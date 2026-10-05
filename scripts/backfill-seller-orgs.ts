// ─────────────────────────────────────────────────────────────────────────────
// PHASE 7.0 SELLER TENANT SUBSTRATE BACKFILL (lastplan v5 7.0.3 + 7.0.4 / the
// binding spec docs/seller-tenant-model.md §6)
//
//   bun scripts/backfill-seller-orgs.ts
//
// Idempotent / resumable — safe to re-run at any point:
//   • org reuse is detected via an existing OWNER OrganizationMember row
//   • SellerProfile / membership creation skips rows that already exist
//   • sellerOrgId stamping only touches rows where sellerOrgId IS NULL
//   • primary-offer creation only fires when NO ProductOffer row exists at all
//     for (productId, sellerId) — offers in ANY status count as covered
//
// What it does, per seller user (role='SELLER' ∪ users referenced as
// ProductOffer.sellerId / Product.sellerId, even when their role differs):
//   a. resolve their org — reuse an org they own (role='OWNER' membership),
//      otherwise create Organization { name: `${storeName ?? name} (Store)`,
//      slug: store-<slug>-<rand6>, orgType COMPANY, status mapped from user }
//   b. create the SellerProfile (ownerUserId, verificationState from
//      user.verifiedAt — S3: verification ≠ suspension)
//   c. ensure an OWNER OrganizationMember row
//   d. stamp sellerOrgId (where NULL) on ProductOffer / OrderItem / Payout /
//      Quote rows attributed to that seller account
//   e. NORMALIZED PRIMARY OFFERS — one ACTIVE ProductOffer per seller-owned
//      product from its current price/stock (spec §2 row 1: from here the
//      offer layer is the single authoritative source of seller attribution)
//   f. reconciliation (THE 7.0 GATE — results committed):
//      docs/reports/phase7-seller-org-backfill.json + .md
// ─────────────────────────────────────────────────────────────────────────────
import { assertNotProd } from './lib/assert-not-prod'
import { db } from '../src/lib/db'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const REPORT_JSON = resolve(process.cwd(), 'docs/reports/phase7-seller-org-backfill.json')
const REPORT_MD = resolve(process.cwd(), 'docs/reports/phase7-seller-org-backfill.md')

type Ambiguity = { sellerId?: string; userId?: string; scope: string; detail: string; decision: string }

const stats = {
  sellersProcessed: 0,
  orgsCreated: 0,
  orgsReused: 0,
  sellerProfilesCreated: 0,
  membershipsCreated: 0,
  offersStamped: 0,
  orderItemsStamped: 0,
  payoutsStamped: 0,
  quotesStamped: 0,
  primaryOffersCreated: 0,
  productsAlreadyCovered: 0,
}

const ambiguities: Ambiguity[] = []
const coveredOfferStatusDistribution: Record<string, number> = {}
// userId → orgId resolved in step (a) — the reconciliation reference map
const sellerOrgMap = new Map<string, string>()

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'store'
}

function random6(): string {
  return Math.random().toString(36).slice(2, 8).padEnd(6, 'x')
}

/** Organization.status from User.status — operational lifecycle only (S3). */
function orgStatusFromUser(userStatus: string): 'ACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION' {
  if (userStatus === 'ACTIVE') return 'ACTIVE'
  if (userStatus === 'SUSPENDED') return 'SUSPENDED'
  return 'PENDING_VERIFICATION'
}

async function uniqueSlug(base: string): Promise<string> {
  for (let attempt = 0; attempt < 25; attempt++) {
    const slug = `store-${base}-${random6()}`
    const clash = await db.organization.findUnique({ where: { slug } })
    if (!clash) return slug
  }
  throw new Error(`could not derive a unique slug for "${base}" after 25 attempts`)
}

