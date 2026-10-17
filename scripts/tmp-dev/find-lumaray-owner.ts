import { db } from '../../src/lib/db'
async function main() {
  const org = await db.organization.findFirst({ where: { name: { contains: 'LumaRay' } }, select: { id: true, name: true } })
  if (!org) { console.log('no org'); return }
  const members = await db.organizationMember.findMany({ where: { organizationId: org.id, role: 'OWNER' }, include: { user: { select: { email: true, name: true } } } })
  console.log(org.name, '->', members.map(m => m.user.email).join(', '))
}
main().catch(e => { console.error(e); process.exit(1) })
