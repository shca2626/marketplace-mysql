/**
 * Vendora — one-command MySQL sync to the user's InfinityFree hosting (SYNC-1).
 *
 *   bun run mysql:sync                 (full refresh: schema + data + verify)
 *   bun run mysql:sync --skip-data     (schema only)
 *   bun run mysql:sync --status-only   (live status + verification, nothing uploaded)
 *
 * The hosting is used for MySQL (+ image storage) ONLY — the app stays on the
 * local dev environment. This pipeline wraps the BRIDGE-1 import bridge into a
 * single repeatable command:
 *
 *   Phase 1  schema  — `bunx prisma migrate diff --from-empty --to-schema-datamodel
 *                      prisma/schema.mysql.prisma --script` → db/vendora-mysql-schema.sql,
 *                      post-processed: SET preamble, `DROP TABLE IF EXISTS` line for
 *                      EVERY table (idempotent re-runs), ENGINE=InnoDB appended to
 *                      every CREATE TABLE closing line (the MyISAM fix — InfinityFree's
 *                      MariaDB default engine breaks FKs; baked in so it can't regress).
 *   Phase 2  data    — `bun run mysql:dump` → db/vendora-mysql-data.sql +
 *                      db/sqlite-manifest.json (freshness checked via mtime).
 *   Phase 3  upload   — FTP: import.php (re-uploaded EVERY run — self-healing
 *                      presence on the host, owner ruling SYNC-1), the schema .sql,
 *                      the data .sql, and a ZEROED import-progress.txt so the data
 *                      import always starts at byte 0 (after DROP+CREATE all tables
 *                      are empty; a stale offset from a previous dump would skip rows).
 *   Phase 4  import   — via the JSON bridge (browser UA + anti-bot challenge solver,
 *                      ?json=1): phase=schema once, phase=data polled until done
 *                      (≤60 requests, 1s pause), then action=status.
 *   Phase 5  verify   — live MySQL table counts vs db/sqlite-manifest.json: tables
 *                      with 0 rows in the manifest may be absent (OK); every
 *                      non-empty table must match exactly; mismatches reported
 *                      loudly. Implicit m2m tables on MySQL that the dump registry
 *                      doesn't cover (e.g. _UserCustomerGroups) are informational.
 *
 * Writes db/mysql-sync-result.json (timestamp, per-phase results, table
 * comparison). Exit 0 = success, 1 = any failure.
 */
import { execFile, spawn } from 'child_process'
import { readFileSync } from 'fs'
import { mkdir, readFile, stat, writeFile } from 'fs/promises'
import { resolve } from 'path'
import {
  INFINITYFREE_DEFAULTS,
  ftpRemotePath,
  ftpUpload,
  ifGetJson,
  resolveFtpConfig,
} from '../src/lib/infinityfree-client'

// ── Constants ────────────────────────────────────────────────────────────────

const LINE = '─'.repeat(60)

const DB_DIR = resolve(process.cwd(), 'db')
const SCHEMA_PATH = resolve(DB_DIR, 'vendora-mysql-schema.sql')
const DATA_PATH = resolve(DB_DIR, 'vendora-mysql-data.sql')
const MANIFEST_PATH = resolve(DB_DIR, 'sqlite-manifest.json')
const RESULT_PATH = resolve(DB_DIR, 'mysql-sync-result.json')
const PROGRESS_RESET_PATH = resolve(DB_DIR, 'import-progress-reset.txt')
const IMPORT_PHP_PATH = resolve(process.cwd(), 'import.php')

/**
 * Shared-secret gate of import.php (see VENDORA_TOKEN there).
 * Kept OUT of the repo for security: set MYSQL_IMPORT_TOKEN in .env (see .env.example).
 */
const DEFAULT_TOKEN = ''

const DIFF_TIMEOUT_MS = 180_000
const DATA_PHASE_MAX_REQUESTS = 60
const DATA_PHASE_PAUSE_MS = 1_000
const FRESHNESS_SLACK_MS = 2_000 // FS timestamp granularity tolerance

// ── .env fallback (bun run auto-loads .env; direct `bun scripts/…` may not) ──

