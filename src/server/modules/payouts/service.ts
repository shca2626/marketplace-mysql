import { db } from '@/lib/db'
import { recordAudit, recordAuditTx } from '@/server/modules/audit/service'
import { emitNotification } from '@/server/modules/notifications/service'
import { nextNumber } from '@/server/modules/sequences/service'
import { assessFee, resolveOrderCommissionPercent, type ResolvedFeeRule } from '@/server/modules/fees/service'

/**
 * Payouts — platform → vendor settlement of marketplace revenue (Phase 7.4).
 *
 * THE INVARIANT: "no two simultaneously effective settlements per order item" —
 * enforced by a CLAIM, not by forbidding history.
 *
 * A. The claim (mutable pointer state, serializes generation):
 *    claiming an item is a conditional single-flight —
 *      UPDATE OrderItem SET payoutId = ? WHERE id = ? AND payoutId IS NULL
 *    with affected-rows verified; mismatch aborts the transaction. The
 *    PayoutLine.claimKey UNIQUE is the DB backstop (orderItemId for
 *    SETTLEMENT/REISSUE lines while PENDING/EFFECTIVE — REVERSAL lines never
 *    occupy the slot).
 * B. The ledger (immutable accounting postings, append-only):
 *    PayoutLine rows — amount/commission/currency/FX never UPDATEd after
 *    insert; only status transitions + appended REVERSAL entries.
 * C. External transfer discipline (S4):
 *    mark-paid requires a non-empty transfer reference; the transfer
 *    idempotency key is unique; duplicate references across payouts are
 *    detected and blocked. Lines become EFFECTIVE only on the confirmed
 *    execution event — an honest operational control, not a DB guarantee of
 *    external exactly-once (registered risk).
 *
 * An order item becomes settleable when its order's payment has SUCCEEDED and
 * the order is not CANCELLED, and it has not been claimed yet (payoutId NULL).
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

/** Phase 11.1 — the commission context for a seller. Engine-first: the fee
 * rule chain ORG → ORG_TYPE → PLATFORM (resolved through
 * resolveOrderCommissionPercent, which falls back to the legacy
 * PlatformSetting payouts.defaultCommissionPercent when nothing resolves —
 * day one that is exactly the 10% default, zero behavior change). The legacy
 * per-vendor override (User.commissionRate, which predates rules) still wins
 * when set — the engine chain applies only without it. */
async function resolveSellerCommissionContext(
  sellerId: string,
  vendorOverride: number | null
): Promise<{
  orgId: string | null
  orgType: string | null
  rate: number
  source: 'VENDOR' | 'RULE' | 'LEGACY'
  rule: ResolvedFeeRule | null
}> {
  const profile = await db.sellerProfile.findFirst({
    where: { ownerUserId: sellerId },
    select: { organizationId: true, organization: { select: { orgType: true } } },
  })
  const orgId = profile?.organizationId ?? null
  const orgType = profile?.organization.orgType ?? null
  if (vendorOverride != null) return { orgId, orgType, rate: vendorOverride, source: 'VENDOR', rule: null }
  const res = await resolveOrderCommissionPercent({ orgId, orgType })
  return { orgId, orgType, rate: res.percent, source: res.source, rule: res.rule }
}

