import { db } from '@/lib/db'
import { recordAudit } from '@/server/modules/audit/service'
import { nextNumber } from '@/server/modules/sequences/service'
import { needsApproval, createQuoteAcceptApprovalRequest } from '@/server/modules/approvals/service'
import { emitNotification, emitNotifications, type EmitInput } from '@/server/modules/notifications/service'
import { resolvePanel } from '@/server/modules/settings/service'
import { ensurePayment } from '@/server/modules/payments/service'
import { openDisputeCountBySeller, lostDisputeCountBySeller } from './disputes'
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
  variantId?: string | null
  variantName?: string | null
  quantity: number
  targetPrice: { toNumber(): number } | null
  notes: string | null
  product: {
    id: string
    title: string
    price: number
    images: string
    moq?: number | null
    stock?: number
    priceTiers?: string | null
    seller?: { storeName: string | null; name: string } | null
  } | null
}): RfqLineDTO {
  return {
    id: l.id,
    productId: l.productId,
    productName: l.productName,
    sku: l.sku,
    variantId: l.variantId ?? null,
    variantName: l.variantName ?? null,
    quantity: l.quantity,
    targetPrice: l.targetPrice ? l.targetPrice.toNumber() : null,
    notes: l.notes,
    sellerName: l.product?.seller ? (l.product.seller.storeName ?? l.product.seller.name) : null,
    product: l.product
      ? {
          id: l.product.id,
          title: l.product.title,
          price: l.product.price,
          image: firstImage(l.product.images),
          moq: l.product.moq ?? null,
          stock: l.product.stock,
          priceTiers: parsePriceTiers(l.product.priceTiers),
        }
      : null,
  }
}

/** Parse a product's stored quantity-break ladder (defensive). */
function parsePriceTiers(raw: string | null | undefined): { from: number; to: number | null; price: number }[] | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) return null
    return parsed
      .filter(
        (t): t is { from: number; to: number | null; price: number } =>
          t && typeof t === 'object' &&
          typeof (t as { from?: unknown }).from === 'number' &&
          typeof (t as { price?: unknown }).price === 'number'
      )
      .sort((a, b) => a.from - b.from)
  } catch {
    return null
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
    variantId?: string | null
    variantName?: string | null
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
        variantId: l.variantId ?? null,
        variantName: l.variantName ?? null,
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
    expiresAt: (r as { expiresAt?: Date | null }).expiresAt?.toISOString() ?? null,
    extendedCount: (r as { extendedCount?: number }).extendedCount ?? 0,
    sourceRecurringId: (r as { sourceRecurringId?: string | null }).sourceRecurringId ?? null,
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
  lines: { include: { product: { include: { seller: { select: { storeName: true, name: true } } } } } },
} as const

// ── Lifecycle sweep (lazy expiry — no cron needed) ──────────────────────────

// ── Settings-aware helpers ──────────────────────────────────────────────────────

/** Scope context for settings resolution: org → org type chain. */
export async function rfqSettingsCtx(organizationId: string | null) {
  if (!organizationId) return {}
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { orgType: true },
  })
  return org ? { orgId: organizationId, orgType: org.orgType } : { orgId: organizationId }
}

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

// ── Distribution filter (shared by buyer SUBMIT and recurring spawns) ─────

export interface DistributionResult {
  eligible: string[]
  titlesBySeller: Map<string, string[]>
}

/**
 * Which sellers should learn about this RFQ — settings-filtered (verification,
 * rating, dispute exclusion, cap). Used by rfqTransition(SUBMIT) and by the
 * recurring spawn engine (which can further restrict to stored recipients).
 */
