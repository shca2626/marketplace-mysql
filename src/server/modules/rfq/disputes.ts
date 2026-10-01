import { db } from '@/lib/db'
import { recordAudit } from '@/server/modules/audit/service'
import { nextNumber } from '@/server/modules/sequences/service'
import { emitNotification, emitNotifications, type EmitInput } from '@/server/modules/notifications/service'
import { resolvePanel } from '@/server/modules/settings/service'
import type { DisputeDTO } from '@/lib/types'

/**
 * DISPUTE RESOLUTION — runtime enforcement of the "Dispute Resolution" settings
 * panel (scope-aware like every other rule).
 *
 * Lifecycle:
 *   OPEN ──seller responds──▶ SELLER_RESPONDED
 *     │                        │
 *     └── autoEscalateDays ────┴──▶ ESCALATED (admin queue)
 *   OPEN/SELLER_RESPONDED/ESCALATED ──admin outcome──▶ RESOLVED
 *   OPEN ──buyer withdraws (buyerCancelOwn)──▶ CANCELLED
 *
 * Settings enforced here:
 *   enabled, windowDays, reasons[], workflow, autoEscalateDays, sellerResponseDays,
 *   outcomes[], affectsSellerRating, affectsVerification, onlyAdminClose, buyerCancelOwn.
 * Side rules enforced elsewhere:
 *   distribution.excludeDisputed (seller eligibility in rfqTransition SUBMIT),
 *   verification.autoSuspendAfterDisputes (distribution suspension), and
 *   sellerRating.showDisputeCount (trust chip in getRfq sellerMeta).
 */

export class DisputeServiceError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    super.name = 'DisputeServiceError'
    this.status = status
  }
}

type DisputeStatus = 'OPEN' | 'SELLER_RESPONDED' | 'ESCALATED' | 'RESOLVED' | 'CLOSED' | 'CANCELLED'
const OPEN_LIKE: DisputeStatus[] = ['OPEN', 'SELLER_RESPONDED', 'ESCALATED']

const REASON_LABELS: Record<string, string> = {
  NOT_AS_DESCRIBED: 'Not as described',
  DAMAGED: 'Damaged',
  LATE_DELIVERY: 'Late delivery',
  WRONG_QUANTITY: 'Wrong quantity',
  QUALITY_ISSUE: 'Quality issue',
  PAYMENT_NOT_RECEIVED: 'Payment not received',
  OTHER: 'Other',
}

const OUTCOME_LABELS: Record<string, string> = {
  FULL_REFUND: 'Full refund',
  PARTIAL_REFUND: 'Partial refund',
  REPLACEMENT: 'Replacement',
  REPAIR: 'Repair',
  NO_ACTION: 'No action',
  SELLER_PENALTY: 'Seller penalty',
}

export function disputeReasonLabel(reason: string): string {
  return REASON_LABELS[reason] ?? reason
}

export function disputeOutcomeLabel(outcome: string): string {
  return OUTCOME_LABELS[outcome] ?? outcome
}

/** Money fields are raw floats — normalize defensively (null-safe). */
type DisputeRow = {
  id: string
  number: string
  orderId: string
  raisedById: string
  sellerId: string
  rfqId: string | null
  reason: string
  description: string
  amount: unknown
  status: string
  sellerResponse: string | null
  sellerRespondedAt: Date | null
  escalateAt: Date | null
  outcome: string | null
  resolutionNote: string | null
  resolvedById: string | null
  resolvedAt: Date | null
  closedAt: Date | null
  createdAt: Date
  order: { id: string; poNumber: string | null; total: number; items: { id: string }[] }
  raisedBy: { id: string; name: string }
  seller: { id: string; name: string; storeName: string | null }
  resolvedBy: { id: string; name: string } | null
}

