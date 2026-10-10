/**
 * scripts/db-push-guard.ts — safety wrapper around `prisma db push`.
 *
 * The live Aiven database intentionally carries 51 legacy tables and extra
 * columns from the pre-rollback implementation that prisma/schema.prisma does
 * not declare. A bare `prisma db push` would DROP all of them. This guard
 * previews the diff first and REFUSES to push when it contains any
 * DROP TABLE / DROP COLUMN / DROP INDEX statement.
 *
 * Usage: bun scripts/db-push-guard.ts   (package.json: bun run db:push)
 */
import { execSync } from 'child_process'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('[db-push-guard] DATABASE_URL is not set.')
  process.exit(1)
}

let script = ''
try {
  script = execSync(
    `npx prisma migrate diff --from-url "${url}" --to-schema-datamodel prisma/schema.prisma --script`,
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  )
} catch (e) {
  console.error('[db-push-guard] failed to compute the diff preview:', (e as Error).message)
  process.exit(1)
}

const destructive = script
  .split('\n')
  .filter((l) => /^\s*(DROP TABLE|DROP COLUMN|DROP INDEX|ALTER TABLE.*DROP)/i.test(l))

if (destructive.length > 0) {
  console.error('┌─────────────────────────────────────────────────────────────┐')
  console.error('│ db-push-guard: REFUSING — destructive changes detected       │')
  console.error('└─────────────────────────────────────────────────────────────┘')
  console.error(`The schema-vs-DB diff contains ${destructive.length} destructive statement(s):`)
  for (const d of destructive.slice(0, 60)) console.error('  ', d.trim())
  if (destructive.length > 60) console.error(`   … and ${destructive.length - 60} more`)
  console.error('')
  console.error('The live DB intentionally keeps 51 legacy tables + columns outside the')
  console.error('schema. Apply changes with the surgical scripts/migrate-*.ts instead,')
  console.error('or extend prisma/schema.prisma to adopt the objects you need.')
  process.exit(1)
}

console.log('[db-push-guard] diff is purely additive — running prisma db push…')
execSync('npx prisma db push', { stdio: 'inherit' })