/** Unsettled, paid-for items of one seller, with the payout math applied. */
export async function previewPayout(sellerId: string): Promise<PayoutPreview> {
  const seller = await db.user.findUnique({
    where: { id: sellerId },
    select: { id: true, name: true, storeName: true, commissionRate: true, role: true },
  })
  if (!seller || seller.role !== 'SELLER') throw new PayoutServiceError('Vendor not found', 404)

  const [commissionCtx, items] = await Promise.all([
    resolveSellerCommissionContext(sellerId, seller.commissionRate),
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

  const commissionRate = commissionCtx.rate
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

// The eligible-set predicate — shared by preview + generation so they can
// never drift.
const ELIGIBLE_ITEMS = (sellerId: string) => ({
  sellerId,
  payoutId: null,
  order: { status: { not: 'CANCELLED' }, payment: { status: 'SUCCEEDED' } },
})

/** Atomically settle every eligible item of a seller into one Payout row with
 * the 7.4 claim discipline: per-item conditional single-flight claims
 * (affected-rows verified — mismatch aborts the transaction) + one
 * SETTLEMENT PayoutLine per item (claimKey = orderItemId, the DB backstop). */
export async function generatePayout(adminId: string, sellerId: string) {
  const seller = await db.user.findUnique({
    where: { id: sellerId },
    select: { id: true, name: true, storeName: true, commissionRate: true, role: true },
  })
  if (!seller || seller.role !== 'SELLER') throw new PayoutServiceError('Vendor not found', 404)

  // Pre-transaction reads: commission context + document number are fetched
  // OUTSIDE the interactive transaction — nextNumber opens its own nested
  // $transaction, which must never run inside another transaction's callback
  // (the remote-Aiven latency + nested-tx contention deadlocked the old code).
  // The commission rate resolves ENGINE-FIRST (ORG → ORG_TYPE → PLATFORM fee
  // rule, legacy PlatformSetting fallback = zero change day one); the legacy
  // per-vendor override still wins when set (it predates rules).
  const [number, commissionCtx] = await Promise.all([
    nextNumber('PY'),
    resolveSellerCommissionContext(sellerId, seller.commissionRate),
  ])
  const sellerOrgId = commissionCtx.orgId

  const payout = await db.$transaction(
    async (tx) => {
      // Re-select inside the tx: concurrent item writes land AFTER this payout
      const items = await tx.orderItem.findMany({
        where: ELIGIBLE_ITEMS(sellerId),
        select: { id: true, price: true, quantity: true, sellerOrgId: true },
        orderBy: { id: 'asc' },
      })
      if (items.length === 0) throw new PayoutServiceError('Nothing to settle — no paid, unsettled items', 409)

      const commissionRate = commissionCtx.rate

      // Per-line math under the declared rounding rule (per-line cents)
      const lineMath = items.map((i) => {
        const amount = Math.round(i.price * i.quantity * 100) / 100
        const commission = Math.round(amount * (commissionRate / 100) * 100) / 100
        return { item: i, amount, commission }
      })
      const gross = Math.round(lineMath.reduce((s, l) => s + l.amount, 0) * 100) / 100
      const commission = Math.round(lineMath.reduce((s, l) => s + l.commission, 0) * 100) / 100
      const net = Math.round((gross - commission) * 100) / 100

      const created = await tx.payout.create({
        data: {
          number,
          sellerId,
          sellerOrgId,
          periodStart: new Date(0),
          periodEnd: new Date(),
          itemCount: items.length,
          grossAmount: gross,
          commissionRate,
          commission,
          netAmount: net,
          currency: 'USD',
          status: 'PENDING',
        },
      })

      // ── 7.4A.1: conditional single-flight claim per item ──
      // UPDATE ... WHERE id AND payoutId IS NULL, affected-rows verified.
      // A concurrent generation that claimed any item first makes our claim
      // match 0 rows → this transaction aborts and the caller recomputes.
      for (const l of lineMath) {
        const claim = await tx.orderItem.updateMany({
          where: { id: l.item.id, payoutId: null },
          data: { payoutId: created.id },
        })
        if (claim.count !== 1) {
          throw new PayoutServiceError(
            `Settlement claim conflict on item ${l.item.id} — another payout claimed it first; recomputing the eligible set`,
            409
          )
        }
        // ── 7.4B.4: the ledger posting (append-only; claimKey holds the slot) ──
        await tx.payoutLine.create({
          data: {
            payoutId: created.id,
            orderItemId: l.item.id,
            linePurpose: 'SETTLEMENT',
            amount: l.amount,
            commission: l.commission,
            currency: 'USD',
            status: 'PENDING',
            claimKey: l.item.id,
          },
        })
      }
      // ── Phase 11.1: the immutable ORDER_COMMISSION assessment, written IN
      // the settlement transaction — payout row + ledger lines + fee-ledger
      // row commit (or roll back) together. Idempotent by key, so a retried
      // scope can never double-charge. The resolved rule is passed forward so
      // the snapshot matches exactly what the payout math applied; a vendor
      // override (or legacy fallback) records the applied numbers instead. ──
      await assessFee(
        {
          event: 'ORDER_COMMISSION',
          actorType: 'SELLER',
          actorOrgId: commissionCtx.orgId,
          ctx: { orgId: commissionCtx.orgId, orgType: commissionCtx.orgType },
          baseAmount: gross,
          currency: 'USD',
          calcInputs: {
            percent: commissionRate,
            itemCount: items.length,
            source: commissionCtx.source,
            legacyAmount: commission,
          },
          idempotencyKey: `ORDER_COMMISSION:payout:${created.id}`,
          refType: 'PAYOUT',
          refId: created.id,
        },
        tx,
        commissionCtx.rule
      )

      // 6.11: settlement + audit row commit atomically.
      await recordAuditTx(tx, {
        actorId: adminId,
        actorType: 'ADMIN',
        action: 'PAYOUT_GENERATED',
        entityType: 'Payout',
        entityId: created.id,
        summary: `Payout ${number} generated for ${seller.storeName ?? seller.name}: $${net.toFixed(2)} net of $${commission.toFixed(2)} commission`,
        metadata: { sellerId, itemCount: items.length, gross, lines: items.length },
      })
      return created
    },
    // Remote-Aiven latency: a full per-item claim batch needs headroom.
    { timeout: 20_000 }
  )

  await emitNotification({
    userId: sellerId,
    type: 'PAYOUT_STATUS',
    title: `Payout ${payout.number} created`,
    body: `$${Number(payout.netAmount).toFixed(2)} is being settled to you ($${Number(payout.grossAmount).toFixed(2)} sales − $${Number(payout.commission).toFixed(2)} platform commission).`,
    linkView: 'seller',
  })

  return payout
}

// ── 7.4C: external transfer discipline ──────────────────────────────────────

/** Mark a payout PAID — the confirmed-execution event (S4).
 * REQUIRES a non-empty transfer reference (bank/manually-confirmed evidence);
 * retries reuse the transfer idempotency key; a reference already used by
 * ANOTHER payout is blocked (two payouts, one bank reference = alert).
 * Lines flip PENDING → EFFECTIVE here, and only here. */
export async function markPayoutPaid(
  adminId: string,
  payoutId: string,
  input: { transferReference: string; note?: string }
) {
  const reference = (input.transferReference ?? '').trim()
  if (!reference)
    throw new PayoutServiceError(
      'A transfer reference is required to confirm execution — a status flip without evidence is not a settlement (lastplan 7.4C)',
      400
    )

  const payout = await db.payout.findUnique({ where: { id: payoutId }, include: { seller: true, lines: true } })
  if (!payout) throw new PayoutServiceError('Payout not found', 404)
  if (payout.status !== 'PENDING') throw new PayoutServiceError(`Payout is already ${payout.status}`, 409)

  // Duplicate reference across payouts: two payouts, one bank reference — block.
  const duplicate = await db.payout.findFirst({
    where: { transferReference: reference, NOT: { id: payoutId } },
    select: { number: true },
  })
  if (duplicate)
    throw new PayoutServiceError(
      `Transfer reference "${reference}" is already recorded on payout ${duplicate.number} — one bank transfer cannot settle two payouts`,
      409
    )

  // 7.4C.6: idempotency key derived from the payout number + attempt; retries
  // after a timeout REUSE the key (first attempt wins the key, later marks
  // short-circuit on status=PENDING check above).
  const idempotencyKey = `${payout.number}#1`

  const updated = await db.$transaction(async (tx) => {
    // Single-flight on the payout row: only one concurrent mark-paid wins.
    const flip = await tx.payout.updateMany({
      where: { id: payoutId, status: 'PENDING' },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        transferReference: reference.slice(0, 190),
        transferIdempotencyKey: idempotencyKey,
        executedById: adminId,
        executedAt: new Date(),
        note: input.note?.slice(0, 500) ?? payout.note,
      },
    })
    if (flip.count !== 1) throw new PayoutServiceError('Payout is no longer PENDING — confirmation raced with another action', 409)

    // 7.4C.7: lines become EFFECTIVE on the confirmed execution event.
    await tx.payoutLine.updateMany({
      where: { payoutId, status: 'PENDING', linePurpose: { in: ['SETTLEMENT', 'REISSUE'] } },
      data: { status: 'EFFECTIVE', effectiveAt: new Date() },
    })

    await recordAuditTx(tx, {
      actorId: adminId,
      actorType: 'ADMIN',
      action: 'PAYOUT_PAID',
      entityType: 'Payout',
      entityId: payoutId,
      summary: `Payout ${payout.number} confirmed executed — $${Number(payout.netAmount).toFixed(2)} to ${payout.seller.storeName ?? payout.seller.name} (ref ${reference})`,
      metadata: { sellerId: payout.sellerId, transferReference: reference, transferIdempotencyKey: idempotencyKey },
    })
    return tx.payout.findUnique({ where: { id: payoutId } })
  })

  await emitNotification({
    userId: payout.sellerId,
    type: 'PAYOUT_STATUS',
    title: `Payout ${payout.number} paid`,
    body: `$${Number(payout.netAmount).toFixed(2)} has been sent to your account (ref ${reference}).`,
    linkView: 'seller',
  })

  return updated
}

/** Cancel a PENDING payout before payment: release the claims (items free for
 * a corrected payout) and CANCEL the ledger lines (claim slot freed). */
export async function cancelPayout(adminId: string, payoutId: string, reason?: string) {
  const payout = await db.payout.findUnique({ where: { id: payoutId } })
  if (!payout) throw new PayoutServiceError('Payout not found', 404)
  if (payout.status !== 'PENDING') throw new PayoutServiceError(`Payout is already ${payout.status}`, 409)

  const updated = await db.$transaction(async (tx) => {
    // 7.4A.2: cancelled-before-payment frees its claims in the same transaction
    await tx.orderItem.updateMany({ where: { payoutId }, data: { payoutId: null } })
    // Lines: PENDING claim-purpose → CANCELLED + claim slot released
    await tx.payoutLine.updateMany({
      where: { payoutId, status: 'PENDING' },
      data: { status: 'CANCELLED', claimKey: null },
    })
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
      metadata: { sellerId: payout.sellerId },
    })
    return row
  })

  return updated
}