function serializeDispute(d: DisputeRow): DisputeDTO {
  return {
    id: d.id,
    number: d.number,
    orderId: d.orderId,
    orderNumber: d.order.poNumber ?? d.order.id.slice(-8).toUpperCase(),
    rfqId: d.rfqId,
    reason: d.reason,
    description: d.description,
    amount: d.amount == null ? null : Number(d.amount),
    status: d.status,
    sellerResponse: d.sellerResponse,
    sellerRespondedAt: d.sellerRespondedAt?.toISOString() ?? null,
    escalateAt: d.escalateAt?.toISOString() ?? null,
    outcome: d.outcome,
    resolutionNote: d.resolutionNote,
    resolvedAt: d.resolvedAt?.toISOString() ?? null,
    closedAt: d.closedAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
    buyer: { id: d.raisedBy.id, name: d.raisedBy.name },
    seller: { id: d.seller.id, name: d.seller.name, storeName: d.seller.storeName },
    resolvedBy: d.resolvedBy ? { id: d.resolvedBy.id, name: d.resolvedBy.name } : null,
    orderTotal: d.order.total,
    itemCount: d.order.items.length,
  }
}

const DISPUTE_INCLUDE = {
  order: { select: { id: true, poNumber: true, total: true, items: { select: { id: true } } } },
  raisedBy: { select: { id: true, name: true } },
  seller: { select: { id: true, name: true, storeName: true } },
  resolvedBy: { select: { id: true, name: true } },
} as const

// ── Create ───────────────────────────────────────────────────────────────────

export interface CreateDisputeInput {
  orderId: string
  sellerId?: string | null
  reason: string
  description: string
  amount?: number | null
}

export async function createDispute(
  input: CreateDisputeInput,
  actor: { id: string; role: string }
): Promise<DisputeDTO> {
  const order = await db.order.findUnique({
    where: { id: input.orderId },
    include: {
      items: { select: { sellerId: true } },
      disputes: { select: { sellerId: true, raisedById: true, status: true } },
    },
  })
  if (!order) throw new DisputeServiceError('Order not found', 404)
  if (order.buyerId !== actor.id && actor.role !== 'ADMIN') {
    throw new DisputeServiceError('Only the buyer can dispute this order', 403)
  }
  if (order.status === 'CANCELLED') {
    throw new DisputeServiceError('Cancelled orders cannot be disputed', 409)
  }

  // Settings scope: resolve through the order's org context
  const settings = await resolvePanel('disputes', order.organizationId ? { orgId: order.organizationId } : {})
  if (!settings.enabled) {
    throw new DisputeServiceError('Disputes are currently disabled by the platform', 403)
  }
  const reasons: string[] = (settings.reasons as string[]) ?? []
  if (!reasons.includes(input.reason)) {
    throw new DisputeServiceError('That dispute reason is not accepted', 422)
  }

  // Dispute window — measured from order placement (orders don't track a
  // deliveredAt stamp yet; the window is generous to in-flight orders too)
  const windowMs = Number(settings.windowDays) * 86_400_000
  if (Date.now() - order.createdAt.getTime() > windowMs) {
    throw new DisputeServiceError(
      `The ${settings.windowDays}-day dispute window for this order has closed`,
      409
    )
  }

  // Target seller: explicit, or derived when the order is single-seller
  const sellerIds = [...new Set(order.items.map((i) => i.sellerId))]
  const sellerId = input.sellerId ?? (sellerIds.length === 1 ? sellerIds[0] : null)
  if (!sellerId || !sellerIds.includes(sellerId)) {
    throw new DisputeServiceError('Pick which seller this dispute is about', 422)
  }

  // Duplicate guard — one open dispute per order+seller pair
  if (
    order.disputes.some(
      (d) => d.sellerId === sellerId && OPEN_LIKE.includes(d.status as DisputeStatus)
    )
  ) {
    throw new DisputeServiceError('There is already an open dispute for this seller on this order', 409)
  }

  const now = new Date()
  const escalateAt = new Date(now.getTime() + Number(settings.autoEscalateDays) * 86_400_000)
  const number = await nextNumber('DSP')

  const dispute = await db.dispute.create({
    data: {
      number,
      orderId: order.id,
      raisedById: order.buyerId, // always the buyer of record
      sellerId,
      rfqId: null, // linked below when the order came from a quote
      reason: input.reason,
      description: input.description,
      amount: input.amount ?? null,
      status: 'OPEN',
      escalateAt,
    },
    include: DISPUTE_INCLUDE,
  })

  // RFQ context: if the order was converted from a quote, carry the rfqId
  const converted = await db.quote.findFirst({
    where: { id: order.sourceQuoteId ?? undefined },
    select: { rfqId: true },
  })
  if (converted) {
    await db.dispute.update({ where: { id: dispute.id }, data: { rfqId: converted.rfqId } })
  }

  // Notifications: seller + platform admins
  const emits: EmitInput[] = [
    {
      userId: sellerId,
      type: 'RFQ_DISPUTE',
      title: `Dispute ${number} opened on order ${order.poNumber ?? dispute.order.id.slice(-8).toUpperCase()}`,
      body: `Reason: ${disputeReasonLabel(input.reason)} — respond within ${settings.sellerResponseDays} days.`,
      linkView: 'disputes',
      linkId: dispute.id,
    },
  ]
  const admins = await db.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })
  for (const a of admins) {
    emits.push({
      userId: a.id,
      type: 'RFQ_DISPUTE',
      title: `New dispute ${number}`,
      body: `${dispute.raisedBy.name} vs ${dispute.seller.name} — ${disputeReasonLabel(input.reason)}.`,
      linkView: 'disputes',
      linkId: dispute.id,
    })
  }
  await emitNotifications(emits)

  await recordAudit({
    actorId: actor.id,
    actorType: actor.role === 'ADMIN' ? 'ADMIN' : 'USER',
    action: 'DISPUTE_OPENED',
    entityType: 'Dispute',
    entityId: dispute.id,
    summary: `Dispute ${number} opened (${disputeReasonLabel(input.reason)})`,
    metadata: { orderId: order.id, sellerId, reason: input.reason },
  })

  return serializeDispute(dispute as unknown as DisputeRow)
}

