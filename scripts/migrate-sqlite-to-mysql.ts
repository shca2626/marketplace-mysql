/**
 * Vendora — SQLite → MySQL data migration (one-shot, idempotent, read-only on
 * the SQLite side).
 *
 *   bun run mysql:migrate                      (package.json alias)
 *   bun scripts/migrate-sqlite-to-mysql.ts     (direct)
 *   bun scripts/migrate-sqlite-to-mysql.ts --dry-run
 *   bun scripts/migrate-sqlite-to-mysql.ts --tables=User,Category,Product
 *
 * SOURCE  : the EXISTING @prisma/client (SQLite — generated from
 *           prisma/schema.prisma, pointed at DATABASE_URL in .env). No new
 *           client is generated; the running dev server is untouched and the
 *           SQLite file is only ever READ.
 * TARGET  : mysql2 connection to MYSQL_DATABASE_URL using the endpoint
 *           fallback chain from src/lib/mysql-check.ts ($MYSQL_HOST if
 *           resolvable → sql301.byet.org → 185.27.134.24).
 *
 * TABLE ORDER (FK-safe):
 *   1. Primary: introspects information_schema.KEY_COLUMN_USAGE
 *      (REFERENCED_TABLE_NAME) of the TARGET schema and topologically sorts
 *      the tables (Kahn's algorithm, parents first).
 *   2. Fallback: the embedded FK_SAFE_ORDER below — the model dependency list
 *      derived from prisma/schema.prisma relations when schema.mysql.prisma
 *      was written (schema file order is NOT FK-safe: Order references
 *      Organization but is declared before it).
 *
 * WRITES: batched INSERT IGNORE (500 rows/batch) — idempotent, re-runnable,
 * duplicate primary/unique keys are skipped instead of failing.
 * TYPE CONVERSION: Date → 'YYYY-MM-DD HH:MM:SS.mmm' (UTC, MySQL DATETIME(3)),
 * Boolean → 1/0, Json/objects → JSON.stringify, BigInt → number-or-string,
 * Decimal → string, null respected.
 *
 * Output: per-table progress + summary on console, full result in
 * db/mysql-migrate-result.json (for shell-less sessions).
 * Exit codes: 0 = success, 1 = failure (see the result JSON for details).
 */
import { PrismaClient } from '@prisma/client'
import { writeFile } from 'fs/promises'
import { resolve } from 'path'
import type { Connection } from 'mysql2/promise'
import {
  connectMySqlWithFallback,
  isMySqlConfigComplete,
  resolveMySqlConfig,
} from '../src/lib/mysql-check'

// ── Constants ────────────────────────────────────────────────────────────────

const BATCH_SIZE = 500
const RESULT_PATH = resolve(process.cwd(), 'db/mysql-migrate-result.json')
const LINE = '─'.repeat(60)

// ── Model registry ───────────────────────────────────────────────────────────
// table = Prisma model name (no @@map in the schema — table = model, verbatim)
// prisma = delegate key on PrismaClient (lowerFirst)
// pk = primary key field used for stable cursor pagination
interface ModelEntry {
  table: string
  prisma: string
  pk: string
}

