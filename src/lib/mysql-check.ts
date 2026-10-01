/**
 * Vendora — MySQL connectivity core (Aiven cloud MySQL 8.4).
 *
 * Shared by the CLI health check (scripts/mysql-check.ts), the one-shot data
 * migration (scripts/migrate-sqlite-to-mysql.ts) and the
 * /api/admin/stats?mysql=1 admin diagnostics branch.
 *
 * TARGET: the single managed Aiven MySQL service reached via the URL in .env:
 *   mysql://avnadmin:<password>@mysql-marketplace-sunsolar1.f.aivencloud.com:23363/defaultdb?ssl-mode=REQUIRED
 *
 * SSL is mandatory — Aiven rejects plaintext connections. Every connection in
 * this module is created with TLS enabled. The server certificate is NOT
 * verified against a pinned CA (that is exactly what ssl-mode=REQUIRED means
 * in MySQL semantics: encrypt, don't verify), so no CA bundle is required on
 * this host.
 *
 * Env resolution order:
 *   1. MYSQL_DATABASE_URL — takes precedence while a migration is in flight
 *   2. DATABASE_URL        — the normal state (the app's primary datasource)
 *
 * This module is server-side only (mysql2 + node:fs) and never logs — callers
 * decide how to present results.
 */
import { readFileSync } from 'fs'
import { createConnection, type Connection, type ConnectionOptions } from 'mysql2/promise'

// ── Constants ───────────────────────────────────────────────────────────────

const CONNECT_TIMEOUT_MS = 12_000

/** Error codes that mean "the server answered and said no" → terminal. */
const ACCESS_LEVEL_CODES = new Set([
  'ER_ACCESS_DENIED_ERROR', // 1045 — wrong user/password OR user@host not allowed
  'ER_HOST_NOT_PRIVILEGED', // 1130 — host not allowed to connect
  'ER_DBACCESS_DENIED_ERROR', // 1044 — no privileges on the database
  'ER_BAD_DB_ERROR', // 1049 — database does not exist on the server
  'ER_NOT_SUPPORTED_AUTH_MODE', // 1251 — auth plugin mismatch
  'ER_MUST_CHANGE_PASSWORD', // 1820
])

// ── Types ───────────────────────────────────────────────────────────────────

export interface MySqlEndpointAttempt {
  host: string
  resolvable: boolean | 'skipped' // kept for result-shape compatibility (single endpoint now)
  connected: boolean
  error?: { code: string; errno?: number; message: string }
}

export interface MySqlCheckResult {
  ok: boolean
  checkedAt: string // ISO timestamp
  durationMs: number
  endpointUsed?: string
  endpointsTried: MySqlEndpointAttempt[]
  server?: {
    version: string // expect MySQL 8.4.x on Aiven
    database: string
    currentUser: string
    characterSetServer: string
  }
  limits?: {
    maxAllowedPacketBytes: number
    waitTimeoutSec: number
    maxConnections: number
  }
  tableCount?: number
  tables?: string[]
  error?: { code: string; errno?: number; message: string; clientIpHint?: string }
  hint?: string
}

export interface MySqlConnectionConfig {
  user: string
  password: string
  database: string
  port: number
  preferredHost?: string
  source: 'env' | 'env-file' | 'url'
}

// ── .env fallback (bun run auto-loads .env; direct `bun scripts/x.ts` may not) ──

function envFromFile(key: string): string | undefined {
  try {
    const raw = readFileSync('.env', 'utf8')
    const m = raw.match(new RegExp(`^${key}="?([^"\\r\\n]*)"?$`, 'm'))
    return m?.[1] || undefined
  } catch {
    return undefined // no .env / unreadable — process.env is the only source
  }
}

function envVar(key: string): string | undefined {
  return process.env[key] ?? envFromFile(key)
}

// ── Config resolution ───────────────────────────────────────────────────────

/**
 * Resolve the MySQL connection config from .env.
 * MYSQL_DATABASE_URL wins (migration override); otherwise DATABASE_URL —
 * which must be a mysql:// URL (SQLite file: URLs are rejected with a clear
 * message instead of producing a confusing parse failure).
 */
