import { db } from '@/lib/db'
import { recordAuditTx } from '@/server/modules/audit/service'
import {
  assessFee,
  resolveFeeRule,
  type ResolvedFeeRule,
} from '@/server/modules/fees/service'

// ─────────────────────────────────────────────────────────────────────────────
// SPONSOR-1: sponsored/pinned listings — the seller-side monetization flow.
//
// A company member (Selling workspace) pays to pin one of the org's APPROVED
// shared-catalog products: the product is pinned to the top of the storefront
// default sort (page 1, max 4 concurrent pins) and carries a "Sponsored" badge.
//
// PRICING (everything customizable from Platform Settings — CONFIG-1 doctrine):
// the per-day price resolves through the fee engine, event SPONSORSHIP:
//   ORG-scoped FLAT rule → ORG_TYPE FLAT rule → PLATFORM FLAT rule
//   → PlatformSetting { key: 'sponsorship', perDay } (legacy fallback, default 15 USD/day)
// Every purchase writes an immutable FeeAssessment ledger row (event SPONSORSHIP,
// actor SELLER) so the Monetization → Revenue console reconciles it.
//
// INVARIANTS
//   • one ACTIVE placement per product at a time (in-tx re-check kills the race)
//   • only APPROVED + ACTIVE products of an ACTIVE org can be sponsored
//   • the purchaser must be a member of the OWNING org (OWNER/ADMIN or a role
//     holding org.offers.manage — the selling permission across the Selling tabs)
//   • expiry is enforced on READ (endsAt > now) and lazily reconciled on write
// ─────────────────────────────────────────────────────────────────────────────

