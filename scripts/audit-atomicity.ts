// ─────────────────────────────────────────────────────────────────────────────
// AUDIT ATOMICITY SUITE (lastplan v5 6.11 / A10) — failure-injection proof
// that sensitive changes and their AuditLog rows commit (or roll back)
// together, plus the DB-level append-only tamper mitigation check.
//
//   bun scripts/audit-atomicity.ts
//
// Cases (all non-polluting: every transaction is rolled back by design):
//   ATOM-01  failure injection    — poisoned recordAuditTx INSERT inside a
//                                   business tx → the WHOLE tx rolls back
//                                   (no silent skip, no orphan business row)
//   ATOM-02  in-tx visibility     — marker + recordAuditTx read back INSIDE
//                                   the tx (same connection), then rolled
//                                   back → neither row persists
//   ATOM-03  drift guard          — recordAudit() REFUSES a sensitive action
//                                   at runtime (the swallow path is closed)
//   ATOM-04  non-sensitive path   — recordAudit() still swallows a failing
//                                   NON-sensitive write (telemetry never
//                                   breaks business flows)
//   ATAM-05  append-only trigger  — UPDATE on AuditLog is blocked at the DB
//                                   level (SQLSTATE 45000) unless the
//                                   maintenance session var is set
//   ATAM-06  trigger inventory    — both triggers present (information_schema)
// ─────────────────────────────────────────────────────────────────────────────
import { assertNotProd } from './lib/assert-not-prod'
import { db } from '../src/lib/db'
import { recordAudit, recordAuditTx, SENSITIVE_AUDIT_ACTIONS } from '../src/server/modules/audit/service'

const results: Array<[string, string, boolean, string]> = []
function record(id: string, name: string, pass: boolean, detail: string) {
  results.push([id, name, pass, detail])
  console.log(`${pass ? '✓' : '✗'} ${id} ${name} — ${detail}`)
}

class DeliberateRollback extends Error {}

