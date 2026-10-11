/**
 * Vendora — SQLite → standalone SQL dump for the InfinityFree PHP import
 * bridge (BRIDGE-1).
 *
 *   bun run mysql:dump                        (package.json alias)
 *   bun scripts/dump-sqlite-to-sql.ts         (direct)
 *
 * SOURCE : the EXISTING @prisma/client (SQLite — generated from
 *          prisma/schema.prisma, pointed at DATABASE_URL in .env). Read-only:
 *          the running dev server and the SQLite file are untouched.
 * OUTPUT : db/vendora-mysql-data.sql — plain MySQL-dialect INSERT dump,
 *          db/sqlite-manifest.json — { generatedAt, tables: { name: rows } }.
 *
 * WHY A DUMP: InfinityFree blocks external MySQL, but PHP hosted ON their
 * platform can reach it — import.php (repo root) streams this file into the
 * remote database in resumable 512KB chunks. To make that possible:
 *
 *   - every statement is exactly ONE LINE (single \n-terminated line ending
 *     with ';') — values never contain raw newlines (they are escaped to the
 *     two characters \ + n), so a naive line reader can split perfectly;
 *   - rows are grouped into INSERT IGNORE statements capped at 500 rows OR
 *     ~750,000 characters, whichever comes first;
 *   - table order is FK-safe (registry below — same order as
 *     scripts/migrate-sqlite-to-mysql.ts), and the header disables FK and
 *     unique checks anyway;
 *   - no schema DDL — create the tables first (mysql:push or the
 *     vendora-mysql-schema.sql file imported via import.php phase=schema).
 *
 * Column names are derived dynamically from Object.keys() of the first row of
 * each table (Prisma returns every scalar field on every row; the schema has
 * no @map, so column = Prisma field name). Empty tables are skipped (no
 * INSERT) but still listed with 0 rows in the manifest.
 *
 * VALUE SERIALIZATION (MySQL literals):
 *   null → NULL · true/false → 1/0 · number → as-is ·
 *   Date → 'YYYY-MM-DD HH:MM:SS.SSS' (UTC, quoted) ·
 *   BigInt → unquoted decimal string (INT64) ·
 *   objects/arrays (Json fields) → JSON text, then string-escaped ·
 *   strings → MySQL backslash rules: \ ' " \n \r \0 \t escaped
 *   (after escaping no raw newline ever remains inside a value).
 *
 * Exit codes: 0 = success, 1 = failure.
 */
import { PrismaClient } from '@prisma/client'
import { appendFile, stat, writeFile } from 'fs/promises'
import { resolve } from 'path'

// ── Constants ────────────────────────────────────────────────────────────────

const BATCH_SIZE = 500 // rows fetched from SQLite per cursor page
const ROWS_PER_STATEMENT = 500 // statement cap: rows …
const CHARS_PER_STATEMENT = 750_000 // …or characters, whichever comes first
const SQL_PATH = resolve(process.cwd(), 'db/vendora-mysql-data.sql')
const MANIFEST_PATH = resolve(process.cwd(), 'db/sqlite-manifest.json')
const LINE = '─'.repeat(60)

// ── Model registry ───────────────────────────────────────────────────────────
// table = Prisma model name (no @@map in the schema — table = model, verbatim)
// prisma = delegate key on PrismaClient (lowerFirst)
// pk = primary key field used for stable cursor pagination
// ORDER = FK-safe (same registry as scripts/migrate-sqlite-to-mysql.ts —
// parents always precede children).
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

// ── Types ────────────────────────────────────────────────────────────────────

interface Delegate {
  count(): Promise<number>
  findMany(args: Record<string, unknown>): Promise<Record<string, unknown>[]>
}

// ── Value serialization (SQLite/Prisma JS → MySQL literal) ──────────────────

/**
 * MySQL string-literal escaping (backslash rules). The backslash is escaped
 * FIRST so the escapes this function inserts are never re-escaped themselves.
 * After escaping, no raw newline ever remains inside a value — every emitted
 * statement is exactly one line (the BRIDGE-1 import.php invariant).
 */
function escapeSqlString(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\0/g, '\\0')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
}