const REGISTRY: ModelEntry[] = [
  // ── level 0: no foreign keys ──
  { table: 'User', prisma: 'user', pk: 'id' },
  { table: 'Category', prisma: 'category', pk: 'id' },
  { table: 'Organization', prisma: 'organization', pk: 'id' },
  { table: 'CustomerGroup', prisma: 'customerGroup', pk: 'id' },
  { table: 'AuditLog', prisma: 'auditLog', pk: 'id' },
  { table: 'Sequence', prisma: 'sequence', pk: 'key' },
  { table: 'PlatformSetting', prisma: 'platformSetting', pk: 'key' },
  { table: 'BannerSlide', prisma: 'bannerSlide', pk: 'id' },
  { table: 'RfqSetting', prisma: 'rfqSetting', pk: 'id' },
  { table: 'Coupon', prisma: 'coupon', pk: 'id' },
  { table: 'ContactMessage', prisma: 'contactMessage', pk: 'id' }, // level 0 — no FKs
  // ── level 1 ──
  { table: 'Product', prisma: 'product', pk: 'id' }, // → Category, User
  { table: 'OrganizationMember', prisma: 'organizationMember', pk: 'id' }, // → Organization, User
  { table: 'PriceList', prisma: 'priceList', pk: 'id' }, // → Organization, CustomerGroup
  { table: 'Rfq', prisma: 'rfq', pk: 'id' }, // → User, Organization
  { table: 'Notification', prisma: 'notification', pk: 'id' }, // → User
  { table: 'NotificationDigest', prisma: 'notificationDigest', pk: 'id' }, // → User
  { table: 'UserDigestPref', prisma: 'userDigestPref', pk: 'userId' }, // → User
  { table: 'MediaAsset', prisma: 'mediaAsset', pk: 'id' }, // → User
  { table: 'RecurringRfq', prisma: 'recurringRfq', pk: 'id' }, // → User
  { table: 'Payout', prisma: 'payout', pk: 'id' }, // → User
  { table: 'SettingChange', prisma: 'settingChange', pk: 'id' }, // → User
  { table: 'FinancierProfile', prisma: 'financierProfile', pk: 'id' }, // → Organization
  { table: 'ConditionTemplate', prisma: 'conditionTemplate', pk: 'id' }, // → Organization, User
  // ── level 2 ──
  { table: 'Order', prisma: 'order', pk: 'id' }, // → User, Organization
  { table: 'ProductVariant', prisma: 'productVariant', pk: 'id' }, // → Product
  { table: 'Review', prisma: 'review', pk: 'id' }, // → Product, User
  { table: 'Favorite', prisma: 'favorite', pk: 'id' }, // → User, Product
  { table: 'PriceListEntry', prisma: 'priceListEntry', pk: 'id' }, // → PriceList, Product
  { table: 'RfqLine', prisma: 'rfqLine', pk: 'id' }, // → Rfq, Product
  { table: 'FinancierBranch', prisma: 'financierBranch', pk: 'id' }, // → FinancierProfile
  { table: 'FinancierService', prisma: 'financierService', pk: 'id' }, // → FinancierProfile
  { table: 'ConditionOption', prisma: 'conditionOption', pk: 'id' }, // → ConditionTemplate
  // ── level 3 ──
  { table: 'Dispute', prisma: 'dispute', pk: 'id' }, // → Order, User
  { table: 'Payment', prisma: 'payment', pk: 'id' }, // → Order, User
  { table: 'OrderItem', prisma: 'orderItem', pk: 'id' }, // → Order, Product, Payout
  { table: 'Quote', prisma: 'quote', pk: 'id' }, // → Rfq, User
  { table: 'RfqMessage', prisma: 'rfqMessage', pk: 'id' }, // → Rfq, User
  { table: 'FinancierServiceAttribute', prisma: 'financierServiceAttribute', pk: 'id' }, // → FinancierService
  { table: 'FinancierServiceCoverage', prisma: 'financierServiceCoverage', pk: 'id' }, // → FinancierService
  { table: 'ServiceRequirement', prisma: 'serviceRequirement', pk: 'id' }, // → FinancierService, ConditionTemplate
  { table: 'AccountDocument', prisma: 'accountDocument', pk: 'id' }, // → User, Organization, MediaAsset
  { table: 'FinancingRequest', prisma: 'financingRequest', pk: 'id' }, // → Organization, User, FinancierService
  { table: 'AccreditationRequest', prisma: 'accreditationRequest', pk: 'id' }, // → Organization, User, FinancierService
  // ── level 4 ──
  { table: 'FinancingOffer', prisma: 'financingOffer', pk: 'id' }, // → FinancingRequest, User
  { table: 'QuoteLine', prisma: 'quoteLine', pk: 'id' }, // → Quote, RfqLine, Product
  { table: 'ApprovalRequest', prisma: 'approvalRequest', pk: 'id' }, // → Organization, Order, Quote, User
  { table: 'RequestAttachment', prisma: 'requestAttachment', pk: 'id' }, // → AccountDocument
  { table: 'RequirementSubmission', prisma: 'requirementSubmission', pk: 'id' }, // → ServiceRequirement, FinancingRequest, AccreditationRequest, AccountDocument, User
  // ── level 5 ──
  { table: 'FinancingOfferInstallment', prisma: 'financingOfferInstallment', pk: 'id' }, // → FinancingOffer
  { table: 'FinancingAgreement', prisma: 'financingAgreement', pk: 'id' }, // → FinancingOffer
  // ── level 6 ──
  { table: 'FinancingEvent', prisma: 'financingEvent', pk: 'id' }, // → FinancingAgreement, User
  { table: 'FinancingFee', prisma: 'financingFee', pk: 'id' }, // → FinancingAgreement
]

