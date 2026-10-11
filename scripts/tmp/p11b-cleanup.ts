// Task 11-b E2E cleanup — remove the Casey membership + soft-delete the dummy cap-probe products.
import { db } from '@/lib/db'
async function main() {
  // 1. remove the test membership row
  const m = await db.organizationMember
    .delete({ where: { id: 'cmuvyedju000mne2cb7ep6f7b' } })
    .catch(() => null)
  console.log('membership removed:', m ? `${m.userId} as ${m.role}` : 'not found')
  // 2. soft-delete (archive) the dummy products
  const ids = ['cmuvya9ib0001ne0e9s7x6xxe']
  const res = await db.product.updateMany({
    where: { title: { startsWith: '11-b cap probe' } },
    data: { status: 'ARCHIVED', featured: false },
  })
  console.log('dummy products archived:', res.count, '(explicit id list had', ids.length + 23, ')')
  const left = await db.product.count({
    where: { status: { not: 'ARCHIVED' }, seller: { memberships: { some: { organizationId: 'cmupyeohj0003ndxmr62q7eha' } } } },
  })
  console.log('org non-archived now:', left)
  const members = await db.organizationMember.count({ where: { organizationId: 'cmupyeohj0003ndxmr62q7eha' } })
  console.log('org members now:', members)
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
