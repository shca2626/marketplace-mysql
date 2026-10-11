/**
 * One-off WEBP→PNG rendition migration (2026-09-29).
 * The public hosting (InfinityFree) serves classic image extensions
 * (.png/.jpg/.gif) without the anti-bot challenge, but challenge-walls
 * .webp — so the rendition pipeline switched to PNG (see renditionKey).
 * This migrates existing data:
 *   1. Backs up db/custom.db → db/custom.db.bak-webp-migration
 *   2. Converts every .webp file under uploads/ to .png (sharp, same base name)
 *   3. Rewrites every text column in SQLite: '.webp' → '.png'
 * Existing .webp files are KEPT until --cleanup is passed (deletes them
 * after the new .png files are verified). Idempotent: re-running is a no-op.
 */
import sharp from 'sharp'
import { Database } from 'bun:sqlite'
import { readdirSync, statSync, copyFileSync, existsSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const DB_PATH = 'db/custom.db'
const BACKUP_PATH = 'db/custom.db.bak-webp-migration'
const CLEANUP = process.argv.includes('--cleanup')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

async function convertFiles(): Promise<{ converted: number; kept: number }> {
  const webpFiles = walk('uploads').filter((f) => f.endsWith('.webp'))
  let converted = 0
  let kept = 0
  for (const f of webpFiles) {
    const pngPath = f.replace(/\.webp$/, '.png')
    if (existsSync(pngPath)) {
      kept++
      continue
    }
    await sharp(f).png({ compressionLevel: 9 }).toFile(pngPath)
    converted++
    console.log(`  ✓ ${relative('uploads', f).split(sep).join('/')} → .png`)
  }
  return { converted, kept }
}

function rewriteDb(): { tables: number; columns: [string, string, number][] } {
  const db = new Database(DB_PATH)
  const tables = (
    db.query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]
  ).map((r) => r.name)

  const touched: [string, string, number][] = []
  for (const table of tables) {
    const cols = db.query(`PRAGMA table_info("${table}")`).all() as { name: string; type: string }[]
    for (const col of cols) {
      const t = (col.type || '').toUpperCase()
      if (t && !['TEXT', 'VARCHAR', 'CHAR', 'CLOB', 'NVARCHAR', 'STRING'].includes(t)) continue
      const res = db
        .query(
          `UPDATE "${table}" SET "${col.name}" = REPLACE("${col.name}", '.webp', '.png') ` +
            `WHERE "${col.name}" IS NOT NULL AND "${col.name}" LIKE '%.webp%'`,
        )
        .run()
      if (res.changes > 0) {
        touched.push([table, col.name, Number(res.changes)])
        console.log(`  ✓ ${table}.${col.name}: ${res.changes} row(s) rewritten`)
      }
    }
  }
  db.close()
  return { tables: tables.length, columns: touched }
}

async function main() {
  console.log('WEBP → PNG migration')
  if (!existsSync(BACKUP_PATH)) {
    copyFileSync(DB_PATH, BACKUP_PATH)
    console.log(`  ✓ DB backup → ${BACKUP_PATH}`)
  } else {
    console.log(`  • backup already exists (${BACKUP_PATH})`)
  }

  console.log('Phase 1 — convert rendition files:')
  const { converted, kept } = await convertFiles()
  console.log(`  ${converted} converted, ${kept} already present as .png`)

  console.log('Phase 2 — rewrite DB text columns:')
  const { tables, columns } = rewriteDb()
  const totalRows = columns.reduce((s, [, , n]) => s + n, 0)
  console.log(`  scanned ${tables} tables · ${columns.length} column(s) touched · ${totalRows} row(s) rewritten`)

  if (CLEANUP) {
    console.log('Phase 3 — cleanup: remove local .webp originals')
    let removed = 0
    for (const f of walk('uploads').filter((x) => x.endsWith('.webp'))) {
      unlinkSync(f)
      removed++
    }
    console.log(`  ${removed} .webp file(s) removed (DB backup retained at ${BACKUP_PATH})`)
  } else {
    console.log('(.webp originals kept — run with --cleanup after verifying the .png uploads)')
  }

  writeFileSync(
    'db/webp-png-migration-result.json',
    JSON.stringify({ ranAt: new Date().toISOString(), converted, kept, tables, columns, cleanup: CLEANUP }, null, 2),
  )
  console.log('Done. Details: db/webp-png-migration-result.json')
}

main().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