/** One Prisma cell value → one MySQL literal (see the table in the header). */
function serializeValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (typeof value === 'bigint') return value.toString() // INT64 — unquoted decimal
  if (typeof value === 'number') return String(value)
  if (value instanceof Date) {
    // UTC 'YYYY-MM-DD HH:MM:SS.SSS' — matches Prisma's MySQL DATETIME(3) storage
    return `'${value.toISOString().slice(0, 23).replace('T', ' ')}'`
  }
  if (typeof value === 'string') return `'${escapeSqlString(value)}'`
  // Json fields (objects/arrays) — and any other object-like value — become
  // JSON text, escaped with the same string rules. JSON.stringify output is
  // compact, so it never introduces raw newlines.
  let json: string
  try {
    json = JSON.stringify(value)
  } catch {
    json = String(value)
  }
  return `'${escapeSqlString(json)}'`
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const startedAt = Date.now()
  console.log('')
  console.log('  Vendora · SQLite → SQL dump (MySQL dialect · one statement per line)')
  console.log('  ' + LINE)

  const prisma = new PrismaClient({ log: ['error'] })
  const delegates = prisma as unknown as Record<string, Delegate | undefined>

  try {
    // Header — imported with FK/unique checks off, restored in the footer.
    await writeFile(SQL_PATH, 'SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\nSET UNIQUE_CHECKS=0;\n', 'utf8')

    const manifestTables: Record<string, number> = {}
    let totalRows = 0
    let totalStatements = 0
    const warnings: string[] = []

    for (const entry of REGISTRY) {
      const delegate = delegates[entry.prisma]
      if (!delegate) {
        throw new Error(
          `No Prisma delegate "${entry.prisma}" on the SQLite client — was the client generated from prisma/schema.prisma?`
        )
      }

      const tableStart = Date.now()
      const rowCount = await delegate.count()
      manifestTables[entry.table] = rowCount

      if (rowCount === 0) {
        console.log(`  • ${entry.table.padEnd(32)} ${'0'.padStart(6)} rows — skipped (empty)`)
        continue
      }

      // Column list derives from the first row actually fetched — Prisma
      // returns every scalar field on every row, so keys(rows[0]) is the full
      // column set for the table (schema has no @map: column = field name).
      let columns: string[] | null = null
      const statements: string[] = []
      let tupleBuffer: string[] = []
      let bufferChars = 0
      let statementCount = 0
      let rowsDumped = 0

      const flushStatement = (): void => {
        if (tupleBuffer.length === 0) return
        const cols = columns as string[]
        const colList = cols.map((c) => `\`${c}\``).join(',')
        statements.push(`INSERT IGNORE INTO \`${entry.table}\` (${colList}) VALUES ${tupleBuffer.join(',')};`)
        tupleBuffer = []
        bufferChars = 0
        statementCount += 1
      }

      // Cursor pagination keeps memory bounded on large tables (same pattern
      // as scripts/migrate-sqlite-to-mysql.ts).
      let cursor: unknown = null
      while (true) {
        const args: Record<string, unknown> = { orderBy: { [entry.pk]: 'asc' }, take: BATCH_SIZE }
        if (cursor !== null) {
          args.cursor = { [entry.pk]: cursor }
          args.skip = 1
        }
        const rows = await delegate.findMany(args)
        if (rows.length === 0) break
        if (columns === null) columns = Object.keys(rows[0])

        for (const row of rows) {
          const cols = columns as string[]
          const tuple = `(${cols.map((c) => serializeValue(row[c])).join(',')})`
          if (
            tupleBuffer.length > 0 &&
            (tupleBuffer.length >= ROWS_PER_STATEMENT ||
              bufferChars + tuple.length > CHARS_PER_STATEMENT)
          ) {
            flushStatement()
          }
          tupleBuffer.push(tuple)
          bufferChars += tuple.length
          rowsDumped += 1
        }

        // defensive: a null PK would restart the loop from offset 0 forever
        const nextCursor = rows[rows.length - 1][entry.pk]
        if (nextCursor === null || nextCursor === undefined) break
        cursor = nextCursor
        if (rows.length < BATCH_SIZE) break
      }
      flushStatement()

      if (rowsDumped !== rowCount) {
        warnings.push(
          `${entry.table}: count() said ${rowCount} rows but ${rowsDumped} were dumped — the database changed while dumping (dev server running?)`
        )
      }

      totalRows += rowsDumped
      totalStatements += statementCount
      await appendFile(SQL_PATH, statements.join('\n') + '\n', 'utf8')
      console.log(
        `  ✓ ${entry.table.padEnd(32)} ${String(rowsDumped).padStart(6)} rows · ${String(statementCount).padStart(4)} statement(s) · ${Date.now() - tableStart}ms`
      )
    }

    // Footer + manifest
    await appendFile(SQL_PATH, 'SET FOREIGN_KEY_CHECKS=1;\n', 'utf8')
    await writeFile(
      MANIFEST_PATH,
      JSON.stringify({ generatedAt: new Date().toISOString(), tables: manifestTables }, null, 2) + '\n',
      'utf8'
    )

    const sizeInfo = await stat(SQL_PATH)
    const manifestInfo = await stat(MANIFEST_PATH)
    const sizeKiB = Math.round(sizeInfo.size / 1024)

    console.log('  ' + LINE)
    console.log(
      `  Dump complete: ${REGISTRY.length} tables · ${totalRows} rows · ${totalStatements} statements · ${SQL_PATH} (${sizeKiB} KiB)`
    )
    console.log(`  Manifest: ${MANIFEST_PATH} (${Math.round(manifestInfo.size / 1024)} KiB) · ${Math.round(Date.now() - startedAt)}ms`)
    if (warnings.length > 0) {
      console.log('  Warnings:')
      for (const w of warnings) console.log(`    ⚠ ${w}`)
    }
    console.log('')

    await prisma.$disconnect()
    process.exit(0)
  } catch (err) {
    console.error(`\n  ✖ DUMP FAILED: ${err instanceof Error ? err.message : String(err)}\n`)
    await prisma.$disconnect().catch(() => undefined)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('dump-sqlite-to-sql crashed:', err)
  process.exit(1)
})