async function main() {
  assertNotProd()

  // ── candidate seller set (7.0.4) ────────────────────────────────────────────
  const roleSellers = await db.user.findMany({ where: { role: 'SELLER' }, select: { id: true } })
  const offerSellers = await db.productOffer.findMany({ select: { sellerId: true }, distinct: ['sellerId'] })
  const productSellers = await db.product.findMany({ select: { sellerId: true }, distinct: ['sellerId'] })
  const candidateIds = Array.from(
    new Set<string>([...roleSellers.map((u) => u.id), ...offerSellers.map((o) => o.sellerId), ...productSellers.map((p) => p.sellerId)])
  )
  const candidates = await db.user.findMany({ where: { id: { in: candidateIds } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
  console.log(`candidate sellers: ${candidates.length} (${roleSellers.length} role=SELLER, ${offerSellers.length} distinct offer sellers, ${productSellers.length} distinct product sellers)`)

  // ── per-seller substrate (a–e), each seller atomic ───────────────────────────
  for (const user of candidates) {
    stats.sellersProcessed++

    // NOTE: remote Aiven latency + per-product writes exceed Prisma's default
    // 5s interactive-transaction timeout — generous timeout for this small
    // per-seller transaction (tens of products at most).
    await db.$transaction(
      async (tx) => {
      // (a) resolve the org — reuse an owned one, else create
      let orgId: string
      const ownedMembership = await tx.organizationMember.findFirst({
        where: { userId: user.id, role: 'OWNER' },
        orderBy: { createdAt: 'asc' },
      })
      if (ownedMembership) {
        orgId = ownedMembership.organizationId
        stats.orgsReused++
      } else {
        const orgName = `${user.storeName ?? user.name} (Store)`
        const org = await tx.organization.create({
          data: {
            name: orgName,
            slug: await uniqueSlug(slugify(user.storeName ?? user.name)),
            orgType: 'COMPANY',
            status: orgStatusFromUser(user.status),
          },
        })
        orgId = org.id
        stats.orgsCreated++
      }

      // (b) SellerProfile — verification lives HERE (S3), never on org.status
      const existingProfile = await tx.sellerProfile.findUnique({ where: { organizationId: orgId } })
      if (!existingProfile) {
        await tx.sellerProfile.create({
          data: {
            organizationId: orgId,
            ownerUserId: user.id,
            verificationState: user.verifiedAt ? 'VERIFIED' : 'UNVERIFIED',
            verifiedAt: user.verifiedAt,
          },
        })
        stats.sellerProfilesCreated++
      } else if (existingProfile.ownerUserId !== user.id) {
        // defensive only — the unique organizationId means this org already
        // has a profile owned by someone else; keep it, record the decision
        ambiguities.push({
          userId: user.id,
          scope: 'SellerProfile',
          detail: `org ${orgId} already has a SellerProfile owned by ${existingProfile.ownerUserId}; user ${user.id} reuses this org as its seller tenant`,
          decision: 'kept the existing profile untouched; sellerOrgId stamping proceeds against this org (one SellerProfile per org is the model)',
        })
      }

      // (c) ensure OWNER membership
      const existingMember = await tx.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: orgId, userId: user.id } },
      })
      if (!existingMember) {
        await tx.organizationMember.create({ data: { organizationId: orgId, userId: user.id, role: 'OWNER' } })
        stats.membershipsCreated++
      } else if (existingMember.role !== 'OWNER') {
        await tx.organizationMember.update({
          where: { id: existingMember.id },
          data: { role: 'OWNER' },
        })
        stats.membershipsCreated++
        ambiguities.push({
          userId: user.id,
          scope: 'OrganizationMember',
          detail: `user held role ${existingMember.role} in their seller org ${orgId}`,
          decision: `promoted to OWNER — the seller substrate requires the owner account to hold the OWNER membership (7.0.4c)`,
        })
      }

      sellerOrgMap.set(user.id, orgId)

      // (d) stamp sellerOrgId where NULL — offers, order items, payouts, quotes
      const offersStamped = await tx.productOffer.updateMany({
        where: { sellerId: user.id, sellerOrgId: null },
        data: { sellerOrgId: orgId },
      })
      stats.offersStamped += offersStamped.count
      const orderItemsStamped = await tx.orderItem.updateMany({
        where: { sellerId: user.id, sellerOrgId: null },
        data: { sellerOrgId: orgId },
      })
      stats.orderItemsStamped += orderItemsStamped.count
      const payoutsStamped = await tx.payout.updateMany({
        where: { sellerId: user.id, sellerOrgId: null },
        data: { sellerOrgId: orgId },
      })
      stats.payoutsStamped += payoutsStamped.count
      const quotesStamped = await tx.quote.updateMany({
        where: { sellerId: user.id, sellerOrgId: null },
        data: { sellerOrgId: orgId },
      })
      stats.quotesStamped += quotesStamped.count

      // (e) NORMALIZED PRIMARY OFFERS (7.0.3) — one ACTIVE offer per
      // seller-owned product from its current price/stock; an offer in ANY
      // status already counts as covered (never activates paused/archived ones)
      const products = await tx.product.findMany({ where: { sellerId: user.id }, orderBy: { createdAt: 'asc' } })
      if (products.length > 0) {
        const existingOffers = await tx.productOffer.findMany({
          where: { sellerId: user.id, productId: { in: products.map((p) => p.id) } },
          select: { productId: true, status: true },
        })
        const coveredProductIds = new Set(existingOffers.map((o) => o.productId))
        for (const o of existingOffers) {
          coveredOfferStatusDistribution[o.status] = (coveredOfferStatusDistribution[o.status] ?? 0) + 1
        }
        for (const product of products) {
          if (coveredProductIds.has(product.id)) {
            stats.productsAlreadyCovered++
            continue
          }
          await tx.productOffer.create({
            data: {
              productId: product.id,
              sellerId: user.id,
              sellerOrgId: orgId,
              price: product.price,
              compareAtPrice: product.compareAtPrice,
              stock: product.stock,
              sku: product.sku,
              moq: product.moq,
              status: 'ACTIVE',
            },
          })
          stats.primaryOffersCreated++
        }
      }
      },
      { timeout: 300_000, maxWait: 10_000 }
    )
    console.log(
      `  seller ${user.id} (${user.storeName ?? user.name}) → org ${sellerOrgMap.get(user.id)} — primary offers so far: ${stats.primaryOffersCreated}, covered: ${stats.productsAlreadyCovered}`
    )
  }

  // ── (f) RECONCILIATION — the 7.0 gate, re-derived from post-backfill DB ────
  const mapIds = [...sellerOrgMap.keys()]

  // (1) every seller user has an org + SellerProfile + OWNER membership
  const missingOrgOrProfileOrMembership: string[] = []
  for (const [userId, orgId] of sellerOrgMap) {
    const profile = await db.sellerProfile.findUnique({ where: { organizationId: orgId } })
    const ownerMembership = await db.organizationMember.findFirst({ where: { userId, organizationId: orgId, role: 'OWNER' } })
    if (!profile || profile.ownerUserId !== userId || !ownerMembership) {
      missingOrgOrProfileOrMembership.push(userId)
    }
  }

  // (2) every ProductOffer's sellerOrgId matches its seller's org from (a)
  const offersAll = await db.productOffer.findMany({ select: { id: true, sellerId: true, sellerOrgId: true } })
  const offerMismatches = offersAll.filter(
    (o) => sellerOrgMap.has(o.sellerId) && o.sellerOrgId !== sellerOrgMap.get(o.sellerId)
  )

  // (3) every seller-owned Product has ≥1 offer row (any status)
  const sellerProducts = await db.product.findMany({
    where: { sellerId: { in: mapIds } },
    select: { id: true, sellerId: true },
  })
  // offers for (productId, sellerId) — the primary-offer normalization check
  const offerPairs = await db.productOffer.findMany({ select: { productId: true, sellerId: true } })
  const coveredPairs = new Set(offerPairs.map((o) => `${o.sellerId}:${o.productId}`))
  const productsWithoutOffer = sellerProducts.filter((p) => !coveredPairs.has(`${p.sellerId}:${p.id}`))

  // (4) every OrderItem/Payout/Quote sellerOrgId matches its seller's org
  const orderItems = await db.orderItem.findMany({ select: { id: true, sellerId: true, sellerOrgId: true } })
  const orderItemMismatches = orderItems.filter(
    (i) => sellerOrgMap.has(i.sellerId) && i.sellerOrgId !== sellerOrgMap.get(i.sellerId)
  )
  const payouts = await db.payout.findMany({ select: { id: true, sellerId: true, sellerOrgId: true } })
  const payoutMismatches = payouts.filter(
    (p) => sellerOrgMap.has(p.sellerId) && p.sellerOrgId !== sellerOrgMap.get(p.sellerId)
  )
  const quotes = await db.quote.findMany({ select: { id: true, sellerId: true, sellerOrgId: true } })
  const quoteMismatches = quotes.filter(
    (q) => q.sellerId && sellerOrgMap.has(q.sellerId) && q.sellerOrgId !== sellerOrgMap.get(q.sellerId as string)
  )

  // (5) no NULL sellerOrgId left on rows belonging to a seller WITH an org
  const nullOrgOffers = offersAll.filter((o) => o.sellerOrgId === null && sellerOrgMap.has(o.sellerId))
  const nullOrgOrderItems = orderItems.filter((i) => i.sellerOrgId === null && sellerOrgMap.has(i.sellerId))
  const nullOrgPayouts = payouts.filter((p) => p.sellerOrgId === null && sellerOrgMap.has(p.sellerId))
  const nullOrgQuotes = quotes.filter((q) => q.sellerOrgId === null && q.sellerId && sellerOrgMap.has(q.sellerId as string))

  const checks = {
    '1_everySellerHasOrgProfileOwnerMembership': {
      mismatches: missingOrgOrProfileOrMembership.length,
      detail: `${missingOrgOrProfileOrMembership.length} seller users missing org/SellerProfile/OWNER membership`,
    },
    '2_offerSellerOrgIdMatchesSellersOrg': {
      mismatches: offerMismatches.length,
      detail: `${offerMismatches.length} ProductOffer rows whose sellerOrgId ≠ their seller's org`,
    },
    '3_everySellerProductHasOffer': {
      mismatches: productsWithoutOffer.length,
      detail: `${productsWithoutOffer.length} seller-owned Products without any ProductOffer row`,
    },
    '4_orderItemPayoutQuoteSellerOrgIdMatches': {
      mismatches: orderItemMismatches.length + payoutMismatches.length + quoteMismatches.length,
      detail: `${orderItemMismatches.length} OrderItem, ${payoutMismatches.length} Payout, ${quoteMismatches.length} Quote rows whose sellerOrgId ≠ their seller's org`,
    },
    '5_noNullSellerOrgIdOnSellerRows': {
      mismatches: nullOrgOffers.length + nullOrgOrderItems.length + nullOrgPayouts.length + nullOrgQuotes.length,
      detail: `${nullOrgOffers.length} ProductOffer, ${nullOrgOrderItems.length} OrderItem, ${nullOrgPayouts.length} Payout, ${nullOrgQuotes.length} Quote rows with NULL sellerOrgId belonging to a seller WITH an org`,
    },
  }
  const gatePassed = Object.values(checks).every((c) => c.mismatches === 0)

  // archived-product nuance: the spec mandates an ACTIVE primary offer for
  // every seller-owned product; commerce paths independently gate on
  // product.status='ACTIVE', so archived listings remain unbuyable
  const archivedProducts = await db.product.findMany({
    where: { sellerId: { in: mapIds }, status: 'ARCHIVED' },
    select: { id: true, sellerId: true },
  })
  if (archivedProducts.length > 0) {
    ambiguities.push({
      scope: 'primary-offer normalization on non-ACTIVE products',
      detail: `${archivedProducts.length} seller-owned Product(s) in status ARCHIVED received a status='ACTIVE' primary ProductOffer per the 7.0.3 spec ("one ACTIVE ProductOffer per seller-owned product")`,
      decision: 'kept ACTIVE per spec; every commerce path (checkout, offer listing) independently validates Product.status — archived products remain unbuyable through their primary offer',
    })
  }

  // ── report (7.0 gate, results committed) ────────────────────────────────────
  // Counts are CUMULATIVE across re-runs (merged with the on-disk report) so
  // the committed artifact always reflects the backfill's total work, not just
  // the zero-delta of an idempotent re-run. The reconciliation checks are
  // re-derived from live DB state on every run.
  let priorCounts: typeof stats & { coveredOfferStatusDistribution?: Record<string, number> } | null = null
  try {
    const prior = JSON.parse(readFileSync(REPORT_JSON, 'utf8')) as { counts?: typeof stats }
    if (prior?.counts && typeof prior.counts.sellersProcessed === 'number') priorCounts = prior.counts
  } catch {
    /* no prior report — first run */
  }
  const cumulative = { ...(priorCounts ?? {}) } as Record<string, number>
  for (const key of Object.keys(stats) as Array<keyof typeof stats>) {
    cumulative[key] = (cumulative[key] ?? 0) + stats[key]
  }
  const cumulativeDistribution: Record<string, number> = { ...(priorCounts?.coveredOfferStatusDistribution ?? {}) }
  for (const [k, v] of Object.entries(coveredOfferStatusDistribution)) {
    cumulativeDistribution[k] = (cumulativeDistribution[k] ?? 0) + v
  }

  const dbStateAfter = {
    organizations: await db.organization.count(),
    sellerProfiles: await db.sellerProfile.count(),
    productOffers: await db.productOffer.count(),
    productOffersWithSellerOrgId: await db.productOffer.count({ where: { sellerOrgId: { not: null } } }),
    orderItemsWithSellerOrgId: await db.orderItem.count({ where: { sellerOrgId: { not: null } } }),
    quotesWithSellerOrgId: await db.quote.count({ where: { sellerOrgId: { not: null } } }),
    payoutsWithSellerOrgId: await db.payout.count({ where: { sellerOrgId: { not: null } } }),
  }

  const report = {
    generatedAt: new Date().toISOString(),
    task: 'Phase 7.0 seller-org substrate backfill (lastplan 7.0.3 + 7.0.4 / docs/seller-tenant-model.md §6)',
    counts: cumulative as unknown as Record<string, number>,
    thisRun: { ...stats, coveredOfferStatusDistribution },
    dbStateAfter,
    reconciliation: checks,
    ambiguities,
    gate: gatePassed ? 'PASS — zero mismatches on all five checks' : 'FAIL — see reconciliation',
  }

  mkdirSync(resolve(process.cwd(), 'docs/reports'), { recursive: true })
  writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2) + '\n')

  const md = `# Phase 7.0 — Seller-org substrate backfill (lastplan 7.0.3 + 7.0.4)

Generated: ${report.generatedAt}
Spec: docs/seller-tenant-model.md (binding) · scripts/backfill-seller-orgs.ts (idempotent, resumable)
Counts below are cumulative across runs; reconciliation is re-derived from live DB state on every run.

## What ran

For every candidate seller user (role=SELLER plus any user referenced as ProductOffer.sellerId / Product.sellerId):
org resolution (reuse an owned org, else create one) → SellerProfile → OWNER membership → sellerOrgId stamping on
offers / order items / payouts / quotes → normalized primary offers for every seller-owned product.

## Counts

| Metric | Count |
|---|---|
| Sellers processed | ${cumulative.sellersProcessed ?? 0} |
| Orgs created | ${cumulative.orgsCreated ?? 0} |
| Orgs reused (existing OWNER membership) | ${cumulative.orgsReused ?? 0} |
| SellerProfiles created | ${cumulative.sellerProfilesCreated ?? 0} |
| OWNER memberships created | ${cumulative.membershipsCreated ?? 0} |
| ProductOffers stamped (sellerOrgId) | ${cumulative.offersStamped ?? 0} |
| OrderItems stamped (sellerOrgId) | ${cumulative.orderItemsStamped ?? 0} |
| Payouts stamped (sellerOrgId) | ${cumulative.payoutsStamped ?? 0} |
| Quotes stamped (sellerOrgId) | ${cumulative.quotesStamped ?? 0} |
| Primary offers created (ACTIVE) | ${cumulative.primaryOffersCreated ?? 0} |
| Products already covered by an offer | ${cumulative.productsAlreadyCovered ?? 0} (status distribution: ${Object.entries(cumulativeDistribution).map(([k, v]) => `${k}=${v}`).join(', ') || 'none'}) |

DB state now: ${Object.entries(dbStateAfter).map(([k, v]) => `${k}=${v}`).join(', ')}

## Reconciliation — the 7.0 gate (every check must be ZERO mismatches)

| # | Check | Mismatches |
|---|---|---|
| 1 | Every seller user has org + SellerProfile + OWNER membership | ${checks['1_everySellerHasOrgProfileOwnerMembership'].mismatches} |
| 2 | Every ProductOffer.sellerOrgId matches its seller's org | ${checks['2_offerSellerOrgIdMatchesSellersOrg'].mismatches} |
| 3 | Every seller-owned Product has ≥1 offer row (any status) | ${checks['3_everySellerProductHasOffer'].mismatches} |
| 4 | Every OrderItem/Payout/Quote sellerOrgId matches its seller's org | ${checks['4_orderItemPayoutQuoteSellerOrgIdMatches'].mismatches} |
| 5 | No NULL sellerOrgId on rows belonging to a seller WITH an org | ${checks['5_noNullSellerOrgIdOnSellerRows'].mismatches} |

**Gate: ${report.gate}**

## Ambiguities (${ambiguities.length} — all carry a recorded decision)

${ambiguities.length === 0 ? '_none_' : ambiguities.map((a) => `- **${a.scope}**${a.userId ? ` (user ${a.userId})` : ''}: ${a.detail}\n  → decision: ${a.decision}`).join('\n')}

From this point the offer layer is the single authoritative source of seller attribution for commerce
(docs/seller-tenant-model.md §2 row 1); the product's own price/stock are the read-model for its primary offer.
`
  writeFileSync(REPORT_MD, md)

  console.log('\n─── 7.0 seller-org backfill ────────────────────────────')
  console.log(JSON.stringify(report.counts, null, 2))
  console.log('reconciliation:', JSON.stringify(checks, null, 2))
  console.log(`gate: ${report.gate}`)
  console.log(`reports: ${REPORT_JSON}`)
  await db.$disconnect()
  if (!gatePassed) process.exit(1)
}

main().catch((err) => {
  console.error('backfill-seller-orgs crashed:', err)
  process.exit(1)
})
