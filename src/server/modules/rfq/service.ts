import { db } from '@/lib/db'
import { recordAudit } from '@/server/modules/audit/service'
import { nextNumber } from '@/server/modules/sequences/service'
import { needsApproval, createQuoteAcceptApprovalRequest } from '@/server/modules/approvals/service'
import type { RfqDTO, QuoteDTO, RfqLineDTO, QuoteLineDTO, RfqMessageDTO } from '@/lib/types'

/**
 * RFQ / QUOTE — the B2B negotiation primitive.
 *
 * RFQ state machine (role-guarded):
 *   DRAFT ──submit──▶ SUBMITTED ──review──▶ UNDER_REVIEW
 *                        │  └───────────────▶ REJECTED
 *                        ▼
 *                     QUOTED ──accept──▶ ACCEPTED ──convert──▶ ORDERED
 *                          │                  │
 *                       expire/──▶ EXPIRED    └─ sibling quotes auto-DECLINE
 *   (any pre-terminal state) ──cancel──▶ CANCELLED   [requester only]
 *
 * Quote lifecycle: SENT → ACCEPTED | DECLINED | EXPIRED | WITHDRAWN
 * Accepting a quote declines its siblings and closes the RFQ.
 */

export class RfqServiceError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

// transition table: status → action → next status (authorization checked separately)
const RFQ_TRANSITIONS: Record<string, Record<string, string>> = {
  DRAFT: { SUBMIT: 'SUBMITTED', CANCEL: 'CANCELLED' },
  SUBMITTED: { REVIEW: 'UNDER_REVIEW', REJECT: 'REJECTED', CANCEL: 'CANCELLED' },
  UNDER_REVIEW: { REJECT: 'REJECTED' },
  QUOTED: { REJECT: 'REJECTED', CANCEL: 'CANCELLED', EXPIRE: 'EXPIRED' },
  ACCEPTED: { CONVERT: 'ORDERED' },
}

function canTransition(status: string, action: string): string | null {
  return RFQ_TRANSITIONS[status]?.[action] ?? null
}

// ── Serialization ───────────────────────────────────────────────────────────

function firstImage(imagesJson: string | null): string | null {
  try {
    const arr = JSON.parse(imagesJson || '[]')
    return Array.isArray(arr) && arr.length > 0 && typeof arr[0] === 'string' ? arr[0] : null
  } catch {
    return null
  }
}

type RfqRaw = Awaited<ReturnType<typeof db.rfq.findFirstOrThrow>>

function serializeRfqLine(l: {
  id: string
  productId: string | null
  productName: string
  sku: string | null
  quantity: number
  targetPrice: { toNumber(): number } | null
  notes: string | null
  product: { id: string; title: string; price: number; images: string } | null
}): RfqLineDTO {
  return {
    id: l.id,
    productId: l.productId,
    productName: l.productName,
    sku: l.sku,
    quantity: l.quantity,
    targetPrice: l.targetPrice ? l.targetPrice.toNumber() : null,
    notes: l.notes,
    product: l.product
      ? {
          id: l.product.id,
          title: l.product.title,
          price: l.product.price,
          image: firstImage(l.product.images),
        }
      : null,
  }
}

function serializeQuote(q: {
  id: string
  number: string
  rfqId: string
  status: string
  currency: string
  subtotal: { toNumber(): number }
  discountTotal: { toNumber(): number }
  shippingTotal: { toNumber(): number }
  taxTotal: { toNumber(): number }
  total: { toNumber(): number }
  paymentTerms: string | null
  validUntil: Date | null
  notes: string | null
  sentAt: Date | null
  acceptedAt: Date | null
  declinedAt: Date | null
  createdAt: Date
  sellerId: string | null
  createdBy: { id: string; name: string }
  lines: {
    id: string
    productId: string
    quantity: number
    unitPrice: { toNumber(): number }
    product: { title: string; images: string } | null
  }[]
}): QuoteDTO {
  return {
    id: q.id,
    number: q.number,
    rfqId: q.rfqId,
    status: q.status,
    currency: q.currency,
    subtotal: q.subtotal.toNumber(),
    discountTotal: q.discountTotal.toNumber(),
    shippingTotal: q.shippingTotal.toNumber(),
    taxTotal: q.taxTotal.toNumber(),
    total: q.total.toNumber(),
    paymentTerms: q.paymentTerms,
    validUntil: q.validUntil?.toISOString() ?? null,
    notes: q.notes,
    sentAt: q.sentAt?.toISOString() ?? null,
    acceptedAt: q.acceptedAt?.toISOString() ?? null,
    declinedAt: q.declinedAt?.toISOString() ?? null,
    createdAt: q.createdAt.toISOString(),
    createdBy: { id: q.createdBy.id, name: q.createdBy.name },
    sellerId: q.sellerId,
    lines: q.lines.map((l): QuoteLineDTO => {
      const unitPrice = l.unitPrice.toNumber()
      return {
        id: l.id,
        productId: l.productId,
        productTitle: l.product?.title,
        image: l.product ? firstImage(l.product.images) : null,
        quantity: l.quantity,
        unitPrice,
        lineTotal: Math.round(unitPrice * l.quantity * 100) / 100,
      }
    }),
  }
}

