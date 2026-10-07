import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import { recordAudit } from '@/server/modules/audit/service'
import { emitNotification, emitNotifications, type EmitInput } from '@/server/modules/notifications/service'

/**
 * APPROVALS — B2B purchase-approval workflow.
 *
 * When an organization sets an approvalThreshold, BUYER-role members trigger
 * an approval request whenever they (a) place a cart order, (b) accept a
 * quote, or (c) accept a financing offer whose amount is at or above the
 * threshold (OFFER_ACCEPT — tenant-audit REPORT §8.1). The order/quote/offer
 * is held until an OWNER/ADMIN/APPROVER member decides. Requesters never
 * self-approve.
 */

export class ApprovalServiceError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

const APPROVAL_ROLES = ['OWNER', 'ADMIN', 'APPROVER'] as const // members who can decide

/** Resolve the viewer's membership in a specific organization. */
export async function findMembership(userId: string, organizationId: string) {
  return db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    include: { organization: true },
  })
}

/**
 * Does this purchase need org approval? Rule: the org has a threshold, is
 * ACTIVE, the member's role is BUYER, and the amount reaches the threshold.
 * OWNER/ADMIN/APPROVER members bypass (they hold the budget).
 */
export function needsApproval(
  org: { status: string; approvalThreshold: Date | number | string | null },
  memberRole: string,
  amount: number
): boolean {
  if (org.status !== 'ACTIVE') return false
  if (memberRole !== 'BUYER') return false
  const threshold = org.approvalThreshold === null ? null : Number(org.approvalThreshold)
  if (threshold === null || threshold <= 0) return false
  return amount >= threshold
}

type RequesterInfo = { id: string; name: string }

/** Notify the org's approvers (minus the requester) that a purchase awaits them. */
async function notifyApprovers(
  organizationId: string,
  requesterId: string,
  input: { type: 'order' | 'quote'; title: string; body: string; linkView: 'business'; linkId?: string | null }
) {
  const approvers = await db.organizationMember.findMany({
    where: { organizationId, role: { in: [...APPROVAL_ROLES] }, userId: { not: requesterId } },
    select: { userId: true },
  })
  await emitNotifications(
    approvers.map((a) => ({
      userId: a.userId,
      type: 'APPROVAL_REQUESTED',
      title: input.title,
      body: input.body,
      linkView: input.linkView,
      linkId: input.linkId ?? null,
    }))
  )
}

/** Create the pending ORDER approval (called inside the checkout transaction). */
export async function createOrderApprovalRequest(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  input: {
    organizationId: string
    orderId: string
    requester: RequesterInfo
    amount: number
    note?: string | null
  }
) {
  return tx.approvalRequest.create({
    data: {
      organizationId: input.organizationId,
      type: 'ORDER',
      orderId: input.orderId,
      requesterId: input.requester.id,
      amount: input.amount,
      note: input.note?.slice(0, 500) ?? null,
    },
  })
}

/** Post-commit bell event for a held order (call after the checkout tx succeeds). */
export async function notifyOrderApprovalRequested(input: {
  organizationId: string
  requesterId: string
  requesterName: string
  amount: number
  itemCount: number
}) {
  await notifyApprovers(input.organizationId, input.requesterId, {
    type: 'order',
    title: 'Order needs approval',
    body: `${input.requesterName} placed a $${input.amount.toFixed(2)} order (${input.itemCount} item${input.itemCount === 1 ? '' : 's'}) awaiting your decision.`,
    linkView: 'business',
    linkId: null,
  })
}