// ── Seller response ─────────────────────────────────────────────────────────

export async function respondToDispute(
  disputeId: string,
  actor: { id: string; role: string },
  response: string
): Promise<DisputeDTO> {
  const dispute = await db.dispute.findUnique({ where: { id: disputeId }, include: DISPUTE_INCLUDE })
  if (!dispute) throw new DisputeServiceError('Dispute not found', 404)
  if (dispute.sellerId !== actor.id && actor.role !== 'ADMIN') {
    throw new DisputeServiceError('Only the disputed seller can respond', 403)
  }
  if (!OPEN_LIKE.includes(dispute.status as DisputeStatus)) {
    throw new DisputeServiceError('This dispute is already closed', 409)
  }

  const settings = await resolvePanel('disputes', await orgCtxForOrder(dispute.orderId))
  const now = new Date()
  const late =
    dispute.sellerRespondedAt == null &&
    now.getTime() - dispute.createdAt.getTime() > Number(settings.sellerResponseDays) * 86_400_000

  const updated = await db.dispute.update({
    where: { id: disputeId },
    data: {
      sellerResponse: late ? `[Late response] ${response}` : response,
      sellerRespondedAt: now,
      status: 'SELLER_RESPONDED',
      escalateAt: new Date(now.getTime() + Number(settings.autoEscalateDays) * 86_400_000),
    },
    include: DISPUTE_INCLUDE,
  })

  await emitNotification({
    userId: dispute.raisedById,
    type: 'RFQ_DISPUTE_STATUS',
    title: `Seller responded to dispute ${dispute.number}`,
    body: late ? 'The response arrived after the response window.' : 'Review the response in your orders.',
    linkView: 'orders',
    linkId: dispute.orderId,
  })

  await recordAudit({
    actorId: actor.id,
    actorType: actor.role === 'ADMIN' ? 'ADMIN' : 'SELLER',
    action: 'DISPUTE_RESPONDED',
    entityType: 'Dispute',
    entityId: disputeId,
    summary: `Seller responded to dispute ${dispute.number}${late ? ' (late)' : ''}`,
    metadata: { disputeId, late },
  })

  return serializeDispute(updated as unknown as DisputeRow)
}

