import { assertNotProd } from '../lib/assert-not-prod'
import { db } from '../../src/lib/db'
import { decryptSecret } from '../../src/lib/secret-box'
import { totpNow } from '../../src/lib/totp'

async function main() {
  assertNotProd()
  const admin = await db.user.findUnique({ where: { email: 'admin@vendora.com' }, select: { id: true } })
  if (!admin) { console.log('NO ADMIN FOUND'); return }
  const enrollments = await db.mfaEnrollment.findMany({ where: { userId: admin.id } })
  console.log('enrollments:', enrollments.length)
  for (const e of enrollments) {
    try {
      const secret = decryptSecret(e.secretEnc)
      console.log(`enrollment ${e.id.slice(-6)} confirmed=${e.confirmedAt ? 'yes' : 'no'} code=${totpNow(secret)}`)
    } catch (err) {
      console.log(`enrollment ${e.id.slice(-6)} decrypt failed: ${(err as Error).message}`)
    }
  }
}
main().then(() => db.$disconnect()).catch((e) => { console.error('FAIL', e); process.exit(1) })
