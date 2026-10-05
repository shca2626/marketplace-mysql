// ─────────────────────────────────────────────────────────────────────────────
// BUMP ALL SESSIONS (lastplan v5 6.0.2) — one-time, audited invalidation of
// every active session. Used after credential rotation / auth changes so all
// existing tokens die and every user re-authenticates (fresh session registry
// rows, fresh MFA state).
//
//   bun scripts/bump-all-sessions.ts [--dry-run]
// ─────────────────────────────────────────────────────────────────────────────
import { assertNotProd } from './lib/assert-not-prod'
import { db } from '../src/lib/db'
import { recordAudit } from '../src/server/modules/audit/service'

async function main() {
  assertNotProd()
  const dry = process.argv.includes('--dry-run')

  const total = await db.user.count()
  if (dry) {
    console.log(`[dry-run] would bump sessionVersion for ${total} user(s) + revoke ${'n'} session-registry rows`)
    process.exit(0)
  }

  // 1. Mark every active registry row revoked (reason recorded).
  const revoked = await db.sessionRegistry.updateMany({
    where: { revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: 'ALL_SESSIONS' },
  })
  // 2. Bump every user's sessionVersion — every token stops resolving.
  const bumped = await db.user.updateMany({
    data: { sessionVersion: { increment: 1 } },
  })

  await recordAudit({
    actorType: 'SYSTEM',
    action: 'ALL_SESSIONS_INVALIDATED',
    entityType: 'Platform',
    summary: `Credential-hygiene invalidation: ${bumped.count} user(s) session-versions bumped, ${revoked.count} registry row(s) revoked`,
    metadata: { users: bumped.count, registryRows: revoked.count },
  })

  console.log(`✓ sessionVersion bumped for ${bumped.count} user(s); ${revoked.count} registry row(s) revoked`)
  console.log('  Every account must sign in again (6.0.2 — one-time kill).')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