export function resolveMySqlConfig(): MySqlConnectionConfig {
  const url = envVar('MYSQL_DATABASE_URL') || envVar('DATABASE_URL') || ''

  if (!url) {
    return { user: '', password: '', database: '', port: 3306, source: 'env' }
  }

  if (!url.startsWith('mysql://')) {
    // Only reachable while DATABASE_URL still points at the old SQLite file
    // and MYSQL_DATABASE_URL is unset — after the switchover this cannot happen.
    return { user: '', password: '', database: '', port: 3306, source: 'env' }
  }

  try {
    const u = new URL(url)
    return {
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace(/^\//, ''),
      port: u.port ? Number(u.port) : 3306,
      preferredHost: u.hostname,
      source: 'url',
    }
  } catch {
    return { user: '', password: '', database: '', port: 3306, source: 'env' }
  }
}

export function isMySqlConfigComplete(cfg: MySqlConnectionConfig): boolean {
  return Boolean(cfg.user && cfg.password && cfg.database)
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(onTimeout()), ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

interface MySqlErrorLike {
  code?: string
  errno?: number
  message?: string
  sqlMessage?: string
}

function toErrorInfo(err: unknown): { code: string; errno?: number; message: string } {
  const e = err as MySqlErrorLike
  return {
    code: e.code ?? 'UNKNOWN',
    errno: typeof e.errno === 'number' ? e.errno : undefined,
    message: e.sqlMessage ?? e.message ?? String(err),
  }
}

function isAccessLevel(err: unknown): boolean {
  return ACCESS_LEVEL_CODES.has(toErrorInfo(err).code)
}

/** For access errors, MySQL's message embeds 'user'@'clientIP' — surface the IP. */
function clientIpFromMessage(message: string): string | undefined {
  const m = /@'(\d{1,3}(?:\.\d{1,3}){3})'/.exec(message)
  return m?.[1]
}

// ── Connection helpers ──────────────────────────────────────────────────────

function connectionOptions(host: string, cfg: MySqlConnectionConfig): ConnectionOptions {
  return {
    host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    connectTimeout: CONNECT_TIMEOUT_MS,
    charset: 'UTF8MB4_UNICODE_CI', // match the utf8mb4 tables prisma db push creates
    // Aiven rejects plaintext connections — TLS is non-negotiable. Certificate
    // verification is disabled (ssl-mode=REQUIRED semantics): encrypt, don't
    // verify. Pin a CA bundle here only if verification is ever required.
    ssl: { rejectUnauthorized: false },
  }
}

export interface MySqlConnected {
  connection: Connection
  host: string
}

/**
 * Connect to the configured MySQL service (single Aiven endpoint — no fallback
 * chain). Kept under the historical export name `connectMySqlWithFallback` so
 * existing importers stay source-compatible.
 */
export async function connectMySqlWithFallback(
  cfg: MySqlConnectionConfig = resolveMySqlConfig(),
): Promise<MySqlConnected> {
  if (!isMySqlConfigComplete(cfg)) {
    throw Object.assign(
      new Error(
        'MySQL config incomplete — set DATABASE_URL to the Aiven mysql:// URL in .env',
      ),
      { code: 'CONFIG_MISSING' },
    )
  }

  const host = cfg.preferredHost ?? 'mysql-marketplace-sunsolar1.f.aivencloud.com'
  return { connection: await createConnection(connectionOptions(host, cfg)), host }
}

// ── The full check ──────────────────────────────────────────────────────────

async function runCheck(deadline: number): Promise<MySqlCheckResult> {
  const startedAt = Date.now()
  const checkedAt = new Date().toISOString()
  const endpointsTried: MySqlEndpointAttempt[] = []

  const base: MySqlCheckResult = { ok: false, checkedAt, durationMs: 0, endpointsTried }

  const cfg = resolveMySqlConfig()
  if (!isMySqlConfigComplete(cfg)) {
    return {
      ...base,
      durationMs: Date.now() - startedAt,
      error: {
        code: 'CONFIG_MISSING',
        message: 'MySQL credentials incomplete — expected DATABASE_URL to be the Aiven mysql:// URL in .env',
      },
      hint: 'Set DATABASE_URL (mysql://…@mysql-marketplace-sunsolar1.f.aivencloud.com:23363/defaultdb?ssl-mode=REQUIRED) in .env.',
    }
  }

  const host = cfg.preferredHost ?? 'mysql-marketplace-sunsolar1.f.aivencloud.com'
  let connection: Connection
  try {
    connection = await createConnection(connectionOptions(host, cfg))
    endpointsTried.push({ host, resolvable: true, connected: true })
  } catch (err) {
    const info = toErrorInfo(err)
    endpointsTried.push({ host, resolvable: true, connected: false, error: info })
    const clientIpHint = clientIpFromMessage(info.message)
    return {
      ...base,
      durationMs: Date.now() - startedAt,
      error: { ...info, clientIpHint },
      hint: isAccessLevel(err)
        ? 'The MySQL server answered but refused this client. Check the Aiven service is running and the credentials in .env are current (Aiven console → service → Users).'
        : 'Could not reach the Aiven MySQL service. Check the service URI/port in .env and that the Aiven service is powered on.',
    }
  }

  if (Date.now() > deadline) {
    try {
      await connection.end()
    } catch {
      /* already closing */
    }
    return { ...base, durationMs: Date.now() - startedAt, error: { code: 'CHECK_TIMEOUT', message: 'Check deadline exceeded' } }
  }

  // Connected — collect server facts, then close.
  try {
    const [serverRows] = await connection.query(
      'SELECT VERSION() AS version, DATABASE() AS database_, CURRENT_USER() AS currentUser, @@character_set_server AS charsetServer, @@max_allowed_packet AS maxAllowedPacket, @@wait_timeout AS waitTimeout, @@max_connections AS maxConnections',
    )
    const server = serverRows as unknown as Array<{
      version: string
      database_: string | null
      currentUser: string
      charsetServer: string
      maxAllowedPacket: number | string
      waitTimeout: number | string
      maxConnections: number | string
    }>

    const [tableRows] = await connection.query(
      'SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME',
    )
    const tables = (tableRows as unknown as Array<{ name: string }>).map((r) => r.name)

    await connection.end()

    const s = server[0]
    return {
      ok: true,
      checkedAt,
      durationMs: Date.now() - startedAt,
      endpointUsed: host,
      endpointsTried,
      server: {
        version: s?.version ?? 'unknown',
        database: s?.database_ ?? cfg.database,
        currentUser: s?.currentUser ?? 'unknown',
        characterSetServer: s?.charsetServer ?? 'unknown',
      },
      limits: {
        maxAllowedPacketBytes: Number(s?.maxAllowedPacket ?? 0),
        waitTimeoutSec: Number(s?.waitTimeout ?? 0),
        maxConnections: Number(s?.maxConnections ?? 0),
      },
      tableCount: tables.length,
      tables,
    }
  } catch (err) {
    try {
      await connection.end()
    } catch {
      /* already closing */
    }
    const info = toErrorInfo(err)
    return {
      ...base,
      durationMs: Date.now() - startedAt,
      endpointUsed: host,
      endpointsTried,
      error: info,
      hint: 'Connected, but the diagnostic queries failed — the MySQL user may lack information_schema privileges.',
    }
  }
}

/**
 * Run the full connectivity check. `timeoutMs` is a HARD overall deadline
 * (default 45s; the /api/admin/stats?mysql=1 branch passes 30s). On timeout
 * the returned result has ok=false + code CHECK_TIMEOUT.
 */
export async function checkMySqlServer(opts: { timeoutMs?: number } = {}): Promise<MySqlCheckResult> {
  const timeoutMs = opts.timeoutMs ?? 45_000
  const deadline = Date.now() + timeoutMs

  const work = runCheck(deadline)
  // never let a late loser rejection surface as unhandled after the race ends
  work.catch(() => {})

  return withTimeout<MySqlCheckResult>(
    work,
    timeoutMs,
    () => ({
      ok: false,
      checkedAt: new Date().toISOString(),
      durationMs: timeoutMs,
      endpointsTried: [],
      error: { code: 'CHECK_TIMEOUT', message: `Check did not finish within ${timeoutMs}ms` },
      hint: 'The Aiven endpoint is slow or hanging — retry, or raise the timeout.',
    }),
  )
}