// ── Buyer cancel ────────────────────────────────────────────────────────────

export async function cancelDispute(
  disputeId: string,
  actor: { id: string; role: string }
): Promise<DisputeDTO> {
  const dispute = await db.dispute.findUnique({ where: { id: disputeId }, include: DISPUTE_INCLUDE })
  if (!dispute) throw new DisputeServiceError('Dispute not found', 404)

  const settings = await resolvePanel('disputes', await orgCtxForOrder(dispute.orderId))
  const isBuyer = dispute.raisedById === actor.id
  const isAdmin = actor.role === 'ADMIN'
  if (!isBuyer && !isAdmin) throw new DisputeServiceError('Not your dispute', 403)
  if (isBuyer && !isAdmin && !settings.buyerCancelOwn) {
    throw new DisputeServiceError('Buyers cannot withdraw disputes on this platform', 403)
  }
  if (!OPEN_LIKE.includes(dispute.status as DisputeStatus)) {
    throw new DisputeServiceError('This dispute is already closed', 409)
  }

  const now = new Date()
  const updated = await db.dispute.update({
    where: { id: disputeId },
    data: { status: 'CANCELLED', closedAt: now },
    include: DISPUTE_INCLUDE,
  })

  await emitNotification({
    userId: dispute.sellerId,
    type: 'RFQ_DISPUTE_STATUS',
    title: `Dispute ${dispute.number} withdrawn`,
    body: 'The buyer withdrew the dispute. No further action needed.',
    linkView: 'disputes',
    linkId: disputeId,
  })

  await recordAudit({
    actorId: actor.id,
    actorType: isAdmin ? 'ADMIN' : 'USER',
    action: 'DISPUTE_CANCELLED',
    entityType: 'Dispute',
    entityId: disputeId,
    summary: `Dispute ${dispute.number} withdrawn`,
  })

  return serializeDispute(updated as unknown as DisputeRow)
}

// ── Admin resolution ─────────────────────────────────────────────────────────

export interface ResolveDisputeInput {
  outcome: string
  note?: string | null
  amount?: number | null
}

