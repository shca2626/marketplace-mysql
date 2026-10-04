import { db } from '@/lib/db'
import { recordAudit, recordAuditTx } from '@/server/modules/audit/service'
import { emitNotification } from '@/server/modules/notifications/service'
import { nextNumber } from '@/server/modules/sequences/service'

/**
 * Payouts — platform → vendor settlement of marketplace revenue.
 *
 * An order item becomes settleable when its order's payment has SUCCEEDED
 * (card, captured bank transfer, or settled invoice) and the order is not
 * CANCELLED, and it has not already been settled (OrderItem.payoutId NULL).
 *
 * Commission: per-vendor override (User.commissionRate) → platform default
 * (PlatformSetting key "payouts" → defaultCommissionPercent).
 */

export class PayoutServiceError extends Error {
  constructor(message: string, public status = 400) {
    super(message)
  }
}

// ── Configuration ───────────────────────────────────────────────────────────

export interface PayoutsConfig {
  defaultCommissionPercent: number // 0..90
}

const DEFAULT_PAYOUTS: PayoutsConfig = { defaultCommissionPercent: 10 }

export async function getPayoutsConfig(): Promise<PayoutsConfig> {
  const row = await db.platformSetting.findUnique({ where: { key: 'payouts' } })
  if (!row) return DEFAULT_PAYOUTS
  try {
    const parsed = JSON.parse(row.value) as Partial<PayoutsConfig>
    const pct = Number(parsed.defaultCommissionPercent)
    return {
      defaultCommissionPercent:
        Number.isFinite(pct) && pct >= 0 && pct <= 90 ? pct : DEFAULT_PAYOUTS.defaultCommissionPercent,
    }
  } catch {
    return DEFAULT_PAYOUTS
  }
}

