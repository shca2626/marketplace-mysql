// ─────────────────────────────────────────────────────────────────────────────
// PHASE 7.8.1–7.8.3 — APPLY ACCREDITATION CONSTRAINTS (lastplan v5 7.8 / A17,
// C2, R7, B4)
//
//   bun scripts/apply-accreditation-constraints.ts
//
// Applies scripts/sql/accreditation-constraints.sql to the live MySQL DB via
// the mysql2 TEXT protocol (CREATE TRIGGER fails through the prepared-
// statement protocol — same note as scripts/sql/audit-append-only.sql).
// Execution order is significant and enforced by the file's statement order:
//   1. CHECK constraint chk_AccreditationRequest_status (dropped first if
//      present — information_schema.TABLE_CONSTRAINTS is queried in the SQL
//      itself; idempotent re-apply)
//   2. BEFORE INSERT + BEFORE UPDATE triggers deriving activeKey
//   3. UPDATE AccreditationRequest SET status = status → the update trigger
//      re-derives activeKey for every existing row IN-DATABASE
// Then VERIFIES and reports:
//   • rows where activeKey disagrees with the derivation → must be 0
//   • an INSERT with status 'BOGUS' is REJECTED by the CHECK (transaction
//     is rolled back either way — non-polluting probe)
//   • the unique index AccreditationRequest_serviceId_organizationId_
//     activeKey_key exists (created by prisma db push from the schema)
//
// Evidence: docs/reports/phase7-accreditation-constraints.json
// ─────────────────────────────────────────────────────────────────────────────
import { assertNotProd } from './lib/assert-not-prod'
import { db } from '../src/lib/db'
import mysql from 'mysql2/promise'
import { readFileSync } from 'fs'
import { mkdirSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const SQL_FILE = resolve(process.cwd(), 'scripts/sql/accreditation-constraints.sql')
const REPORT_JSON = resolve(process.cwd(), 'docs/reports/phase7-accreditation-constraints.json')

const VALID_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_PLATFORM_REVIEW',
  'RETURNED_FOR_COMPLETION',
  'FORWARDED_TO_FINANCIER',
  'UNDER_FINANCIER_REVIEW',
  'ACCREDITED',
  'REJECTED',
  'EXPIRED',
  'REVOKED',
  'CANCELLED',
]
const ACTIVE_SET = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_PLATFORM_REVIEW',
  'RETURNED_FOR_COMPLETION',
  'FORWARDED_TO_FINANCIER',
  'UNDER_FINANCIER_REVIEW',
  'ACCREDITED',
]