function serializeRfq(
  r: RfqRaw & {
    organization: { name: string } | null
    user: { id: string; name: string; email: string }
    lines: Parameters<typeof serializeRfqLine>[0][]
    quotes?: Parameters<typeof serializeQuote>[0][]
    _count?: { quotes: number }
  },
  includeQuotes: boolean
): RfqDTO {
  const base: RfqDTO = {
    id: r.id,
    number: r.number,
    status: r.status,
    title: r.title,
    description: r.description,
    organizationId: r.organizationId,
    organizationName: r.organization?.name ?? null,
    requester: { id: r.user.id, name: r.user.name, email: r.user.email },
    submittedAt: r.submittedAt?.toISOString() ?? null,
    respondedAt: r.respondedAt?.toISOString() ?? null,
    closedAt: r.closedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    lines: r.lines.map(serializeRfqLine),
    quoteCount: r._count?.quotes,
    lineCount: r.lines.length,
    totalQuantity: r.lines.reduce((sum, l) => sum + l.quantity, 0),
  }
  if (includeQuotes && r.quotes) base.quotes = r.quotes.map(serializeQuote)
  return base
}

const rfqInclude = {
  organization: { select: { name: true } },
  user: { select: { id: true, name: true, email: true } },
  lines: { include: { product: true } },
} as const

// ── Lifecycle sweep (lazy expiry — no cron needed) ──────────────────────────

export async function expireStaleQuotes(): Promise<void> {
  const now = new Date()
  await db.quote.updateMany({
    where: { status: 'SENT', validUntil: { lt: now } },
    data: { status: 'EXPIRED' },
  })
  // RFQs stuck in QUOTED whose quotes are ALL expired → EXPIRED
  const stale = await db.rfq.findMany({
    where: { status: 'QUOTED' },
    select: { id: true, quotes: { select: { status: true } } },
  })
  for (const r of stale) {
    if (r.quotes.length > 0 && r.quotes.every((q) => q.status !== 'SENT' && q.status !== 'ACCEPTED')) {
      await db.rfq.update({
        where: { id: r.id },
        data: { status: 'EXPIRED', closedAt: new Date() },
      })
    }
  }
}

// ── Buyer operations ────────────────────────────────────────────────────────

export interface RfqLineInput {
  productId?: string | null
  productName?: string | null
  sku?: string | null
  quantity: number
  targetPrice?: number | null
  notes?: string | null
}