function envFromFile(key: string): string | undefined {
  try {
    const raw = readFileSync('.env', 'utf8')
    const m = raw.match(new RegExp(`^${key}="?([^"\\r\\n]*)"?$`, 'm'))
    return m?.[1] || undefined
  } catch {
    return undefined // no .env / unreadable — process.env is the only source
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

type SyncMode = 'full' | 'schema-only' | 'status-only'

interface SyncPhaseResult {
  ok: boolean
  skipped?: boolean
  note?: string
  [key: string]: unknown
}

interface TableComparison {
  expected: number | null
  actual: number | null
  status: 'match' | 'mismatch' | 'missing' | 'missing-empty' | 'extra' | 'count-failed'
}

interface SyncResult {
  ranAt: string
  mode: SyncMode
  baseUrl: string
  ok: boolean
  error?: string
  phases: Record<string, SyncPhaseResult>
  server?: string
  tableCount?: number
  tables?: Record<string, TableComparison>
  totals?: {
    checked: number
    matched: number
    mismatched: number
    missingEmpty: number
    extra: number
    rowsOnMysql: number
  }
}

interface Flags {
  statusOnly: boolean
  skipData: boolean
}

/** Shape of import.php's JSON responses (subset — extra fields ignored). */
interface ImportBridgeResult {
  ok?: boolean
  done?: boolean
  pct?: number
  executed?: number
  error?: string
  statement?: string
  line?: string
  server?: string
  tableCount?: number
  tables?: Record<string, number | null>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

function rel(p: string): string {
  const cwd = process.cwd()
  return p.startsWith(cwd + '/') ? p.slice(cwd.length + 1) : p
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}

function excerpt(value: unknown, max = 300): string {
  const s = value === null || value === undefined ? '' : String(value)
  return s.length > max ? `${s.slice(0, max)}…` : s
}

function parseFlags(argv: string[]): Flags {
  return {
    statusOnly: argv.includes('--status-only'),
    skipData: argv.includes('--skip-data'),
  }
}

function importUrl(token: string, action: string, phase?: string): string {
  const qs = new URLSearchParams({ token, action, json: '1' })
  if (phase) qs.set('phase', phase)
  return `${INFINITYFREE_DEFAULTS.baseUrl}/import.php?${qs.toString()}`
}

/** Run a child process with inherited stdio (its progress stays visible). Resolves with the exit code. */
function runInherit(cmd: string, args: string[]): Promise<number> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(cmd, args, { stdio: 'inherit' })
    child.on('error', (err) => rejectPromise(new Error(`could not spawn ${cmd}: ${err.message}`)))
    child.on('close', (code) => resolvePromise(code ?? -1))
  })
}

/** Run a child process and capture stdout/stderr. Rejects on a non-zero exit. */
function runCapture(cmd: string, args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const e = err as Error & { code?: number | string }
        rejectPromise(
          new Error(`${cmd} ${args.join(' ')} failed (exit ${e.code ?? '?'}): ${excerpt(String(stderr || e.message))}`),
        )
      } else {
        resolvePromise({ stdout: String(stdout), stderr: String(stderr) })
      }
    })
  })
}

// ── Phase 1: schema diff + post-processing ───────────────────────────────────

/**
 * Post-process the raw `prisma migrate diff --script` output into an idempotent,
 * InnoDB-forced schema file:
 *   (a) `SET NAMES utf8mb4;` + `SET FOREIGN_KEY_CHECKS=0;` preamble (the DROPs
 *       and CREATEs must run with FK checks off);
 *   (b) a `DROP TABLE IF EXISTS \`X\`;` line for EVERY CREATE TABLE table,
 *       inserted after the SET lines — re-running the import is always safe;
 *   (c) ` ENGINE=InnoDB` appended to the closing line of every CREATE TABLE
 *       statement. The diff's closing lines look like
 *           `) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
 *       (NOT a bare `);`), so the `;` terminating the `)`-opening line is
 *       replaced. A line-state machine (inside-CREATE-TABLE tracking) makes
 *       sure AddForeignKey/ALTER statements are never touched.
 */
function postProcessSchemaSql(raw: string): { sql: string; tables: string[] } {
  const lines = raw.split('\n')
  const out: string[] = []
  const tables: string[] = []
  let inCreateTable = false

  for (const line of lines) {
    const createMatch = /^CREATE TABLE `([^`]+)`/.exec(line)
    if (createMatch) {
      inCreateTable = true
      tables.push(createMatch[1])
      out.push(line)
      continue
    }
    if (inCreateTable && line.startsWith(')')) {
      inCreateTable = false
      if (/;\s*$/.test(line) && !/ENGINE\s*=/i.test(line)) {
        out.push(line.replace(/;\s*$/, ' ENGINE=InnoDB;'))
      } else {
        out.push(line) // already carries an engine or unexpected shape — keep verbatim
      }
      continue
    }
    out.push(line)
  }

  if (tables.length === 0) {
    throw new Error('no CREATE TABLE statements found in the prisma migrate diff output')
  }

  const preamble = [
    'SET NAMES utf8mb4;',
    'SET FOREIGN_KEY_CHECKS=0;',
    ...tables.map((t) => `DROP TABLE IF EXISTS \`${t}\`;`),
    '',
  ]
  return { sql: preamble.concat(out).join('\n'), tables }
}