/** 7.4A.2 / case (b): reverse a PAID payout — append REVERSAL ledger entries,
 * flip the originals EFFECTIVE → REVERSED, and free the claims (a later
 * corrected payout can reissue). History is never rewritten: the REVERSAL
 * lines are accounting facts (claimKey NULL — they never occupy the slot). */
export async function reversePayout(adminId: string, payoutId: string, reason: string) {
  const payout = await db.payout.findUnique({ where: { id: payoutId }, include: { seller: true, lines: true } })
  if (!payout) throw new PayoutServiceError('Payout not found', 404)
  if (payout.status !== 'PAID')
    throw new PayoutServiceError(
      `Only a PAID payout can be reversed (this one is ${payout.status}) — cancelled-before-payment payouts release their claims via cancel`,
      409
    )
  const trimmed = (reason ?? '').trim()
  if (!trimmed) throw new PayoutServiceError('A reversal reason is required', 400)

  const reversible = payout.lines.filter((l) => l.linePurpose !== 'REVERSAL' && l.status === 'EFFECTIVE')
  const now = new Date()

  const updated = await db.$transaction(
    async (tx) => {
      // Append REVERSAL lines per EFFECTIVE settlement line + flip originals —
      // single pass, reversalOfLineId set at creation (self-FK within the tx).
      for (const line of reversible) {
        await tx.payoutLine.create({
          data: {
            payoutId,
            orderItemId: line.orderItemId,
            linePurpose: 'REVERSAL',
            amount: line.amount,
            commission: line.commission,
            currency: line.currency,
            fxRate: line.fxRate,
            fxRateAt: line.fxRateAt,
            fxSource: line.fxSource,
            status: 'EFFECTIVE', // the reversal posting is effective with the correction event
            claimKey: null, // an accounting fact, not a claim — never blocks a reissue
            reversalOfLineId: line.id,
            effectiveAt: now,
          },
        })
      }
      // Originals EFFECTIVE → REVERSED + claims released (same transaction)
      await tx.payoutLine.updateMany({
        where: { payoutId, linePurpose: { in: ['SETTLEMENT', 'REISSUE'] }, status: 'EFFECTIVE' },
        data: { status: 'REVERSED', reversedAt: now, claimKey: null },
      })
      await tx.orderItem.updateMany({ where: { payoutId }, data: { payoutId: null } })

      const row = await tx.payout.update({
        where: { id: payoutId },
        data: { note: `${payout.note ? payout.note + ' | ' : ''}REVERSED: ${trimmed}`.slice(0, 500) },
      })
      await recordAuditTx(tx, {
        actorId: adminId,
        actorType: 'ADMIN',
        action: 'PAYOUT_REVERSED',
        entityType: 'Payout',
        entityId: payoutId,
        summary: `Payout ${payout.number} reversed — ${reversible.length} settlement lines reversed, claims released for reissue (${trimmed})`,
        metadata: { sellerId: payout.sellerId, reversedLines: reversible.length },
      })
      return row
    },
    // Remote-Aiven latency: per-line reversal postings need headroom.
    { timeout: 20_000 }
  )

  return updated
}