export async function computeEligibleSellers(
  rfqId: string,
  organizationId: string | null
): Promise<DistributionResult> {
  const sellers = await db.rfqLine.findMany({
    where: { rfqId, productId: { not: null } },
    select: { product: { select: { sellerId: true, title: true } } },
  })
  const titlesBySeller = new Map<string, string[]>()
  for (const s of sellers) {
    if (!s.product) continue
    titlesBySeller.set(s.product.sellerId, [...(titlesBySeller.get(s.product.sellerId) ?? []), s.product.title])
  }

  const distribution = await resolvePanel('distribution', await rfqSettingsCtx(organizationId))
  let eligible = [...titlesBySeller.keys()]
  // NOTE: this panel has no separate `enabled` toggle — the mode IS the switch
  // ('ALL_MATCHING' = every referenced seller, no filters). An earlier gate on
  // a non-existent distribution.enabled silently disabled every filter below.
  if (distribution.mode && distribution.mode !== 'ALL_MATCHING') {
    if (distribution.minVerification !== 'NONE' && distribution.minVerification !== 'EMAIL') {
      // Email is always verified on this platform; KYC+ requires the stamp
      const rows = await db.user.findMany({
        where: { id: { in: eligible } },
        select: { id: true, verifiedAt: true },
      })
      const verified = new Set(rows.filter((u) => u.verifiedAt).map((u) => u.id))
      eligible = eligible.filter((id) => verified.has(id))
    }
    if (Number(distribution.minRating) > 0) {
      const rows = await db.product.groupBy({
        by: ['sellerId'],
        where: { sellerId: { in: eligible }, status: 'ACTIVE' },
        _avg: { rating: true },
      })
      const ratingBySeller = new Map(rows.map((r) => [r.sellerId, r._avg.rating ?? 0]))
      eligible = eligible.filter((id) => (ratingBySeller.get(id) ?? 0) >= Number(distribution.minRating))
    }
    // Dispute Resolution × Distribution: sellers with open disputes drop out
    if (distribution.excludeDisputed && eligible.length) {
      const disputed = await openDisputeCountBySeller(eligible)
      eligible = eligible.filter((id) => !disputed.has(id))
    }
    const cap = Number(distribution.maxSellers)
    if (eligible.length > cap) {
      // Rank by catalog rating (the dominant ranking signal available today)
      const rows = await db.product.groupBy({
        by: ['sellerId'],
        where: { sellerId: { in: eligible }, status: 'ACTIVE' },
        _avg: { rating: true },
      })
      const ratingBySeller = new Map(rows.map((r) => [r.sellerId, r._avg.rating ?? 0]))
      eligible.sort((a, b) => (ratingBySeller.get(b) ?? 0) - (ratingBySeller.get(a) ?? 0))
      eligible = eligible.slice(0, cap)
    }
  }
  return { eligible, titlesBySeller }
}

// ── Lazy background engine nudges ─────────────────────────────────────────

/**
 * Fire-and-forget nudge of the recurring spawn engine and the dispute
 * escalation sweep — called from the same read paths as expireStaleQuotes.
 * Guarded so concurrent list reads only run one sweep at a time.
 */
let sweepsInFlight = false
export async function nudgeBackgroundSweeps(): Promise<void> {
  if (sweepsInFlight) return
  sweepsInFlight = true
  try {
    const [{ processDueSchedules }, { sweepDisputes }] = await Promise.all([
      import('./recurring'),
      import('./disputes'),
    ])
    await Promise.allSettled([processDueSchedules(), sweepDisputes()])
  } catch {
    // best-effort — reads must never fail because a sweep hiccupped
  } finally {
    sweepsInFlight = false
  }
}

export async function expireStaleQuotes(): Promise<void> {
  const now = new Date()

  // ── Quote validity lapsed ──
  await db.quote.updateMany({
    where: { status: 'SENT', validUntil: { lt: now } },
    data: { status: 'EXPIRED' },
  })

  // ── RFQ deadline reached (expiry settings; grace period respected) ──
  const expiry = await resolvePanel('rfqExpiry')
  if (expiry.enabled && expiry.actionOnExpiry !== 'KEEP_OPEN') {
    const graceMs = Number(expiry.graceHours) * 3_600_000
    const due = await db.rfq.findMany({
      where: {
        status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'QUOTED'] },
        expiresAt: { not: null, lt: new Date(now.getTime() - graceMs) },
      },
      include: {
        user: { select: { id: true } },
        lines: { select: { product: { select: { sellerId: true } } } },
        quotes: { select: { sellerId: true } },
      },
    })
    for (const r of due) {
      await db.rfq.update({
        where: { id: r.id },
        data: { status: 'EXPIRED', closedAt: now },
      })
      if (expiry.notifyBuyerOnExpiry) {
        await emitNotification({
          userId: r.user.id,
          type: 'RFQ_STATUS',
          title: `RFQ ${r.number} expired`,
          body: 'The deadline passed without a deal. You can re-issue the request anytime.',
          linkView: 'rfq',
          linkId: r.id,
        })
      }
      if (expiry.notifyUnresponded) {
        const quoted = new Set(r.quotes.map((q) => q.sellerId).filter((x): x is string => !!x))
        const unresponded = new Set<string>()
        for (const l of r.lines) if (l.product?.sellerId) unresponded.add(l.product.sellerId)
        for (const s of quoted) unresponded.delete(s)
        await emitNotifications(
          [...unresponded].map((sellerId) => ({
            userId: sellerId,
            type: 'RFQ_STATUS',
            title: `RFQ ${r.number} expired`,
            body: 'This request closed before you sent a quote.',
            linkView: 'seller',
            linkId: r.id,
          }))
        )
      }
    }
  }

  // ── Sent quotes older than the auto-expire window (cancellation settings) ──
  const cancellation = await resolvePanel('cancellation')
  if (cancellation.enabled) {
    const cutoff = new Date(now.getTime() - Number(cancellation.autoExpireQuotesDays) * 86_400_000)
    await db.quote.updateMany({
      where: { status: 'SENT', sentAt: { lt: cutoff }, validUntil: null },
      data: { status: 'EXPIRED' },
    })
  }

  // RFQs stuck in QUOTED whose quotes are ALL expired → EXPIRED
  const stale = await db.rfq.findMany({
    where: { status: 'QUOTED' },
    select: { id: true, quotes: { select: { status: true } } },
  })
  for (const r of stale) {
    if (r.quotes.length > 0 && r.quotes.every((q) => q.status !== 'SENT' && q.status !== 'ACCEPTED')) {
      await db.rfq.update({
        where: { id: r.id },
        data: { status: 'EXPIRED', closedAt: now },
      })
    }
  }
}