export class SponsorshipError extends Error {
  status: number
  code?: string
  constructor(message: string, status = 400, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

/** Purchasable windows (days). */
export const SPONSORSHIP_PACKAGES = [7, 14, 30] as const
export type SponsorshipPackage = (typeof SPONSORSHIP_PACKAGES)[number]

function isPackage(days: number): days is SponsorshipPackage {
  return (SPONSORSHIP_PACKAGES as readonly number[]).includes(days)
}

/** Max concurrent pins on the storefront page 1 (UX guard, not a purchase cap). */
export const MAX_PINS = 4

const LEGACY_DEFAULT_PER_DAY = 15

export interface SponsorshipPricing {
  perDay: number
  currency: string
  source: 'RULE' | 'PLATFORM_SETTING' | 'DEFAULT'
  ruleId: string | null
  ruleVersion: number | null
}

/**
 * Resolve the per-day sponsorship price for a seller org context. Fee-engine
 * first (event SPONSORSHIP — FLAT dimension; PERCENT rules don't price a
 * placement), legacy PlatformSetting fallback, hard default last.
 */
export async function resolveSponsorshipPricing(orgId: string | null): Promise<SponsorshipPricing> {
  const ctx = await sellerFeeActorCtxFromOrg(orgId)
  const rule = await resolveFeeRule('SPONSORSHIP', ctx)
  if (rule && rule.dimension === 'FLAT') {
    return {
      perDay: rule.value,
      currency: rule.currency ?? 'USD',
      source: 'RULE',
      ruleId: rule.id,
      ruleVersion: rule.version,
    }
  }
  // Legacy fallback — Platform Settings (key 'sponsorship' → { perDay })
  const row = await db.platformSetting.findUnique({ where: { key: 'sponsorship' } })
  if (row) {
    try {
      const parsed = JSON.parse(row.value) as { perDay?: number }
      if (Number.isFinite(parsed.perDay) && (parsed.perDay as number) > 0) {
        return { perDay: parsed.perDay as number, currency: 'USD', source: 'PLATFORM_SETTING', ruleId: null, ruleVersion: null }
      }
    } catch {
      /* fall through */
    }
  }
  return { perDay: LEGACY_DEFAULT_PER_DAY, currency: 'USD', source: 'DEFAULT', ruleId: null, ruleVersion: null }
}

async function sellerFeeActorCtxFromOrg(orgId: string | null) {
  if (orgId) {
    const org = await db.organization.findUnique({ where: { id: orgId }, select: { id: true, orgType: true } })
    if (org) return { orgId: org.id, orgType: org.orgType }
  }
  return {}
}

/** Lazily flip ACTIVE placements past their window to EXPIRED (idempotent). */
export async function expireDueSponsorships(): Promise<number> {
  const res = await db.sponsoredPlacement.updateMany({
    where: { status: 'ACTIVE', endsAt: { lt: new Date() } },
    data: { status: 'EXPIRED' },
  })
  return res.count
}

// ── guard (quote + purchase share it) ───────────────────────────────────────

interface EligibleProduct {
  id: string
  status: string
  approvalState: string
  organizationId: string | null
  organization: { id: string; status: string } | null
}

export interface SponsorshipGuard {
  eligible: boolean
  activePlacementExists: boolean
  reason?: string
}

export async function sponsorshipEligibility(userId: string, product: EligibleProduct): Promise<SponsorshipGuard> {
  if (!product.organizationId || !product.organization) {
    return { eligible: false, activePlacementExists: false, reason: 'Only company-owned catalog products can be sponsored.' }
  }
  if (product.organization.status !== 'ACTIVE') {
    return { eligible: false, activePlacementExists: false, reason: 'Your organization is not active yet.' }
  }
  if (product.status !== 'ACTIVE' || product.approvalState !== 'APPROVED') {
    return { eligible: false, activePlacementExists: false, reason: 'Only platform-approved, live products can be sponsored.' }
  }
  const membership = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: product.organizationId, userId } },
    select: { role: true },
  })
  if (!membership) {
    return { eligible: false, activePlacementExists: false, reason: 'You are not a member of the product owner organization.' }
  }
  if (!['OWNER', 'ADMIN'].includes(membership.role)) {
    const allowed = await db.userRole.count({
      where: {
        userId,
        organizationId: product.organizationId,
        role: { permissions: { some: { permissionKey: 'org.offers.manage' } } },
      },
    })
    if (allowed === 0) {
      return { eligible: false, activePlacementExists: false, reason: 'Sponsoring requires the "org.offers.manage" permission.' }
    }
  }
  const activePlacementExists = Boolean(
    await db.sponsoredPlacement.findFirst({
      where: { productId: product.id, status: 'ACTIVE', endsAt: { gt: new Date() } },
      select: { id: true },
    })
  )
  if (activePlacementExists) {
    return { eligible: false, activePlacementExists: true, reason: 'This product already has an active sponsorship.' }
  }
  return { eligible: true, activePlacementExists: false }
}

// ── quote ───────────────────────────────────────────────────────────────────

export interface SponsorshipQuote {
  productId: string
  productTitle: string
  days: number
  perDay: number
  amount: number
  currency: string
  source: SponsorshipPricing['source']
  eligible: boolean
  reason?: string
}

export async function quoteSponsorship(userId: string, productId: string, days: number): Promise<SponsorshipQuote> {
  if (!isPackage(days)) throw new SponsorshipError('Choose a 7, 14 or 30 day window', 400, 'BAD_PACKAGE')
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { id: true, title: true, status: true, approvalState: true, organizationId: true, organization: { select: { id: true, status: true } } },
  })
  if (!product) throw new SponsorshipError('Product not found', 404, 'NOT_FOUND')

  const guard = await sponsorshipEligibility(userId, product)
  const pricing = await resolveSponsorshipPricing(product.organizationId)
  return {
    productId: product.id,
    productTitle: product.title,
    days,
    perDay: pricing.perDay,
    amount: Math.round(pricing.perDay * days * 100) / 100,
    currency: pricing.currency,
    source: pricing.source,
    eligible: guard.eligible,
    reason: guard.reason,
  }
}

// ── purchase ─────────────────────────────────────────────────────────────────

export interface SponsorshipDTO {
  id: string
  productId: string
  productTitle: string
  productSlug: string | null
  organizationId: string
  organizationName: string
  days: number
  amount: number
  currency: string
  status: string
  paymentMethod: string
  paymentStatus: string
  startsAt: string
  endsAt: string
  createdAt: string
  daysLeft: number
}

