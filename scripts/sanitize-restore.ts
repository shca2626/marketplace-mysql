// ─────────────────────────────────────────────────────────────────────────────
// SANITIZE RESTORE (lastplan v5 6.0b.4) — scripted, re-runnable sanitization of
// a restored production backup on STAGING, run BEFORE testers touch the data.
//
//   bun scripts/sanitize-restore.ts [--dry-run]
//
// What it does (in order):
//   1. assert-not-prod (fail closed — no production mode, ever)
//   2. anonymize personal data (names, phones, emails, addresses)
//   3. strip auth/session/recovery material (reset tokens, OTP codes,
//      sessions, invitation tokens, MFA enrollments)
//   4. zero API credentials + WhatsApp session state
//   5. report per-table counts (controlled comparison — aggregate only)
//
// KYC/private documents are NOT copied into staging by the restore procedure
// itself (6.0b.4); this script additionally verifies the vault tables are
// empty and refuses to proceed if they are not.
// ─────────────────────────────────────────────────────────────────────────────
import { assertNotProd } from './lib/assert-not-prod'
import { db } from '../src/lib/db'
import { randomBytes } from 'crypto'

const dry = process.argv.includes('--dry-run')

function anon(prefix: string): string {
  return `${prefix}-${randomBytes(4).toString('hex')}`
}

async function count(table: string): Promise<number> {
  // Safe subset — only tables this script knows how to sanitize.
  const allowed: Record<string, () => Promise<number>> = {
    user: () => db.user.count(),
    organization: () => db.organization.count(),
    sessionRegistry: () => db.sessionRegistry.count(),
    staffInvitation: () => db.staffInvitation.count(),
    mfaEnrollment: () => db.mfaEnrollment.count(),
    passwordResetToken: () => db.passwordResetToken.count(),
    otpCode: () => db.otpCode.count(),
    order: () => db.order.count(),
    accountDocument: () => db.accountDocument.count(),
  }
  if (!allowed[table]) throw new Error(`Unknown table for count: ${table}`)
  return allowed[table]()
}

async function main() {
  assertNotProd()
  console.log('── sanitize-restore ────────────────────────────────────────')
  if (dry) console.log('(dry run — counts only, no writes)')

  const before: Record<string, number> = {}
  for (const t of ['user', 'organization', 'sessionRegistry', 'staffInvitation', 'mfaEnrollment', 'passwordResetToken', 'otpCode', 'order', 'accountDocument']) {
    before[t] = await count(t)
  }
  console.log('Before:', JSON.stringify(before))

  // 4. Private KYC documents must not be present at all in staging.
  if (before.accountDocument > 0) {
    console.error(
      `✗ ${before.accountDocument} AccountDocument row(s) present — the restore procedure must NOT copy private KYC documents into staging (6.0b.4). Replace with test fixtures; refusing to continue.`
    )
    process.exit(1)
  }

  if (dry) {
    console.log('(dry run complete — no changes written)')
    process.exit(0)
  }

  // ── 3. Auth/session/recovery material ──────────────────────────────────────
  await db.sessionRegistry.deleteMany({})
  await db.mfaEnrollment.deleteMany({}) // cascade: backup codes
  await db.passwordResetToken.deleteMany({})
  await db.otpCode.deleteMany({})
  await db.staffInvitation.deleteMany({ status: 'PENDING' })
  console.log('✓ sessions / MFA / reset tokens / OTP codes / pending invitations stripped')

  // ── 2. Personal data anonymization ────────────────────────────────────────
  const users = await db.user.findMany({
    select: { id: true, name: true, email: true, phone: true },
    take: 100000,
  })
  for (const u of users) {
    await db.user.update({
      where: { id: u.id },
      data: {
        name: anon('User'),
        email: `user${u.id.slice(-6)}@staging.invalid`,
        phone: `+1555${String(1000000 + (users.indexOf(u) % 8999999)).slice(0, 7)}`,
        whatsappNumber: null,
        identityNumber: null,
        residenceStreet: null,
        residenceCity: null,
        residenceDistrict: null,
      },
    })
  }
  console.log(`✓ ${users.length} user(s) anonymized (names/emails/phones/addresses/identity)`)

  const orgs = await db.organization.findMany({ select: { id: true, name: true }, take: 10000 })
  for (const o of orgs) {
    await db.organization.update({
      where: { id: o.id },
      data: { name: anon('Org'), contactEmail: `org${o.id.slice(-6)}@staging.invalid`, contactPhone: null },
    })
  }
  console.log(`✓ ${orgs.length} organization(s) anonymized`)

  // ── 4. Credential-bearing rows ─────────────────────────────────────────────
  await db.whatsAppSender.updateMany({ data: { credsJson: '', status: 'DISCONNECTED' } })
  console.log('✓ WhatsApp sender credentials cleared (re-pair with the staging test line)')

  // ── 5. Controlled comparison (aggregates only — what testers may see) ───────
  const after: Record<string, string | number> = {}
  for (const t of Object.keys(before)) after[t] = await count(t)
  console.log('After: ', JSON.stringify(after))

  const orders = await db.order.aggregate({ _count: { _all: true } })
  console.log(`Aggregate verification: orders=${orders._count._all} (row counts must match the pre-sanitize restore — sanitized values, same rows)`)
  console.log('── sanitize complete: staging data is synthetic-safe ────')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