export async function updatePayoutsConfig(patch: Partial<PayoutsConfig>): Promise<PayoutsConfig> {
  const pct = Number(patch.defaultCommissionPercent)
  if (!Number.isFinite(pct) || pct < 0 || pct > 90)
    throw new PayoutServiceError('Commission must be between 0 and 90 percent', 400)
  const next: PayoutsConfig = { defaultCommissionPercent: pct }
  await db.platformSetting.upsert({
    where: { key: 'payouts' },
    create: { key: 'payouts', value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  })
  return next
}

// ── Settlement math ─────────────────────────────────────────────────────────

export interface PayoutPreview {
  sellerId: string
  sellerName: string
  storeName: string | null
  commissionRate: number
  unsettledItems: number
  grossAmount: number
  commission: number
  netAmount: number
  earliestItemAt: string | null
  latestItemAt: string | null
}

/** Unsettled, paid-for items of one seller, with the payout math applied. */
export async function previewPayout(sellerId: string): Promise<PayoutPreview> {
  const seller = await db.user.findUnique({
    where: { id: sellerId },
    select: { id: true, name: true, storeName: true, commissionRate: true, role: true },
  })
  if (!seller || seller.role !== 'SELLER') throw new PayoutServiceError('Vendor not found', 404)

  const [cfg, items] = await Promise.all([
    getPayoutsConfig(),
    db.orderItem.findMany({
      where: {
        sellerId,
        payoutId: null,
        order: { status: { not: 'CANCELLED' }, payment: { status: 'SUCCEEDED' } },
      },
      select: { price: true, quantity: true, orderId: true },
      orderBy: { id: 'asc' },
    }),
  ])

  const commissionRate = seller.commissionRate ?? cfg.defaultCommissionPercent
  const gross = items.reduce((s, i) => s + i.price * i.quantity, 0)
  const commission = Math.round(gross * (commissionRate / 100) * 100) / 100

  return {
    sellerId: seller.id,
    sellerName: seller.name,
    storeName: seller.storeName,
    commissionRate,
    unsettledItems: items.length,
    grossAmount: Math.round(gross * 100) / 100,
    commission,
    netAmount: Math.round((gross - commission) * 100) / 100,
    earliestItemAt: null,
    latestItemAt: null,
  }
}

/** Atomically settle every eligible item of a seller into one Payout row. */
export async function generatePayout(adminId: string, sellerId: string) {
  const seller = await db.user.findUnique({
    where: { id: sellerId },
    select: { id: true, name: true, storeName: true, commissionRate: true, role: true },
  })
  if (!seller || seller.role !== 'SELLER') throw new PayoutServiceError('Vendor not found', 404)

  const payout = await db.$transaction(async (tx) => {
    // Re-select inside the tx: concurrent item writes land AFTER this payout
    const items = await tx.orderItem.findMany({
      where: {
        sellerId,
        payoutId: null,
        order: { status: { not: 'CANCELLED' }, payment: { status: 'SUCCEEDED' } },
      },
      select: { id: true, price: true, quantity: true },
    })
    if (items.length === 0) throw new PayoutServiceError('Nothing to settle — no paid, unsettled items', 409)

    const cfg = await getPayoutsConfig()
    const commissionRate = seller.commissionRate ?? cfg.defaultCommissionPercent
    const gross = Math.round(items.reduce((s, i) => s + i.price * i.quantity, 0) * 100) / 100
    const commission = Math.round(gross * (commissionRate / 100) * 100) / 100
    const net = Math.round((gross - commission) * 100) / 100
    const number = await nextNumber('PY')

    const created = await tx.payout.create({
      data: {
        number,
        sellerId,
        periodStart: new Date(0),
        periodEnd: new Date(),
        itemCount: items.length,
        grossAmount: gross,
        commissionRate,
        commission,
        netAmount: net,
        status: 'PENDING',
      },
    })
    await tx.orderItem.updateMany({
      where: { id: { in: items.map((i) => i.id) } },
      data: { payoutId: created.id },
    })
    // 6.11: settlement + audit row commit atomically.
    await recordAuditTx(tx, {
      actorId: adminId,
      actorType: 'ADMIN',
      action: 'PAYOUT_GENERATED',
      entityType: 'Payout',
      entityId: created.id,
      summary: `Payout ${number} generated for ${seller.storeName ?? seller.name}: $${net.toFixed(2)} net of $${commission.toFixed(2)} commission`,
      metadata: { sellerId, itemCount: items.length, gross },
    })
    return created
  })

  await emitNotification({
    userId: sellerId,
    type: 'PAYOUT_STATUS',
    title: `Payout ${payout.number} created`,
    body: `$${Number(payout.netAmount).toFixed(2)} is being settled to you ($${Number(payout.grossAmount).toFixed(2)} sales − $${Number(payout.commission).toFixed(2)} platform commission).`,
    linkView: 'seller',
  })

  return payout
}

export async function markPayoutPaid(adminId: string, payoutId: string, note?: string) {
  const payout = await db.payout.findUnique({ where: { id: payoutId }, include: { seller: true } })
  if (!payout) throw new PayoutServiceError('Payout not found', 404)
  if (payout.status !== 'PENDING') throw new PayoutServiceError(`Payout is already ${payout.status}`, 409)

  // 6.11: status flip + audit row commit atomically.
  const updated = await db.$transaction(async (tx) => {
    const row = await tx.payout.update({
      where: { id: payoutId },
      data: { status: 'PAID', paidAt: new Date(), note: note?.slice(0, 500) ?? payout.note },
    })
    await recordAuditTx(tx, {
      actorId: adminId,
      actorType: 'ADMIN',
      action: 'PAYOUT_PAID',
      entityType: 'Payout',
      entityId: payoutId,
      summary: `Payout ${payout.number} marked paid — $${Number(row.netAmount).toFixed(2)} to ${payout.seller.storeName ?? payout.seller.name}`,
      metadata: { sellerId: payout.sellerId },
    })
    return row
  })

  await emitNotification({
    userId: payout.sellerId,
    type: 'PAYOUT_STATUS',
    title: `Payout ${payout.number} paid`,
    body: `$${Number(updated.netAmount).toFixed(2)} has been sent to your account.`,
    linkView: 'seller',
  })

  return updated
}

export async function cancelPayout(adminId: string, payoutId: string, reason?: string) {
  const payout = await db.payout.findUnique({ where: { id: payoutId } })
  if (!payout) throw new PayoutServiceError('Payout not found', 404)
  if (payout.status !== 'PENDING') throw new PayoutServiceError(`Payout is already ${payout.status}`, 409)

  const updated = await db.$transaction(async (tx) => {
    // release the items back to unsettled so a corrected payout can pick them up
    await tx.orderItem.updateMany({ where: { payoutId }, data: { payoutId: null } })
    const row = await tx.payout.update({
      where: { id: payoutId },
      data: { status: 'CANCELLED', note: reason?.slice(0, 500) ?? null },
    })
    // 6.11: release + cancellation + audit row commit atomically.
    await recordAuditTx(tx, {
      actorId: adminId,
      actorType: 'ADMIN',
      action: 'PAYOUT_CANCELLED',
      entityType: 'Payout',
      entityId: payoutId,
      summary: `Payout ${payout.number} cancelled — ${reason ?? 'no reason given'}`,
    })
    return row
  })

  return updated
}

// ── Listing ────────────────────────────────────────────────────────────────

export async function listPayouts(filters: { q?: string; status?: string; page?: number; limit?: number }) {
  const page = Math.max(1, filters.page ?? 1)
  const limit = Math.min(50, Math.max(1, filters.limit ?? 20))

  const where: Record<string, unknown> = {}
  const q = filters.q?.trim()
  if (q) {
    where.OR = [{ number: { contains: q } }, { seller: { name: { contains: q } } }, { seller: { storeName: { contains: q } } }]
  }
  if (filters.status) where.status = filters.status

  const [total, rows] = await Promise.all([
    db.payout.count({ where }),
    db.payout.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { seller: { select: { id: true, name: true, storeName: true, email: true } } },
    }),
  ])

  const sums = await db.payout.groupBy({
    by: ['status'],
    _sum: { netAmount: true, commission: true },
    _count: { _all: true },
  })
  const totalsByStatus = Object.fromEntries(
    sums.map((s) => [s.status, { count: s._count._all, net: Number(s._sum.netAmount ?? 0), commission: Number(s._sum.commission ?? 0) }])
  )

  return {
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    totalsByStatus,
    payouts: rows.map((p) => ({
      id: p.id,
      number: p.number,
      seller: p.seller,
      periodEnd: p.periodEnd.toISOString(),
      itemCount: p.itemCount,
      grossAmount: Number(p.grossAmount),
      commissionRate: p.commissionRate,
      commission: Number(p.commission),
      netAmount: Number(p.netAmount),
      status: p.status,
      paidAt: p.paidAt?.toISOString() ?? null,
      note: p.note,
      createdAt: p.createdAt.toISOString(),
    })),
  }
}

