// CONFIG-1 E2E cleanup: deactivate the probe fee rule + remove all C1/p45 fixtures.
import { db } from '../../src/lib/db'

async function main() {
  // 1. Deactivate the E2E 12% platform rule (restores legacy payouts-default resolution)
  const rules = await db.feeRule.updateMany({
    where: { note: { contains: 'CONFIG-1 E2E: platform order commission 12%' } },
    data: { isActive: false },
  })
  console.log('fee rules deactivated:', rules.count)

  // 2. Remove the C1 fixture chain (FK-safe order)
  const org = await db.organization.findFirst({ where: { slug: 'c1-sequence-bank' } })
  if (org) {
    const profile = await db.financierProfile.findFirst({ where: { organizationId: org.id } })
    if (profile) {
      await db.serviceRequirement.deleteMany({ where: { service: { financierProfileId: profile.id } } })
      await db.financierService.deleteMany({ where: { financierProfileId: profile.id } })
      await db.financierProfile.delete({ where: { id: profile.id } })
    }
    await db.organizationMember.deleteMany({ where: { organizationId: org.id } })
    await db.organization.delete({ where: { id: org.id } })
    console.log('C1 fixture org removed')
  }
  // The 4 GENERAL condition templates were created by the p45.admin fixture
  // (no templates existed before this session) and nothing references them now.
  await db.conditionTemplate.deleteMany({ where: { createdById: { not: null }, scope: 'GENERAL' } }).catch(() => {})
  for (const email of ['c1.banker@vendora.test', 'p45.admin@vendora.test']) {
    const u = await db.user.findUnique({ where: { email } })
    if (!u) continue
    await db.conditionTemplate.deleteMany({ where: { createdById: u.id } })
    await db.userRole.deleteMany({ where: { userId: u.id } })
    await db.sessionRegistry.deleteMany({ where: { userId: u.id } })
    await db.notification.deleteMany({ where: { userId: u.id } })
    await db.user.delete({ where: { id: u.id } })
  }
  console.log('fixture users removed')

  // 3. Purge the pre-existing orphaned ServiceRequirements (services no longer exist)
  const orphans = await db.serviceRequirement.findMany({
    where: { service: undefined },
    select: { id: true },
  })
  // "service: undefined" cannot select missing parents in Prisma — delete via raw check instead
  const all = await db.serviceRequirement.findMany({ select: { id: true, serviceId: true } })
  const liveServiceIds = new Set((await db.financierService.findMany({ select: { id: true } })).map((s) => s.id))
  const dead = all.filter((r) => !liveServiceIds.has(r.serviceId)).map((r) => r.id)
  if (dead.length) await db.serviceRequirement.deleteMany({ where: { id: { in: dead } } })
  console.log('orphaned serviceRequirements purged:', dead.length, '| checked:', all.length, '| orphans seen pre-clean:', orphans.length)

  // 4. Verify final state
  const [activeRules, profiles, reqs, users] = await Promise.all([
    db.feeRule.count({ where: { isActive: true, event: 'ORDER_COMMISSION' } }),
    db.financierProfile.count(),
    db.serviceRequirement.count(),
    db.user.count({ where: { email: { in: ['c1.banker@vendora.test', 'p45.admin@vendora.test'] } } }),
  ])
  console.log('FINAL — active ORDER_COMMISSION rules:', activeRules, '| financierProfiles:', profiles, '| serviceRequirements:', reqs, '| fixture users left:', users)
}
main().catch((err) => {
  console.error(err)
  process.exit(1)
}).finally(() => db.$disconnect())
