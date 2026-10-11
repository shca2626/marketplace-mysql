// Task 11-a dev helper: ensure the QA admin has a KNOWN dev TOTP enrollment
// (mirrors scripts/tmp-dev/admin-mfa.ts, targeted at qa-admin@vendora.local)
import { assertNotProd } from '../lib/assert-not-prod'
import { db } from '../../src/lib/db'
import { encryptSecret } from '../../src/lib/secret-box'
import { totpNow } from '../../src/lib/totp'

const DEV_SECRET = 'JBSWY3DPEHPK3PXP' // well-known test secret (rfc vector base32)

async function main() {
  assertNotProd()
  const admin = await db.user.findUnique({ where: { email: 'qa-admin@vendora.local' }, select: { id: true, email: true } })
  if (!admin) { console.log('NO QA ADMIN'); return }
  const existing = await db.mfaEnrollment.findFirst({ where: { userId: admin.id } })
  if (existing) {
    console.log('already enrolled, enrollment', existing.id, 'confirmed=', !!existing.confirmedAt)
    console.log('code=' + totpNow(DEV_SECRET))
    return
  }
  const now = new Date()
  const e = await db.mfaEnrollment.create({
    data: { userId: admin.id, secretEnc: encryptSecret(DEV_SECRET), confirmedAt: now },
  })
  console.log(`enrolled ${admin.email}: ${e.id} confirmed. code=${totpNow(DEV_SECRET)}`)
}
main().then(() => db.$disconnect()).catch((e) => { console.error('FAIL', e); process.exit(1) })