async function runSchemaPhase(): Promise<{ tables: string[]; bytes: number }> {
  const { stdout, stderr } = await runCapture(
    'bunx',
    ['prisma', 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.mysql.prisma', '--script'],
    DIFF_TIMEOUT_MS,
  )

  if (!stdout || !/^CREATE TABLE /m.test(stdout)) {
    throw new Error(`prisma migrate diff produced no CREATE TABLE statements (stderr: ${excerpt(stderr)})`)
  }

  const { sql, tables } = postProcessSchemaSql(stdout)
  await writeFile(SCHEMA_PATH, sql, 'utf8')
  return { tables, bytes: Buffer.byteLength(sql) }
}

// ── Phase 2: data dump ────────────────────────────────────────────────────────

async function runDumpPhase(): Promise<{ bytes: number; manifestAt: string }> {
  const phaseStart = Date.now()

  const code = await runInherit('bun', ['run', 'mysql:dump'])
  if (code !== 0) throw new Error(`bun run mysql:dump exited with code ${code}`)

  for (const p of [DATA_PATH, MANIFEST_PATH]) {
    const info = await stat(p) // throws when the dump produced no file at all
    if (info.mtimeMs < phaseStart - FRESHNESS_SLACK_MS) {
      throw new Error(
        `${rel(p)} is stale (mtime ${new Date(info.mtimeMs).toISOString()} predates this run) — the dump did not regenerate it`,
      )
    }
  }

  const dataInfo = await stat(DATA_PATH)
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as { generatedAt?: string }
  return { bytes: dataInfo.size, manifestAt: manifest.generatedAt ?? 'unknown' }
}

// ── Phase 3: FTP upload ──────────────────────────────────────────────────────

async function runUploadPhase(includeData: boolean): Promise<string[]> {
  const uploaded: string[] = []

  // import.php is re-uploaded on EVERY run — the earlier cleanup action deleted
  // it once; the owner ruling (SYNC-1) keeps it on the host permanently, so this
  // is self-healing: even a cleaned-up host is repaired by the next sync.
  await ftpUpload(IMPORT_PHP_PATH, ftpRemotePath('import.php'))
  uploaded.push(ftpRemotePath('import.php'))

  await ftpUpload(SCHEMA_PATH, ftpRemotePath('vendora-mysql-schema.sql'))
  uploaded.push(ftpRemotePath('vendora-mysql-schema.sql'))

  if (includeData) {
    await ftpUpload(DATA_PATH, ftpRemotePath('vendora-mysql-data.sql'))
    uploaded.push(ftpRemotePath('vendora-mysql-data.sql'))

    // Zero the remote progress marker: the schema phase DROPs + recreates every
    // table, so the data import MUST start at byte 0. A stale offset from a
    // previous (different) dump — even one smaller than the new file — would
    // silently skip statements and leave tables partially empty.
    await writeFile(PROGRESS_RESET_PATH, '0\n', 'utf8')
    await ftpUpload(PROGRESS_RESET_PATH, ftpRemotePath('import-progress.txt'))
    uploaded.push(ftpRemotePath('import-progress.txt'))
  }

  return uploaded
}

// ── Phase 4: import via the JSON bridge ──────────────────────────────────────

async function runSchemaImport(token: string): Promise<number> {
  const r = (await ifGetJson(importUrl(token, 'import', 'schema'))) as ImportBridgeResult
  if (!r || r.ok !== true) {
    throw new Error(
      `schema import failed: ${excerpt(r?.error ?? 'no ok flag in the response')}${r?.statement ? ` — statement: ${excerpt(r.statement)}` : ''}`,
    )
  }
  return Number(r.executed ?? 0)
}

async function runDataImport(token: string): Promise<{ statements: number; requests: number }> {
  let totalStatements = 0
  for (let i = 1; i <= DATA_PHASE_MAX_REQUESTS; i++) {
    const r = (await ifGetJson(importUrl(token, 'import', 'data'))) as ImportBridgeResult
    if (!r || r.ok !== true) {
      throw new Error(
        `data import failed at ${r?.pct ?? 0}%: ${excerpt(r?.error ?? 'no ok flag in the response')}${r?.line ? ` — statement: ${excerpt(r.line)}` : ''}`,
      )
    }
    totalStatements += Number(r.executed ?? 0)
    if (r.done === true) return { statements: totalStatements, requests: i }
    console.log(`    … request #${i}: ${r.pct ?? 0}% (+${r.executed ?? 0} statements)`)
    if (i === DATA_PHASE_MAX_REQUESTS) {
      throw new Error(
        `data import did not finish within ${DATA_PHASE_MAX_REQUESTS} requests (last progress ${r.pct ?? 0}%) — re-run \`bun run mysql:sync\` for a clean restart`,
      )
    }
    await sleep(DATA_PHASE_PAUSE_MS)
  }
  throw new Error('unreachable: data import loop exited without a verdict')
}

async function runStatusImport(token: string): Promise<ImportBridgeResult> {
  const r = (await ifGetJson(importUrl(token, 'status'))) as ImportBridgeResult
  if (!r || r.ok !== true) {
    throw new Error(`status check failed: ${excerpt(r?.error ?? 'no ok flag in the response')}`)
  }
  return r
}

// ── Phase 5: verification ─────────────────────────────────────────────────────

interface VerifyOutcome {
  ok: boolean
  mismatches: string[]
  tables: Record<string, TableComparison>
  totals: {
    checked: number
    matched: number
    mismatched: number
    missingEmpty: number
    extra: number
    rowsOnMysql: number
  }
}

async function runVerifyPhase(
  statusTables: Record<string, number | null>,
  mode: SyncMode,
): Promise<VerifyOutcome> {
  const tables: Record<string, TableComparison> = {}
  const mismatches: string[] = []
  let checked = 0
  let matched = 0
  let mismatched = 0
  let missingEmpty = 0
  let extra = 0
  let rowsOnMysql = 0

  let expected: Record<string, number> | null = null
  try {
    const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as { tables?: Record<string, number> }
    expected = manifest.tables ?? null
  } catch {
    expected = null // no readable manifest — counts become informational
  }

  for (const count of Object.values(statusTables)) {
    if (typeof count === 'number') rowsOnMysql += count
  }

  if (!expected) {
    if (mode !== 'status-only') {
      throw new Error('db/sqlite-manifest.json missing or unreadable — cannot verify (was the dump phase run?)')
    }
    console.log('    ⚠ db/sqlite-manifest.json missing or unreadable — counts listed WITHOUT comparison (run a full sync to verify)')
    for (const [name, actual] of Object.entries(statusTables)) {
      tables[name] = { expected: null, actual: actual ?? null, status: 'extra' }
      extra++
    }
    return {
      ok: true,
      mismatches,
      tables,
      totals: { checked: 0, matched: 0, mismatched: 0, missingEmpty: 0, extra, rowsOnMysql },
    }
  }

  for (const [name, expectedCount] of Object.entries(expected)) {
    checked++
    const raw = statusTables[name]

    if (mode === 'schema-only') {
      // Schema-only run: every schema table must EXIST (the data phase was
      // skipped, so row counts are not comparable — shown as information).
      if (raw === undefined) {
        tables[name] = { expected: expectedCount, actual: null, status: 'missing' }
        mismatched++
        mismatches.push(`${name}: table missing on MySQL after schema import`)
      } else {
        tables[name] = { expected: expectedCount, actual: raw, status: 'match' }
        matched++
      }
      continue
    }

    if (raw === undefined) {
      if (expectedCount === 0) {
        tables[name] = { expected: 0, actual: null, status: 'missing-empty' }
        missingEmpty++
      } else {
        tables[name] = { expected: expectedCount, actual: null, status: 'missing' }
        mismatched++
        mismatches.push(`${name}: table missing on MySQL (expected ${expectedCount} rows)`)
      }
      continue
    }

    if (raw === null) {
      // Present on MySQL, but its COUNT(*) failed — report loudly.
      tables[name] = { expected: expectedCount, actual: null, status: 'count-failed' }
      mismatched++
      mismatches.push(`${name}: COUNT(*) failed on MySQL (expected ${expectedCount} rows)`)
      continue
    }

    if (raw === expectedCount) {
      tables[name] = { expected: expectedCount, actual: raw, status: 'match' }
      matched++
    } else {
      tables[name] = { expected: expectedCount, actual: raw, status: 'mismatch' }
      mismatched++
      mismatches.push(`${name}: expected ${expectedCount} rows, MySQL has ${raw}`)
    }
  }

  // Tables on MySQL that the manifest doesn't know (implicit m2m join tables
  // like _UserCustomerGroups are created by the schema but not dumped by the
  // registry) — informational, never a failure.
  for (const [name, actual] of Object.entries(statusTables)) {
    if (!(name in expected)) {
      tables[name] = { expected: null, actual: actual ?? null, status: 'extra' }
      extra++
    }
  }

  return {
    ok: mismatched === 0,
    mismatches,
    tables,
    totals: { checked, matched, mismatched, missingEmpty, extra, rowsOnMysql },
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2))
  const mode: SyncMode = flags.statusOnly ? 'status-only' : flags.skipData ? 'schema-only' : 'full'
  const startedAt = Date.now()

  const envToken = process.env.MYSQL_IMPORT_TOKEN ?? envFromFile('MYSQL_IMPORT_TOKEN')
  const token = envToken && envToken.trim() !== '' ? envToken.trim() : DEFAULT_TOKEN
  if (!token) {
    console.error('✗ MYSQL_IMPORT_TOKEN is not set. Add it to .env (see .env.example) — it must match VENDORA_TOKEN in import.php on the hosting.')
    process.exit(1)
  }

  const ftp = resolveFtpConfig()
  const result: SyncResult = {
    ranAt: new Date().toISOString(),
    mode,
    baseUrl: INFINITYFREE_DEFAULTS.baseUrl,
    ok: false,
    phases: {},
  }

  console.log('')
  console.log('  Vendora · mysql:sync — InfinityFree MySQL refresh (SYNC-1)')
  console.log('  ' + LINE)
  console.log(`  Mode     : ${mode}`)
  console.log(`  Target   : ${INFINITYFREE_DEFAULTS.baseUrl} · FTP ${ftp.host} → ${ftp.base}`)
  console.log('')

  try {
    // Phase 0 — artifacts dir
    await mkdir(DB_DIR, { recursive: true })

    if (flags.statusOnly) {
      result.phases.schema = { ok: true, skipped: true, note: '--status-only' }
      result.phases.dump = { ok: true, skipped: true, note: '--status-only' }
      result.phases.upload = { ok: true, skipped: true, note: '--status-only' }
    } else {
      // Phase 1 — schema
      console.log('  Phase 1 · schema (prisma migrate diff + InnoDB post-processing)…')
      const schema = await runSchemaPhase()
      result.phases.schema = { ok: true, tables: schema.tables.length, bytes: schema.bytes }
      console.log(
        `    ✓ ${rel(SCHEMA_PATH)} — ${schema.tables.length} tables, ${fmtBytes(schema.bytes)} (DROP preamble + ENGINE=InnoDB)`,
      )

      // Phase 2 — data dump
      if (flags.skipData) {
        result.phases.dump = { ok: true, skipped: true, note: '--skip-data' }
        console.log('  Phase 2 · data dump — skipped (--skip-data)')
      } else {
        console.log('  Phase 2 · data dump (bun run mysql:dump)…')
        const dump = await runDumpPhase()
        result.phases.dump = { ok: true, bytes: dump.bytes, manifestAt: dump.manifestAt }
        console.log(`    ✓ ${rel(DATA_PATH)} (${fmtBytes(dump.bytes)}) + sqlite-manifest.json fresh (${dump.manifestAt})`)
      }

      // Phase 3 — upload
      console.log('  Phase 3 · upload (FTP via curl -T)…')
      const uploaded = await runUploadPhase(!flags.skipData)
      result.phases.upload = { ok: true, files: uploaded }
      for (const remote of uploaded) {
        const label = remote.endsWith('import.php')
          ? 'self-healing re-upload — stays on the host permanently (SYNC-1)'
          : remote.endsWith('import-progress.txt')
            ? 'zeroed — data import restarts at byte 0'
            : remote.split('/').pop() ?? remote
        console.log(`    ✓ ${remote} (${label})`)
      }
    }

    // Phase 4 — import
    if (flags.statusOnly) {
      result.phases.import = { ok: true, skipped: true, note: 'status-only run — action=status requested' }
      console.log('  Phase 4 · import — skipped (--status-only), querying status…')
    } else {
      console.log('  Phase 4 · import (JSON bridge — browser UA + challenge solver, json=1)…')
      const schemaStatements = await runSchemaImport(token)
      console.log(`    ✓ schema imported (${schemaStatements} statements)`)
      let dataImport: { statements: number; requests: number } | null = null
      if (flags.skipData) {
        console.log('    – data import skipped (--skip-data)')
      } else {
        dataImport = await runDataImport(token)
        console.log(`    ✓ data imported — ${dataImport.statements} statements across ${dataImport.requests} request(s)`)
      }
      result.phases.import = {
        ok: true,
        schemaStatements,
        dataStatements: dataImport?.statements ?? null,
        dataRequests: dataImport?.requests ?? null,
      }
    }

    const statusJson = await runStatusImport(token)
    result.server = statusJson.server
    result.tableCount = statusJson.tableCount
    console.log(`    ✓ status ok — ${statusJson.server ?? 'unknown server'}, ${statusJson.tableCount ?? '?'} tables`)

    // Phase 5 — verify
    console.log('  Phase 5 · verification (db/sqlite-manifest.json vs live MySQL counts)…')
    const verify = await runVerifyPhase(statusJson.tables ?? {}, mode)
    result.tables = verify.tables
    result.totals = verify.totals
    result.phases.verify = {
      ok: verify.ok,
      checked: verify.totals.checked,
      matched: verify.totals.matched,
      mismatched: verify.totals.mismatched,
      missingEmpty: verify.totals.missingEmpty,
      extra: verify.totals.extra,
    }

    const names = Object.keys(verify.tables)
    const width = Math.max(20, ...(names.length > 0 ? names.map((n) => n.length) : [0]))
    for (const [name, cmp] of Object.entries(verify.tables)) {
      const mark = cmp.status === 'match' ? '✓' : cmp.status === 'missing-empty' ? '·' : cmp.status === 'extra' ? '+' : '✗'
      const detail =
        cmp.status === 'match'
          ? mode === 'schema-only'
            ? `present (${cmp.actual} rows)`
            : `${cmp.expected} = ${cmp.actual}`
          : cmp.status === 'missing-empty'
            ? 'manifest 0 rows, absent on MySQL — OK'
            : cmp.status === 'extra'
              ? `MySQL only (${cmp.actual ?? '?'} rows) — implicit m2m table, not in the dump registry`
              : cmp.status === 'count-failed'
                ? `COUNT(*) failed on MySQL (expected ${cmp.expected})`
                : cmp.status === 'missing'
                  ? `MISSING (expected ${cmp.expected} rows)`
                  : `expected ${cmp.expected}, got ${cmp.actual}`
      console.log(`    ${mark} ${name.padEnd(width)} ${detail}`)
    }

    if (verify.mismatches.length > 0) {
      console.log(`    ✗ MISMATCHES (${verify.mismatches.length}):`)
      for (const m of verify.mismatches) console.log(`      ✗ ${m}`)
    }

    result.ok = verify.ok
    console.log('  ' + LINE)
    if (result.ok) {
      console.log(
        `  ✓ SYNC COMPLETE (${mode}) — ${verify.totals.matched}/${verify.totals.checked} tables verified, ${verify.totals.rowsOnMysql} rows on MySQL, ${verify.totals.mismatched} mismatches · ${Math.round((Date.now() - startedAt) / 1000)}s`,
      )
    } else {
      console.log(
        `  ✗ SYNC FAILED VERIFICATION — ${verify.totals.mismatched} table mismatch(es); ${verify.totals.matched}/${verify.totals.checked} verified`,
      )
      result.error = `${verify.totals.mismatched} table count mismatch(es): ${verify.mismatches.join('; ').slice(0, 500)}`
    }
  } catch (err) {
    result.ok = false
    result.error = err instanceof Error ? err.message : String(err)
    console.log(`  ✗ SYNC FAILED: ${result.error}`)
  }

  try {
    await writeFile(RESULT_PATH, JSON.stringify(result, null, 2) + '\n', 'utf8')
    console.log(`  (details: ${rel(RESULT_PATH)})`)
  } catch (err) {
    console.log(`  ⚠ could not write ${rel(RESULT_PATH)}: ${err instanceof Error ? err.message : String(err)}`)
  }
  console.log('')

  process.exit(result.ok ? 0 : 1)
}

main().catch((err) => {
  console.error('mysql-sync crashed:', err)
  process.exit(1)
})