/** Create the pending QUOTE_ACCEPT approval (quote stays SENT until approved). */
export async function createQuoteAcceptApprovalRequest(input: {
  organizationId: string
  quoteId: string
  rfqId: string
  requester: RequesterInfo
  amount: number
}) {
  const existing = await db.approvalRequest.findFirst({
    where: { quoteId: input.quoteId, status: 'PENDING' },
  })
  if (existing) {
    throw new ApprovalServiceError('This quote acceptance is already awaiting approval', 409)
  }
  const request = await db.approvalRequest.create({
    data: {
      organizationId: input.organizationId,
      type: 'QUOTE_ACCEPT',
      quoteId: input.quoteId,
      rfqId: input.rfqId,
      requesterId: input.requester.id,
      amount: input.amount,
    },
  })
  await recordAudit({
    actorId: input.requester.id,
    actorType: 'USER',
    action: 'APPROVAL_REQUESTED',
    entityType: 'ApprovalRequest',
    entityId: request.id,
    summary: `Quote acceptance routed for approval ($${input.amount.toFixed(2)})`,
    metadata: { quoteId: input.quoteId, rfqId: input.rfqId, organizationId: input.organizationId },
  })
  await notifyApprovers(input.organizationId, input.requester.id, {
    type: 'quote',
    title: `Quote acceptance needs approval`,
    body: `${input.requester.name} wants to accept a $${input.amount.toFixed(2)} quote — your decision releases the deal.`,
    linkView: 'business',
    linkId: input.rfqId,
  })
  return request
}

/**
 * Create the pending OFFER_ACCEPT approval (financing offer stays SENT until
 * approved) — TENANT-AUDIT REPORT §8.1 threshold-parity extension. A BUYER
 * member at/above the org threshold routes their financing-offer acceptance
 * here instead of being denied; the offer is only accepted when an approver
 * releases the request.
 */
export async function createOfferAcceptApprovalRequest(input: {
  organizationId: string
  offerId: string
  requester: RequesterInfo
  amount: number
  currency: string
}) {
  const existing = await db.approvalRequest.findFirst({
    where: { offerId: input.offerId, status: 'PENDING' },
  })
  if (existing) {
    throw new ApprovalServiceError('This offer acceptance is already awaiting approval', 409)
  }
  const request = await db.approvalRequest.create({
    data: {
      organizationId: input.organizationId,
      type: 'OFFER_ACCEPT',
      offerId: input.offerId,
      requesterId: input.requester.id,
      amount: input.amount,
    },
  })
  await recordAudit({
    actorId: input.requester.id,
    actorType: 'USER',
    action: 'APPROVAL_REQUESTED',
    entityType: 'ApprovalRequest',
    entityId: request.id,
    summary: `Financing offer acceptance routed for approval (${input.amount.toLocaleString()} ${input.currency})`,
    metadata: { offerId: input.offerId, organizationId: input.organizationId },
  })
  await notifyApprovers(input.organizationId, input.requester.id, {
    type: 'quote',
    title: `Financing offer acceptance needs approval`,
    body: `${input.requester.name} wants to accept a ${input.amount.toLocaleString()} ${input.currency} financing offer — your decision binds the organization to the agreement.`,
    linkView: 'business',
    linkId: null,
  })
  return request
}

const approvalInclude = {
  requester: { select: { id: true, name: true, email: true } },
  decidedBy: { select: { id: true, name: true, email: true } },
  order: { include: { items: true } },
  quote: { select: { id: true, number: true, total: true, paymentTerms: true, validUntil: true, status: true } },
  financingOffer: {
    select: {
      id: true,
      amount: true,
      currency: true,
      tenorMonths: true,
      rateType: true,
      ratePercent: true,
      status: true,
      requestId: true,
      request: { select: { number: true } },
    },
  },
} satisfies Prisma.ApprovalRequestInclude

// TENANT-AUDIT follow-up: the row type now derives from the ACTUAL include —
// the old `findFirstOrThrow` return type omitted the relations, producing 23
// phantom TS2551 errors on serializeApproval.
type ApprovalRaw = Prisma.ApprovalRequestGetPayload<{ include: typeof approvalInclude }>

