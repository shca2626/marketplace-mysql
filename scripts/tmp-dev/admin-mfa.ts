// Dev-only: enroll the seeded admin with a KNOWN dev TOTP secret (for E2E of
// step-up-protected money actions). Mirrors the confirm() write path.
import { assertNotProd } from '../lib/assert-not-prod'
import { db } from '../../src/lib/db'
import { encryptSecret } from '../../src/lib/secret-box'
import { totpNow } from '../../src/lib/totp'
import { generateTotpSecret } from '../../src/lib/totp'

const DEV_SECRET = 'JBSWY3DPEHPK3PXP' // well-known test secret (rfc vector base32)

async function main() {
  assertNotProd()
  const admin = await db.user.findUnique({ where: { email: 'admin@vendora.com' }, select: { id: true, email: true } })
  if (!admin) { console.log('NO ADMIN'); return }
  const existing = await db.mfaEnrollment.findFirst({ where: { userId: admin.id } })
  if (existing) { console.log('already enrolled'); return }
  const now = new Date()
  const e = await db.mfaEnrollment.create({
    data: { userId: admin.id, secretEnc: encryptSecret(DEV_SECRET), confirmedAt: now },
  })
  console.log(`enrolled ${admin.email}: enrollment ${e.id} confirmed. Current code: ${totpNow(DEV_SECRET)}`)
}
main().then(() => db.$disconnect()).catch((e) => { console.error('FAIL', e); process.exit(1) })