// ── Seller-facing earnings ──────────────────────────────────────────────────

export async function sellerEarnings(sellerId: string) {
  const [seller, cfg] = await Promise.all([
    db.user.findUnique({ where: { id: sellerId }, select: { commissionRate: true } }),
    getPayoutsConfig(),
  ])
  const commissionRate = seller?.commissionRate ?? cfg.defaultCommissionPercent

  const [pendingItems, payouts, lifetimeAgg] = await Promise.all([
    db.orderItem.findMany({
      where: {
        sellerId,
        payoutId: null,
        order: { status: { not: 'CANCELLED' }, payment: { status: 'SUCCEEDED' } },
      },
      select: { price: true, quantity: true },
    }),
    db.payout.findMany({
      where: { sellerId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    db.payout.aggregate({
      where: { sellerId, status: 'PAID' },
      _sum: { netAmount: true, commission: true },
      _count: { _all: true },
    }),
  ])

  const pendingGross = pendingItems.reduce((s, i) => s + i.price * i.quantity, 0)
  const pendingCommission = Math.round(pendingGross * (commissionRate / 100) * 100) / 100

  return {
    commissionRate,
    pending: {
      itemCount: pendingItems.length,
      gross: Math.round(pendingGross * 100) / 100,
      commission: pendingCommission,
      net: Math.round((pendingGross - pendingCommission) * 100) / 100,
    },
    lifetime: {
      payouts: lifetimeAgg._count._all,
      paidOut: Math.round(Number(lifetimeAgg._sum.netAmount ?? 0) * 100) / 100,
      commissionPaid: Math.round(Number(lifetimeAgg._sum.commission ?? 0) * 100) / 100,
    },
    payouts: payouts.map((p) => ({
      id: p.id,
      number: p.number,
      itemCount: p.itemCount,
      grossAmount: Number(p.grossAmount),
      commission: Number(p.commission),
      netAmount: Number(p.netAmount),
      status: p.status,
      paidAt: p.paidAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
    })),
  }
}
