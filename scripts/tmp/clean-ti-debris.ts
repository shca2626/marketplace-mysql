import { db } from '../../src/lib/db'
async function main() {
  const users = await db.user.findMany({ where: { email: { contains: '-mv4a2ln3@staging.invalid' } }, select: { id: true, email: true } })
  const ids = users.map(u => u.id)
  if (!ids.length) { console.log('no debris'); await db.$disconnect(); return }
  console.log('cleaning', ids.length, 'users')
  // orgs created by the run
  const orgs = await db.organization.findMany({ where: { name: { contains: 'mv4a2ln3' } }, select: { id: true, name: true } })
  const orgIds = orgs.map(o => o.id)
  // financing requests referencing fixture users/orgs
  await db.financingRequest.deleteMany({ where: { OR: [{ createdById: { in: ids } }, { organizationId: { in: orgIds } }] } })
  await db.accreditationRequest.deleteMany({ where: { OR: [{ submittedById: { in: ids } }, { organizationId: { in: orgIds } }] } })
  await db.financierService.deleteMany({ where: { financierProfile: { organizationId: { in: orgIds } } } })
  await db.financierProfile.deleteMany({ where: { organizationId: { in: orgIds } } })
  await db.order.deleteMany({ where: { buyerId: { in: ids } } })
  await db.notification.deleteMany({ where: { userId: { in: ids } } })
  await db.organizationMember.deleteMany({ where: { userId: { in: ids } } })
  await db.vaultAccessGrant.deleteMany({ where: { userId: { in: ids } } })
  await db.userRole.deleteMany({ where: { userId: { in: ids } } })
  
  await db.user.deleteMany({ where: { id: { in: ids } } })
  await db.organization.deleteMany({ where: { id: { in: orgIds } } })
  const left = await db.user.findMany({ where: { email: { contains: '-mv4a2ln3@staging.invalid' } } })
  console.log('remaining:', left.length)
  await db.$disconnect()
}
main().catch(async e => { console.error(e); process.exit(1) })
