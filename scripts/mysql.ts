/**
 * Vendora — Aiven MySQL utilities.
 * SQLite stays the app default until flipped via `bun run db:use-mysql`.
 *
 * Usage:
 *   bun run mysql:check    — connectivity, version, tables, row counts, RTT
 *   bun run mysql:migrate  — copy ALL data from SQLite → MySQL (destructive on the MySQL side)
 *   bun run mysql:verify   — row-count parity + deep spot checks between SQLite and MySQL
 *
 * Env (see .env): MYSQL_HOST / MYSQL_PORT / MYSQL_USER / MYSQL_PASSWORD /
 * MYSQL_DATABASE / DATABASE_URL (must be the SQLite file: URL for
 * migrate & verify, since SQLite is the read source).
 */
import mysql from 'mysql2/promise'
import { PrismaClient } from '@prisma/client'

type Delegate =
  | 'user'
  | 'category'
  | 'product'
  | 'order'
  | 'orderItem'
  | 'review'
  | 'favorite'

// Insert/read order — parents first, then children (FK safety).
const TABLES: { table: string; delegate: Delegate }[] = [
  { table: 'User', delegate: 'user' },
  { table: 'Category', delegate: 'category' },
  { table: 'Product', delegate: 'product' },
  { table: 'Order', delegate: 'order' },
  { table: 'OrderItem', delegate: 'orderItem' },
  { table: 'Review', delegate: 'review' },
  { table: 'Favorite', delegate: 'favorite' },
]

const env = (k: string, d = '') => process.env[k] ?? d

// TLS encrypted; sandbox cannot resolve ssl.aiven.io to fetch the Aiven CA
// cert, so the chain is not pinned (matches Prisma sslaccept setting).
function mysqlOpts() {
  return {
    host: env('MYSQL_HOST'),
    port: Number(env('MYSQL_PORT', '23363')),
    user: env('MYSQL_USER'),
    password: env('MYSQL_PASSWORD'),
    database: env('MYSQL_DATABASE', 'defaultdb'),
    ssl: { rejectUnauthorized: false },
    timezone: 'Z' as const, // treat DATETIME as UTC (Prisma convention)
  }
}

type Countable = { count: () => Promise<number> }
type Findable = { findMany: () => Promise<Record<string, unknown>[]> }

function toSqlValue(v: unknown): unknown {
  if (typeof v === 'boolean') return v ? 1 : 0
  if (v instanceof Date) return v // mysql2 serializes Date (UTC via timezone: 'Z')
  return v
}

function requireSqliteActive(): boolean {
  if (!env('APP_DATABASE_URL', '').startsWith('file:')) {
    console.error(
      '✖ APP_DATABASE_URL is not the SQLite file — run `bun run db:use-sqlite` first\n' +
        '  (SQLite must be the active/read source for this command).'
    )
    return false
  }
  return true
}

// ── check ────────────────────────────────────────────────────────────
async function cmdCheck() {
  const t0 = Date.now()
  const conn = await mysql.createConnection(mysqlOpts())
  const connectMs = Date.now() - t0

  const [ver] = await conn.query<mysql.RowDataPacket[]>(
    'SELECT VERSION() as v, NOW() as now'
  )
  console.log(`✔ connected in ${connectMs}ms — MySQL ${ver[0].v}, server time ${ver[0].now}`)

  const [tables] = await conn.query<mysql.RowDataPacket[]>('SHOW TABLES')
  const names = tables.map((r) => String(Object.values(r)[0]))
  if (names.length === 0) {
    console.log('• no tables yet — create them with: bun run mysql:push')
  } else {
    for (const t of names) {
      const [c] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT COUNT(*) as n FROM \`${t}\``
      )
      console.log(`  ${t.padEnd(12)} ${String(c[0].n)} rows`)
    }
  }

  const lat: number[] = []
  for (let i = 0; i < 5; i++) {
    const s = Date.now()
    await conn.query('SELECT 1')
    lat.push(Date.now() - s)
  }
  const avg = Math.round(lat.reduce((a, b) => a + b, 0) / lat.length)
  console.log(
    `• query RTT over 5 pings: min ${Math.min(...lat)}ms / avg ${avg}ms / max ${Math.max(...lat)}ms`
  )
  await conn.end()
}

