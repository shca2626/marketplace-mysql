// COMPLAINT-1 E2E fixtures: super-admin for the admin console login.
// Namespaced (p45.*) so cleanup can remove it deterministically.
import { db } from '../../src/lib/db'
import { hashPassword } from '../../src/lib/auth'

async function main() {
  const adminEmail = 'p45.admin@vendora.test'
  let admin = await db.user.findUnique({ where: { email: adminEmail } })
  if (!admin) {
    admin = await db.user.create({
      data: { name: 'P45 Admin', email: adminEmail, password: hashPassword('Vendora123!'), role: 'ADMIN', emailVerifiedAt: new Date() },
    })
    const superRole = await db.role.findUnique({ where: { key: 'platform.super-admin' } })
    if (superRole) await db.userRole.create({ data: { userId: admin.id, roleId: superRole.id } })
    console.log('created super-admin', adminEmail)
  } else console.log('super-admin exists', adminEmail)
  console.log('done')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
