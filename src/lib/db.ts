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
// ── Connection-pool tuning (PERF-1, 10k-concurrent criterion) ───────────────
// Aiven Hobby tier: max_connections = 76 across ALL clients (this app + the
// WhatsApp mini-service + CLI scripts). Prisma's default pool is
// num_cpus*2+1 which (a) is unspecified on this box and (b) can overshoot the
// server ceiling when CPUs scale up. Pin the main app to a explicit, modest
// pool so thousands of concurrent requests QUEUE on checkout (pool_timeout)
// instead of exhausting the server. Headroom math: 15 (app) + 5 (bridge)
// + transient CLI ≈ 25 « 76.
const POOL_PARAMS =
  'connection_limit=15&pool_timeout=20&connect_timeout=15&socket_timeout=30'

function withPoolParams(url: string): string {
  if (!url.startsWith('mysql://')) return url
  if (url.includes('connection_limit=')) return url // already tuned (e.g. prod platform)
  return url + (url.includes('?') ? '&' : '?') + POOL_PARAMS
}

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
// Apply pool tuning AFTER the guard so both the restored .env URL and a
// platform-provided URL get the same bounded pool.
process.env.DATABASE_URL = withPoolParams(process.env.DATABASE_URL ?? '')

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
