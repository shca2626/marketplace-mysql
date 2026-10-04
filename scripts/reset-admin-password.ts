// ─────────────────────────────────────────────────────────────────────────────
// RESET ADMIN PASSWORD (lastplan v5 6.7.6 — locked-out-admin recovery runbook)
//
//   bun scripts/reset-admin-password.ts [--email admin@vendora.com]
//
// Generates a strong password, sets it, bumps the session epoch (all existing
// admin sessions die), and writes the recovery to the audit trail. The new
// password is printed ONCE and should be stored in the secret store (.env /
// password manager) — never in a plan document or chat.
//
// Use case: the rotated credential was lost in a sandbox rebuild (no .env
// survived). Identity is verified out-of-band by the owner directing the
// recovery through the development channel.
// ─────────────────────────────────────────────────────────────────────────────
import { randomBytes } from 'crypto'
import { assertNotProd } from './lib/assert-not-prod'
import { db } from '../src/lib/db'
import { hashPassword } from '../src/lib/auth'
import { recordAuditTx } from '../src/server/modules/audit/service'

function generatePassword(): string {
  // 20 chars, unambiguous alphabet, guaranteed classes
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ'
  const lower = 'abcdefghijkmnopqrstuvwxyz'
  const digits = '23456789'
  const symbols = '!@#$%^&*-_=+'
  const all = upper + lower + digits + symbols
  const pick = (set: string) => set[randomBytes(1)[0] % set.length]
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)]
  while (chars.length < 20) chars.push(pick(all))
  // Fisher-Yates with crypto randomness
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0] % (i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

async function main() {
  assertNotProd()
  const email = process.argv.find((a) => a.startsWith('--email='))?.slice(8) ?? 'admin@vendora.com'

  const user = await db.user.findUnique({ where: { email }, select: { id: true, email: true, role: true } })
  if (!user || user.role !== 'ADMIN') {
    console.error(`No ADMIN account with email ${email}`)
    process.exit(1)
  }

  const password = generatePassword()
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { password: hashPassword(password), sessionVersion: { increment: 1 } },
    })
    await recordAuditTx(tx, {
      actorType: 'SYSTEM',
      action: 'MFA_ADMIN_RESET',
      entityType: 'User',
      entityId: user.id,
      summary: `Admin password reset via the 6.7.6 locked-out-admin recovery runbook (rotated credential lost in sandbox rebuild; recovery directed by the owner out-of-band)`,
      metadata: { via: 'scripts/reset-admin-password.ts', email: user.email },
    })
  })

  console.log('Password reset complete. New password (shown ONCE — store it in the secret store):')
  console.log(password)
  await db.$disconnect()
}

main().catch((err) => {
  console.error('reset-admin-password failed:', err)
  process.exit(1)
})
