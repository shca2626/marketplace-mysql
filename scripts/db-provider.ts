/**
 * Vendora — flip the active database provider (Aiven MySQL ⇄ SQLite rollback).
 *
 * Usage:
 *   bun run db:use-mysql   → app runs on Aiven MySQL 8.4 (primary)
 *   bun run db:use-sqlite   → emergency rollback to the local SQLite snapshot
 *
 * What it does:
 *   1. prisma/schema.prisma → datasource provider rewritten to <target>
 *      • leaving mysql  → pristine typed schema saved to prisma/schema.mysql.bak.prisma
 *      • entering mysql → restores the typed backup if present
 *      • entering sqlite → strips MySQL native types (@db.VarChar/@db.Text)
 *        so the sqlite provider validates (SQLite rejects MySQL native types).
 *   2. .env → APP_DATABASE_URL = SQLITE_URL / MYSQL_URL, DB_PROVIDER = <target>
 *   3. bunx prisma generate → regenerates @prisma/client for <target>
 *
 * Afterwards RESTART the dev server (kill it, then `setsid bun run dev &`).
 * NOTE: the SQLite snapshot is a frozen backup — data created while on MySQL
 * lives in MySQL only. Flipping back LOSES those rows.
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync, rmSync } from 'fs'
import { spawnSync } from 'child_process'

const target = process.argv[2]
if (target !== 'mysql' && target !== 'sqlite') {
  console.error('Usage: bun run scripts/db-provider.ts <mysql|sqlite>')
  process.exit(1)
}
const from = target === 'mysql' ? 'sqlite' : 'mysql'

const SCHEMA = 'prisma/schema.prisma'
const TYPED_BACKUP = 'prisma/schema.mysql.bak.prisma'

const stripNativeTypes = (s: string) =>
  s
    .replace(/@db\.VarChar(\(\d+\))?\s*/g, '')
    .replace(/@db\.Text\s*/g, '')

// 1) prisma/schema.prisma — provider rewrite (+ typed-schema backup round-trip)
let schema = readFileSync(SCHEMA, 'utf8')
if (schema.includes(`provider = "${target}"`)) {
  console.log(`• schema.prisma already on ${target}`)
} else if (!schema.includes(`provider = "${from}"`)) {
  console.error(`✖ expected datasource provider = "${from}" not found in ${SCHEMA}`)
  process.exit(1)
} else {
  if (from === 'mysql') {
    // save the pristine typed schema so a later flip back is lossless
    copyFileSync(SCHEMA, TYPED_BACKUP)
    console.log(`• saved typed schema backup → ${TYPED_BACKUP}`)
  }
  if (target === 'mysql') {
    if (existsSync(TYPED_BACKUP)) {
      copyFileSync(TYPED_BACKUP, SCHEMA)
      schema = readFileSync(SCHEMA, 'utf8')
      console.log(`• restored typed schema from ${TYPED_BACKUP}`)
      // remove the backup copy to avoid it drifting from the live schema
      rmSync(TYPED_BACKUP)
    } else {
      console.log('⚠ no typed backup found — keeping schema as-is (may lack @db types)')
    }
  }
  if (!schema.includes(`provider = "${target}"`)) {
    let next = schema.replace(`provider = "${from}"`, `provider = "${target}"`)
    if (target === 'sqlite') {
      next = stripNativeTypes(next)
      console.log('• stripped MySQL native types (sqlite compatibility)')
    }
    writeFileSync(SCHEMA, next)
  } else {
    writeFileSync(SCHEMA, schema)
  }
  console.log(`• schema.prisma: provider ${from} → ${target}`)
}

// 2) .env — APP_DATABASE_URL + DB_PROVIDER
//    (APP_DATABASE_URL, not DATABASE_URL: the platform shell exports
//     DATABASE_URL=<sqlite file> which would override .env in processes
//     spawned from that shell.)
const srcUrl = target === 'mysql' ? process.env.MYSQL_URL : process.env.SQLITE_URL
if (!srcUrl) {
  console.error(`✖ ${target === 'mysql' ? 'MYSQL_URL' : 'SQLITE_URL'} missing in .env — aborting`)
  process.exit(1)
}
const envPath = '.env'
const raw = existsSync(envPath) ? readFileSync(envPath, 'utf8') : ''
const setVar = (content: string, key: string, value: string): string => {
  const line = `${key}="${value.replace(/"/g, '\\"')}"`
  const re = new RegExp(`^${key}=.*$`, 'm')
  return re.test(content) ? content.replace(re, line) : content.trimEnd() + '\n' + line + '\n'
}
let envContent = setVar(raw, 'APP_DATABASE_URL', srcUrl)
envContent = setVar(envContent, 'DB_PROVIDER', target)
writeFileSync(envPath, envContent)
console.log(`• .env: APP_DATABASE_URL → ${target} URL, DB_PROVIDER=${target}`)

// 3) regenerate the Prisma client for the target provider
console.log(`• prisma generate (${target})…`)
const gen = spawnSync('bunx', ['prisma', 'generate'], { stdio: 'inherit' })
if (gen.status !== 0) {
  console.error('✖ prisma generate failed — fix the error above and re-run this script.')
  process.exit(1)
}

console.log(
  target === 'mysql'
    ? '✔ App is now configured for Aiven MySQL. Restart the dev server (kill it, then: setsid bun run dev &).'
    : '✔ App is back on SQLite (frozen snapshot — MySQL-only data is NOT here). Restart the dev server (kill it, then: setsid bun run dev &).'
)