// The FK-safe order above doubles as the fallback when information_schema
// introspection fails or finds a cycle.
const FK_SAFE_ORDER = REGISTRY.map((m) => m.table)

// ── Types ────────────────────────────────────────────────────────────────────

interface Delegate {
  count(): Promise<number>
  findMany(args: Record<string, unknown>): Promise<Record<string, unknown>[]>
}

interface TableResult {
  table: string
  model: string
  status: 'migrated' | 'dry-run' | 'skipped' | 'failed'
  sourceRows?: number
  insertedRows?: number
  targetRows?: number
  batches?: number
  durationMs?: number
  error?: string
}

interface MigrateResult {
  ok: boolean
  dryRun: boolean
  startedAt: string
  finishedAt: string
  durationMs: number
  endpointUsed?: string
  orderStrategy: 'information_schema-topological' | 'registry-fallback' | 'registry-fallback-cycle'
  tableOrder: string[]
  totals: { tables: number; rows: number; inserted: number }
  tables: TableResult[]
  warnings: string[]
  error?: string
}

// ── Value conversion (SQLite/Prisma JS → MySQL literal) ──────────────────────

function convertValue(value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (value instanceof Date) {
    // UTC 'YYYY-MM-DD HH:MM:SS.mmm' — matches Prisma's MySQL DATETIME(3) storage
    return value.toISOString().slice(0, 23).replace('T', ' ')
  }
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'bigint') {
    const n = Number(value)
    return Number.isSafeInteger(n) ? n : value.toString()
  }
  if (typeof value === 'number' || typeof value === 'string') return value
  // Decimal-like objects have toString(); Json/plain objects are stringified
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

// ── Topological sort (Kahn, registry order as tiebreak) ──────────────────────