function serializeApproval(r: ApprovalRaw) {
  const amount = Number(r.amount)
  return {
    id: r.id,
    organizationId: r.organizationId,
    type: r.type,
    status: r.status,
    amount,
    note: r.note,
    decisionNote: r.decisionNote,
    createdAt: r.createdAt.toISOString(),
    decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
    requester: r.requester ? { id: r.requester.id, name: r.requester.name, email: r.requester.email } : null,
    decidedBy: r.decidedBy ? { id: r.decidedBy.id, name: r.decidedBy.name, email: r.decidedBy.email } : null,
    order:
      r.type === 'ORDER' && r.order
        ? {
            id: r.order.id,
            status: r.order.status,
            total: r.order.total,
            poNumber: r.order.poNumber,
            createdAt: r.order.createdAt.toISOString(),
            items: r.order.items.map((i) => ({
              title: i.title,
              quantity: i.quantity,
              price: i.price,
              variantName: i.variantName,
              image: i.image,
            })),
          }
        : null,
    quote:
      r.type === 'QUOTE_ACCEPT' && r.quote
        ? {
            id: r.quote.id,
            number: r.quote.number,
            total: Number(r.quote.total),
            paymentTerms: r.quote.paymentTerms,
            validUntil: r.quote.validUntil ? r.quote.validUntil.toISOString() : null,
            status: r.quote.status,
          }
        : null,
    financingOffer:
      r.type === 'OFFER_ACCEPT' && r.financingOffer
        ? {
            id: r.financingOffer.id,
            amount: Number(r.financingOffer.amount),
            currency: r.financingOffer.currency,
            tenorMonths: r.financingOffer.tenorMonths,
            rateType: r.financingOffer.rateType,
            ratePercent: r.financingOffer.ratePercent,
            status: r.financingOffer.status,
            requestId: r.financingOffer.requestId,
            requestNumber: r.financingOffer.request.number,
          }
        : null,
    rfqId: r.rfqId,
  }
}

export type ApprovalRequestDTO = ReturnType<typeof serializeApproval>

/**
 * List approvals for the viewer:
 * - OWNER/ADMIN/APPROVER: their organization's queue (pending first, recent
 *   decisions below for context).
 * - BUYER/VIEWER: only their own requests (track status).
 */
export async function listApprovals(userId: string) {
  const memberships = await db.organizationMember.findMany({
    where: { userId },
    include: { organization: { select: { id: true, name: true, approvalThreshold: true } } },
  })
  if (memberships.length === 0) return { approvals: [] as ApprovalRequestDTO[], canDecide: false, organizationId: null }

  // One user belongs to at most a couple of orgs in practice; surface the one
  // with an approval setup, else the first.
  const org =
    memberships.find((m) => m.organization.approvalThreshold !== null)?.organization ??
    memberships[0].organization
  const role = memberships.find((m) => m.organizationId === org.id)!.role
  const canDecide = (APPROVAL_ROLES as readonly string[]).includes(role)

  const where = canDecide ? { organizationId: org.id } : { organizationId: org.id, requesterId: userId }
  const rows = await db.approvalRequest.findMany({
    where,
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 50,
    include: approvalInclude,
  })

  return {
    approvals: rows.map(serializeApproval),
    canDecide,
    organizationId: org.id,
  }
}

/**
 * Decide a pending approval (APPROVE or REJECT). The requester can never
 * decide their own request. APPROVE releases the held order (→ PAID) or
 * performs the quote acceptance; REJECT cancels the order (restock) or leaves
 * the quote open.
 */
