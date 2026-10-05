import { db } from '@/lib/db'
import { recordAudit, recordAuditTx } from '@/server/modules/audit/service'
import { emitNotification } from '@/server/modules/notifications/service'
import { nextNumber } from '@/server/modules/sequences/service'
import type { Prisma } from '@prisma/client'

/**
 * Refunds (Phase 7.7.3 — S7): obligation vs execution, item-level.
 *
 *   REQUESTED → APPROVED (obligation established — approved but not yet paid)
 *            → COMPLETED (ONLY with execution evidence: a payment reference
 *              recorded by an authenticated actor)
 *   REQUESTED/APPROVED → DENIED | CANCELLED
 *
 * A refund obligation is NEVER conflated with a completed refund:
 *   - while APPROVED-but-unpaid, the order keeps its prior payment state plus
 *     a pending-refund indicator — never a completed-refund status;
 *   - paymentStatus refund states (PARTIALLY_REFUNDED / REFUNDED) are derived
 *     ONLY from COMPLETED refunds' allocations;
 *   - completing a refund RELEASES the affected items' payout claims and
 *     appends REVERSAL entries on the PayoutLine ledger (7.4B) — history is
 *     never rewritten.
 */

export class RefundServiceError extends Error {
  constructor(message: string, public status = 400) {
    super(message)
  }
}

const REFUND_STATUSES = ['REQUESTED', 'APPROVED', 'COMPLETED', 'DENIED', 'CANCELLED'] as const
export type RefundStatus = (typeof REFUND_STATUSES)[number]

// ── paymentStatus derivation (7.7.1) ───────────────────────────────────────

/** Derive the order's paymentStatus refund state from COMPLETED refunds only.
 * While a refund is APPROVED-but-unpaid the caller keeps the prior state —
 * the pending-refund indicator is exposed separately. */
export async function derivePaymentStatus(orderId: string): Promise<string> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      refunds: { where: { status: 'COMPLETED' }, include: { allocations: true } },
      items: { select: { id: true, quantity: true } },
    },
  })
  if (!order) throw new RefundServiceError('Order not found', 404)

  const qtyRefunded = new Map<string, number>()
  for (const r of order.refunds) for (const a of r.allocations) qtyRefunded.set(a.orderItemId, (qtyRefunded.get(a.orderItemId) ?? 0) + a.quantity)
  const refundedIds = new Set(qtyRefunded.keys())

  if (refundedIds.size === 0) return order.paymentStatus // no completed refunds — keep prior state
  const allRefunded =
    order.items.length > 0 &&
    order.items.every((i) => (qtyRefunded.get(i.id) ?? 0) >= i.quantity)
  return allRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED'
}

/** Pending-refund indicator (never a completed-refund status). */
export async function hasPendingRefunds(orderId: string): Promise<boolean> {
  const n = await db.refund.count({ where: { orderId, status: { in: ['REQUESTED', 'APPROVED'] } } })
  return n > 0
}

// ── Buyer request ──────────────────────────────────────────────────────────

export interface RefundRequestInput {
  orderId: string
  reason: string
  items: Array<{ orderItemId: string; quantity: number }>
  shipping?: number
}

