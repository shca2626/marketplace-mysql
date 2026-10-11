/**
 * PHASE 9.1 migration — resolve the system-seller contradiction (C3).
 *
 * 1. Curated rows owned by the "Vendora Catalog" system user migrate to
 *    `sellerId → null` (platform-curated catalog record) with provenance moved
 *    to `curatedById` (admin actor). `isCurated` flag set.
 * 2. Offers held by the system account itself are ARCHIVED — a curated product
 *    is buyable only through a REAL vendor's ACTIVE offer; "Vendora-sold"
 *    attribution is retired everywhere (payouts exclude it by construction).
 * 3. The system account is SUSPENDED — a kill switch: any lingering offer it
 *    holds fails the active-seller checkout guard, and seller counts no longer
 *    include it.
 *
 * Idempotent: safe to re-run (all steps are conditional).
 */
import { db } from '../src/lib/db'

const CATALOG_EMAIL = 'catalog@vendora.com'
const ADMIN_EMAIL = 'qa-admin@vendora.local'

async function main() {
  const catalog = await db.user.findUnique({ where: { email: CATALOG_EMAIL } })
  if (!catalog) {
    console.log('✓ no "Vendora Catalog" system account — nothing to migrate')
    return
  }
  const admin = await db.user.findUnique({ where: { email: ADMIN_EMAIL } })

  // Historical order items attributed to the system seller? (payout-settlement
  // check — they must not exist; report if they do.)
  const orderItemsOnCatalog = await db.orderItem.count({ where: { sellerId: catalog.id } })

  // 1. curated rows → sellerId null + provenance
  const curated = await db.product.updateMany({
    where: { sellerId: catalog.id },
    data: { sellerId: null, curatedById: admin?.id ?? null, isCurated: true },
  })

  // 2. retire the system account's own offers (no Vendora-sold attribution)
  const offers = await db.productOffer.updateMany({
    where: { sellerId: catalog.id },
    data: { status: 'ARCHIVED' },
  })

  // 3. suspend the account — final, reversible-by-hand kill switch
  await db.user.update({
    where: { id: catalog.id },
    data: { status: 'SUSPENDED', name: 'Vendora Catalog (retired 9.1)' },
  })

  console.log(
    JSON.stringify({
      migratedProducts: curated.count,
      archivedSystemOffers: offers.count,
      accountSuspended: true,
      historicalOrderItemsOnSystemSeller: orderItemsOnCatalog,
      provenanceAdmin: admin?.email ?? null,
    })
  )
  if (orderItemsOnCatalog > 0) {
    console.log('⚠️ historical order items reference the system seller — review before payout generation')
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
