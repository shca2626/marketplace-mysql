import { db } from '@/lib/db'
async function main() {
  const org = await db.sellerProfile.findFirstOrThrow({
    where: { organizationId: 'cmupyeohj0003ndxmr62q7eha' },
    select: { owner: { select: { email: true, name: true, role: true } }, organization: { select: { name: true } } },
  })
  console.log('QA SOLAR OWNER:', JSON.stringify(org))
  // also list a couple of seeded sellers for a UI login candidate
  const sellers = await db.user.findMany({ where: { role: 'SELLER', email: { in: ['seller1@vendora.com', 'seller2@vendora.com', 'seller@vendora.com'] } }, select: { email: true, storeName: true, sellerProfilesOwned: { select: { organization: { select: { name: true } } } } } })
  console.log('SEEDED SELLERS:', JSON.stringify(sellers))
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