/** Buyer asks for money back on specific items of THEIR order. */
export async function requestRefund(userId: string, input: RefundRequestInput) {
  const reason = (input.reason ?? '').trim()
  if (reason.length < 10) throw new RefundServiceError('Please describe the reason (at least 10 characters)', 400)

  const order = await db.order.findUnique({ where: { id: input.orderId }, include: { items: true } })
  if (!order) throw new RefundServiceError('Order not found', 404)
  if (order.buyerId !== userId) throw new RefundServiceError('Only the buyer can request a refund on this order', 403)

  // Obligations can only be established on money that actually moved.
  const paidStates = ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'FUNDED', 'OUTSTANDING']
  if (!paidStates.includes(order.paymentStatus))
    throw new RefundServiceError(
      `This order is ${order.paymentStatus.replace('_', ' ').toLowerCase()} — no payment to refund`,
      409
    )
  if (order.fulfillmentStatus === 'CANCELLED' && order.paymentStatus === 'AWAITING_PAYMENT')
    throw new RefundServiceError('This order was cancelled before payment — nothing to refund', 409)

  if (!input.items?.length) throw new RefundServiceError('Select at least one item to refund', 400)

  const itemMap = new Map(order.items.map((i) => [i.id, i]))
  for (const line of input.items) {
    const item = itemMap.get(line.orderItemId)
    if (!item) throw new RefundServiceError('A selected item is not part of this order', 400)
    if (line.quantity < 1 || line.quantity > item.quantity)
      throw new RefundServiceError(`Refund quantity for "${item.title}" must be between 1 and ${item.quantity}`, 400)
  }

  // Document number OUTSIDE the interactive transaction — nextNumber opens
  // its own nested $transaction which must never run inside another's
  // callback (nested interactive transactions deadlock under load).
  const number = await nextNumber('RF')
  const refund = await db.$transaction(
    async (tx) => {
    const created = await tx.refund.create({
      data: {
        number,
        orderId: order.id,
        requestedById: userId,
        reason: reason.slice(0, 2000),
        status: 'REQUESTED',
        currency: order.currency,
        amountTotal: 0,
      },
    })
    let total = 0
    for (const line of input.items) {
      const item = itemMap.get(line.orderItemId)!
      const amount = Math.round(item.price * line.quantity * 100) / 100
      total += amount
      await tx.refundAllocation.create({
        data: {
          refundId: created.id,
          orderItemId: item.id,
          quantity: line.quantity,
          amount,
          bucketShipping: 0,
          bucketDiscounts: 0,
          bucketTaxes: 0,
        },
      })
    }
    total = Math.round((total + Math.max(0, input.shipping ?? 0)) * 100) / 100
    const withTotal = await tx.refund.update({ where: { id: created.id }, data: { amountTotal: total } })
    await recordAuditTx(tx, {
      actorId: userId,
      actorType: 'USER',
      action: 'REFUND_REQUESTED',
      entityType: 'Refund',
      entityId: created.id,
      summary: `Refund ${number} requested on order ${order.poNumber ?? order.id.slice(-8)} — ${input.items.length} item(s), $${total.toFixed(2)}`,
      metadata: { orderId: order.id, amountTotal: total, items: input.items.length },
    })
    return withTotal
    },
    { timeout: 20_000 } // remote-Aiven latency headroom for multi-item requests
  )

  // Buyer acknowledgement (after commit — never throws)
  await emitNotification({
    userId: order.buyerId,
    type: 'REFUND_STATUS',
    title: `Refund ${refund.number} submitted`,
    body: 'Your refund request was submitted and is awaiting review.',
    linkView: 'orders',
    linkId: order.id,
  }).catch(() => {})

  return serializeRefund(refund)
}

// ── Admin decisions ────────────────────────────────────────────────────────

/** REQUESTED → APPROVED: the obligation is established (nothing paid yet). */
export async function approveRefund(adminId: string, refundId: string, note?: string) {
  return transition(adminId, refundId, 'APPROVED', {
    from: ['REQUESTED'],
    note,
    auditAction: 'REFUND_APPROVED',
    auditSummary: (r) => `Refund ${r.number} approved — $${Number(r.amountTotal).toFixed(2)} obligation established`,
  })
}

/** REQUESTED/APPROVED → DENIED. */
export async function denyRefund(adminId: string, refundId: string, note?: string) {
  return transition(adminId, refundId, 'DENIED', {
    from: ['REQUESTED', 'APPROVED'],
    note,
    auditAction: 'REFUND_DENIED',
    auditSummary: (r) => `Refund ${r.number} denied`,
  })
}

/** Buyer cancels their own pending request (REQUESTED/APPROVED → CANCELLED). */
export async function cancelRefund(userId: string, refundId: string) {
  const refund = await db.refund.findUnique({ where: { id: refundId } })
  if (!refund) throw new RefundServiceError('Refund not found', 404)
  const order = await db.order.findUnique({ where: { id: refund.orderId } })
  if (!order) throw new RefundServiceError('Order not found', 404)
  if (order.buyerId !== userId) throw new RefundServiceError('Only the requester can cancel this refund', 403)
  return transition(userId, refundId, 'CANCELLED', {
    from: ['REQUESTED', 'APPROVED'],
    auditAction: 'REFUND_CANCELLED',
    auditSummary: (r) => `Refund ${r.number} cancelled by the requester`,
    actorType: 'USER',
  })
}

/** APPROVED → COMPLETED — the execution event (S7).
 * REQUIRES execution evidence: a payment reference (PSP refund id or the
 * manual-money reference recorded by the operator). Effects, atomically:
 *   - allocations determine which items' payout claims are released;
 *   - EFFECTIVE settlement lines covering those items get REVERSAL entries
 *     (appended — never rewritten);
 *   - the order's paymentStatus refund state is re-derived from COMPLETED
 *     refunds' allocations ONLY. */
