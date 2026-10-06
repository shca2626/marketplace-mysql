// Task 11-b E2E cleanup — hard-delete every '11-b cap probe' product (this run's
// 24 DRAFT dummies + the previous 11-b run's archived residue) and verify the
// QA Solar org is back to its original 2 non-archived products / 3 members.
import { db } from '@/lib/db'

async function main() {
  const before = await db.product.findMany({
    where: { title: { startsWith: '11-b cap probe' } },
    select: { id: true, title: true, status: true },
  })
  console.log('probe rows found:', before.length, '(', before.filter((p) => p.status === 'ARCHIVED').length, 'archived from the prior run,', before.filter((p) => p.status === 'DRAFT').length, 'draft from this run )')
  const res = await db.product.deleteMany({ where: { title: { startsWith: '11-b cap probe' } } })
  console.log('deleted:', res.count)
  const orgId = 'cmupyeohj0003ndxmr62q7eha'
  const left = await db.product.count({
    where: { status: { not: 'ARCHIVED' }, seller: { memberships: { some: { organizationId: orgId } } } },
  })
  const members = await db.organizationMember.count({ where: { organizationId: orgId } })
  console.log('org non-archived products now:', left, '| members now:', members)
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