export async function decideApproval(
  approvalId: string,
  decider: { id: string; name: string },
  action: 'APPROVE' | 'REJECT',
  decisionNote?: string
) {
  const request = await db.approvalRequest.findUnique({
    where: { id: approvalId },
    include: { order: { include: { items: true } }, quote: true, financingOffer: true, organization: true },
  })
  if (!request) throw new ApprovalServiceError('Approval request not found', 404)
  if (request.status !== 'PENDING')
    throw new ApprovalServiceError(`This request was already ${request.status.toLowerCase()}`, 409)
  if (request.requesterId === decider.id)
    throw new ApprovalServiceError('You cannot approve your own request — ask another approver', 403)

  const membership = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: request.organizationId, userId: decider.id } },
  })
  if (!membership || !(APPROVAL_ROLES as readonly string[]).includes(membership.role))
    throw new ApprovalServiceError('Only organization owners, admins and approvers can decide', 403)

  const now = new Date()
  const amount = Number(request.amount)

  if (action === 'APPROVE') {
    if (request.type === 'ORDER') {
      if (!request.order) throw new ApprovalServiceError('The linked order no longer exists', 409)
      if (request.order.status !== 'PENDING_APPROVAL')
        throw new ApprovalServiceError('The linked order is no longer awaiting approval', 409)
      await db.$transaction(async (tx) => {
        // Payment comes AFTER org approval now — the buyer settles the approved
        // order from their orders page (card or bank transfer).
        await tx.order.update({ where: { id: request.orderId! }, data: { status: 'PENDING_PAYMENT' } })
        await tx.approvalRequest.update({
          where: { id: approvalId },
          data: { status: 'APPROVED', decidedById: decider.id, decidedAt: now, decisionNote: decisionNote?.slice(0, 500) ?? null },
        })
      })
    } else if (request.type === 'OFFER_ACCEPT') {
      // TENANT-AUDIT REPORT §8.1 — perform the financing-offer acceptance the
      // requester asked for (validations, AGR minting, fee accrual, audits,
      // notifications all live in the financing service). The approval row is
      // marked after the acceptance commits; if the offer went stale the
      // decide call fails 409 and the request stays pending for a human.
      if (!request.financingOffer || !request.offerId)
        throw new ApprovalServiceError('The linked financing offer no longer exists', 409)
      const { performOfferAcceptanceForApproval } = await import('@/server/modules/financing/offers')
      await performOfferAcceptanceForApproval(decider, {
        offerId: request.offerId,
        requesterId: request.requesterId,
        organizationId: request.organizationId,
      })
      await db.approvalRequest.update({
        where: { id: approvalId },
        data: { status: 'APPROVED', decidedById: decider.id, decidedAt: now, decisionNote: decisionNote?.slice(0, 500) ?? null },
      })
    } else {
      // QUOTE_ACCEPT — perform the acceptance now (mirrors respondToQuote)
      const quote = request.quote
      if (!quote || quote.status !== 'SENT')
        throw new ApprovalServiceError('The quote is no longer open — cannot accept', 409)
      if (quote.validUntil && quote.validUntil.getTime() < Date.now())
        throw new ApprovalServiceError('The quote has expired — request a revised offer', 409)
      await db.$transaction(async (tx) => {
        await tx.quote.update({
          where: { id: quote.id },
          data: { status: 'ACCEPTED', acceptedAt: now },
        })
        await tx.quote.updateMany({
          where: { rfqId: quote.rfqId, status: 'SENT', id: { not: quote.id } },
          data: { status: 'DECLINED', declinedAt: now },
        })
        await tx.rfq.update({ where: { id: quote.rfqId }, data: { status: 'ACCEPTED', closedAt: now } })
        await tx.approvalRequest.update({
          where: { id: approvalId },
          data: { status: 'APPROVED', decidedById: decider.id, decidedAt: now, decisionNote: decisionNote?.slice(0, 500) ?? null },
        })
      })
    }
  } else {
    // REJECT
    if (request.type === 'ORDER' && request.order && request.order.status === 'PENDING_APPROVAL') {
      await db.$transaction(async (tx) => {
        // Restock every item and roll back sold counts (mirrors buyer cancel)
        for (const item of request.order!.items) {
          if (item.variantId) {
            await tx.productVariant
              .update({
                where: { id: item.variantId },
                data: { stock: { increment: item.quantity } },
              })
              .catch(() => undefined) // variant may have been deleted
          }
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity }, soldCount: { decrement: item.quantity } },
          })
        }
        await tx.order.update({ where: { id: request.orderId! }, data: { status: 'CANCELLED' } })
        await tx.approvalRequest.update({
          where: { id: approvalId },
          data: { status: 'REJECTED', decidedById: decider.id, decidedAt: now, decisionNote: decisionNote?.slice(0, 500) ?? null },
        })
      })
    } else {
      // QUOTE_ACCEPT / OFFER_ACCEPT rejection: the quote/offer simply stays
      // open for the buyer — no state was mutated by the routed acceptance.
      await db.approvalRequest.update({
        where: { id: approvalId },
        data: { status: 'REJECTED', decidedById: decider.id, decidedAt: now, decisionNote: decisionNote?.slice(0, 500) ?? null },
      })
    }
  }

  const kindLabel =
    request.type === 'ORDER' ? 'order' : request.type === 'OFFER_ACCEPT' ? 'financing offer acceptance' : 'quote acceptance'
  await recordAudit({
    actorId: decider.id,
    actorType: 'USER',
    action: action === 'APPROVE' ? 'APPROVAL_GRANTED' : 'APPROVAL_REJECTED',
    entityType: 'ApprovalRequest',
    entityId: approvalId,
    summary:
      action === 'APPROVE'
        ? `Approved ${kindLabel} of $${amount.toFixed(2)}`
        : `Rejected ${kindLabel} of $${amount.toFixed(2)}`,
    metadata: { organizationId: request.organizationId, requesterId: request.requesterId },
  })

  // ── Bell events ──
  await emitNotification({
    userId: request.requesterId,
    type: 'APPROVAL_DECIDED',
    title:
      action === 'APPROVE'
        ? request.type === 'ORDER'
          ? 'Your order was approved'
          : request.type === 'OFFER_ACCEPT'
            ? 'Your financing offer acceptance was approved'
            : 'Your quote acceptance was approved'
        : request.type === 'ORDER'
          ? 'Your order was rejected'
          : request.type === 'OFFER_ACCEPT'
            ? 'Your financing offer acceptance was rejected — the offer stays open'
            : 'Your quote acceptance was rejected',
    body: `${decider.name} ${action === 'APPROVE' ? 'approved' : 'rejected'} the $${amount.toFixed(2)} ${kindLabel}${decisionNote ? ` — “${decisionNote.slice(0, 160)}”` : '.'}`,
    linkView: request.type === 'ORDER' ? 'orders' : request.type === 'OFFER_ACCEPT' ? 'financing' : 'rfq',
    linkId: request.type === 'ORDER' ? request.orderId : request.type === 'OFFER_ACCEPT' ? request.financingOffer?.requestId ?? null : request.rfqId,
  })
  if (action === 'APPROVE' && request.type === 'QUOTE_ACCEPT' && request.quote) {
    // The issuing seller finally learns the acceptance went through
    const quote = await db.quote.findUnique({
      where: { id: request.quoteId! },
      select: { sellerId: true, createdById: true, number: true, rfqId: true },
    })
    if (quote) {
      const sellerRecipient = quote.sellerId ?? quote.createdById
      if (sellerRecipient !== decider.id) {
        await emitNotification({
          userId: sellerRecipient,
          type: 'RFQ_QUOTE_ACCEPTED',
          title: `Quote ${quote.number} accepted`,
          body: `The buyer's approver signed off on $${amount.toFixed(2)} — convert it to an order when ready.`,
          linkView: 'rfq',
          linkId: quote.rfqId,
        })
      }
    }
  }

  const updated = await db.approvalRequest.findUniqueOrThrow({
    where: { id: approvalId },
    include: approvalInclude,
  })
  return serializeApproval(updated)
}

/** Withdraw/cancel a pending request (buyer escape hatch when they cancel the order). */
export async function cancelApprovalForOrder(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  orderId: string
) {
  await tx.approvalRequest.updateMany({
    where: { orderId, status: 'PENDING' },
    data: { status: 'CANCELLED' },
  })
}