// ── Listing ────────────────────────────────────────────────────────────────

export async function listPayouts(filters: { q?: string; status?: string; page?: number; limit?: number }) {
  const page = Math.max(1, filters.page ?? 1)
  const limit = Math.min(50, Math.max(1, filters.limit ?? 20))

  const where: Record<string, unknown> = {}
  const q = filters.q?.trim()
  if (q) {
    where.OR = [{ number: { contains: q } }, { seller: { name: { contains: q } } }, { seller: { storeName: { contains: q } } }, { transferReference: { contains: q } }]
  }
  if (filters.status) where.status = filters.status

  const [total, rows] = await Promise.all([
    db.payout.count({ where }),
    db.payout.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        seller: { select: { id: true, name: true, storeName: true, email: true } },
        lines: { select: { id: true, linePurpose: true, status: true, amount: true, commission: true } },
      },
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
      transferReference: p.transferReference,
      transferIdempotencyKey: p.transferIdempotencyKey,
      executedAt: p.executedAt?.toISOString() ?? null,
      lineSummary: {
        total: p.lines.length,
        effective: p.lines.filter((l) => l.status === 'EFFECTIVE').length,
        reversed: p.lines.filter((l) => l.status === 'REVERSED').length,
        cancellations: p.lines.filter((l) => l.status === 'CANCELLED').length,
        reversals: p.lines.filter((l) => l.linePurpose === 'REVERSAL').length,
      },
      createdAt: p.createdAt.toISOString(),
    })),
  }
}

