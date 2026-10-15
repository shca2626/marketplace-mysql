// Phase 4/5 E2E cleanup — remove test fixtures, keep seeded data + demo orders
import { db } from '../../src/lib/db'

async function main() {
  // 1. Remove my p45 fixtures (users, UserRole, org, memberships, FinancierProfile)
  const admin = await db.user.findUnique({ where: { email: 'p45.admin@vendora.test' } })
  if (admin) {
    await db.userRole.deleteMany({ where: { userId: admin.id } })
    await db.sessionRegistry.deleteMany({ where: { userId: admin.id } })
    await db.user.delete({ where: { id: admin.id } })
    console.log('removed p45.admin')
  }
  const banker = await db.user.findUnique({ where: { email: 'p45.banker@vendora.test' } })
  if (banker) {
    await db.sessionRegistry.deleteMany({ where: { userId: banker.id } })
    await db.user.delete({ where: { id: banker.id } })
    console.log('removed p45.banker')
  }
  const bank = await db.organization.findFirst({ where: { name: 'P45 Test Bank' } })
  if (bank) {
    await db.financierProfile.deleteMany({ where: { organizationId: bank.id } })
    await db.organizationMember.deleteMany({ where: { organizationId: bank.id } })
    await db.organization.delete({ where: { id: bank.id } })
    console.log('removed P45 Test Bank')
  }

  // 2. Restore SunCore seed state: remove maya's test membership + custom role
  const sun = await db.organization.findFirst({ where: { name: 'SunCore Energy' } })
  if (sun) {
    const maya = await db.user.findUnique({ where: { email: 'maya@example.com' } })
    if (maya) {
      const m = await db.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: sun.id, userId: maya.id } } })
      if (m) {
        await db.userRole.deleteMany({ where: { userId: maya.id, organizationId: sun.id } })
        await db.organizationMember.delete({ where: { id: m.id } })
        console.log('removed maya from SunCore (+assignments)')
      }
    }
    const role = await db.role.findFirst({ where: { organizationId: sun.id, name: 'Procurement approver' } })
    if (role) {
      await db.userRole.deleteMany({ where: { roleId: role.id } })
      await db.role.delete({ where: { id: role.id } })
      console.log('removed custom role Procurement approver')
    }
  }

  // 3. Remove leftover pollution orgs from crashed/interrupted test runs
  const leftovers = await db.organization.findMany({
    where: { OR: [{ name: { startsWith: 'NEG-' } }, { name: 'UI Amal Bank 871356' }, { name: 'Meridian Energy' }] },
    select: { id: true, name: true },
  })
  for (const o of leftovers) {
    await db.financierProfile.deleteMany({ where: { organizationId: o.id } })
    await db.userRole.deleteMany({ where: { organizationId: o.id } })
    await db.organizationMember.deleteMany({ where: { organizationId: o.id } })
    await db.organization.delete({ where: { id: o.id } })
    console.log('removed leftover org', o.name)
  }

  // 4. Remove users from the crashed negative-suite runs
  const neg = await db.user.findMany({ where: { email: { contains: 'staging.invalid' } }, select: { id: true, email: true } })
  for (const u of neg) {
    await db.userRole.deleteMany({ where: { userId: u.id } })
    await db.sessionRegistry.deleteMany({ where: { userId: u.id } })
    await db.user.delete({ where: { id: u.id } })
  }
  console.log('removed', neg.length, 'staging.invalid users')

  // 5. Final state
  const counts = {
    users: await db.user.count(),
    orgs: await db.organization.count(),
    stores: await db.store.count(),
    orders: await db.order.count(),
    refunds: await db.refund.count(),
  }
  console.log('FINAL', JSON.stringify(counts))
}
main().finally(() => db.$disconnect())
