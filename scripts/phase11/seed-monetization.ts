// ─────────────────────────────────────────────────────────────────────────────
// Phase 11 seed — the "zero behavior change day one" migration:
//   1. PLATFORM FeeRule ORDER_COMMISSION @ the live payouts config percent
//      (no User.commissionRate overrides exist today — verified 2026-10).
//   2. Four subscription tiers. Seller-domain modules are distributed across
//      them; FREE keeps only what every seller always had at zero cost.
//   3. Every EXISTING seller org is grandfathered onto PRO ACTIVE for 30
//      days — current entitlements are preserved exactly (Law 5), and the
//      ceiling becomes provable the moment one of them downgrades.
// Idempotent: safe to re-run.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from '@/lib/db'

const PLANS = [
  {
    key: 'free',
    name: 'Free',
    description: 'The essential marketplace presence: list products, sell, get paid.',
    priceMonthly: 0,
    modules: JSON.stringify([]),
    limits: JSON.stringify({ maxProducts: 25, maxActiveOffers: 10, maxUsers: 2 }),
    sortOrder: 0,
  },
  {
    key: 'starter',
    name: 'Starter',
    description: 'For growing shops: RFQ pipeline + buyer reviews.',
    priceMonthly: 19,
    modules: JSON.stringify(['rfq', 'reviews']),
    limits: JSON.stringify({ maxProducts: 200, maxActiveOffers: 50, maxUsers: 5 }),
    sortOrder: 1,
  },
  {
    key: 'growth',
    name: 'Growth',
    description: 'Scale with insights, comparison and brand presence.',
    priceMonthly: 49,
    modules: JSON.stringify(['rfq', 'reviews', 'insights', 'compare']),
    limits: JSON.stringify({ maxProducts: 1000, maxActiveOffers: 250, maxUsers: 20 }),
    sortOrder: 2,
  },
  {
    key: 'pro',
    name: 'Pro',
    description: 'Everything: B2B org accounts, solutions spotlights and all seller modules.',
    priceMonthly: 99,
    modules: JSON.stringify(['rfq', 'reviews', 'insights', 'compare', 'b2b-orgs', 'solutions']),
    limits: JSON.stringify({ maxProducts: null, maxActiveOffers: null, maxUsers: null }),
    sortOrder: 3,
  },
]

async function main() {
  // 1 — PLATFORM ORDER_COMMISSION rule at the current live percent
  const cfgRow = await db.platformSetting.findUnique({ where: { key: 'payouts' } })
  let pct = 10
  if (cfgRow) {
    try {
      const parsed = JSON.parse(cfgRow.value) as { defaultCommissionPercent?: number }
      if (Number.isFinite(parsed.defaultCommissionPercent)) pct = Number(parsed.defaultCommissionPercent)
    } catch {
      /* keep 10 */
    }
  }
  const existingRule = await db.feeRule.findFirst({
    where: { event: 'ORDER_COMMISSION', scopeType: 'PLATFORM', isActive: true },
  })
  if (!existingRule) {
    await db.feeRule.create({
      data: {
        event: 'ORDER_COMMISSION',
        actorType: 'SELLER',
        scopeType: 'PLATFORM',
        scopeId: '',
        dimension: 'PERCENT',
        value: pct,
        note: `Phase 11 migration: the ${pct}% marketplace commission, now rule-driven (was PlatformSetting "payouts").`,
      },
    })
    console.log(`seeded PLATFORM ORDER_COMMISSION rule @ ${pct}%`)
  } else {
    console.log(`PLATFORM ORDER_COMMISSION rule already present (v${existingRule.version}, ${existingRule.value}%)`)
  }

  // 2 — subscription plans
  for (const p of PLANS) {
    await db.subscriptionPlan.upsert({ where: { key: p.key }, update: {}, create: p })
  }
  console.log(`plans ensured: ${PLANS.map((p) => p.key).join(', ')}`)

  // 3 — grandfather every seller org onto PRO ACTIVE (30 days)
  const pro = await db.subscriptionPlan.findUniqueOrThrow({ where: { key: 'pro' } })
  const sellerOrgs = await db.sellerProfile.findMany({ select: { organizationId: true } })
  const now = new Date()
  const periodEnd = new Date(now.getTime() + 30 * 24 * 3600 * 1000)
  let created = 0
  for (const { organizationId } of sellerOrgs) {
    const existing = await db.sellerSubscription.findUnique({ where: { organizationId } })
    if (existing) continue
    await db.sellerSubscription.create({
      data: {
        organizationId,
        planId: pro.id,
        status: 'ACTIVE',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        changedById: null,
      },
    })
    created++
  }
  console.log(`seller orgs: ${sellerOrgs.length} total, ${created} grandfathered onto PRO ACTIVE (30d)`)

  const counts = {
    feeRules: await db.feeRule.count(),
    plans: await db.subscriptionPlan.count(),
    subs: await db.sellerSubscription.count(),
    assessments: await db.feeAssessment.count(),
    invoices: await db.subscriptionInvoice.count(),
  }
  console.log('FINAL COUNTS:', JSON.stringify(counts))
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