export async function resolveDispute(
  disputeId: string,
  actor: { id: string; role: string },
  input: ResolveDisputeInput
): Promise<DisputeDTO> {
  if (actor.role !== 'ADMIN') throw new DisputeServiceError('Only platform admins resolve disputes', 403)
  const dispute = await db.dispute.findUnique({ where: { id: disputeId }, include: DISPUTE_INCLUDE })
  if (!dispute) throw new DisputeServiceError('Dispute not found', 404)
  if (!OPEN_LIKE.includes(dispute.status as DisputeStatus)) {
    throw new DisputeServiceError('This dispute is already closed', 409)
  }

  const settings = await resolvePanel('disputes', await orgCtxForOrder(dispute.orderId))
  const outcomes: string[] = (settings.outcomes as string[]) ?? []
  if (!outcomes.includes(input.outcome)) {
    throw new DisputeServiceError('That outcome is not allowed by platform settings', 422)
  }

  const now = new Date()
  const updated = await db.dispute.update({
    where: { id: disputeId },
    data: {
      status: 'RESOLVED',
      outcome: input.outcome,
      resolutionNote: input.note ?? null,
      resolvedById: actor.id,
      resolvedAt: now,
      closedAt: now,
      ...(input.amount != null && settings.allowPartial ? { amount: input.amount } : {}),
    },
    include: DISPUTE_INCLUDE,
  })

  // ── Outcome effects on the seller (settings-gated) ──
  const sellerLost = ['FULL_REFUND', 'PARTIAL_REFUND', 'SELLER_PENALTY'].includes(input.outcome)
  let ratingPenaltyApplied = false
  let verificationRevoked = false
  if (sellerLost) {
    if (settings.affectsVerification) {
      // A lost dispute revokes the platform verification stamp — the seller is
      // filtered out of verified-only distribution and drops back into the
      // quote review queue (routing settings react to verifiedAt).
      await db.user.update({ where: { id: dispute.sellerId }, data: { verifiedAt: null } })
      verificationRevoked = true
    }
    if (settings.affectsSellerRating) {
      // Rating is review-derived; a lost dispute applies a -0.25 reliability
      // penalty per lost dispute via sellerMeta (computed in getRfq) instead of
      // fabricating reviews.
      ratingPenaltyApplied = true
    }
    // Auto-suspension: too many OPEN disputes blocks the seller from new RFQ
    // distribution (verification.autoSuspendAfterDisputes).
    const verification = await resolvePanel('verification')
    const openCount = await db.dispute.count({
      where: { sellerId: dispute.sellerId, status: { in: OPEN_LIKE } },
    })
    if (openCount >= Number(verification.autoSuspendAfterDisputes)) {
      await db.user.update({ where: { id: dispute.sellerId }, data: { verifiedAt: null } })
      verificationRevoked = true
      await emitNotification({
        userId: dispute.sellerId,
        type: 'RFQ_DISPUTE_STATUS',
        title: 'Account suspended from new quote requests',
        body: `${openCount} open disputes exceeded the platform limit. Resolve them to restore distribution.`,
        linkView: 'seller',
        linkId: null,
      })
    }
  }

  const emits: EmitInput[] = [
    {
      userId: dispute.raisedById,
      type: 'RFQ_DISPUTE_STATUS',
      title: `Dispute ${dispute.number} resolved — ${disputeOutcomeLabel(input.outcome)}`,
      body: input.note?.slice(0, 300) ?? 'A platform admin has closed your dispute.',
      linkView: 'orders',
      linkId: dispute.orderId,
    },
    {
      userId: dispute.sellerId,
      type: 'RFQ_DISPUTE_STATUS',
      title: `Dispute ${dispute.number} resolved — ${disputeOutcomeLabel(input.outcome)}`,
      body: [
        input.note?.slice(0, 300) ?? 'A platform admin has closed this dispute.',
        ratingPenaltyApplied ? 'Your seller rating takes a reliability penalty.' : '',
        verificationRevoked ? 'Your verification status has been revoked.' : '',
      ]
        .filter(Boolean)
        .join(' '),
      linkView: 'disputes',
      linkId: disputeId,
    },
  ]
  await emitNotifications(emits)

  await recordAudit({
    actorId: actor.id,
    actorType: 'ADMIN',
    action: 'DISPUTE_RESOLVED',
    entityType: 'Dispute',
    entityId: disputeId,
    summary: `Dispute ${dispute.number} resolved: ${disputeOutcomeLabel(input.outcome)}`,
    metadata: {
      outcome: input.outcome,
      ratingPenaltyApplied,
      verificationRevoked,
    },
  })

  return serializeDispute(updated as unknown as DisputeRow)
}

// ── Lazy sweep (escalation + auto-resolve) ──────────────────────────────────

/**
 * Called from the same read paths as expireStaleQuotes: escalates disputes
 * unresolved past autoEscalateDays, and (AUTO_RESOLVE workflow only) closes
 * disputes where the seller never responded within sellerResponseDays.
 */