type PlacementRow = {
  id: string
  productId: string
  organizationId: string
  days: number
  amount: number
  currency: string
  status: string
  paymentMethod: string
  paymentStatus: string
  startsAt: Date
  endsAt: Date
  createdAt: Date
  product: { title: string; slug: string | null }
  organization: { name: string }
}

function serializePlacement(row: PlacementRow): SponsorshipDTO {
  return {
    id: row.id,
    productId: row.productId,
    productTitle: row.product.title,
    productSlug: row.product.slug,
    organizationId: row.organizationId,
    organizationName: row.organization.name,
    days: row.days,
    amount: row.amount,
    currency: row.currency,
    status: row.status,
    paymentMethod: row.paymentMethod,
    paymentStatus: row.paymentStatus,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    daysLeft: Math.max(0, Math.ceil((row.endsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000))),
  }
}

export async function purchaseSponsorship(input: {
  userId: string
  productId: string
  days: number
  paymentMethod?: 'CARD' | 'WALLET'
}): Promise<SponsorshipDTO> {
  const { userId, productId, days } = input
  if (!isPackage(days)) throw new SponsorshipError('Choose a 7, 14 or 30 day window', 400, 'BAD_PACKAGE')
  const paymentMethod = input.paymentMethod ?? 'CARD'

  const product = await db.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      approvalState: true,
      organizationId: true,
      organization: { select: { id: true, name: true, status: true, orgType: true } },
    },
  })
  if (!product) throw new SponsorshipError('Product not found', 404, 'NOT_FOUND')

  const guard = await sponsorshipEligibility(userId, product)
  if (!guard.eligible) throw new SponsorshipError(guard.reason ?? 'Not eligible', 403, 'NOT_ELIGIBLE')

  const pricing = await resolveSponsorshipPricing(product.organizationId)
  const amount = Math.round(pricing.perDay * days * 100) / 100
  const now = new Date()
  const endsAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)

  // Rule pre-resolution (BEFORE the transaction): the Aiven MySQL link has
  // WAN latency and the scope-chain queries must not burn the interactive
  // transaction budget. The resolved rule is passed forward as explicitRule.
  let ruleForLedger: ResolvedFeeRule | null = null
  if (pricing.source === 'RULE' && pricing.ruleId) {
    const base = await resolveFeeRule('SPONSORSHIP', { orgId: product.organizationId! })
    ruleForLedger = base && base.id === pricing.ruleId ? { ...base, value: amount } : null
  }

  const placement = await db.$transaction(
    async (tx) => {
      // In-tx re-check of the one-active-per-product invariant (kills the race)
      const conflict = await tx.sponsoredPlacement.findFirst({
        where: { productId, status: 'ACTIVE', endsAt: { gt: now } },
        select: { id: true },
      })
      if (conflict) throw new SponsorshipError('This product already has an active sponsorship', 409, 'ALREADY_SPONSORED')

      const created = await tx.sponsoredPlacement.create({
        data: {
          productId,
          organizationId: product.organizationId!,
          sellerId: userId,
          days,
          amount,
          currency: pricing.currency,
          status: 'ACTIVE',
          paymentMethod,
          paymentStatus: 'PAID',
          startsAt: now,
          endsAt,
        },
        include: { product: { select: { title: true, slug: true } }, organization: { select: { name: true } } },
      })

      // Immutable SPONSORSHIP ledger row — rule-linked when a fee rule priced
      // it (value-adjusted explicitRule so the ledger amount is the FULL
      // purchase price while still snapshotting the originating rule).
      const assessment = await assessFee(
        {
          event: 'SPONSORSHIP',
          actorType: 'SELLER',
          actorOrgId: product.organizationId,
          ctx: { orgId: product.organizationId! },
          baseAmount: amount,
          currency: pricing.currency,
          calcInputs: {
            flow: 'sponsorship',
            perDay: pricing.perDay,
            priceSource: pricing.source,
            days,
            ...(ruleForLedger ? {} : { legacyAmount: amount }),
          },
          idempotencyKey: `SPONSORSHIP:placement:${created.id}`,
          refType: 'SPONSORSHIP_PLACEMENT',
          refId: created.id,
        },
        tx,
        ruleForLedger
      )
      await tx.sponsoredPlacement.update({ where: { id: created.id }, data: { feeAssessmentId: assessment.id } })

      await recordAuditTx(tx, {
        actorId: userId,
        actorType: 'USER',
        action: 'SPONSORSHIP_PURCHASE',
        entityType: 'SponsoredPlacement',
        entityId: created.id,
        summary: `Sponsored "${product.title}" for ${days} days (${amount} ${pricing.currency}, ${paymentMethod})`,
        metadata: { productId, organizationId: product.organizationId, days, amount, paymentMethod, priceSource: pricing.source },
      })

      return created
    },
    // WAN-resilient budget: the default 5s can expire on the Aiven link under
    // concurrent load; the in-tx work itself is 5 small queries.
    { timeout: 15000 }
  )

  return serializePlacement(placement as PlacementRow)
}

