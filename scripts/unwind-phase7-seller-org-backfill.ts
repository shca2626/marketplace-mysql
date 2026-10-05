// ─────────────────────────────────────────────────────────────────────────────
// PHASE 7.0 SELLER-ORG BACKFILL — DOCUMENTED ROLLBACK (one-shot inverse of
// scripts/backfill-seller-orgs.ts, lastplan 7.0.4 "documented rollback" rule)
//
//   bun scripts/unwind-phase7-seller-org-backfill.ts
//
// Precisely undoes everything the 7.0 backfill created/stamped, in FK-safe
// order, and verifies the result against the recorded pre-backfill baseline:
//   • deletes the primary ProductOffers the backfill created (offers whose
//     sellerId IS the product's owner — the 3 pre-existing multi-vendor
//     offers by NON-owner sellers are untouched)
//   • deletes all SellerProfile rows (none existed before the backfill)
//   • deletes OWNER OrganizationMember rows in backfill-created orgs
//   • deletes the backfill-created Organizations (createdAt ≥ run date, slug
//     'store-…' pattern, SellerProfile-backed)
//   • NULLs sellerOrgId on ProductOffer / OrderItem / Payout / Quote rows of
//     candidate sellers (all were NULL before the backfill — verified)
// Also deletes docs/reports/phase7-seller-org-backfill.{json,md} so the next
// backfill run starts a clean cumulative report.
// ONE-SHOT by design; refuses to run twice (no SellerProfile rows → no-op).
// ─────────────────────────────────────────────────────────────────────────────
import { assertNotProd } from './lib/assert-not-prod'
import { db } from '../src/lib/db'
import { existsSync, rmSync } from 'fs'
import { resolve } from 'path'

const REPORT_JSON = resolve(process.cwd(), 'docs/reports/phase7-seller-org-backfill.json')
const REPORT_MD = resolve(process.cwd(), 'docs/reports/phase7-seller-org-backfill.md')

// the 7.0 backfill ran on this date (2026-10-05) — orgs created by it are
// identified by createdAt ≥ this instant
const BACKFILL_EPOCH = new Date('2026-10-05T00:00:00.000Z')

async function main() {
  assertNotProd()

  const profiles = await db.sellerProfile.findMany({ select: { organizationId: true, ownerUserId: true } })
  if (profiles.length === 0) {
    console.log('nothing to unwind — no SellerProfile rows exist (already rolled back?)')
    await db.$disconnect()
    return
  }
  const sellerOrgIds = new Set(profiles.map((p) => p.organizationId))
  const sellerUserIds = [...new Set(profiles.map((p) => p.ownerUserId))]
  console.log(`unwinding substrate for ${profiles.length} seller profiles (${sellerUserIds.length} sellers)`)

  // 1. delete primary offers the backfill created = owner-backed offers
  const ownerOffers = await db.productOffer.findMany({
    where: { sellerOrgId: { in: [...sellerOrgIds] } },
    select: { id: true, sellerId: true, productId: true, product: { select: { sellerId: true } } },
  })
  const primaryOfferIds = ownerOffers.filter((o) => o.sellerId === o.product.sellerId).map((o) => o.id)
  const thirdPartyOffers = ownerOffers.length - primaryOfferIds.length
  const delOffers = await db.productOffer.deleteMany({ where: { id: { in: primaryOfferIds } } })
  console.log(`  primary offers deleted: ${delOffers.count} (kept ${thirdPartyOffers} pre-existing non-owner offers)`)

  // 2. NULL the stamps (all were NULL pre-backfill)
  const r1 = await db.productOffer.updateMany({ where: { sellerId: { in: sellerUserIds } }, data: { sellerOrgId: null } })
  const r2 = await db.orderItem.updateMany({ where: { sellerId: { in: sellerUserIds } }, data: { sellerOrgId: null } })
  const r3 = await db.payout.updateMany({ where: { sellerId: { in: sellerUserIds } }, data: { sellerOrgId: null } })
  const r4 = await db.quote.updateMany({ where: { sellerId: { in: sellerUserIds } }, data: { sellerOrgId: null } })
  console.log(`  stamps NULLed: offers=${r1.count}, orderItems=${r2.count}, payouts=${r3.count}, quotes=${r4.count}`)

  // 3. delete SellerProfiles (none pre-existed the backfill)
  const delProfiles = await db.sellerProfile.deleteMany({ where: { organizationId: { in: [...sellerOrgIds] } } })
  console.log(`  seller profiles deleted: ${delProfiles.count}`)

  // 4. delete OWNER memberships inside backfill-CREATED orgs only
  const createdOrgs = await db.organization.findMany({
    where: { id: { in: [...sellerOrgIds] }, createdAt: { gte: BACKFILL_EPOCH } },
    select: { id: true, name: true, slug: true },
  })
  const createdOrgIds = new Set(createdOrgs.map((o) => o.id))
  const delMembers = await db.organizationMember.deleteMany({
    where: { organizationId: { in: [...createdOrgIds] } },
  })
  console.log(`  memberships deleted (in created orgs): ${delMembers.count}`)

  // 5. delete the created orgs
  const delOrgs = await db.organization.deleteMany({ where: { id: { in: [...createdOrgIds] } } })
  console.log(`  created orgs deleted: ${delOrgs.count} — reused orgs kept: ${sellerOrgIds.size - createdOrgIds.size}`)

  // 6. baseline verification (recorded pre-backfill state)
  const baseline = {
    organizations: 14,
    members: 19,
    sellerProfiles: 0,
    productOffers: 3,
    offersWithNullSellerOrgId: 3,
    orderItemsWithNullSellerOrgId: 35,
    quotesWithNullSellerOrgId: 2,
  }
  const now = {
    organizations: await db.organization.count(),
    members: await db.organizationMember.count(),
    sellerProfiles: await db.sellerProfile.count(),
    productOffers: await db.productOffer.count(),
    offersWithNullSellerOrgId: await db.productOffer.count({ where: { sellerOrgId: null } }),
    orderItemsWithNullSellerOrgId: await db.orderItem.count({ where: { sellerOrgId: null } }),
    quotesWithNullSellerOrgId: await db.quote.count({ where: { sellerOrgId: null } }),
  }
  const matches = JSON.stringify(baseline) === JSON.stringify(now)
  console.log('  baseline check:', matches ? 'MATCH — DB restored to pre-backfill state' : `MISMATCH\n    expected ${JSON.stringify(baseline)}\n    actual   ${JSON.stringify(now)}`)

  for (const f of [REPORT_JSON, REPORT_MD]) {
    if (existsSync(f)) {
      rmSync(f)
      console.log(`  removed ${f}`)
    }
  }

  await db.$disconnect()
  if (!matches) process.exit(1)
}

main().catch((err) => {
  console.error('unwind crashed:', err)
  process.exit(1)
})
