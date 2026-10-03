import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// ── SANDBOX-ENV GUARD ────────────────────────────────────────────────────────
// The dev sandbox supervisor exports a generic `DATABASE_URL=file:…/db/custom.db`
// (SQLite default) into every process it spawns. Process env shadows `.env`
// files, so that injection silently overrides the real datasource — this
// deployment's one-and-only database is the Aiven MySQL URL in `.env`
// (see worklog: "Aiven migration; never install a local database server").
// Restore `.env`'s value whenever the process env is missing or points at a
// `file:` SQLite path. No-op in real production, where DATABASE_URL is set
// correctly by the platform (and `.env` may not even exist — try/catch).
function restoreDatasourceUrlFromEnvFile(): void {
  const url = process.env.DATABASE_URL
  if (url && !url.startsWith('file:')) return
  try {
    const envFile = readFileSync(resolve(process.cwd(), '.env'), 'utf8')
    const match = envFile.match(/^DATABASE_URL=(mysql:\/\/.+)$/m)
    if (match) process.env.DATABASE_URL = match[1].trim()
  } catch {
    // No readable .env (e.g. standalone prod image) — keep whatever the
    // platform provided; Prisma will surface a clear validation error if it
    // is genuinely unusable.
  }
}

restoreDatasourceUrlFromEnvFile()

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