// ── migrate ──────────────────────────────────────────────────────────
async function cmdMigrate() {
  if (!requireSqliteActive()) process.exit(1)
  const prisma = new PrismaClient()
  const conn = await mysql.createConnection(mysqlOpts())
  const t0 = Date.now()

  try {
    await conn.query('SET FOREIGN_KEY_CHECKS=0')
    for (const { table, delegate } of TABLES) {
      const rows = await (prisma[delegate] as unknown as Findable).findMany()
      await conn.query(`TRUNCATE TABLE \`${table}\``)
      if (rows.length === 0) {
        console.log(`• ${table.padEnd(12)} 0 rows (cleared)`)
        continue
      }
      const cols = Object.keys(rows[0])
      const chunk = 50
      for (let i = 0; i < rows.length; i += chunk) {
        const slice = rows.slice(i, i + chunk)
        const placeholders = slice.map(() => `(${cols.map(() => '?').join(',')})`).join(',')
        const values = slice.flatMap((r) => cols.map((c) => toSqlValue(r[c])))
        await conn.execute(
          `INSERT INTO \`${table}\` (${cols.map((c) => `\`${c}\``).join(',')}) VALUES ${placeholders}`,
          values
        )
      }
      console.log(`• ${table.padEnd(12)} ${rows.length} rows copied`)
    }
    await conn.query('SET FOREIGN_KEY_CHECKS=1')
    console.log(`✔ migration finished in ${Date.now() - t0}ms — verify with: bun run mysql:verify`)
  } finally {
    await conn.end()
    await prisma.$disconnect()
  }
}

// ── verify ───────────────────────────────────────────────────────────
async function cmdVerify() {
  if (!requireSqliteActive()) process.exit(1)
  const prisma = new PrismaClient()
  const conn = await mysql.createConnection(mysqlOpts())
  let ok = true

  try {
    console.log('model        sqlite  mysql   match')
    for (const { table, delegate } of TABLES) {
      const nSqlite = await (prisma[delegate] as unknown as Countable).count()
      const [r] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT COUNT(*) as n FROM \`${table}\``
      )
      const nMysql = Number(r[0].n)
      const match = nSqlite === nMysql
      if (!match) ok = false
      console.log(
        `${table.padEnd(12)} ${String(nSqlite).padStart(6)}  ${String(nMysql).padStart(5)}   ${match ? '✓' : '✗ MISMATCH'}`
      )
    }

    // Deep spot-check: oldest product, compare every scalar field incl. dates.
    const p = await prisma.product.findFirst({ orderBy: { createdAt: 'asc' } })
    if (p) {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT * FROM `Product` WHERE `id` = ?',
        [p.id]
      )
      const m = rows[0] as Record<string, unknown> | undefined
      const checks: [string, boolean][] = m
        ? [
            ['id', m.id === p.id],
            ['title', m.title === p.title],
            ['description', m.description === p.description],
            ['price', Number(m.price) === p.price],
            ['compareAtPrice', (m.compareAtPrice == null) === (p.compareAtPrice == null) && (m.compareAtPrice == null || Number(m.compareAtPrice) === p.compareAtPrice)],
            ['images', m.images === p.images],
            ['categoryId', m.categoryId === p.categoryId],
            ['sellerId', m.sellerId === p.sellerId],
            ['stock', Number(m.stock) === p.stock],
            ['soldCount', Number(m.soldCount) === p.soldCount],
            ['rating', Number(m.rating) === p.rating],
            ['reviewCount', Number(m.reviewCount) === p.reviewCount],
            ['featured', Number(m.featured) === (p.featured ? 1 : 0)],
            ['status', m.status === p.status],
            ['createdAt', new Date(m.createdAt as string).getTime() === p.createdAt.getTime()],
            ['updatedAt', new Date(m.updatedAt as string).getTime() === p.updatedAt.getTime()],
          ]
        : []
      const failed = checks.filter(([, pass]) => !pass).map(([n]) => n)
      if (!m || failed.length > 0) ok = false
      console.log(
        `spot-check Product ${p.id}: ${!m ? '✗ row missing' : failed.length === 0 ? '✓ all 16 fields identical' : '✗ diff in ' + failed.join(', ')}`
      )
    }

    console.log(
      ok
        ? '✔ PARITY OK — MySQL is in sync. Flip the app with: bun run db:use-mysql'
        : '✗ parity FAILED — inspect and re-run: bun run mysql:migrate'
    )
    process.exitCode = ok ? 0 : 1
  } finally {
    await conn.end()
    await prisma.$disconnect()
  }
}

// ── main ─────────────────────────────────────────────────────────────
const cmd = process.argv[2]
const commands: Record<string, () => Promise<void>> = {
  check: cmdCheck,
  migrate: cmdMigrate,
  verify: cmdVerify,
}
if (!cmd || !commands[cmd]) {
  console.error('Usage: bun run scripts/mysql.ts <check|migrate|verify>')
  process.exit(1)
}
commands[cmd]().catch((err) => {
  console.error('✖', err instanceof Error ? err.message : err)
  process.exit(1)
})