export async function completeRefund(
  adminId: string,
  refundId: string,
  input: { paymentReference: string; note?: string }
) {
  const reference = (input.paymentReference ?? '').trim()
  if (!reference)
    throw new RefundServiceError(
      'A payment reference is required — a completed refund must carry execution evidence (lastplan 7.7.3)',
      400
    )

  const refund = await db.refund.findUnique({
    where: { id: refundId },
    include: { order: { include: { items: true } }, allocations: true },
  })
  if (!refund) throw new RefundServiceError('Refund not found', 404)
  if (refund.status !== 'APPROVED')
    throw new RefundServiceError(`Refund is ${refund.status} — only an APPROVED obligation can be completed`, 409)

  const now = new Date()
  const completed = await db.$transaction(
    async (tx) => {
    // Single-flight on the refund row
    const flip = await tx.refund.updateMany({
      where: { id: refundId, status: 'APPROVED' },
      data: {
        status: 'COMPLETED',
        paymentReference: reference.slice(0, 190),
        completedById: adminId,
        completedAt: now,
        ...(input.note ? { decidedNote: input.note.slice(0, 1000) } : {}),
      },
    })
    if (flip.count !== 1) throw new RefundServiceError('Refund is no longer APPROVED — completion raced with another action', 409)

    // ── Effects (7.7.3): allocations drive the payout-ledger corrections ──
    const allocItems = refund.allocations.map((a) => a.orderItemId)
    if (allocItems.length > 0) {
      // 1) release the affected items' payout claims
      await tx.orderItem.updateMany({ where: { id: { in: allocItems }, payoutId: { not: null } }, data: { payoutId: null } })
      // 2) append REVERSAL entries for EFFECTIVE settlement lines covering the items
      const settled = await tx.payoutLine.findMany({
        where: { orderItemId: { in: allocItems }, linePurpose: { in: ['SETTLEMENT', 'REISSUE'] }, status: 'EFFECTIVE' },
      })
      for (const line of settled) {
        await tx.payoutLine.create({
          data: {
            payoutId: line.payoutId,
            orderItemId: line.orderItemId,
            linePurpose: 'REVERSAL',
            amount: line.amount,
            commission: line.commission,
            currency: line.currency,
            fxRate: line.fxRate,
            fxRateAt: line.fxRateAt,
            fxSource: line.fxSource,
            status: 'EFFECTIVE',
            claimKey: null,
            reversalOfLineId: line.id,
            effectiveAt: now,
          },
        })
        await tx.payoutLine.update({
          where: { id: line.id },
          data: { status: 'REVERSED', reversedAt: now, claimKey: null },
        })
      }
    }

    // 3) re-derive the order paymentStatus from COMPLETED refunds ONLY
    const completedRefunds = await tx.refund.findMany({
      where: { orderId: refund.orderId, status: 'COMPLETED' },
      include: { allocations: true },
    })
    const qtyRefunded = new Map<string, number>()
    for (const r of completedRefunds) for (const a of r.allocations) qtyRefunded.set(a.orderItemId, (qtyRefunded.get(a.orderItemId) ?? 0) + a.quantity)
    const refundedIds = new Set(qtyRefunded.keys())
    const items = refund.order.items
    const allRefunded = refundedIds.size > 0 && items.every((i) => (qtyRefunded.get(i.id) ?? 0) >= i.quantity)
    const paymentStatus = refundedIds.size === 0 ? refund.order.paymentStatus : allRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED'
    await tx.order.update({ where: { id: refund.orderId }, data: { paymentStatus } })

    await recordAuditTx(tx, {
      actorId: adminId,
      actorType: 'ADMIN',
      action: 'REFUND_COMPLETED',
      entityType: 'Refund',
      entityId: refundId,
      summary: `Refund ${refund.number} completed — $${Number(refund.amountTotal).toFixed(2)} returned (ref ${reference}); order paymentStatus → ${paymentStatus}`,
      metadata: { orderId: refund.orderId, paymentReference: reference, paymentStatus },
    })
    return tx.refund.findUnique({ where: { id: refundId } })
    },
    { timeout: 20_000 } // remote-Aiven latency headroom for ledger corrections
  )

  await emitNotification({
    userId: refund.order.buyerId,
    type: 'REFUND_STATUS',
    title: `Refund ${refund.number} completed`,
    body: `$${Number(refund.amountTotal).toFixed(2)} has been returned to you (ref ${reference}).`,
    linkView: 'orders',
    linkId: refund.orderId,
  }).catch(() => {})

  return serializeRefund(completed!)
}

// ── shared transition machinery (server-side transition map — 7.7.4) ────────

interface TransitionSpec {
  from: RefundStatus[]
  note?: string
  auditAction: string
  auditSummary: (r: { number: string; amountTotal: number }) => string
  actorType?: 'USER' | 'ADMIN'
}

