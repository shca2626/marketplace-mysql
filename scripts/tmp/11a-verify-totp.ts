import { db } from '../../src/lib/db'
import { decryptSecret } from '../../src/lib/secret-box'
import { totpNow, verifyTotp } from '../../src/lib/totp'
async function main() {
  const e = await db.mfaEnrollment.findUnique({ where: { userId: 'cmuvhj2jw0000netat574v5jf' } })
  if (!e) { console.log('NO ENROLLMENT'); return }
  console.log('enrollment found, confirmedAt=', e.confirmedAt, 'lastTotpStep=', e.lastTotpStep)
  const secret = decryptSecret(e.secretEnc)
  console.log('secret decrypts to:', JSON.stringify(secret))
  const code = totpNow(secret)
  console.log('code now:', code, 'verify:', JSON.stringify(verifyTotp(secret, code)))
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
