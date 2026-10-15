// Phase 4/5 E2E fixtures: super-admin with known password + report of existing orgs
import { db } from '../../src/lib/db'
import { hashPassword } from '../../src/lib/auth'

async function main() {
  // 1. Super-admin fixture (browser login for the platform console)
  const email = 'p45.admin@vendora.test'
  const existing = await db.user.findUnique({ where: { email } })
  if (!existing) {
    const user = await db.user.create({
      data: { name: 'P45 Admin', email, password: hashPassword('Vendora123!'), role: 'ADMIN', emailVerifiedAt: new Date() },
    })
    const superRole = await db.role.findUnique({ where: { key: 'platform.super-admin' } })
    if (superRole) await db.userRole.create({ data: { userId: user.id, roleId: superRole.id } })
    console.log('created super-admin', email)
  } else console.log('super-admin exists', email)

  // 2. Report orgs (company + financier) with owner emails
  const orgs = await db.organization.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true, orgType: true, members: { select: { role: true, user: { select: { email: true } } } } },
    take: 12,
  })
  for (const o of orgs) {
    console.log(`ORG ${o.orgType} "${o.name}" members: ${o.members.map((m) => `${m.user.email}(${m.role})`).join(', ') || 'NONE'}`)
  }
}
main().finally(() => db.$disconnect())