function topoSort(
  present: string[],
  deps: Map<string, Set<string>>,
  preference: string[],
): { order: string[]; hadCycle: boolean } {
  const prefIndex = new Map(preference.map((t, i) => [t, i]))
  const remaining = new Set(present)
  // in-degree = distinct present parents not yet emitted
  const pending = new Map<string, Set<string>>()
  for (const t of present) {
    pending.set(t, new Set([...(deps.get(t) ?? [])].filter((p) => remaining.has(p))))
  }
  const order: string[] = []
  while (order.length < present.length) {
    let best: string | null = null
    let bestIdx = Infinity
    for (const t of remaining) {
      if ((pending.get(t)?.size ?? 0) === 0) {
        const idx = prefIndex.get(t) ?? Infinity
        if (idx < bestIdx) {
          best = t
          bestIdx = idx
        }
      }
    }
    if (best === null) break // cycle
    remaining.delete(best)
    order.push(best)
    for (const t of remaining) pending.get(t)?.delete(best)
  }
  if (remaining.size > 0) {
    // cycle → append the leftovers in registry order (INSERT IGNORE will
    // surface any genuine FK problem as an error with the table name)
    const leftovers = [...remaining].sort(
      (a, b) => (prefIndex.get(a) ?? Infinity) - (prefIndex.get(b) ?? Infinity),
    )
    return { order: [...order, ...leftovers], hadCycle: true }
  }
  return { order, hadCycle: false }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const startedAt = new Date()
  const dryRun = process.argv.includes('--dry-run')
  const tablesArg = process.argv.find((a) => a.startsWith('--tables='))
  const tablesFilter = tablesArg
    ? tablesArg.slice('--tables='.length).split(',').map((t) => t.trim()).filter(Boolean)
    : null

  const warnings: string[] = []
  const tableResults: TableResult[] = []
  const result: MigrateResult = {
    ok: false,
    dryRun,
    startedAt: startedAt.toISOString(),
    finishedAt: '',
    durationMs: 0,
    orderStrategy: 'registry-fallback',
    tableOrder: [],
    totals: { tables: 0, rows: 0, inserted: 0 },
    tables: tableResults,
    warnings,
  }

  const fail = async (error: string): Promise<void> => {
    result.ok = false
    result.error = error
    result.finishedAt = new Date().toISOString()
    result.durationMs = Date.now() - startedAt.getTime()
    try {
      await writeFile(RESULT_PATH, JSON.stringify(result, null, 2) + '\n', 'utf8')
    } catch {
      /* best effort */
    }
    console.error(`\n  ✖ MIGRATION FAILED: ${error}`)
    console.error(`  (details: ${RESULT_PATH})\n`)
    process.exit(1)
  }

  console.log('')
  console.log('  Vendora · SQLite → MySQL data migration' + (dryRun ? ' (DRY RUN)' : ''))
  console.log('  ' + LINE)

  // ── 1. MySQL target connection (endpoint fallback chain) ──
  const cfg = resolveMySqlConfig()
  if (!isMySqlConfigComplete(cfg)) {
    await fail('MySQL credentials incomplete — set MYSQL_DATABASE_URL (or MYSQL_USER/MYSQL_PASSWORD/MYSQL_DATABASE) in .env')
    return
  }

  // definite-assignment: every path that reaches their first use passes
  // through the try block below (the catch exits the process)
  let conn!: Connection
  let endpointUsed!: string
  try {
    const connected = await connectMySqlWithFallback(cfg)
    conn = connected.connection
    endpointUsed = connected.host
    result.endpointUsed = endpointUsed
    console.log(`  ✓ target: ${cfg.database} @ ${endpointUsed} (user ${cfg.user})`)
  } catch (err) {
    const e = err as { code?: string; errno?: number; message?: string; sqlMessage?: string }
    await fail(
      `MySQL connection failed [${e.code ?? 'UNKNOWN'}${e.errno ? ` errno ${e.errno}` : ''}]: ${e.sqlMessage ?? e.message ?? String(err)}`,
    )
    return
  }

  const prisma = new PrismaClient({ log: ['error'] })
  const delegates = prisma as unknown as Record<string, Delegate | undefined>

  try {
    // ── 2. Introspect the target schema ──
    const [tableRows] = await conn.query(
      'SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()',
    )
    // information_schema may report a different letter-case than the Prisma
    // model names (MariaDB hosts with lower_case_table_names=1 lowercase them;
    // SQL identifier matching itself is unaffected) — canonicalize every name
    // to its REGISTRY spelling; SQL built from REGISTRY names is always right.
    const canonical = new Map<string, string>() // lowercase table name → registry name
    for (const m of REGISTRY) canonical.set(m.table.toLowerCase(), m.table)

    const presentRaw = (tableRows as unknown as Array<{ name: string }>).map((r) => r.name)
    if (presentRaw.length === 0) {
      await fail(
        'The target MySQL schema has no tables — run `bun run mysql:push` first (see MYSQL-MIGRATION.md step 2)',
      )
      return
    }
    const presentTables: string[] = []
    const unknownTables: string[] = []
    for (const raw of presentRaw) {
      const canon = canonical.get(raw.toLowerCase())
      if (canon) presentTables.push(canon)
      else unknownTables.push(raw)
    }
    const present = new Set(presentTables)

    const registryMissing = REGISTRY.filter((m) => !present.has(m.table))
    if (registryMissing.length > 0) {
      warnings.push(
        `Registry models without a target table (skipped): ${registryMissing.map((m) => m.table).join(', ')}`,
      )
    }
    if (unknownTables.length > 0) {
      warnings.push(`Target tables with no Prisma model (not migrated): ${unknownTables.join(', ')}`)
    }

    // ── 3. FK graph → topological order (fallback: embedded registry order) ──
    let order: string[]
    let strategy: MigrateResult['orderStrategy']
    try {
      const [fkRows] = await conn.query(
        'SELECT TABLE_NAME AS tableName, REFERENCED_TABLE_NAME AS refTable FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL',
      )
      const deps = new Map<string, Set<string>>()
      for (const row of fkRows as unknown as Array<{ tableName: string; refTable: string }>) {
        const child = canonical.get(row.tableName.toLowerCase())
        const parent = canonical.get(row.refTable.toLowerCase())
        if (!child || !parent) continue
        const set = deps.get(child) ?? new Set<string>()
        set.add(parent)
        deps.set(child, set)
      }
      const sorted = topoSort(presentTables, deps, FK_SAFE_ORDER)
      order = sorted.order
      strategy = sorted.hadCycle ? 'registry-fallback-cycle' : 'information_schema-topological'
      if (sorted.hadCycle) {
        warnings.push('FK cycle detected in information_schema — leftover tables appended in registry order')
      }
    } catch (err) {
      warnings.push(
        `information_schema introspection failed (${err instanceof Error ? err.message : String(err)}) — using embedded FK-safe registry order`,
      )
      order = FK_SAFE_ORDER.filter((t) => present.has(t))
      strategy = 'registry-fallback'
    }
    result.orderStrategy = strategy

    // ── 4. Apply --tables filter ──
    if (tablesFilter) {
      const wanted = tablesFilter.map((t) => canonical.get(t.toLowerCase()))
      for (let i = 0; i < tablesFilter.length; i++) {
        if (!wanted[i]) await fail(`--tables: "${tablesFilter[i]}" is not a known model (see REGISTRY in scripts/migrate-sqlite-to-mysql.ts)`)
        if (!present.has(wanted[i] as string)) await fail(`--tables: "${tablesFilter[i]}" has no table in the target schema (run mysql:push first)`)
      }
      order = order.filter((t) => wanted.includes(t))
      warnings.push(`--tables filter active: only ${order.length} table(s) will be migrated`)
    }

    const migratable = order
      .map((t) => REGISTRY.find((m) => m.table === t))
      .filter((m): m is ModelEntry => Boolean(m))
    result.tableOrder = order

    console.log(`  ✓ target schema: ${presentTables.length} tables · order: ${strategy}`)
    console.log('  ' + LINE)

    // ── 5. Copy each table ──
    for (const entry of migratable) {
      const delegate = delegates[entry.prisma]
      if (!delegate) {
        tableResults.push({
          table: entry.table,
          model: entry.prisma,
          status: 'failed',
          error: `No Prisma delegate "${entry.prisma}" on the SQLite client — was the client generated from prisma/schema.prisma?`,
        })
        await fail(`Missing Prisma delegate for ${entry.table}`)
        return
      }

      const tableStart = Date.now()
      const sourceRows = await delegate.count()

      // target columns (ordinal order) — the INSERT column list.
      // LOWER() on both sides: on lower_case_table_names hosts information_schema
      // stores the lowercased name, on strict hosts the exact one.
      const [colRows] = await conn.query(
        'SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = ? ORDER BY ORDINAL_POSITION',
        [entry.table.toLowerCase()],
      )
      const cols = (colRows as unknown as Array<{ name: string }>).map((r) => r.name)
      if (cols.length === 0) {
        tableResults.push({
          table: entry.table,
          model: entry.prisma,
          status: 'failed',
          error: 'No columns found in information_schema.COLUMNS',
        })
        await fail(`Target table ${entry.table} has no columns — was db push incomplete?`)
        return
      }

      if (dryRun) {
        tableResults.push({
          table: entry.table,
          model: entry.prisma,
          status: 'dry-run',
          sourceRows,
          batches: Math.ceil(sourceRows / BATCH_SIZE),
          durationMs: Date.now() - tableStart,
        })
        console.log(`  • ${entry.table.padEnd(32)} ${String(sourceRows).padStart(6)} rows (dry run — no writes)`)
        continue
      }

      // batched cursor pagination over the SQLite source, INSERT IGNORE batches
      const colList = cols.map((c) => `\`${c}\``).join(', ')
      const insertSql = `INSERT IGNORE INTO \`${entry.table}\` (${colList}) VALUES ?`

      let cursor: string | null = null
      let batches = 0
      let inserted = 0
      let warnedExtraKeys = false

      while (true) {
        const args: Record<string, unknown> = { orderBy: { [entry.pk]: 'asc' }, take: BATCH_SIZE }
        if (cursor !== null) {
          args.cursor = { [entry.pk]: cursor }
          args.skip = 1
        }
        const rows = await delegate.findMany(args)
        if (rows.length === 0) break

        if (!warnedExtraKeys && batches === 0) {
          const extra = Object.keys(rows[0]).filter((k) => !cols.includes(k))
          if (extra.length > 0) {
            warnings.push(`${entry.table}: source fields not in target columns (ignored): ${extra.join(', ')}`)
          }
          warnedExtraKeys = true
        }

        const values = rows.map((row) => cols.map((c) => convertValue(row[c])))
        try {
          const [res] = await conn.query(insertSql, [values])
          inserted += (res as unknown as { affectedRows?: number }).affectedRows ?? 0
        } catch (err) {
          const e = err as { code?: string; errno?: number; message?: string; sqlMessage?: string }
          tableResults.push({
            table: entry.table,
            model: entry.prisma,
            status: 'failed',
            sourceRows,
            insertedRows: inserted,
            batches,
            durationMs: Date.now() - tableStart,
            error: `[${e.code ?? 'UNKNOWN'}${e.errno ? ` errno ${e.errno}` : ''}] ${e.sqlMessage ?? e.message ?? String(err)}`,
          })
          await fail(
            `INSERT into ${entry.table} failed [${e.code ?? 'UNKNOWN'}]: ${e.sqlMessage ?? e.message ?? String(err)} — see db/mysql-migrate-result.json`,
          )
          return
        }
        batches += 1
        // defensive: a null PK would restart the loop from offset 0 forever
        const nextCursor = rows[rows.length - 1][entry.pk]
        if (nextCursor === null || nextCursor === undefined) break
        cursor = nextCursor as string
        if (rows.length < BATCH_SIZE) break
      }

      // verify with a target-side count
      let targetRows: number | undefined
      try {
        const [countRows] = await conn.query(`SELECT COUNT(*) AS c FROM \`${entry.table}\``)
        targetRows = Number((countRows as unknown as Array<{ c: number | string }>)[0]?.c ?? 0)
      } catch {
        targetRows = undefined
      }

      tableResults.push({
        table: entry.table,
        model: entry.prisma,
        status: 'migrated',
        sourceRows,
        insertedRows: inserted,
        targetRows,
        batches,
        durationMs: Date.now() - tableStart,
      })
      console.log(
        `  ✓ ${entry.table.padEnd(32)} ${String(sourceRows).padStart(6)} rows · ${batches} batch(es) · ${inserted} inserted · target now ${targetRows ?? '?'}`,
      )
    }

    // ── 6. Summary + result JSON ──
    const totals = tableResults.reduce(
      (acc, t) => ({
        tables: acc.tables + (t.status === 'migrated' || t.status === 'dry-run' ? 1 : 0),
        rows: acc.rows + (t.sourceRows ?? 0),
        inserted: acc.inserted + (t.insertedRows ?? 0),
      }),
      { tables: 0, rows: 0, inserted: 0 },
    )
    result.totals = totals
    result.ok = true
    result.finishedAt = new Date().toISOString()
    result.durationMs = Date.now() - startedAt.getTime()

    try {
      await writeFile(RESULT_PATH, JSON.stringify(result, null, 2) + '\n', 'utf8')
    } catch (err) {
      warnings.push(`Could not write ${RESULT_PATH}: ${err instanceof Error ? err.message : String(err)}`)
    }

    console.log('  ' + LINE)
    console.log(
      `  ${dryRun ? 'DRY RUN complete' : 'Migration complete'}: ${totals.tables} tables · ${totals.rows} source rows` +
        (dryRun ? '' : ` · ${totals.inserted} inserted`) +
        ` · endpoint ${endpointUsed} · order ${strategy}`,
    )
    if (warnings.length > 0) {
      console.log('  Warnings:')
      for (const w of warnings) console.log(`    ⚠ ${w}`)
    }
    console.log(`  (full details: ${RESULT_PATH})`)
    console.log('')

    await prisma.$disconnect()
    await conn.end()
    process.exit(0)
  } catch (err) {
    const e = err as { code?: string; message?: string; sqlMessage?: string }
    await prisma.$disconnect().catch(() => undefined)
    try {
      await conn.end()
    } catch {
      /* already closing */
    }
    await fail(`Unexpected error [${e.code ?? 'UNKNOWN'}]: ${e.sqlMessage ?? e.message ?? String(err)}`)
  }
}

main().catch(async (err) => {
  console.error('migrate-sqlite-to-mysql crashed:', err)
  process.exit(1)
})
