// SPONSOR-1 E2E fixtures: only the fixture super-admin for browser/API tests.
// Cleanup deletes it (+ everything it namespaced). Mirrors the p45.* pattern.
import { db } from '../../src/lib/db'
import { hashPassword } from '../../src/lib/auth'

async function main() {
  const email = 'p45.admin@vendora.test'
  const existing = await db.user.findUnique({ where: { email } })
  if (existing) {
    console.log('super-admin exists:', email)
    return
  }
  const user = await db.user.create({
    data: { name: 'P45 Admin', email, password: hashPassword('Vendora123!'), role: 'ADMIN', emailVerifiedAt: new Date() },
  })
  const superRole = await db.role.findUnique({ where: { key: 'platform.super-admin' } })
  if (superRole) await db.userRole.create({ data: { userId: user.id, roleId: superRole.id } })
  console.log('created super-admin:', email)
}
main().finally(() => db.$disconnect())
