import { db } from '@/lib/db'
import { decryptSecret } from '@/lib/secret-box'
import { totpNow } from '@/lib/totp'

async function main() {
  const admin = await db.user.findUnique({ where: { email: 'qa-admin@vendora.local' }, select: { id: true } })
  if (!admin) { console.log('NO QA ADMIN'); return }
  const enrollments = await db.mfaEnrollment.findMany({ where: { userId: admin.id } })
  for (const e of enrollments) {
    try {
      const secret = decryptSecret(e.secretEnc)
      console.log(`enrollment ${e.id.slice(-6)} confirmed=${e.confirmedAt ? 'yes' : 'no'} code=${totpNow(secret)}`)
    } catch (err) {
      console.log(`enrollment ${e.id.slice(-6)} decrypt failed: ${(err as Error).message}`)
    }
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error('FAIL', e); process.exit(1) })