async function main() {
  assertNotProd()

  const TAG = `audit-atomicity-${Date.now()}`

  // ── ATOM-01: failure injection — the audit write dies, the business write
  // must die with it (no silent skip). A >191-char action violates the
  // AuditLog.action VARCHAR(191) → deterministic INSERT failure inside the tx.
  {
    const markerBefore = await db.platformSetting.count({ where: { key: { startsWith: TAG } } })
    let txFailed = false
    try {
      await db.$transaction(async (tx) => {
        // "Business" change — would persist on its own.
        await tx.platformSetting.create({
          data: { key: `${TAG}-atom01`, value: 'marker' },
        })
        // Poisoned audit write — action longer than the column allows.
        await recordAuditTx(tx, {
          actorType: 'SYSTEM',
          action: 'X'.repeat(400),
          entityType: 'AtomicityProbe',
        })
      })
    } catch {
      txFailed = true
    }
    const markerAfter = await db.platformSetting.count({ where: { key: { startsWith: TAG } } })
    const rolledBack = txFailed && markerAfter === markerBefore
    record(
      'ATOM-01',
      'failure injection rolls the business change back',
      rolledBack,
      txFailed
        ? `tx failed as injected; marker rows before=${markerBefore} after=${markerAfter} (unchanged = rolled back)`
        : 'transaction unexpectedly succeeded — the poisoned audit write did NOT fail'
    )
  }

  // ── ATOM-02: in-tx visibility + non-polluting rollback. A committed-style
  // flow (business write + audit write, read both back on the same
  // connection), then a deliberate rollback proves the script leaves no rows.
  {
    let sawMarker = false
    let sawAudit = false
    try {
      await db.$transaction(async (tx) => {
        await tx.platformSetting.create({ data: { key: `${TAG}-atom02`, value: 'marker' } })
        await recordAuditTx(tx, {
          actorType: 'SYSTEM',
          action: 'ATOMICITY_PROBE_READBACK',
          entityType: 'AtomicityProbe',
          entityId: `${TAG}-atom02`,
        })
        sawMarker =
          (await tx.platformSetting.count({ where: { key: `${TAG}-atom02` } })) === 1
        sawAudit =
          (await tx.auditLog.count({ where: { action: 'ATOMICITY_PROBE_READBACK', entityId: `${TAG}-atom02` } })) === 1
        throw new DeliberateRollback() // non-polluting by design
      })
    } catch (err) {
      if (!(err instanceof DeliberateRollback)) throw err
    }
    const leaked =
      (await db.platformSetting.count({ where: { key: { startsWith: TAG } } })) +
      (await db.auditLog.count({ where: { entityType: 'AtomicityProbe' } }))
    record(
      'ATOM-02',
      'audit row visible on the tx connection; rollback leaves zero rows',
      sawMarker && sawAudit && leaked === 0,
      `in-tx marker=${sawMarker}, audit=${sawAudit}; leaked rows after rollback=${leaked}`
    )
  }

  // ── ATOM-03: the runtime drift guard — recordAudit() refuses sensitive actions.
  {
    let refused = false
    let message = ''
    try {
      await recordAudit({ actorType: 'ADMIN', action: 'ROLE_ASSIGNED', entityType: 'AtomicityProbe' })
    } catch (err) {
      refused = true
      message = (err as Error).message.slice(0, 90)
    }
    record(
      'ATOM-03',
      'recordAudit() refuses sensitive actions (fail-closed)',
      refused,
      refused ? `threw: "${message}…"` : 'sensitive action traveled the swallow path — NOT refused'
    )
  }

  // ── ATOM-04: the non-sensitive path still swallows failures (telemetry rule).
  {
    let swallowed = true
    try {
      // >191 chars → INSERT fails; non-sensitive actions must not throw.
      await recordAudit({ actorType: 'SYSTEM', action: 'X'.repeat(400), entityType: 'AtomicityProbe' })
    } catch {
      swallowed = false
    }
    record(
      'ATOM-04',
      'non-sensitive audit failures stay swallowed',
      swallowed,
      swallowed ? 'no exception (logged + swallowed, business flows unaffected)' : 'threw — telemetry path regressed'
    )
  }

  // ── ATAM-05: DB-level tamper mitigation — UPDATE on AuditLog must be
  // blocked by the append-only trigger (SQLSTATE 45000). BEFORE UPDATE only
  // fires on matched rows, so the probe creates a real row first — inside the
  // same transaction that then rolls back (non-polluting).
  {
    let blocked = false
    let detail = ''
    try {
      await db.$transaction(async (tx) => {
        await tx.auditLog.create({
          data: { id: `${TAG}-atam05`, actorType: 'SYSTEM', action: 'ATOMICITY_PROBE_TAMPER', entityType: 'AtomicityProbe' },
        })
        try {
          await tx.auditLog.update({ where: { id: `${TAG}-atam05` }, data: { summary: 'tampered' } })
        } catch (err) {
          blocked = /append-only/i.test(String((err as Error).message))
          detail = String((err as Error).message).slice(0, 80)
        }
        throw new DeliberateRollback()
      })
    } catch (err) {
      if (!(err instanceof DeliberateRollback)) throw err
    }
    record(
      'ATAM-05',
      'UPDATE on AuditLog blocked at the DB level',
      blocked,
      blocked ? `SIGNAL 45000 received: "${detail}…"` : 'UPDATE was not blocked — append-only trigger missing or bypassed'
    )
  }

  // ── ATAM-06: trigger inventory (information_schema) — both guards installed.
  {
    const rows = (await db.$queryRawUnsafe(
      `SELECT TRIGGER_NAME FROM information_schema.TRIGGERS
       WHERE EVENT_OBJECT_TABLE = 'AuditLog' AND TRIGGER_SCHEMA = DATABASE()`
    )) as Array<{ TRIGGER_NAME: string }>
    const names = rows.map((r) => r.TRIGGER_NAME).sort()
    const both = names.includes('AuditLog_block_update') && names.includes('AuditLog_block_delete')
    record(
      'ATAM-06',
      'append-only triggers installed on AuditLog',
      both,
      `present: [${names.join(', ') || 'none'}] — reinstall with scripts/sql/audit-append-only.sql if missing`
    )
  }

  // ── summary ────────────────────────────────────────────────────────────────
  const failed = results.filter((r) => !r[2])
  console.log('\n─── audit atomicity suite ──────────────────────────────')
  console.log(`  sensitive actions registered: ${SENSITIVE_AUDIT_ACTIONS.size}`)
  console.log(`  cases: ${results.length}, passed: ${results.length - failed.length}, failed: ${failed.length}`)
  for (const [id, name] of failed) console.error(`  FAILED: ${id} ${name}`)
  await db.$disconnect()
  process.exit(failed.length > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('audit-atomicity suite crashed:', err)
  process.exit(1)
})