export async function createRfq(
  userId: string,
  input: { title?: string | null; description?: string | null; organizationId?: string | null; lines: RfqLineInput[] }
): Promise<RfqDTO> {
  if (!input.lines?.length) throw new RfqServiceError('An RFQ needs at least one line item')

  let organizationId: string | null = null
  if (input.organizationId) {
    const membership = await db.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId: input.organizationId, userId },
      },
    })
    if (!membership) throw new RfqServiceError('You are not a member of that organization', 403)
    organizationId = input.organizationId
  }

  // Resolve products for snapshotting
  const productIds = input.lines.map((l) => l.productId).filter((x): x is string => !!x)
  const products = productIds.length
    ? await db.product.findMany({ where: { id: { in: productIds } } })
    : []
  const productMap = new Map(products.map((p) => [p.id, p]))

  for (const line of input.lines) {
    if (line.quantity < 1 || line.quantity > 1_000_000) {
      throw new RfqServiceError('Quantity must be between 1 and 1,000,000')
    }
    if (line.productId && !productMap.has(line.productId)) {
      throw new RfqServiceError('A referenced product does not exist')
    }
    if (!line.productId && !line.productName?.trim()) {
      throw new RfqServiceError('Open items need a name/description')
    }
    if (line.targetPrice !== undefined && line.targetPrice !== null && line.targetPrice < 0) {
      throw new RfqServiceError('Target price cannot be negative')
    }
  }

  const number = await nextNumber('RFQ')
  const rfq = await db.rfq.create({
    data: {
      number,
      userId,
      organizationId,
      title: input.title?.trim() || null,
      description: input.description?.trim() || null,
      status: 'DRAFT',
      lines: {
        create: input.lines.map((l) => ({
          productId: l.productId ?? null,
          productName: l.productId
            ? (productMap.get(l.productId)?.title ?? l.productName ?? 'Product')
            : (l.productName as string),
          sku: l.sku ?? null,
          quantity: l.quantity,
          targetPrice: l.targetPrice ?? null,
          notes: l.notes ?? null,
        })),
      },
    },
    include: { ...rfqInclude, _count: { select: { quotes: true } } },
  })

  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'RFQ_CREATED',
    entityType: 'Rfq',
    entityId: rfq.id,
    summary: `RFQ ${number} drafted (${input.lines.length} lines)`,
    metadata: { organizationId },
  })

  return serializeRfq(rfq as never, false)
}