async function transition(actorId: string, refundId: string, to: RefundStatus, spec: TransitionSpec) {
  const refund = await db.refund.findUnique({ where: { id: refundId } })
  if (!refund) throw new RefundServiceError('Refund not found', 404)
  if (!spec.from.includes(refund.status as RefundStatus))
    throw new RefundServiceError(`Refund is ${refund.status} — the transition to ${to} is not legal from there`, 409)

  const now = new Date()
  return db.$transaction(async (tx) => {
    const updated = await tx.refund.update({
      where: { id: refundId },
      data: {
        status: to,
        ...(spec.note ? { decidedNote: spec.note.slice(0, 1000) } : {}),
        ...(to === 'APPROVED' ? { approvedById: actorId, approvedAt: now } : {}),
        ...(to === 'DENIED' ? { deniedAt: now } : {}),
        ...(to === 'CANCELLED' ? { cancelledAt: now } : {}),
      },
    })
    await recordAuditTx(tx, {
      actorId,
      actorType: spec.actorType ?? 'ADMIN',
      action: spec.auditAction,
      entityType: 'Refund',
      entityId: refundId,
      summary: spec.auditSummary(updated),
      metadata: { orderId: refund.orderId, to },
    })
    return serializeRefund(updated)
  })
}

// ── Listing / DTO ───────────────────────────────────────────────────────────

function serializeRefund(
  r: {
    id: string
    number: string
    orderId: string
    status: string
    reason: string
    amountTotal: number | Prisma.Decimal
    currency: string
    paymentReference: string | null
    createdAt: Date
    approvedAt: Date | null
    completedAt: Date | null
  },
  allocations?: Array<{ orderItemId: string; quantity: number; amount: number | Prisma.Decimal }>
) {
  return {
    id: r.id,
    number: r.number,
    orderId: r.orderId,
    status: r.status,
    reason: r.reason,
    amountTotal: Number(r.amountTotal),
    currency: r.currency,
    paymentReference: r.paymentReference,
    createdAt: r.createdAt.toISOString(),
    approvedAt: r.approvedAt?.toISOString() ?? null,
    completedAt: r.completedAt?.toISOString() ?? null,
    allocations: (allocations ?? []).map((a) => ({ orderItemId: a.orderItemId, quantity: a.quantity, amount: Number(a.amount) })),
  }
}

export async function listRefunds(filters: { status?: string; q?: string; page?: number; limit?: number }) {
  const page = Math.max(1, filters.page ?? 1)
  const limit = Math.min(50, Math.max(1, filters.limit ?? 20))
  const where: Record<string, unknown> = {}
  if (filters.status) where.status = filters.status
  const q = filters.q?.trim()
  if (q) where.OR = [{ number: { contains: q } }, { order: { items: { some: { title: { contains: q } } } } }]

  const [total, rows, counts] = await Promise.all([
    db.refund.count({ where }),
    db.refund.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        order: { select: { id: true, poNumber: true, paymentStatus: true, buyerId: true, buyer: { select: { name: true } } } },
        requestedBy: { select: { id: true, name: true } },
        allocations: { include: { orderItem: { select: { id: true, title: true, quantity: true, price: true } } } },
      },
    }),
    db.refund.groupBy({ by: ['status'], _count: { _all: true } }),
  ])

  return {
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    countsByStatus: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    refunds: rows.map((r) => ({
      ...serializeRefund(
        r,
        r.allocations.map((a) => ({ orderItemId: a.orderItemId, quantity: a.quantity, amount: a.amount }))
      ),
      order: {
        id: r.order.id,
        poNumber: r.order.poNumber,
        paymentStatus: r.order.paymentStatus,
        buyerName: r.order.buyer.name,
      },
      requestedBy: r.requestedBy,
      items: r.allocations.map((a) => ({
        orderItemId: a.orderItem.id,
        title: a.orderItem.title,
        quantity: a.quantity,
        refundedQty: a.quantity,
        unitPrice: Number(a.orderItem.price),
        amount: Number(a.amount),
      })),
    })),
  }
}

export async function buyerRefunds(userId: string) {
  const rows = await db.refund.findMany({
    where: { order: { buyerId: userId } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      allocations: { include: { orderItem: { select: { id: true, title: true } } } },
    },
  })
  return rows.map((r) => ({
    ...serializeRefund(
      r,
      r.allocations.map((a) => ({ orderItemId: a.orderItemId, quantity: a.quantity, amount: a.amount }))
    ),
    items: r.allocations.map((a) => ({ orderItemId: a.orderItem.id, title: a.orderItem.title, quantity: a.quantity })),
  }))
}
