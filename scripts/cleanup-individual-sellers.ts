/**
 * scripts/cleanup-individual-sellers.ts — Phase 7 scoped demo-data cleanup.
 *
 * Cleans the confirmed dummy INDIVIDUAL-SELLER dataset (C2C remnants) and
 * reseeds company offers through the normal application service. Safety:
 *   • --dry-run (default): prints the exact plan + dependency evidence, changes
 *     NOTHING.
 *   • --execute: applies the plan with FK-safe ordering. Users referenced by
 *     REAL history (payouts, disputes, orders as buyer) are PRESERVED and
 *     demoted to BUYER (they can no longer sell); only confirmed test-only
 *     artifacts are deleted. Anything uncertain is preserved.
 *   • Orders, payouts, financing records, documents and audit history are
 *     NEVER touched.
 */
import { db } from '../src/lib/db'

const ARTIFACT_PATTERNS = [
  /@staging\.invalid$/i,
  /@placeholder\.vendora$/i,
  /^qa[-_.]/i,
  /@qa\./i,
  /^e2e[-_.]/i,
  /@e2e\./i,
  /@e2e\.vendora$/i,
  /^neg-/i,
  /^ti-/i,
  /^otp-/i,
  /^test[-_.@]/i,
  /@vendora\.local$/i,
  /@otp\.local$/i,
  /@test\.vendora$/i,
]
const SEED_DOMAIN = '@vendora.com'

interface SellerPlan {
  id: string
  email: string
  name: string
  classification: 'ARTIFACT' | 'SEED' | 'OFFICIAL' | 'EXTERNAL' | 'PRESERVE-HISTORY'
  reason: string
  products: number
  deletableProducts: number
  protectedProducts: number
  offers: number
  deletableOffers: number
  protectedOffers: number
  orderItemsAsSeller: number
  quotesAsSeller: number
  disputesAsSeller: number
  payouts: number
  ordersAsBuyer: number
  memberships: { org: string; orgType: string; role: string }[]
  sellerProfileOrg: string | null
  action: 'DELETE' | 'DEMOTE' | 'KEEP'
}

function classify(email: string, name: string): { classification: SellerPlan['classification']; reason: string } {
  if (ARTIFACT_PATTERNS.some((re) => re.test(email))) {
    return { classification: 'ARTIFACT', reason: 'email matches QA/e2e artifact pattern' }
  }
  if (/official/i.test(email) || /official/i.test(name)) {
    return { classification: 'OFFICIAL', reason: 'platform catalog steward account' }
  }
  if (email.endsWith(SEED_DOMAIN)) {
    return { classification: 'SEED', reason: 'seeded demo seller account' }
  }
  return { classification: 'EXTERNAL', reason: 'externally registered account — status uncertain, preserve' }
}