// ── cancel ──────────────────────────────────────────────────────────────────

export async function cancelSponsorship(userId: string, placementId: string): Promise<void> {
  const placement = await db.sponsoredPlacement.findUnique({
    where: { id: placementId },
    select: { id: true, status: true, organizationId: true, product: { select: { title: true } } },
  })
  if (!placement) throw new SponsorshipError('Placement not found', 404, 'NOT_FOUND')
  if (placement.status !== 'ACTIVE') throw new SponsorshipError('Only active sponsorships can be cancelled', 409, 'NOT_ACTIVE')

  const membership = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: placement.organizationId, userId } },
    select: { role: true },
  })
  if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) {
    throw new SponsorshipError('Only the sponsoring organization OWNER/ADMIN can cancel', 403, 'NOT_ALLOWED')
  }

  await db.$transaction(async (tx) => {
    await tx.sponsoredPlacement.update({ where: { id: placementId }, data: { status: 'CANCELLED' } })
    await recordAuditTx(tx, {
      actorId: userId,
      actorType: 'USER',
      action: 'SPONSORSHIP_CANCEL',
      entityType: 'SponsoredPlacement',
      entityId: placementId,
      summary: `Cancelled sponsorship of "${placement.product.title}"`,
      metadata: { placementId, organizationId: placement.organizationId },
    })
  })
}

// ── queries ─────────────────────────────────────────────────────────────────

const PLACEMENT_INCLUDE = {
  product: { select: { title: true, slug: true } },
  organization: { select: { name: true } },
} as const

/** An org's placements (Selling → Sponsorships). Expired rows reconciled first. */
export async function listOrgSponsorships(organizationId: string): Promise<SponsorshipDTO[]> {
  await expireDueSponsorships()
  const rows = await db.sponsoredPlacement.findMany({
    where: { organizationId },
    include: PLACEMENT_INCLUDE,
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  return rows.map((row) => serializePlacement(row as PlacementRow))
}

/** Product ids with a live placement — the storefront pin set (bounded). */
export async function activeSponsoredProductIds(limit = MAX_PINS): Promise<string[]> {
  const rows = await db.sponsoredPlacement.findMany({
    where: { status: 'ACTIVE', endsAt: { gt: new Date() } },
    select: { productId: true, createdAt: true },
    orderBy: { createdAt: 'asc' }, // earliest purchases keep their slot when over capacity
    take: 60,
  })
  return [...new Set(rows.map((r) => r.productId))].slice(0, limit)
}

/** Admin monetization console view. */
export async function listAllSponsorships(limit = 200): Promise<SponsorshipDTO[]> {
  await expireDueSponsorships()
  const rows = await db.sponsoredPlacement.findMany({
    include: PLACEMENT_INCLUDE,
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  return rows.map((row) => serializePlacement(row as PlacementRow))
}