export async function sweepDisputes(): Promise<void> {
  const now = new Date()

  // Escalate unresolved disputes past their deadline (conditional update —
  // concurrent sweeps never escalate or notify twice)
  const due = await db.dispute.findMany({
    where: { status: { in: ['OPEN', 'SELLER_RESPONDED'] }, escalateAt: { lt: now } },
    include: DISPUTE_INCLUDE,
  })
  for (const d of due) {
    const escalated = await db.dispute.updateMany({
      where: { id: d.id, status: { in: ['OPEN', 'SELLER_RESPONDED'] } },
      data: { status: 'ESCALATED' },
    })
    if (escalated.count === 0) continue
    const admins = await db.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })
    await emitNotifications([
      {
        userId: d.raisedById,
        type: 'RFQ_DISPUTE_STATUS',
        title: `Dispute ${d.number} escalated to platform admins`,
        body: 'No agreement was reached in time; an admin will now mediate.',
        linkView: 'orders',
        linkId: d.orderId,
      },
      ...admins.map((a) => ({
        userId: a.id,
        type: 'RFQ_DISPUTE_STATUS' as const,
        title: `Dispute ${d.number} needs mediation`,
        body: 'Auto-escalated after the resolution window lapsed.',
        linkView: 'disputes' as const,
        linkId: d.id,
      })),
    ])
    await recordAudit({
      actorId: null,
      actorType: 'SYSTEM',
      action: 'DISPUTE_ESCALATED',
      entityType: 'Dispute',
      entityId: d.id,
      summary: `Dispute ${d.number} auto-escalated`,
    })
  }

  // AUTO_RESOLVE workflow: seller silence past the response window → the
  // system records the outcome in the buyer's favor (default FULL_REFUND).
  const settings = await resolvePanel('disputes')
  if (settings.enabled && settings.workflow === 'AUTO_RESOLVE') {
    const cutoff = new Date(now.getTime() - Number(settings.sellerResponseDays) * 86_400_000)
    const silent = await db.dispute.findMany({
      where: { status: 'OPEN', sellerRespondedAt: null, createdAt: { lt: cutoff } },
      include: DISPUTE_INCLUDE,
    })
    const outcomes: string[] = (settings.outcomes as string[]) ?? []
    const fallbackOutcome = outcomes.includes('FULL_REFUND') ? 'FULL_REFUND' : (outcomes[0] ?? 'NO_ACTION')
    for (const d of silent) {
      const resolved = await db.dispute.updateMany({
        where: { id: d.id, status: 'OPEN', sellerRespondedAt: null },
        data: {
          status: 'RESOLVED',
          outcome: fallbackOutcome,
          resolutionNote: 'Auto-resolved: the seller did not respond within the response window.',
          resolvedAt: now,
          closedAt: now,
        },
      })
      if (resolved.count === 0) continue
      if (settings.affectsVerification && ['FULL_REFUND', 'PARTIAL_REFUND', 'SELLER_PENALTY'].includes(fallbackOutcome)) {
        await db.user.update({ where: { id: d.sellerId }, data: { verifiedAt: null } })
      }
      await emitNotification({
        userId: d.raisedById,
        type: 'RFQ_DISPUTE_STATUS',
        title: `Dispute ${d.number} auto-resolved in your favor`,
        body: `The seller never responded — outcome recorded as ${disputeOutcomeLabel(fallbackOutcome)}.`,
        linkView: 'orders',
        linkId: d.orderId,
      })
      await recordAudit({
        actorId: null,
        actorType: 'SYSTEM',
        action: 'DISPUTE_AUTO_RESOLVED',
        entityType: 'Dispute',
        entityId: d.id,
        summary: `Dispute ${d.number} auto-resolved (${fallbackOutcome}) — seller non-response`,
      })
    }
  }
}

// ── Queries ─────────────────────────────────────────────────────────────────

