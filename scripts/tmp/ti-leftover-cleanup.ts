// One-off: remove leftover TI-suite fixtures from the failed cleanup run
// (users ti-*@staging.invalid + their orgs/orders/etc).
import { db } from '../../src/lib/db'

async function main() {
  const users = await db.user.findMany({
    where: { email: { contains: 'ti-', endsWith: '@staging.invalid' } },
    select: { id: true },
  })
  const ids = users.map((u) => u.id)
  if (ids.length === 0) {
    console.log('nothing to clean')
    return
  }
  console.log('removing', ids.length, 'leftover TI users')

  // Orders (items/payment cascade), then every User-referencing fixture row
  await db.order.deleteMany({ where: { buyerId: { in: ids } } })
  await db.notification.deleteMany({ where: { userId: { in: ids } } })
  await db.vaultAccessGrant.deleteMany({ where: { userId: { in: ids } } })
  await db.userRole.deleteMany({ where: { userId: { in: ids } } })
  await db.approvalRequest.deleteMany({ where: { requesterId: { in: ids } } })

  // Orgs owned by these members (financier chain first)
  const memberships = await db.organizationMember.findMany({
    where: { userId: { in: ids } },
    select: { organizationId: true },
  })
  const orgIds = [...new Set(memberships.map((m) => m.organizationId))]
  for (const orgId of orgIds) {
    const profiles = await db.financierProfile.findMany({
      where: { organizationId: orgId },
      select: { id: true },
    })
    for (const p of profiles) {
      await db.financierService.deleteMany({ where: { financierProfileId: p.id } })
      await db.financierProfile.deleteMany({ where: { id: p.id } })
    }
  }
  await db.organizationMember.deleteMany({ where: { userId: { in: ids } } })
  await db.user.deleteMany({ where: { id: { in: ids } } })
  await db.organization.deleteMany({ where: { id: { in: orgIds } } })
  console.log('cleaned', ids.length, 'users,', orgIds.length, 'orgs')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