// ── Payout detail with the full ledger (admin inspection) ──────────────────

export async function getPayoutDetail(payoutId: string) {
  const payout = await db.payout.findUnique({
    where: { id: payoutId },
    include: {
      seller: { select: { id: true, name: true, storeName: true, email: true } },
      lines: {
        orderBy: { createdAt: 'asc' },
        include: { orderItem: { select: { id: true, title: true, quantity: true, price: true, orderId: true } } },
      },
    },
  })
  if (!payout) throw new PayoutServiceError('Payout not found', 404)

  return {
    id: payout.id,
    number: payout.number,
    seller: payout.seller,
    periodStart: payout.periodStart.toISOString(),
    periodEnd: payout.periodEnd.toISOString(),
    itemCount: payout.itemCount,
    grossAmount: Number(payout.grossAmount),
    commissionRate: payout.commissionRate,
    commission: Number(payout.commission),
    netAmount: Number(payout.netAmount),
    currency: payout.currency,
    status: payout.status,
    paidAt: payout.paidAt?.toISOString() ?? null,
    note: payout.note,
    transferReference: payout.transferReference,
    transferIdempotencyKey: payout.transferIdempotencyKey,
    executedAt: payout.executedAt?.toISOString() ?? null,
    createdAt: payout.createdAt.toISOString(),
    lines: payout.lines.map((l) => ({
      id: l.id,
      linePurpose: l.linePurpose,
      status: l.status,
      amount: Number(l.amount),
      commission: Number(l.commission),
      currency: l.currency,
      claimKey: l.claimKey,
      reversalOfLineId: l.reversalOfLineId,
      effectiveAt: l.effectiveAt?.toISOString() ?? null,
      reversedAt: l.reversedAt?.toISOString() ?? null,
      createdAt: l.createdAt.toISOString(),
      orderItem: l.orderItem
        ? {
            id: l.orderItem.id,
            title: l.orderItem.title,
            quantity: l.orderItem.quantity,
            price: Number(l.orderItem.price),
            orderId: l.orderItem.orderId,
          }
        : null,
    })),
  }
}

// ── Seller-facing earnings ──────────────────────────────────────────────────

export async function sellerEarnings(sellerId: string) {
  // Phase 11.1: the pending projection resolves through the same engine-first
  // chain as generation, so what the seller sees as "pending commission" is
  // what the next payout will actually charge (vendor override → rule chain →
  // legacy PlatformSetting fallback).
  const seller = await db.user.findUnique({ where: { id: sellerId }, select: { commissionRate: true } })
  const commissionCtx = await resolveSellerCommissionContext(sellerId, seller?.commissionRate ?? null)
  const commissionRate = commissionCtx.rate

  const [pendingItems, payouts, lifetimeAgg] = await Promise.all([
    db.orderItem.findMany({
      where: ELIGIBLE_ITEMS(sellerId),
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
      transferReference: p.transferReference,
      createdAt: p.createdAt.toISOString(),
    })),
  }
}