export async function listMyRfqs(userId: string, organizationId?: string | null): Promise<RfqDTO[]> {
  await expireStaleQuotes()
  const rfqs = await db.rfq.findMany({
    where: {
      userId,
      ...(organizationId ? { organizationId } : {}),
    },
    include: { ...rfqInclude, _count: { select: { quotes: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return rfqs.map((r) => serializeRfq(r as never, false))
}

export async function getRfq(rfqId: string, viewer: { id: string; role: string }): Promise<RfqDTO> {
  await expireStaleQuotes()
  const rfq = await db.rfq.findUnique({
    where: { id: rfqId },
    include: {
      ...rfqInclude,
      _count: { select: { quotes: true } },
      quotes: {
        include: {
          createdBy: { select: { id: true, name: true } },
          lines: { include: { product: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  })
  if (!rfq) throw new RfqServiceError('RFQ not found', 404)

  const isOwner = rfq.userId === viewer.id
  const isAdmin = viewer.role === 'ADMIN'
  // Sellers whose catalog products are referenced by RFQ lines may view the RFQ
  // (they need this to discover requests and respond with quotes).
  const isLineSeller = rfq.lines.some((l) => l.product && l.product.sellerId === viewer.id)
  const isInvolvedSeller = rfq.quotes.some((q) => q.sellerId === viewer.id)
  if (!isOwner && !isAdmin && !isLineSeller && !isInvolvedSeller) {
    throw new RfqServiceError('Access denied', 403)
  }

  const dto = serializeRfq(rfq as never, true)
  // Sellers never see competitors' quotes or platform-facilitated pricing —
  // only their own quotes on this RFQ.
  if (!isOwner && !isAdmin && dto.quotes) {
    dto.quotes = dto.quotes.filter((q) => q.sellerId === viewer.id)
  }
  return dto
}

export async function rfqTransition(
  rfqId: string,
  actor: { id: string; role: string },
  action: 'SUBMIT' | 'CANCEL' | 'REVIEW' | 'REJECT'
): Promise<RfqDTO> {
  const rfq = await db.rfq.findUnique({ where: { id: rfqId }, include: { quotes: true } })
  if (!rfq) throw new RfqServiceError('RFQ not found', 404)

  const isOwner = rfq.userId === actor.id
  const isAdmin = actor.role === 'ADMIN'

  // Authorization per action
  if ((action === 'SUBMIT' || action === 'CANCEL') && !isOwner && !isAdmin) {
    throw new RfqServiceError('Only the requester can do that', 403)
  }
  if ((action === 'REVIEW' || action === 'REJECT') && !isAdmin) {
    throw new RfqServiceError('Only platform admins can do that', 403)
  }
  if (action === 'CANCEL' && rfq.quotes.some((q) => q.status === 'ACCEPTED')) {
    throw new RfqServiceError('Cannot cancel an RFQ with an accepted quote', 409)
  }

  const next = canTransition(rfq.status, action)
  if (!next) throw new RfqServiceError(`Cannot ${action.toLowerCase()} an RFQ in ${rfq.status}`, 409)

  const now = new Date()
  const patch: Record<string, unknown> = { status: next }
  if (action === 'SUBMIT') patch.submittedAt = now
  if (action === 'REJECT' || action === 'CANCEL' || action === 'EXPIRE') patch.closedAt = now

  await db.rfq.update({ where: { id: rfqId }, data: patch })

  await recordAudit({
    actorId: actor.id,
    actorType: isAdmin ? 'ADMIN' : 'USER',
    action: `RFQ_${action}`,
    entityType: 'Rfq',
    entityId: rfqId,
    summary: `RFQ ${rfq.number}: ${rfq.status} → ${next}`,
    metadata: { from: rfq.status, to: next },
  })

  return getRfq(rfqId, actor)
}

// ── Quote operations (admin, or seller for their own products) ──────────────

export interface QuoteLineInput {
  rfqLineId?: string | null
  productId: string
  quantity: number
  unitPrice: number
}

export async function createQuote(
  rfqId: string,
  actor: { id: string; role: string },
  input: {
    lines: QuoteLineInput[]
    validUntil?: string | null
    paymentTerms?: string | null
    notes?: string | null
    discountTotal?: number
    shippingTotal?: number
    taxTotal?: number
  }
): Promise<QuoteDTO> {
  if (!input.lines?.length) throw new RfqServiceError('A quote needs at least one line')

  const rfq = await db.rfq.findUnique({
    where: { id: rfqId },
    include: { lines: true },
  })
  if (!rfq) throw new RfqServiceError('RFQ not found', 404)
  if (!['SUBMITTED', 'UNDER_REVIEW', 'QUOTED'].includes(rfq.status)) {
    throw new RfqServiceError(`RFQ is ${rfq.status} — quotes are closed`, 409)
  }

  const isAdmin = actor.role === 'ADMIN'
  const products = await db.product.findMany({
    where: { id: { in: input.lines.map((l) => l.productId) } },
  })
  const productMap = new Map(products.map((p) => [p.id, p]))

  let sellerId: string | null = null
  for (const line of input.lines) {
    const p = productMap.get(line.productId)
    if (!p) throw new RfqServiceError('A quoted product does not exist')
    if (line.quantity < 1) throw new RfqServiceError('Quantities must be ≥ 1')
    if (line.unitPrice < 0) throw new RfqServiceError('Unit prices cannot be negative')
    if (!isAdmin) {
      if (actor.role !== 'SELLER') {
        throw new RfqServiceError('Only sellers or admins can issue quotes', 403)
      }
      if (p.sellerId !== actor.id) {
        throw new RfqServiceError('You can only quote your own products', 403)
      }
      sellerId = actor.id
    }
  }

  const validUntil = input.validUntil ? new Date(input.validUntil) : null
  if (validUntil && validUntil.getTime() <= Date.now()) {
    throw new RfqServiceError('Validity date must be in the future')
  }

  const subtotal = input.lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0)
  const discountTotal = input.discountTotal ?? 0
  const shippingTotal = input.shippingTotal ?? 0
  const taxTotal = input.taxTotal ?? 0
  const total = Math.round((subtotal - discountTotal + shippingTotal + taxTotal) * 100) / 100
  if (total < 0) throw new RfqServiceError('Quote total cannot be negative')

  const number = await nextNumber('QTE')
  const rfqLineIds = new Set(rfq.lines.map((l) => l.id))

  const quote = await db.$transaction(async (tx) => {
    const created = await tx.quote.create({
      data: {
        number,
        rfqId,
        createdById: actor.id,
        sellerId,
        status: 'SENT',
        subtotal,
        discountTotal,
        shippingTotal,
        taxTotal,
        total,
        paymentTerms: input.paymentTerms?.trim() || null,
        validUntil,
        notes: input.notes?.trim() || null,
        sentAt: new Date(),
        lines: {
          create: input.lines.map((l) => ({
            rfqLineId: l.rfqLineId && rfqLineIds.has(l.rfqLineId) ? l.rfqLineId : null,
            productId: l.productId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
          })),
        },
      },
      include: {
        createdBy: { select: { id: true, name: true } },
        lines: { include: { product: true } },
      },
    })
    if (rfq.status === 'SUBMITTED' || rfq.status === 'UNDER_REVIEW') {
      await tx.rfq.update({
        where: { id: rfqId },
        data: { status: 'QUOTED', respondedAt: new Date() },
      })
    }
    return created
  })

  await recordAudit({
    actorId: actor.id,
    actorType: isAdmin ? 'ADMIN' : 'SELLER',
    action: 'QUOTE_SENT',
    entityType: 'Quote',
    entityId: quote.id,
    summary: `Quote ${number} issued for RFQ ${rfq.number} (total ${total.toFixed(2)})`,
    metadata: { rfqId, total },
  })

  return serializeQuote(quote as never)
}

export async function respondToQuote(
  quoteId: string,
  userId: string,
  action: 'ACCEPT' | 'DECLINE'
): Promise<{ quote: QuoteDTO; rfq: RfqDTO; pendingApproval?: boolean }> {
  const quote = await db.quote.findUnique({
    where: { id: quoteId },
    include: { rfq: true, lines: { include: { product: true } } },
  })
  if (!quote) throw new RfqServiceError('Quote not found', 404)
  if (quote.rfq.userId !== userId) throw new RfqServiceError('Access denied', 403)

  if (quote.status !== 'SENT') {
    throw new RfqServiceError(`Quote is ${quote.status.toLowerCase()} — cannot ${action.toLowerCase()}`, 409)
  }
  if (quote.validUntil && quote.validUntil.getTime() < Date.now()) {
    throw new RfqServiceError('This quote has expired', 409)
  }
  if (quote.rfq.status === 'ACCEPTED' || quote.rfq.status === 'ORDERED') {
    throw new RfqServiceError('This RFQ is already closed', 409)
  }

  const now = new Date()

  if (action === 'ACCEPT') {
    // ── B2B approval gate: a BUYER-role member accepting a quote at/above the
    // org threshold routes the acceptance to the org's approvers instead ──
    const membership = await db.organizationMember.findFirst({
      where: { userId, organization: { status: 'ACTIVE' } },
      include: { organization: true },
    })
    if (membership && needsApproval(membership.organization, membership.role, Number(quote.total))) {
      const requester = await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true } })
      await createQuoteAcceptApprovalRequest({
        organizationId: membership.organizationId,
        quoteId,
        rfqId: quote.rfqId,
        requester: requester ?? { id: userId, name: 'Member' },
        amount: Number(quote.total),
      })
      const refreshedQuote = await db.quote.findUniqueOrThrow({
        where: { id: quoteId },
        include: { createdBy: { select: { id: true, name: true } }, lines: { include: { product: true } } },
      })
      const rfq = await getRfq(quote.rfqId, { id: userId, role: 'USER' })
      return {
        quote: serializeQuote(refreshedQuote as never),
        rfq,
        pendingApproval: true,
      }
    }

    await db.$transaction(async (tx) => {
      await tx.quote.update({ where: { id: quoteId }, data: { status: 'ACCEPTED', acceptedAt: now } })
      // Sibling open quotes auto-decline
      await tx.quote.updateMany({
        where: { rfqId: quote.rfqId, status: 'SENT', id: { not: quoteId } },
        data: { status: 'DECLINED', declinedAt: now },
      })
      await tx.rfq.update({
        where: { id: quote.rfqId },
        data: { status: 'ACCEPTED', closedAt: now },
      })
    })
  } else {
    await db.quote.update({
      where: { id: quoteId },
      data: { status: 'DECLINED', declinedAt: now },
    })
    // If no open quotes remain, RFQ stays QUOTED (buyer may request more quotes)
  }

  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: `QUOTE_${action}ED`,
    entityType: 'Quote',
    entityId: quoteId,
    summary: `Quote ${quote.number} ${action.toLowerCase()}${action === 'ACCEPT' ? 'ed' : 'd'} by buyer`,
    metadata: { rfqId: quote.rfqId },
  })

  const updatedQuote = await db.quote.findUniqueOrThrow({
    where: { id: quoteId },
    include: { createdBy: { select: { id: true, name: true } }, lines: { include: { product: true } } },
  })
  const rfq = await getRfq(quote.rfqId, { id: userId, role: 'USER' })
  return { quote: serializeQuote(updatedQuote as never), rfq }
}

// ── Admin monitor ───────────────────────────────────────────────────────────

export async function adminListRfqs(filter?: {
  status?: string
  search?: string
}): Promise<RfqDTO[]> {
  await expireStaleQuotes()
  const rfqs = await db.rfq.findMany({
    where: {
      ...(filter?.status ? { status: filter.status } : {}),
      ...(filter?.search
        ? {
            OR: [
              { number: { contains: filter.search } },
              { title: { contains: filter.search } },
              { user: { name: { contains: filter.search } } },
              { user: { email: { contains: filter.search } } },
            ],
          }
        : {}),
    },
    include: { ...rfqInclude, _count: { select: { quotes: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  return rfqs.map((r) => serializeRfq(r as never, false))
}

// ── Seller inbox — RFQs that reference my catalog products ──────────────────

export async function sellerRfqInbox(sellerId: string): Promise<RfqDTO[]> {
  await expireStaleQuotes()
  const rfqs = await db.rfq.findMany({
    where: {
      status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'QUOTED'] },
      lines: { some: { product: { sellerId } } },
    },
    include: {
      ...rfqInclude,
      _count: { select: { quotes: true } },
      quotes: { select: { sellerId: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  return rfqs.map((r) => {
    const dto = serializeRfq(r as never, false)
    dto.myLineCount = r.lines.filter((l) => l.product && l.product.sellerId === sellerId).length
    dto.myQuoteCount = r.quotes.filter((q) => q.sellerId === sellerId).length
    return dto
  })
}

// ── Negotiation thread ──────────────────────────────────────────────────────

async function assertRfqThreadAccess(
  rfqId: string,
  viewer: { id: string; role: string }
): Promise<void> {
  const rfq = await db.rfq.findUnique({
    where: { id: rfqId },
    select: {
      userId: true,
      lines: { select: { product: { select: { sellerId: true } } } },
      quotes: { select: { sellerId: true } },
    },
  })
  if (!rfq) throw new RfqServiceError('RFQ not found', 404)
  const isOwner = rfq.userId === viewer.id
  const isAdmin = viewer.role === 'ADMIN'
  const isLineSeller = rfq.lines.some((l) => l.product && l.product.sellerId === viewer.id)
  const isInvolvedSeller = rfq.quotes.some((q) => q.sellerId === viewer.id)
  if (!isOwner && !isAdmin && !isLineSeller && !isInvolvedSeller) {
    throw new RfqServiceError('Access denied', 403)
  }
}

export async function listRfqMessages(
  rfqId: string,
  viewer: { id: string; role: string }
): Promise<RfqMessageDTO[]> {
  await assertRfqThreadAccess(rfqId, viewer)
  const messages = await db.rfqMessage.findMany({
    where: { rfqId },
    include: { author: { select: { id: true, name: true, role: true } } },
    orderBy: { createdAt: 'asc' },
    take: 200,
  })
  return messages.map((m) => ({
    id: m.id,
    rfqId: m.rfqId,
    author: m.author,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
  }))
}

export async function postRfqMessage(
  rfqId: string,
  actor: { id: string; role: string },
  body: string
): Promise<RfqMessageDTO> {
  const clean = body.trim()
  if (!clean) throw new RfqServiceError('Message cannot be empty')
  if (clean.length > 4000) throw new RfqServiceError('Message is too long (max 4000 chars)')
  await assertRfqThreadAccess(rfqId, actor)

  const rfq = await db.rfq.findUnique({
    where: { id: rfqId },
    select: { status: true },
  })
  if (!rfq) throw new RfqServiceError('RFQ not found', 404)
  if (['CANCELLED', 'REJECTED', 'EXPIRED', 'ORDERED'].includes(rfq.status)) {
    throw new RfqServiceError(`This RFQ is ${rfq.status.toLowerCase()} — the thread is closed`, 409)
  }

  const message = await db.rfqMessage.create({
    data: { rfqId, authorId: actor.id, body: clean },
    include: { author: { select: { id: true, name: true, role: true } } },
  })
  return {
    id: message.id,
    rfqId: message.rfqId,
    author: message.author,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
  }
}

// ── Quote withdrawal (seller/admin on open quotes) ───────────────────────────

export async function withdrawQuote(
  quoteId: string,
  actor: { id: string; role: string }
): Promise<QuoteDTO> {
  const quote = await db.quote.findUnique({ where: { id: quoteId }, include: { rfq: true } })
  if (!quote) throw new RfqServiceError('Quote not found', 404)
  const isAdmin = actor.role === 'ADMIN'
  const isOwnSellerQuote = quote.sellerId === actor.id
  if (!isAdmin && !isOwnSellerQuote) throw new RfqServiceError('Access denied', 403)
  if (quote.status !== 'SENT') {
    throw new RfqServiceError(`Quote is ${quote.status.toLowerCase()} — cannot withdraw`, 409)
  }

  await db.quote.update({ where: { id: quoteId }, data: { status: 'WITHDRAWN' } })
  await recordAudit({
    actorId: actor.id,
    actorType: isAdmin ? 'ADMIN' : 'SELLER',
    action: 'QUOTE_WITHDRAWN',
    entityType: 'Quote',
    entityId: quoteId,
    summary: `Quote ${quote.number} withdrawn`,
    metadata: { rfqId: quote.rfqId },
  })

  const updated = await db.quote.findUniqueOrThrow({
    where: { id: quoteId },
    include: {
      createdBy: { select: { id: true, name: true } },
      lines: { include: { product: true } },
    },
  })
  return serializeQuote(updated as never)
}

// ── Quote → Order conversion (closes the B2B commerce loop) ──────────────────

export interface ConvertQuoteInput {
  poNumber?: string | null
  fullName?: string | null
  address?: string | null
  city?: string | null
  country?: string | null
  zip?: string | null
  phone?: string | null
}

interface ConvertedOrderShape {
  id: string
  total: number
  status: string
  fullName: string
  address: string
  city: string
  country: string
  zip: string
  phone: string | null
  poNumber: string | null
  paymentTerms: string | null
  sourceType: string | null
  createdAt: Date
  items: { id: string; productId: string; sellerId: string; title: string; price: number; quantity: number }[]
}

export async function convertQuoteToOrder(
  quoteId: string,
  viewer: { id: string; role: string },
  input: ConvertQuoteInput
): Promise<{ order: ReturnType<typeof serializeOrderForDto>; quote: QuoteDTO; rfq: RfqDTO }> {
  const quote = await db.quote.findUnique({
    where: { id: quoteId },
    include: {
      rfq: { include: { organization: true } },
      lines: { include: { product: true } },
    },
  })
  if (!quote) throw new RfqServiceError('Quote not found', 404)

  const isOwner = quote.rfq.userId === viewer.id
  const isAdmin = viewer.role === 'ADMIN'
  if (!isOwner && !isAdmin) throw new RfqServiceError('Only the requester can convert this quote', 403)
  if (quote.status !== 'ACCEPTED') {
    throw new RfqServiceError(
      `Quote is ${quote.status.toLowerCase()} — only accepted quotes can convert`,
      409
    )
  }
  if (quote.rfq.status === 'ORDERED') {
    throw new RfqServiceError('This RFQ has already been converted to an order', 409)
  }

  // Stock re-check (acceptance may predate stock changes)
  const needed = new Map<string, number>()
  for (const l of quote.lines) needed.set(l.productId, (needed.get(l.productId) ?? 0) + l.quantity)
  for (const [productId, qty] of needed) {
    const p = quote.lines.find((l) => l.productId === productId)!.product
    if (p.stock < qty) {
      throw new RfqServiceError(
        `Not enough stock for "${p.title}" — ${p.stock} available, ${qty} needed. Request a revised quote.`,
        409
      )
    }
  }

  // Shipping details: explicit input → buyer's latest order → org billing → fallbacks
  const lastOrder = await db.order.findFirst({
    where: { buyerId: quote.rfq.userId },
    orderBy: { createdAt: 'desc' },
  })
  let orgBilling: {
    fullName?: string
    address?: string
    city?: string
    country?: string
    zip?: string
  } = {}
  if (quote.rfq.organization?.billingAddress) {
    try {
      orgBilling = JSON.parse(String(quote.rfq.organization.billingAddress)) as typeof orgBilling
    } catch {
      orgBilling = {}
    }
  }
  const buyer = await db.user.findUnique({
    where: { id: quote.rfq.userId },
    select: { name: true },
  })
  const shipping = {
    fullName: (
      input.fullName?.trim() ||
      orgBilling.fullName ||
      lastOrder?.fullName ||
      buyer?.name ||
      'B2B Buyer'
    ).slice(0, 120),
    address: (
      input.address?.trim() ||
      orgBilling.address ||
      lastOrder?.address ||
      `Per quote terms — see quote ${quote.number}`
    ).slice(0, 255),
    city: (input.city?.trim() || orgBilling.city || lastOrder?.city || '—').slice(0, 120),
    country: (input.country?.trim() || orgBilling.country || lastOrder?.country || '—').slice(
      0,
      120
    ),
    zip: (input.zip?.trim() || orgBilling.zip || lastOrder?.zip || '—').slice(0, 32),
    phone: (input.phone?.trim() || lastOrder?.phone || null) as string | null,
  }

  const order = await db.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        buyerId: quote.rfq.userId,
        total: quote.total.toNumber(),
        status: 'PROCESSING', // B2B invoiced order — payment on terms, not prepaid
        fullName: shipping.fullName,
        address: shipping.address,
        city: shipping.city,
        country: shipping.country,
        zip: shipping.zip,
        phone: shipping.phone,
        organizationId: quote.rfq.organizationId,
        poNumber: input.poNumber?.trim().slice(0, 40) || null,
        paymentTerms: quote.paymentTerms,
        sourceType: 'RFQ',
        sourceQuoteId: quote.id,
        items: {
          create: quote.lines.map((l) => ({
            productId: l.productId,
            sellerId: l.product.sellerId,
            quantity: l.quantity,
            price: l.unitPrice.toNumber(),
            title: l.product.title,
            image: firstImage(l.product.images),
          })),
        },
      },
      include: { items: true },
    })

    for (const [productId, qty] of needed) {
      await tx.product.update({
        where: { id: productId },
        data: { stock: { decrement: qty }, soldCount: { increment: qty } },
      })
    }

    await tx.quote.update({
      where: { id: quote.id },
      data: { status: 'CONVERTED', convertedAt: new Date() },
    })
    await tx.rfq.update({
      where: { id: quote.rfqId },
      data: { status: 'ORDERED', closedAt: new Date() },
    })

    return created
  })

  await recordAudit({
    actorId: viewer.id,
    actorType: isAdmin ? 'ADMIN' : 'USER',
    action: 'QUOTE_CONVERTED',
    entityType: 'Quote',
    entityId: quote.id,
    summary: `Quote ${quote.number} converted to order (${quote.total.toNumber().toFixed(2)} USD)`,
    metadata: { rfqId: quote.rfqId, orderId: order.id },
  })

  const updatedQuote = await db.quote.findUniqueOrThrow({
    where: { id: quoteId },
    include: {
      createdBy: { select: { id: true, name: true } },
      lines: { include: { product: true } },
    },
  })
  const rfq = await getRfq(quote.rfqId, viewer)
  return {
    order: serializeOrderForDto(order as unknown as ConvertedOrderShape),
    quote: serializeQuote(updatedQuote as never),
    rfq,
  }
}

// Local minimal order serializer for the conversion response (mirrors OrderDTO
// shape without importing lib/serialize into the service layer).
function serializeOrderForDto(o: ConvertedOrderShape) {
  return {
    id: o.id,
    total: o.total,
    status: o.status,
    fullName: o.fullName,
    address: o.address,
    city: o.city,
    country: o.country,
    zip: o.zip,
    phone: o.phone,
    poNumber: o.poNumber,
    paymentTerms: o.paymentTerms,
    sourceType: o.sourceType,
    createdAt: o.createdAt.toISOString(),
    items: o.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      sellerId: i.sellerId,
      title: i.title,
      price: i.price,
      quantity: i.quantity,
    })),
  }
}
