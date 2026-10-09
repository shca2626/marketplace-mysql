/**
 * scripts/backup-db.ts — full logical backup of the live Aiven MySQL database.
 * Dumps every table to db/backups/<stamp>/<table>.json via SELECT *.
 * Read-only against the database; safe to run at any time.
 *
 * Usage: DATABASE_URL=<mysql url> bun scripts/backup-db.ts [--note "reason"]
 */
import { PrismaClient } from '@prisma/client'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

const db = new PrismaClient()
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const noteIdx = process.argv.indexOf('--note')
const note = noteIdx >= 0 ? process.argv[noteIdx + 1] ?? '' : ''
const outDir = join(process.cwd(), 'db', 'backups', stamp)

async function main() {
  mkdirSync(outDir, { recursive: true })
  const tables = (await db.$queryRawUnsafe(
    `SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name`
  )) as { t: string }[]

  let totalRows = 0
  const manifest: Record<string, number> = {}
  for (const { t } of tables) {
    const rows = (await db.$queryRawUnsafe(`SELECT * FROM \`${t}\``)) as unknown[]
    manifest[t] = rows.length
    totalRows += rows.length
    writeFileSync(join(outDir, `${t}.json`), JSON.stringify(rows, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 1))
  }
  writeFileSync(
    join(outDir, 'manifest.json'),
    JSON.stringify({ stamp, note, tables: tables.length, totalRows, manifest }, null, 2)
  )
  console.log(`backup complete: ${tables.length} tables, ${totalRows} rows -> ${outDir}`)
}

main()
  .catch((e) => {
    console.error('backup failed:', e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