function readDatabaseUrl(): string {
  const env = readFileSync(resolve(process.cwd(), '.env'), 'utf8')
  const match = env.match(/^DATABASE_URL=(.+)$/m)
  if (!match) throw new Error('DATABASE_URL not found in .env')
  return match[1].trim().replace(/^["']|["']$/g, '')
}

async function main() {
  assertNotProd()

  const url = readDatabaseUrl()
  const conn = await mysql.createConnection(url)
  const steps: Array<{ step: string; statement: string; result: string }> = []

  // ── pre-state inventory ────────────────────────────────────────────────────
  const [preConstraints] = (await conn.query(
    `SELECT CONSTRAINT_NAME, CONSTRAINT_TYPE FROM information_schema.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'AccreditationRequest'`
  )) as unknown as [any[]]
  const preTriggers = (await conn.query(
    `SELECT TRIGGER_NAME FROM information_schema.TRIGGERS
     WHERE TRIGGER_SCHEMA = DATABASE() AND EVENT_OBJECT_TABLE = 'AccreditationRequest'`
  )) as unknown as [any[]]
  const [preRows] = await conn.query(
    'SELECT id, number, status, activeKey FROM AccreditationRequest'
  )
  console.log(
    `pre-state: ${preConstraints.length} constraints, ${preTriggers[0].length} triggers, ${(preRows as any[]).length} accreditation rows`
  )
  for (const row of preRows as any[]) {
    console.log(`  row ${row.number} status=${row.status} activeKey=${row.activeKey}`)
  }

  // ── apply the SQL file, statement by statement (order matters) ────────────
  const file = readFileSync(SQL_FILE, 'utf8')
  const chunks = file.split(/^-- >>> STATEMENT\s*$/m)
  const statements = chunks
    .slice(1) // the header comment block before the first marker
    .map((chunk) => chunk.replace(/^\s+|\s+$/g, ''))
    .filter((chunk) => chunk.length > 0)
  // strip leading `--` comment lines for statement classification (the SQL
  // file annotates every statement with an explanatory comment)
  const codeOf = (stmt: string) =>
    stmt
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n')
      .trim()

  console.log(`\napplying ${statements.length} statements from ${SQL_FILE}`)
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i]
    const code = codeOf(stmt)
    const label =
      code.startsWith('SET @has_check')
        ? 'check existence probe'
        : code.startsWith('SET @ddl')
          ? 'drop DDL selector'
          : code.startsWith('PREPARE')
            ? 'prepare drop DDL'
            : code.startsWith('EXECUTE')
              ? 'execute drop DDL'
              : code.startsWith('DEALLOCATE')
                ? 'deallocate drop DDL'
                : code.startsWith('ALTER TABLE')
                  ? 'ADD CONSTRAINT chk_AccreditationRequest_status'
                  : code.startsWith('DROP TRIGGER IF EXISTS `AccreditationRequest_activeKey_insert`')
                    ? 'drop insert trigger (if exists)'
                    : code.startsWith('CREATE TRIGGER `AccreditationRequest_activeKey_insert`')
                      ? 'CREATE TRIGGER AccreditationRequest_activeKey_insert'
                      : code.startsWith('DROP TRIGGER IF EXISTS `AccreditationRequest_activeKey_update`')
                        ? 'drop update trigger (if exists)'
                        : code.startsWith('CREATE TRIGGER `AccreditationRequest_activeKey_update`')
                          ? 'CREATE TRIGGER AccreditationRequest_activeKey_update'
                          : code.startsWith('UPDATE')
                            ? 're-derive existing rows (UPDATE status = status)'
                            : 'unknown'
    try {
      const [result] = await conn.query(stmt)
      const summary =
        Array.isArray(result) && result.length === 1 && (result[0] as any).info !== undefined
          ? String((result[0] as any).info)
          : Array.isArray(result)
            ? `${result.length} row(s)`
            : result && typeof result === 'object' && 'affectedRows' in (result as any)
              ? `affectedRows=${(result as any).affectedRows}`
              : 'ok'
      steps.push({ step: `${i + 1}. ${label}`, statement: stmt.slice(0, 120), result: summary })
      console.log(`  [${i + 1}/${statements.length}] ${label} — ${summary}`)
    } catch (err) {
      steps.push({
        step: `${i + 1}. ${label}`,
        statement: stmt.slice(0, 120),
        result: `FAILED: ${(err as Error).message}`,
      })
      console.error(`  [${i + 1}/${statements.length}] ${label} FAILED: ${(err as Error).message}`)
      await conn.end()
      process.exit(1)
    }
  }

  // ── verification 1: activeKey agrees with the derivation everywhere ────────
  const [badRows] = await conn.query(
    `SELECT COUNT(*) AS n FROM AccreditationRequest
     WHERE NOT (activeKey <=> CASE WHEN status IN (${ACTIVE_SET.map((s) => `'${s}'`).join(',')}) THEN 1 ELSE NULL END)`
  )
  const derivationMismatches = (badRows as any[])[0].n

  // ── verification 2: invalid status is rejected by the CHECK ────────────────
  const [sample] = await conn.query(
    'SELECT organizationId, submittedById, serviceId FROM AccreditationRequest LIMIT 1'
  )
  let bogusRejected = false
  let bogusError = ''
  if ((sample as any[]).length > 0) {
    const s = (sample as any[])[0]
    try {
      await conn.beginTransaction()
      await conn.query(
        `INSERT INTO AccreditationRequest (id, number, organizationId, submittedById, serviceId, status, createdAt, updatedAt)
         VALUES ('chk-probe-bogus', 'ACC-PROBE-BOGUS', ?, ?, ?, 'BOGUS', NOW(), NOW())`,
        [s.organizationId, s.submittedById, s.serviceId]
      )
      // if we get here the CHECK did NOT block — roll back, verification failed
      await conn.rollback()
      bogusRejected = false
      bogusError = 'INSERT SUCCEEDED — the CHECK constraint did NOT block the invalid status'
    } catch (err) {
      await conn.rollback()
      const e = err as any
      bogusRejected = e.code === 'ER_CHECK_CONSTRAINT_VIOLATED' || /chk_AccreditationRequest_status/i.test(String(e.message))
      bogusError = `${e.code ?? ''} ${e.message}`.trim()
    }
  }
  const [probeLeak] = await conn.query(
    `SELECT COUNT(*) AS n FROM AccreditationRequest WHERE id = 'chk-probe-bogus' OR number = 'ACC-PROBE-BOGUS'`
  )
  const probeLeakRows = (probeLeak as any[])[0].n

  // ── verification 3: the unique index exists ────────────────────────────────
  const [indexRows] = await conn.query(
    `SELECT INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns_
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'AccreditationRequest'
       AND INDEX_NAME = 'AccreditationRequest_serviceId_organizationId_activeKey_key'
     GROUP BY INDEX_NAME`
  )
  const uniqueIndex =
    (indexRows as any[]).length > 0
      ? { name: (indexRows as any[])[0].INDEX_NAME, columns: (indexRows as any[])[0].columns_.split(',') }
      : null

  // ── verification 4: post-state inventory ───────────────────────────────────
  const [postConstraints] = await conn.query(
    `SELECT CONSTRAINT_NAME, CONSTRAINT_TYPE FROM information_schema.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'AccreditationRequest'`
  )
  const postTriggers = await conn.query(
    `SELECT TRIGGER_NAME, ACTION_TIMING, EVENT_MANIPULATION FROM information_schema.TRIGGERS
     WHERE TRIGGER_SCHEMA = DATABASE() AND EVENT_OBJECT_TABLE = 'AccreditationRequest'`
  )
  const [postRows] = await conn.query(
    'SELECT id, number, status, activeKey FROM AccreditationRequest'
  )

  const gatePassed =
    derivationMismatches === 0 && bogusRejected && probeLeakRows === 0 && uniqueIndex !== null

  const report = {
    generatedAt: new Date().toISOString(),
    task: 'Phase 7.8.1–7.8.3 accreditation status CHECK + DB-derived activeKey (lastplan 7.8)',
    sql: 'scripts/sql/accreditation-constraints.sql',
    activeSet: ACTIVE_SET,
    terminalSet: VALID_STATUSES.filter((s) => !ACTIVE_SET.includes(s)),
    note: "ARCHIVED (lastplan 7.8.1) is deliberately NOT in the CHECK — it is not yet an adopted application status (schema comment lists 11 values); adding it later is a reviewed migration, not a silent edit",
    appliedSteps: steps,
    verification: {
      checkConstraintPresent: (postConstraints as any[]).some(
        (c) => c.CONSTRAINT_NAME === 'chk_AccreditationRequest_status' && c.CONSTRAINT_TYPE === 'CHECK'
      ),
      triggersPresent: {
        AccreditationRequest_activeKey_insert: (postTriggers[0] as any[]).some((t) => t.TRIGGER_NAME === 'AccreditationRequest_activeKey_insert'),
        AccreditationRequest_activeKey_update: (postTriggers[0] as any[]).some((t) => t.TRIGGER_NAME === 'AccreditationRequest_activeKey_update'),
      },
      activeKeyDerivationMismatches: derivationMismatches,
      bogusStatusInsertRejected: bogusRejected,
      bogusStatusInsertError: bogusError,
      probeLeakRows,
      uniqueIndex,
      rowsBefore: preRows,
      rowsAfter: postRows,
    },
    gate: gatePassed
      ? 'PASS — CHECK live, triggers derive activeKey in-database, zero derivation mismatches, invalid status rejected, unique index present'
      : 'FAIL — see verification',
  }

  mkdirSync(resolve(process.cwd(), 'docs/reports'), { recursive: true })
  writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2) + '\n')

  console.log('\n─── 7.8 accreditation constraints ─────────────────────')
  console.log(`  CHECK constraint present: ${report.verification.checkConstraintPresent}`)
  console.log(`  triggers: ${JSON.stringify(report.verification.triggersPresent)}`)
  console.log(`  activeKey derivation mismatches: ${derivationMismatches}`)
  console.log(`  BOGUS-status insert rejected: ${bogusRejected} (${bogusError})`)
  console.log(`  probe leak rows: ${probeLeakRows}`)
  console.log(`  unique index: ${JSON.stringify(uniqueIndex)}`)
  for (const row of postRows as any[]) {
    console.log(`  row ${row.number} status=${row.status} activeKey=${row.activeKey}`)
  }
  console.log(`gate: ${report.gate}`)
  console.log(`report: ${REPORT_JSON}`)

  await conn.end()
  await db.$disconnect()
  if (!gatePassed) process.exit(1)
}

main().catch((err) => {
  console.error('apply-accreditation-constraints crashed:', err)
  process.exit(1)
})
