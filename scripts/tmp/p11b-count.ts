import { db } from '@/lib/db'
async function main() {
  const orgId = 'cmupyeohj0003ndxmr62q7eha'
  const c = await db.product.count({
    where: { status: { not: 'ARCHIVED' }, seller: { memberships: { some: { organizationId: orgId } } } },
  })
  const total = await db.product.count({ where: { seller: { memberships: { some: { organizationId: orgId } } } } })
  console.log(`nonArchived=${c} totalAnyStatus=${total}`)
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
