/**
 * One-off idempotent script: creates the platform ADMIN user.
 * Run with: bun run scripts/add-admin.ts
 * (Data-level addition only — no schema change; the User.role column is a
 * free-text String, 'ADMIN' is just a new value guarded in /api/admin/*.)
 */
import { PrismaClient } from '@prisma/client'
import { scryptSync, randomBytes } from 'crypto'
import { assertNotProd } from './lib/assert-not-prod'

const db = new PrismaClient()

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

async function main() {
assertNotProd() // Phase 6 (6.0b.8/B1): fail-closed — no production mode, ever
  const email = 'admin@vendora.com'
  const existing = await db.user.findUnique({ where: { email } })
  if (existing) {
    if (existing.role === 'ADMIN') {
      console.log(`Admin already exists: ${email} (id ${existing.id}) — nothing to do`)
      return
    }
    // Promote an existing account (idempotent if re-run)
    const promoted = await db.user.update({ where: { email }, data: { role: 'ADMIN' } })
    console.log(`Promoted ${email} (id ${promoted.id}) to ADMIN`)
    return
  }
  const admin = await db.user.create({
    data: {
      email,
      name: 'Vendora Admin',
      password: hashPassword('admin1234'),
      role: 'ADMIN',
    },
  })
  console.log(`Created ADMIN user ${email} / admin1234 (id ${admin.id})`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
