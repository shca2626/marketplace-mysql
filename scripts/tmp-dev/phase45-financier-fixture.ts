// Phase 4/5 E2E financier fixture: BANK org + OWNER with known password
import { db } from '../../src/lib/db'
import { hashPassword } from '../../src/lib/auth'

async function main() {
  const email = 'p45.banker@vendora.test'
  let user = await db.user.findUnique({ where: { email } })
  if (!user) {
    user = await db.user.create({
      data: { name: 'P45 Banker', email, password: hashPassword('Vendora123!'), role: 'BUYER', emailVerifiedAt: new Date() },
    })
  }
  let org = await db.organization.findFirst({ where: { name: 'P45 Test Bank' } })
  if (!org) {
    org = await db.organization.create({
      data: {
        name: 'P45 Test Bank',
        slug: 'p45-test-bank',
        orgType: 'BANK',
        status: 'ACTIVE',
        verifiedAt: new Date(),
        members: { create: { userId: user.id, role: 'OWNER' } },
      },
    })
  } else {
    const m = await db.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: org.id, userId: user.id } } })
    if (!m) await db.organizationMember.create({ data: { organizationId: org.id, userId: user.id, role: 'OWNER' } })
  }
  console.log('financier fixture ready:', email, 'org', org.id)
}
main().finally(() => db.$disconnect())