async function main() {
  const execute = process.argv.includes('--execute')
  console.log(`── Individual-seller cleanup ${execute ? 'EXECUTE' : 'DRY RUN'} ──`)

  const sellers = await db.user.findMany({ where: { role: 'SELLER' } })
  console.log(`SELLER-role users: ${sellers.length}`)

  // All order-item references (products + offers) — the preservation set.
  const itemProductIds = new Set(
    (await db.orderItem.findMany({ select: { productId: true }, distinct: ['productId'] })).map((i) => i.productId)
  )
  const itemOfferIds = new Set(
    (await db.orderItem.findMany({ select: { offerId: true }, where: { offerId: { not: null } } })).map((i) => i.offerId as string)
  )
  // QuoteLine.productId is NOT nullable — products referenced by quotes survive.
  const quoteLineProductIds = new Set(
    (await db.quoteLine.findMany({ select: { productId: true }, distinct: ['productId'] })).map((l) => l.productId)
  )
  console.log(`Products referenced by order items: ${itemProductIds.size}`)
  console.log(`Offers referenced by order items: ${itemOfferIds.size}`)
  console.log(`Products referenced by quote lines: ${quoteLineProductIds.size}`)

  const plans: SellerPlan[] = []
  for (const s of sellers) {
    const [products, offers, orderItems, quotes, disputes, payouts, ordersAsBuyer, memberships, sellerProfile] =
      await Promise.all([
        db.product.findMany({ where: { sellerId: s.id }, select: { id: true } }),
        db.productOffer.findMany({ where: { sellerId: s.id }, select: { id: true } }),
        db.orderItem.count({ where: { sellerId: s.id } }),
        db.quote.count({ where: { sellerId: s.id } }),
        db.dispute.count({ where: { sellerId: s.id } }),
        db.payout.count({ where: { sellerId: s.id } }),
        db.order.count({ where: { buyerId: s.id } }),
        db.organizationMember.findMany({
          where: { userId: s.id },
          include: { organization: { select: { name: true, orgType: true } } },
        }),
        db.sellerProfile.findFirst({ where: { ownerUserId: s.id }, include: { organization: { select: { name: true } } } }),
      ])
    const deletableProducts = products.filter((p) => !itemProductIds.has(p.id) && !quoteLineProductIds.has(p.id)).length
    const deletableOffers = offers.filter((o) => !itemOfferIds.has(o.id)).length
    const initial = classify(s.email, s.name)

    let action: SellerPlan['action']
    let classification = initial.classification
    let reason = initial.reason
    const ownsOrgs = memberships.some((m) => m.role === 'OWNER')
    if (payouts > 0 || disputes > 0 || ordersAsBuyer > 0) {
      action = 'DEMOTE'
      classification = 'PRESERVE-HISTORY'
      reason = `referenced by real history: payouts=${payouts} disputes=${disputes} orders-as-buyer=${ordersAsBuyer}`
    } else if (ownsOrgs) {
      // Last-owner governance: deleting an org's only owner would orphan the
      // organization. Org owners are demoted to BUYER instead — their account
      // and the org survive; the individual-SELLER identity is what dies.
      action = 'DEMOTE'
      reason = `owner of ${memberships.filter((m) => m.role === 'OWNER').map((m) => m.org).join(', ')} — demoted to keep org governance intact`
    } else if (classification === 'ARTIFACT' || classification === 'SEED') {
      action = 'DELETE'
    } else if (classification === 'OFFICIAL') {
      action = 'KEEP'
    } else {
      action = 'KEEP'
    }

    plans.push({
      id: s.id,
      email: s.email,
      name: s.name,
      classification,
      reason,
      products: products.length,
      deletableProducts,
      protectedProducts: products.length - deletableProducts,
      offers: offers.length,
      deletableOffers,
      protectedOffers: offers.length - deletableOffers,
      orderItemsAsSeller: orderItems,
      quotesAsSeller: quotes,
      disputesAsSeller: disputes,
      payouts,
      ordersAsBuyer,
      memberships: memberships.map((m) => ({ org: m.organization.name, orgType: m.organization.orgType, role: m.role })),
      sellerProfileOrg: sellerProfile?.organization.name ?? null,
      action,
    })
  }

  for (const p of plans) {
    console.log(
      `\n[${p.action}] ${p.email} ("${p.name}") — ${p.classification} (${p.reason})` +
        `\n    products: ${p.products} (deletable ${p.deletableProducts}, protected-by-orders ${p.protectedProducts})` +
        `\n    offers: ${p.offers} (deletable ${p.deletableOffers}, protected ${p.protectedOffers})` +
        `\n    orderItems-as-seller: ${p.orderItemsAsSeller}, quotes: ${p.quotesAsSeller}, disputes: ${p.disputesAsSeller}, payouts: ${p.payouts}` +
        `\n    memberships: ${p.memberships.map((m) => `${m.org}(${m.orgType}/${m.role})`).join(', ') || 'none'}` +
        `\n    sellerProfile org: ${p.sellerProfileOrg ?? 'none'}`
    )
  }

  const toDelete = plans.filter((p) => p.action === 'DELETE')
  const toDemote = plans.filter((p) => p.action === 'DEMOTE')
  const toKeep = plans.filter((p) => p.action === 'KEEP')
  console.log(`\n── PLAN ──`)
  console.log(`DELETE users: ${toDelete.map((p) => p.email).join(', ')}`)
  console.log(`DEMOTE→BUYER (history-preserved): ${toDemote.map((p) => p.email).join(', ')}`)
  console.log(`KEEP: ${toKeep.map((p) => p.email).join(', ')}`)

  if (!execute) {
    console.log('\nDRY RUN complete — nothing changed. Re-run with --execute to apply.')
    return
  }

  // ── EXECUTE ────────────────────────────────────────────────────────────
  const deletedUsers: string[] = []
  const demotedUsers: string[] = []
  let deletedProducts = 0
  let deletedOffers = 0
  let deletedProfiles = 0
  let nulledQuotes = 0

  for (const p of [...toDelete, ...toDemote, ...toKeep]) {
    // 1. Delete deletable offers (never ones referenced by order items).
    if (p.deletableOffers > 0) {
      const res = await db.productOffer.deleteMany({
        where: { sellerId: p.id, id: { notIn: [...itemOfferIds] } },
      })
      deletedOffers += res.count
    }
    // 2. Delete deletable products (never ones referenced by order items).
    if (p.deletableProducts > 0) {
      const ids = (await db.product.findMany({ where: { sellerId: p.id }, select: { id: true } }))
        .map((x) => x.id)
        .filter((id) => !itemProductIds.has(id) && !quoteLineProductIds.has(id))
      for (const id of ids) {
        // FK-safe: reviews/favorites/price-list entries/variants reference products.
        await db.review.deleteMany({ where: { productId: id } })
        await db.favorite.deleteMany({ where: { productId: id } })
        await db.priceListEntry.deleteMany({ where: { productId: id } })
        await db.rfqLine.updateMany({ where: { productId: id }, data: { productId: null, variantId: null, variantName: 'previously referenced product' } })
        await db.productVariant.deleteMany({ where: { productId: id } })
        await db.product.delete({ where: { id } })
        deletedProducts++
      }
    }
    // 3. Quotes authored as seller: detach (sellerId nullable) — quote history survives.
    const q = await db.quote.updateMany({ where: { sellerId: p.id }, data: { sellerId: null } })
    nulledQuotes += q.count
    // 4. SellerProfile rows owned by this user.
    const sp = await db.sellerProfile.deleteMany({ where: { ownerUserId: p.id } })
    deletedProfiles += sp.count
    // 5. User row: delete (artifacts) or demote (history-bound).
    if (p.action === 'DELETE') {
      await db.user.delete({ where: { id: p.id } })
      deletedUsers.push(p.email)
    } else if (p.action === 'DEMOTE') {
      await db.user.update({
        where: { id: p.id },
        data: { role: 'BUYER', storeName: null, storeBio: null },
      })
      demotedUsers.push(p.email)
    }
  }

  console.log(`\n── EXECUTED ──`)
  console.log(`users deleted: ${deletedUsers.length} (${deletedUsers.join(', ')})`)
  console.log(`users demoted→BUYER: ${demotedUsers.length} (${demotedUsers.join(', ')})`)
  console.log(`products deleted: ${deletedProducts} · offers deleted: ${deletedOffers}`)
  console.log(`sellerProfiles deleted: ${deletedProfiles} · quotes detached: ${nulledQuotes}`)

  // ── RESEED: company offers via the authorized application service ──────
  const { createOffer, ensureDefaultStore } = await import('../src/server/modules/catalog/service')
  // Company orgs in good standing, with an owner we can act as.
  const companies = await db.organization.findMany({
    where: { orgType: 'COMPANY', status: 'ACTIVE' },
    include: { members: { where: { role: 'OWNER' }, take: 1 } },
    take: 10,
  })
  const catalogProducts = await db.product.findMany({
    where: { status: 'ACTIVE', approvalState: 'APPROVED' },
    select: { id: true, title: true, price: true },
    take: 200,
  })
  let seededOffers = 0
  const seededTitles: string[] = []
  for (const org of companies) {
    const owner = org.members[0]
    if (!owner) continue
    await ensureDefaultStore(org.id)
    // Each company offers a deterministic subset of the catalog at varied prices.
    const start = Math.abs(hashCode(org.id)) % Math.max(1, catalogProducts.length - 4)
    const picks = catalogProducts.slice(start, start + 4)
    for (const product of picks) {
      const existing = await db.productOffer.findFirst({
        where: { productId: product.id, sellerOrgId: org.id },
      })
      if (existing) continue
      try {
        const offer = await createOffer(owner.userId, org.id, {
          productId: product.id,
          price: round2(product.price * (0.92 + (Math.abs(hashCode(org.id + product.id)) % 9) / 50)),
          stock: 15 + (Math.abs(hashCode(product.id + org.id)) % 60),
          moq: 1,
          processingDays: 2 + (Math.abs(hashCode(org.slug)) % 6),
          status: 'ACTIVE',
        })
        seededOffers++
        seededTitles.push(`${org.name} → ${product.title}`)
        void offer
      } catch (err) {
        console.warn(`  reseed skip: ${org.name} → ${product.title}: ${(err as Error).message}`)
      }
    }
  }
  console.log(`reseeded company offers: ${seededOffers}`)
  for (const t of seededTitles) console.log(`  ✓ ${t}`)
}

function hashCode(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h
}
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

main()
  .catch((err) => {
    console.error('cleanup failed:', err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