// ── Buyer operations ────────────────────────────────────────────────────────

export interface RfqLineInput {
  productId?: string | null
  productName?: string | null
  sku?: string | null
  variantId?: string | null
  quantity: number
  targetPrice?: number | null
  notes?: string | null
}

export async function createRfq(
  userId: string,
  input: { title?: string | null; description?: string | null; organizationId?: string | null; lines: RfqLineInput[]; expiresInDays?: number | null }
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

  // ── Commercial-rule enforcement (scoped settings) ──
  const ctx = await rfqSettingsCtx(organizationId)
  const [spam, moq, expiryPanel] = await Promise.all([
    resolvePanel('spamPrevention', ctx),
    resolvePanel('moq', ctx),
    resolvePanel('rfqExpiry', ctx),
  ])

  // Anti-spam: daily RFQ caps per buyer and per org
  if (spam.enabled) {
    const today = startOfToday()
    const mineToday = await db.rfq.count({ where: { userId, createdAt: { gte: today } } })
    if (mineToday >= Number(spam.maxRfqsBuyerDay)) {
      throw new RfqServiceError(
        `Daily limit reached — you have already created ${mineToday} RFQs today. Come back tomorrow.`,
        429
      )
    }
    if (organizationId) {
      const orgToday = await db.rfq.count({ where: { organizationId, createdAt: { gte: today } } })
      if (orgToday >= Number(spam.maxRfqsOrgDay)) {
        throw new RfqServiceError(
          `Your organization's daily RFQ limit (${spam.maxRfqsOrgDay}) is reached.`,
          429
        )
      }
    }
  }

  // Resolve products for snapshotting
  const productIds = input.lines.map((l) => l.productId).filter((x): x is string => !!x)
  const products = productIds.length
    ? await db.product.findMany({ where: { id: { in: productIds } }, include: { variants: true } })
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
    // Variant must belong to the referenced product and be active
    if (line.variantId && line.productId) {
      const variant = productMap.get(line.productId)?.variants.find((v) => v.id === line.variantId)
      if (!variant) throw new RfqServiceError('The selected variant does not exist for that product')
      if (!variant.isActive) throw new RfqServiceError('The selected variant is not available')
    }
    // Minimum order quantity (product.moq × commercial rules)
    if (line.productId) {
      const p = productMap.get(line.productId)
      if (p?.moq && line.quantity < p.moq) {
        if (moq.enabled && moq.blockRfqBelow && moq.enforcementMode === 'BLOCK' && !moq.allowBelowRequest) {
          throw new RfqServiceError(
            `“${p.title}” has a minimum order quantity of ${p.moq} — increase the quantity to continue.`
          )
        }
      }
    }
  }

  // Expiry deadline: buyer override (when allowed) or the platform default
  let expiresAt: Date | null = null
  if (expiryPanel.enabled) {
    let days = Number(expiryPanel.defaultDays)
    if (input.expiresInDays != null) {
      if (!expiryPanel.buyerOverride) {
        throw new RfqServiceError('The deadline for requests is fixed by the platform', 403)
      }
      days = Math.min(Math.max(input.expiresInDays, Number(expiryPanel.minDays)), Number(expiryPanel.maxDays))
    }
    expiresAt = new Date(Date.now() + days * 86_400_000)
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
      expiresAt,
      lines: {
        create: input.lines.map((l) => {
          let variantName: string | null = null
          if (l.variantId && l.productId) {
            const v = productMap.get(l.productId)?.variants.find((x) => x.id === l.variantId)
            variantName = v ? v.name : null
          }
          return {
            productId: l.productId ?? null,
            productName: l.productId
              ? (productMap.get(l.productId)?.title ?? l.productName ?? 'Product')
              : (l.productName as string),
            sku: l.sku ?? null,
            variantId: l.variantId ?? null,
            variantName,
            quantity: l.quantity,
            targetPrice: l.targetPrice ?? null,
            notes: l.notes ?? null,
          }
        }),
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
  await nudgeBackgroundSweeps()
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
  await nudgeBackgroundSweeps()
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
  // The buyer never sees quotes still in platform review (or review-rejected ones)
  if (isOwner && !isAdmin && dto.quotes) {
    dto.quotes = dto.quotes.filter((q) => q.status !== 'PENDING_REVIEW' && q.status !== 'REJECTED')
  }
  // Seller trust meta on quotes (rating shown to buyers per settings)
  const ratingPanel = await resolvePanel('sellerRating')
  const disputesPanel = await resolvePanel('disputes')
  if (dto.quotes?.length) {
    const sellerIds = [...new Set(dto.quotes.map((q) => q.sellerId).filter((x): x is string => !!x))]
    if (sellerIds.length) {
      const [sellers, stats, openDisputes, lostDisputes] = await Promise.all([
        db.user.findMany({ where: { id: { in: sellerIds } }, select: { id: true, name: true, storeName: true, verifiedAt: true, createdAt: true } }),
        db.product.groupBy({ by: ['sellerId'], where: { sellerId: { in: sellerIds }, status: 'ACTIVE' }, _avg: { rating: true }, _sum: { reviewCount: true } }),
        disputesPanel.showDisputeCount || disputesPanel.affectsSellerRating
          ? openDisputeCountBySeller(sellerIds)
          : Promise.resolve(new Map<string, number>()),
        disputesPanel.affectsSellerRating
          ? lostDisputeCountBySeller(sellerIds)
          : Promise.resolve(new Map<string, number>()),
      ])
      const statBySeller = new Map(stats.map((s) => [s.sellerId, s]))
      for (const q of dto.quotes) {
        if (!q.sellerId) continue
        const seller = sellers.find((s) => s.id === q.sellerId)
        if (!seller) continue
        const stat = statBySeller.get(q.sellerId)
        // Dispute penalty: each dispute resolved against the seller shaves
        // 0.25 off the displayed rating (floor 0) when the setting is on.
        const lost = lostDisputes.get(q.sellerId) ?? 0
        const baseRating = Number((stat?._avg.rating ?? 0).toFixed(2)) || 0
        const displayedRating = disputesPanel.affectsSellerRating
          ? Math.max(0, Math.round((baseRating - lost * 0.25) * 100) / 100)
          : baseRating
        q.sellerMeta = {
          name: seller.name,
          storeName: seller.storeName ?? null,
          verified: ratingPanel.showVerificationBadge ? !!seller.verifiedAt : undefined,
          rating: ratingPanel.showStars ? displayedRating : undefined,
          reviewCount: ratingPanel.showReviewCount ? (stat?._sum.reviewCount ?? 0) : undefined,
          memberSince: ratingPanel.showMemberSince ? seller.createdAt.toISOString() : undefined,
          disputeCount: ratingPanel.showDisputeCount ? (openDisputes.get(q.sellerId) ?? 0) : undefined,
        }
      }
    }
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
  if (action === 'SUBMIT') {
    patch.submittedAt = now
    // Default the deadline from expiry settings when the draft has none
    if (!rfq.expiresAt) {
      const expiryPanel = await resolvePanel('rfqExpiry', await rfqSettingsCtx(rfq.organizationId))
      if (expiryPanel.enabled) {
        patch.expiresAt = new Date(now.getTime() + Number(expiryPanel.defaultDays) * 86_400_000)
      }
    }
  }
  if (action === 'REJECT' || action === 'CANCEL') patch.closedAt = now

  await db.rfq.update({ where: { id: rfqId }, data: patch })

  // ── Notifications ──
  if (action === 'SUBMIT') {
    // Tell every seller whose catalog products this RFQ references — filtered
    // and capped by the distribution settings (verification, rating, disputes, max sellers)
    const { eligible, titlesBySeller } = await computeEligibleSellers(rfqId, rfq.organizationId)

    const emits: EmitInput[] = eligible.map((sellerId) => {
      const titles = titlesBySeller.get(sellerId) ?? []
      return {
        userId: sellerId,
        type: 'RFQ_SUBMITTED_SELLER',
        title: `New quote request ${rfq.number}`,
        body: `A buyer needs a quote including ${titles.slice(0, 2).join(', ')}${titles.length > 2 ? ` +${titles.length - 2} more` : ''}`,
        linkView: 'seller',
        linkId: rfqId,
      }
    })
    await emitNotifications(emits)
  } else if (action === 'REVIEW' || action === 'REJECT') {
    await emitNotification({
      userId: rfq.userId,
      type: 'RFQ_STATUS',
      title: `RFQ ${rfq.number} is ${next === 'UNDER_REVIEW' ? 'under review' : next.toLowerCase()}`,
      body:
        next === 'UNDER_REVIEW'
          ? 'Our team is reviewing your request before routing it to sellers.'
          : 'Your request was not accepted for quoting.',
      linkView: 'rfq',
      linkId: rfqId,
    })
  }

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

  // ── Settings enforcement (scoped to the buyer's org chain) ──
  const ctx = await rfqSettingsCtx(rfq.organizationId)
  const [spam, routing, stockHold] = await Promise.all([
    resolvePanel('spamPrevention', ctx),
    resolvePanel('quoteRouting', ctx),
    resolvePanel('stockHold', ctx),
  ])

  // Anti-spam: daily quote cap per seller
  if (spam.enabled && sellerId) {
    const mineToday = await db.quote.count({
      where: { createdById: actor.id, createdAt: { gte: startOfToday() } },
    })
    if (mineToday >= Number(spam.maxQuotesSellerDay)) {
      throw new RfqServiceError(
        `Daily limit reached — you have already sent ${mineToday} quotes today. Come back tomorrow.`,
        429
      )
    }
  }

  // Stock hold: block quoting on zero-stock products
  if (stockHold.enabled && stockHold.blockQuotesZeroStock) {
    const zero = input.lines.find((l) => (productMap.get(l.productId)?.stock ?? 1) <= 0)
    if (zero) {
      throw new RfqServiceError(
        `“${productMap.get(zero.productId)!.title}” is out of stock — it cannot be quoted right now.`,
        409
      )
    }
  }

  // Quote routing: does this quote need platform review before the buyer sees it?
  let quoteStatus: 'SENT' | 'PENDING_REVIEW' = 'SENT'
  if (routing.enabled && !isAdmin && routing.mode !== 'DIRECT') {
    let needsReview = false
    if (routing.mode === 'ALWAYS') needsReview = true
    else if (routing.mode === 'THRESHOLD') {
      // total is computed below — approximate with the line sum (discounts only lower it)
      const gross = input.lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0)
      needsReview = gross > Number(routing.thresholdAmount)
    } else if (routing.mode === 'NEW_SELLERS') {
      const sellerUser = sellerId
        ? await db.user.findUnique({ where: { id: sellerId }, select: { createdAt: true } })
        : null
      needsReview = !sellerUser || Date.now() - sellerUser.createdAt.getTime() < 30 * 86_400_000
    } else if (routing.mode === 'CATEGORY') {
      const cats = new Set((routing.reviewCategories as string[]) ?? [])
      needsReview = products.some((p) => cats.has(p.categoryId))
    }
    if (needsReview && sellerId) {
      const sellerUser = await db.user.findUnique({ where: { id: sellerId }, select: { verifiedAt: true } })
      if (routing.autoApproveVerified && sellerUser?.verifiedAt) needsReview = false
      else if (routing.autoRejectUnverified && !sellerUser?.verifiedAt) {
        throw new RfqServiceError(
          'Your account is not verified yet — quotes cannot be submitted until verification completes.',
          403
        )
      }
    }
    if (needsReview) quoteStatus = 'PENDING_REVIEW'
  }

  // Recurring RFQs: quotes on an auto-approved schedule skip the review queue
  // (recurring.autoApprove — the schedule itself is the buyer's pre-vetting).
  if (quoteStatus === 'PENDING_REVIEW' && rfq.sourceRecurringId) {
    const recurring = await resolvePanel('recurring', ctx)
    if (recurring.enabled && recurring.autoApprove) quoteStatus = 'SENT'
  }

  const subtotal = input.lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0)
  const discountTotal = input.discountTotal ?? 0
  const shippingTotal = input.shippingTotal ?? 0
  const taxTotal = input.taxTotal ?? 0
  const total = Math.round((subtotal - discountTotal + shippingTotal + taxTotal) * 100) / 100
  if (total < 0) throw new RfqServiceError('Quote total cannot be negative')

  const number = await nextNumber('QTE')
  const rfqLineIds = new Set(rfq.lines.map((l) => l.id))
  // Variant snapshot: mirror the referenced RFQ line's variant (server truth)
  const variantByLine = new Map(rfq.lines.map((l) => [l.id, { variantId: l.variantId ?? null, variantName: l.variantName ?? null }]))

  const quote = await db.$transaction(async (tx) => {
    const created = await tx.quote.create({
      data: {
        number,
        rfqId,
        createdById: actor.id,
        sellerId,
        status: quoteStatus,
        subtotal,
        discountTotal,
        shippingTotal,
        taxTotal,
        total,
        paymentTerms: input.paymentTerms?.trim() || null,
        validUntil,
        notes: input.notes?.trim() || null,
        sentAt: quoteStatus === 'SENT' ? new Date() : null,
        lines: {
          create: input.lines.map((l) => ({
            rfqLineId: l.rfqLineId && rfqLineIds.has(l.rfqLineId) ? l.rfqLineId : null,
            productId: l.productId,
            variantId: l.rfqLineId && rfqLineIds.has(l.rfqLineId)
              ? variantByLine.get(l.rfqLineId)!.variantId
              : null,
            variantName: l.rfqLineId && rfqLineIds.has(l.rfqLineId)
              ? variantByLine.get(l.rfqLineId)!.variantName
              : null,
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

  if (quoteStatus === 'PENDING_REVIEW') {
    // The quote waits in the admin review queue — the buyer sees nothing yet
    if (routing.notifyAdminOnQueue) {
      const admins = await db.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })
      await emitNotifications(
        admins.map((a) => ({
          userId: a.id,
          type: 'RFQ_QUOTE_REVIEW',
          title: `Quote ${number} awaits review`,
          body: `$${total.toFixed(2)} from ${quote.createdBy.name || 'a seller'} on RFQ ${rfq.number} — approve to release it to the buyer.`,
          linkView: 'admin',
          linkId: rfqId,
        }))
      )
    }
    await recordAudit({
      actorId: actor.id,
      actorType: isAdmin ? 'ADMIN' : 'SELLER',
      action: 'QUOTE_PENDING_REVIEW',
      entityType: 'Quote',
      entityId: quote.id,
      summary: `Quote ${number} queued for platform review (total ${total.toFixed(2)})`,
      metadata: { rfqId, total, mode: routing.mode },
    })
  } else if (rfq.userId !== actor.id) {
    // Buyer learns a new offer arrived (skip the platform quoting itself)
    await emitNotification({
      userId: rfq.userId,
      type: 'RFQ_QUOTE_RECEIVED',
      title: `Quote ${number} received`,
      body: `${isAdmin ? 'Vendora' : (quote.createdBy.name || 'A seller')} offered $${total.toFixed(2)}${quote.lines[0]?.product ? ` for ${quote.lines[0].product.title}` : ''}${input.paymentTerms ? ` · ${input.paymentTerms}` : ''}`,
      linkView: 'rfq',
      linkId: rfqId,
    })
  }

  return serializeQuote(quote as never)
}

// ── Quote routing review (admin releases or rejects a queued quote) ────

export async function reviewQuote(
  quoteId: string,
  actor: { id: string; role: string },
  decision: 'APPROVE' | 'REJECT',
  note?: string
): Promise<QuoteDTO> {
  if (actor.role !== 'ADMIN') throw new RfqServiceError('Only platform admins can review quotes', 403)
  const quote = await db.quote.findUnique({
    where: { id: quoteId },
    include: {
      rfq: { select: { id: true, number: true, userId: true } },
      createdBy: { select: { id: true, name: true } },
      lines: { include: { product: true } },
    },
  })
  if (!quote) throw new RfqServiceError('Quote not found', 404)
  if (quote.status !== 'PENDING_REVIEW') {
    throw new RfqServiceError(`Quote is ${quote.status.toLowerCase()} — nothing to review`, 409)
  }

  if (decision === 'APPROVE') {
    await db.quote.update({ where: { id: quoteId }, data: { status: 'SENT', sentAt: new Date() } })
    await recordAudit({
      actorId: actor.id,
      actorType: 'ADMIN',
      action: 'QUOTE_APPROVED',
      entityType: 'Quote',
      entityId: quoteId,
      summary: `Quote ${quote.number} released to the buyer after review`,
      metadata: { rfqId: quote.rfqId, note: note ?? null },
    })
    await emitNotification({
      userId: quote.rfq.userId,
      type: 'RFQ_QUOTE_RECEIVED',
      title: `Quote ${quote.number} received`,
      body: `${quote.createdBy.name || 'A seller'} offered $${Number(quote.total).toFixed(2)}${quote.lines[0]?.product ? ` for ${quote.lines[0].product.title}` : ''}${quote.paymentTerms ? ` · ${quote.paymentTerms}` : ''}`,
      linkView: 'rfq',
      linkId: quote.rfqId,
    })
  } else {
    await db.quote.update({ where: { id: quoteId }, data: { status: 'REJECTED' } })
    await recordAudit({
      actorId: actor.id,
      actorType: 'ADMIN',
      action: 'QUOTE_REJECTED',
      entityType: 'Quote',
      entityId: quoteId,
      summary: `Quote ${quote.number} rejected in review`,
      metadata: { rfqId: quote.rfqId, note: note ?? null },
    })
    if (quote.sellerId) {
      await emitNotification({
        userId: quote.sellerId,
        type: 'RFQ_QUOTE_REJECTED',
        title: `Quote ${quote.number} was not approved`,
        body: note?.trim()
          ? `Platform review declined your quote: ${note.trim()}`
          : 'Platform review declined your quote. Review the request and try a revised offer.',
        linkView: 'seller',
        linkId: quote.rfqId,
      })
    }
  }

  const updated = await db.quote.findUniqueOrThrow({
    where: { id: quoteId },
    include: {
      createdBy: { select: { id: true, name: true } },
      lines: { include: { product: true } },
    },
  })
  return serializeQuote(updated as never)
}

export async function respondToQuote(
  quoteId: string,
  userId: string,
  action: 'ACCEPT' | 'DECLINE'
): Promise<{ quote: QuoteDTO; rfq: RfqDTO; pendingApproval?: boolean }> {
  const quote = await db.quote.findUnique({
    where: { id: quoteId },
    include: {
      rfq: true,
      lines: { include: { product: true } },
      createdBy: { select: { id: true, name: true } },
    },
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
    if (
      membership &&
      needsApproval(
        {
          status: membership.organization.status,
          approvalThreshold: membership.organization.approvalThreshold
            ? Number(membership.organization.approvalThreshold)
            : null,
        },
        membership.role,
        Number(quote.total)
      )
    ) {
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

  // Tell the issuing seller (or platform facilitator) the outcome
  const quoteRecipient = quote.sellerId ?? quote.createdBy.id
  if (quoteRecipient !== userId) {
    await emitNotification({
      userId: quoteRecipient,
      type: action === 'ACCEPT' ? 'RFQ_QUOTE_ACCEPTED' : 'RFQ_QUOTE_DECLINED',
      title:
        action === 'ACCEPT'
          ? `Quote ${quote.number} accepted`
          : `Quote ${quote.number} declined`,
      body:
        action === 'ACCEPT'
          ? `The buyer accepted your offer of $${Number(quote.total).toFixed(2)} — convert it to an order when ready.`
          : `The buyer declined your offer of $${Number(quote.total).toFixed(2)}.`,
      linkView: 'rfq',
      linkId: quote.rfqId,
    })
  }

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
  await nudgeBackgroundSweeps()
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

/** Quotes filtered by status for the admin routing-review queue. */
export async function adminListQuotes(status?: string): Promise<QuoteDTO[]> {
  await expireStaleQuotes()
  await nudgeBackgroundSweeps()
  const quotes = await db.quote.findMany({
    where: status ? { status } : undefined,
    include: {
      createdBy: { select: { id: true, name: true } },
      lines: { include: { product: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  return quotes.map((q) => serializeQuote(q as never))
}

// ── Seller inbox — RFQs that reference my catalog products ───────────────────

export async function sellerRfqInbox(sellerId: string): Promise<RfqDTO[]> {
  await expireStaleQuotes()
  await nudgeBackgroundSweeps()
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

  // Anti-spam: messages per thread per day
  const spam = await resolvePanel('spamPrevention')
  if (spam.enabled) {
    const todayOnThread = await db.rfqMessage.count({
      where: { rfqId, createdAt: { gte: startOfToday() } },
    })
    if (todayOnThread >= Number(spam.maxMessagesThreadDay)) {
      throw new RfqServiceError(
        'This thread reached its daily message limit — continue tomorrow.',
        429
      )
    }
  }

  const message = await db.rfqMessage.create({
    data: { rfqId, authorId: actor.id, body: clean },
    include: { author: { select: { id: true, name: true, role: true } } },
  })

  // Notify the other thread participants: requester + involved/line sellers
  const meta = await db.rfq.findUnique({
    where: { id: rfqId },
    select: {
      userId: true,
      number: true,
      lines: { select: { product: { select: { sellerId: true } } } },
      quotes: { select: { sellerId: true } },
    },
  })
  if (meta) {
    const recipients = new Set<string>([meta.userId])
    for (const l of meta.lines) if (l.product?.sellerId) recipients.add(l.product.sellerId)
    for (const q of meta.quotes) if (q.sellerId) recipients.add(q.sellerId)
    recipients.delete(actor.id)
    const preview = clean.length > 120 ? `${clean.slice(0, 120)}…` : clean
    await emitNotifications(
      [...recipients].map((uid) => ({
        userId: uid,
        type: 'RFQ_MESSAGE',
        title: `New message on ${meta.number}`,
        body: `${message.author.name}: ${preview}`,
        linkView: 'rfq',
        linkId: rfqId,
      }))
    )
  }

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
  // Cancellation settings may lock quotes once sent
  if (!isAdmin) {
    const cancellation = await resolvePanel('cancellation')
    if (cancellation.enabled && cancellation.sellerWithdrawUntil === 'NEVER') {
      throw new RfqServiceError('Quotes cannot be withdrawn once sent on this platform', 403)
    }
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

  // The buyer should know the offer is off the table
  if (quote.rfq.userId !== actor.id) {
    await emitNotification({
      userId: quote.rfq.userId,
      type: 'RFQ_QUOTE_WITHDRAWN',
      title: `Quote ${quote.number} withdrawn`,
      body: 'The seller pulled this offer. Other quotes on the request remain open.',
      linkView: 'rfq',
      linkId: quote.rfqId,
    })
  }

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

  // Stock re-check (acceptance may predate stock changes). Variant lines check
  // the variant's own stock; product-level lines check the product stock.
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
  const neededVariants = new Map<string, number>()
  for (const l of quote.lines) {
    if (l.variantId) neededVariants.set(l.variantId, (neededVariants.get(l.variantId) ?? 0) + l.quantity)
  }
  if (neededVariants.size > 0) {
    const variants = await db.productVariant.findMany({
      where: { id: { in: [...neededVariants.keys()] } },
      include: { product: { select: { title: true } } },
    })
    for (const v of variants) {
      const need = neededVariants.get(v.id)!
      if (v.stock < need) {
        throw new RfqServiceError(
          `Not enough stock for "${v.product.title} (${v.name})" — ${v.stock} available, ${need} needed. Request a revised quote.`,
          409
        )
      }
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
            variantId: l.variantId ?? null,
            variantName: l.variantName ?? null,
            quantity: l.quantity,
            price: l.unitPrice.toNumber(),
            title: l.variantName ? `${l.product.title} — ${l.variantName}` : l.product.title,
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
    for (const [variantId, qty] of neededVariants) {
      await tx.productVariant
        .update({ where: { id: variantId }, data: { stock: { decrement: qty } } })
        .catch(() => undefined) // variant deleted mid-flight — product stock already covers it
    }

    await tx.quote.update({
      where: { id: quote.id },
      data: { status: 'CONVERTED', convertedAt: new Date() },
    })
    await tx.rfq.update({
      where: { id: quote.rfqId },
      data: { status: 'ORDERED', closedAt: new Date() },
    })

    // B2B money tracking: the converted order runs on NET terms — record an
    // INVOICE payment with the due date so the payments console can chase it.
    await ensurePayment(tx, {
      orderId: created.id,
      amount: quote.total.toNumber(),
      method: 'INVOICE',
      paymentTerms: quote.paymentTerms,
      orderRef: input.poNumber?.trim().slice(0, 40) || created.id.slice(-8).toUpperCase(),
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

  // Tell the issuing seller the deal closed with a real order
  const quoteRecipient = quote.sellerId ?? quote.createdById
  if (quoteRecipient !== viewer.id) {
    await emitNotification({
      userId: quoteRecipient,
      type: 'RFQ_QUOTE_CONVERTED',
      title: `Quote ${quote.number} became an order`,
      body: `PO ${order.poNumber ?? '—'} · $${order.total.toFixed(2)}${quote.paymentTerms ? ` · ${quote.paymentTerms}` : ''} — see it in your dashboard.`,
      linkView: 'seller',
      linkId: order.id,
    })
  }

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