export async function listMyDisputes(
  userId: string,
  role: string
): Promise<{ raised: DisputeDTO[]; against: DisputeDTO[] }> {
  const [raised, against] = await Promise.all([
    db.dispute.findMany({
      where: { raisedById: userId },
      orderBy: { createdAt: 'desc' },
      include: DISPUTE_INCLUDE,
    }),
    role === 'SELLER' || role === 'ADMIN'
      ? db.dispute.findMany({
          where: { sellerId: userId },
          orderBy: { createdAt: 'desc' },
          include: DISPUTE_INCLUDE,
        })
      : Promise.resolve([]),
  ])
  return {
    raised: raised.map((d) => serializeDispute(d as unknown as DisputeRow)),
    against: against.map((d) => serializeDispute(d as unknown as DisputeRow)),
  }
}

export async function adminListDisputes(status?: string): Promise<DisputeDTO[]> {
  const rows = await db.dispute.findMany({
    where: status && status !== 'ALL' ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: DISPUTE_INCLUDE,
  })
  return rows.map((d) => serializeDispute(d as unknown as DisputeRow))
}

export async function getDispute(
  disputeId: string,
  viewer: { id: string; role: string }
): Promise<DisputeDTO> {
  const d = await db.dispute.findUnique({ where: { id: disputeId }, include: DISPUTE_INCLUDE })
  if (!d) throw new DisputeServiceError('Dispute not found', 404)
  const allowed =
    viewer.role === 'ADMIN' || d.raisedById === viewer.id || d.sellerId === viewer.id
  if (!allowed) throw new DisputeServiceError('Not your dispute', 403)
  return serializeDispute(d as unknown as DisputeRow)
}

/** Disputes visible on a specific order (for the orders view). */
export async function disputesForOrder(
  orderId: string,
  viewer: { id: string; role: string }
): Promise<DisputeDTO[]> {
  const order = await db.order.findUnique({ where: { id: orderId }, select: { buyerId: true } })
  if (!order) throw new DisputeServiceError('Order not found', 404)
  if (order.buyerId !== viewer.id && viewer.role !== 'ADMIN') {
    throw new DisputeServiceError('Not your order', 403)
  }
  const rows = await db.dispute.findMany({
    where: { orderId },
    orderBy: { createdAt: 'desc' },
    include: DISPUTE_INCLUDE,
  })
  return rows.map((d) => serializeDispute(d as unknown as DisputeRow))
}

/** Open-dispute counts per seller id (trust chips + distribution exclusion). */
export async function openDisputeCountBySeller(sellerIds: string[]): Promise<Map<string, number>> {
  if (sellerIds.length === 0) return new Map()
  const grouped = await db.dispute.groupBy({
    by: ['sellerId'],
    where: { sellerId: { in: sellerIds }, status: { in: OPEN_LIKE } },
    _count: { id: true },
  })
  return new Map(grouped.map((g) => [g.sellerId, g._count.id]))
}

/** Disputes resolved AGAINST a seller (rating penalty input). */
export async function lostDisputeCountBySeller(sellerIds: string[]): Promise<Map<string, number>> {
  if (sellerIds.length === 0) return new Map()
  const grouped = await db.dispute.groupBy({
    by: ['sellerId'],
    where: {
      sellerId: { in: sellerIds },
      status: 'RESOLVED',
      outcome: { in: ['FULL_REFUND', 'PARTIAL_REFUND', 'SELLER_PENALTY'] },
    },
    _count: { id: true },
  })
  return new Map(grouped.map((g) => [g.sellerId, g._count.id]))
}

// ── helpers ─────────────────────────────────────────────────────────────────

async function orgCtxForOrder(orderId: string) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { organizationId: true },
  })
  if (!order?.organizationId) return {}
  const org = await db.organization.findUnique({
    where: { id: order.organizationId },
    select: { orgType: true },
  })
  return org ? { orgId: order.organizationId, orgType: org.orgType } : { orgId: order.organizationId }
}