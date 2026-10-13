import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'
import { join } from 'path'

// ─────────────────────────────────────────────────────────────────────────────
// Datasource self-heal (scripts/with-env.sh policy, applied to the app).
//
// The sandbox supervisor exports DATABASE_URL=file:…custom.db (SQLite) into
// every spawned shell, and process env SHADOWS .env files — so a mysql-backed
// Prisma client can receive a SQLite URL and every query fails at runtime.
// If the inherited URL is not mysql://, fall back to the DATABASE_URL in the
// project .env (the one true database — Aiven MySQL, per AIVEN-1).
// ─────────────────────────────────────────────────────────────────────────────

function resolveDatabaseUrl(): string | undefined {
  const envUrl = process.env.DATABASE_URL
  if (envUrl && envUrl.startsWith('mysql://')) return envUrl
  try {
    const dotEnv = readFileSync(join(process.cwd(), '.env'), 'utf8')
    const match = dotEnv.match(/^DATABASE_URL=(.+)$/m)
    const fromFile = match?.[1]?.trim()
    if (fromFile && fromFile.startsWith('mysql://')) return fromFile
  } catch {
    // no readable .env — keep whatever the process inherited
  }
  return envUrl
}

const databaseUrl = resolveDatabaseUrl()

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error'],
    ...(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : {}),
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
