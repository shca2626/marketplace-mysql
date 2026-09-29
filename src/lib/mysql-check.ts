/**
 * Vendora — Remote MySQL (InfinityFree / byet.org MariaDB) connectivity core.
 * Shared by scripts/mysql-check.ts (CLI), scripts/migrate-sqlite-to-mysql.ts
 * (data migration) and the /api/admin/stats?mysql=1 admin diagnostics branch.
 *
 * ENDPOINT FALLBACK CHAIN (why it exists):
 *   .env carries MYSQL_HOST=sql301.infinityfree.com — that hostname has NO
 *   public DNS record (verified via dns.google, see worklog PRODENV-1). The
 *   reachable endpoints for the same InfinityFree MySQL server are:
 *     1. $MYSQL_HOST (or the MYSQL_DATABASE_URL host) — only if it resolves
 *     2. sql301.byet.org        — the byet.org alias that DOES resolve
 *     3. 185.27.134.24          — the IP behind it (always "resolvable")
 *   The chain advances only on connection-level failures (DNS / TCP). An
 *   auth/access error (ER_ACCESS_DENIED_ERROR, ER_HOST_NOT_PRIVILEGED, …) means
 *   the server itself answered, so the failure is terminal — reported with the
 *   exact MySQL error code + message, which for access errors includes the
 *   client IP that must be whitelisted in the InfinityFree Remote MySQL panel.
 *
 * This module is server-side only (mysql2 + node:dns + fs) and never logs —
 * callers decide how to present results.
 */
import { readFileSync } from 'fs'
import { lookup } from 'node:dns/promises'
import { createConnection, type Connection, type ConnectionOptions } from 'mysql2/promise'

// ── Constants ───────────────────────────────────────────────────────────────

const FALLBACK_HOSTS = ['sql301.byet.org', '185.27.134.24'] as const
const CONNECT_TIMEOUT_MS = 12_000
const DNS_PROBE_TIMEOUT_MS = 4_000

/** mysql2 error codes that mean "couldn't even reach a server" → try next endpoint. */
const CONNECT_LEVEL_CODES = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
  'EOF',
])

/** MySQL error codes that mean "the server answered and said no" → terminal. */
const ACCESS_LEVEL_CODES = new Set([
  'ER_ACCESS_DENIED_ERROR', // 1045 — wrong user/password OR user@host not allowed
  'ER_HOST_NOT_PRIVILEGED', // 1130 — host not allowed to connect (whitelist!)
  'ER_DBACCESS_DENIED_ERROR', // 1044 — no privileges on the database
  'ER_BAD_DB_ERROR', // 1049 — database does not exist on the server
  'ER_NOT_SUPPORTED_AUTH_MODE', // 1251 — auth plugin mismatch
  'ER_MUST_CHANGE_PASSWORD', // 1820
])

// ── Types ───────────────────────────────────────────────────────────────────

export interface MySqlEndpointAttempt {
  host: string
  resolvable: boolean | 'skipped' // skipped = dropped by dedupe
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
    version: string // expect MariaDB ~10.x
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

/** MYSQL_* explicit vars win over the MYSQL_DATABASE_URL components. */
export function resolveMySqlConfig(): MySqlConnectionConfig {
  const url = envVar('MYSQL_DATABASE_URL')
  let cfg: MySqlConnectionConfig = {
    user: '',
    password: '',
    database: '',
    port: 3306,
    source: 'env',
  }

  if (url) {
    try {
      const u = new URL(url)
      cfg = {
        user: decodeURIComponent(u.username),
        password: decodeURIComponent(u.password),
        database: u.pathname.replace(/^\//, ''),
        port: u.port ? Number(u.port) : 3306,
        preferredHost: u.hostname,
        source: 'url',
      }
    } catch {
      // malformed URL — fall through, explicit vars may still save us
    }
  }

  if (envVar('MYSQL_USER')) cfg.user = envVar('MYSQL_USER') as string
  if (envVar('MYSQL_PASSWORD')) cfg.password = envVar('MYSQL_PASSWORD') as string
  if (envVar('MYSQL_DATABASE')) cfg.database = envVar('MYSQL_DATABASE') as string
  if (envVar('MYSQL_PORT')) {
    const p = Number(envVar('MYSQL_PORT'))
    if (Number.isFinite(p) && p > 0) cfg.port = p
  }
  if (envVar('MYSQL_HOST')) cfg.preferredHost = envVar('MYSQL_HOST')

  return cfg
}

export function isMySqlConfigComplete(cfg: MySqlConnectionConfig): boolean {
  return Boolean(cfg.user && cfg.password && cfg.database)
}

// ── Endpoint chain ───────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(onTimeout()), ms)
  })
  return Promise.race([
    promise,
    timeout,
  ]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

/** Numeric IPs are always considered resolvable (no DNS needed). */
export async function isResolvable(host: string, timeoutMs = DNS_PROBE_TIMEOUT_MS): Promise<boolean> {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true
  try {
    await withTimeout(lookup(host, { family: 0 }), timeoutMs, () => {
      throw new Error('dns probe timeout')
    })
    return true
  } catch {
    return false
  }
}

export interface MySqlEndpoint {
  host: string
  resolvable: boolean | 'skipped'
}

/**
 * The ordered endpoint chain: preferred host (only if resolvable), then
 * sql301.byet.org, then the raw IP — deduplicated.
 */
export async function buildEndpointChain(cfg: MySqlConnectionConfig): Promise<MySqlEndpoint[]> {
  const chain: MySqlEndpoint[] = []
  const seen = new Set<string>()

  const push = async (host?: string) => {
    if (!host || seen.has(host)) {
      if (host && seen.has(host)) chain.push({ host, resolvable: 'skipped' })
      return
    }
    seen.add(host)
    chain.push({ host, resolvable: await isResolvable(host) })
  }

  await push(cfg.preferredHost)
  for (const fallback of FALLBACK_HOSTS) await push(fallback)
  return chain
}

// ── Error classification ────────────────────────────────────────────────────

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

function isConnectLevel(err: unknown): boolean {
  const { code } = toErrorInfo(err)
  return CONNECT_LEVEL_CODES.has(code)
}

function isAccessLevel(err: unknown): boolean {
  const { code } = toErrorInfo(err)
  return ACCESS_LEVEL_CODES.has(code)
}

/** For access errors, MySQL's message embeds 'user'@'clientIP' — surface the IP. */
function clientIpFromMessage(message: string): string | undefined {
  const m = /@'(\d{1,3}(?:\.\d{1,3}){3})'/.exec(message)
  return m?.[1]
}

// ── Connection helpers ───────────────────────────────────────────────────────

function connectionOptions(host: string, cfg: MySqlConnectionConfig): ConnectionOptions {
  return {
    host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    connectTimeout: CONNECT_TIMEOUT_MS,
    charset: 'UTF8MB4_UNICODE_CI', // match the utf8mb4 tables prisma db push creates
  }
}

export interface MySqlConnected {
  connection: Connection
  host: string
}

/**
 * Connect using the endpoint fallback chain. Throws the LAST meaningful error
 * (access errors short-circuit the chain — the server answered, other hosts
 * cannot change that answer).
 */
export async function connectMySqlWithFallback(
  cfg: MySqlConnectionConfig = resolveMySqlConfig(),
): Promise<MySqlConnected> {
  if (!isMySqlConfigComplete(cfg)) {
    throw Object.assign(new Error('MySQL config incomplete — set MYSQL_DATABASE_URL (or MYSQL_USER/MYSQL_PASSWORD/MYSQL_DATABASE) in .env'), { code: 'CONFIG_MISSING' })
  }

  const chain = await buildEndpointChain(cfg)
  let lastError: unknown = null

  for (const endpoint of chain) {
    if (endpoint.resolvable !== true) {
      lastError ??= Object.assign(new Error(`Host ${endpoint.host} is not resolvable`), { code: 'ENOTFOUND' })
      continue
    }
    try {
      const connection = await createConnection(connectionOptions(endpoint.host, cfg))
      return { connection, host: endpoint.host }
    } catch (err) {
      lastError = err
      if (isAccessLevel(err)) throw err // terminal — server answered
      // connect-level failure → next endpoint
    }
  }
  throw lastError ?? new Error('No MySQL endpoint could be reached')
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
        message: 'MySQL credentials incomplete — expected MYSQL_DATABASE_URL (or MYSQL_USER + MYSQL_PASSWORD + MYSQL_DATABASE) in .env',
      },
      hint: 'Copy the MySQL section from .env.example and fill in the InfinityFree credentials.',
    }
  }

  const chain = await buildEndpointChain(cfg)
  let connection: Connection | null = null
  let endpointUsed: string | undefined
  let lastError: { code: string; errno?: number; message: string } | undefined

  for (const endpoint of chain) {
    if (Date.now() > deadline) {
      return {
        ...base,
        durationMs: Date.now() - startedAt,
        error: lastError ?? { code: 'CHECK_TIMEOUT', message: 'Check deadline exceeded before all endpoints were tried' },
      }
    }
    if (endpoint.resolvable !== true) {
      endpointsTried.push({ host: endpoint.host, resolvable: endpoint.resolvable, connected: false })
      continue
    }
    try {
      connection = await createConnection(connectionOptions(endpoint.host, cfg))
      endpointUsed = endpoint.host
      endpointsTried.push({ host: endpoint.host, resolvable: true, connected: true })
      break
    } catch (err) {
      const info = toErrorInfo(err)
      lastError = info
      endpointsTried.push({ host: endpoint.host, resolvable: true, connected: false, error: info })
      if (isAccessLevel(err)) break // terminal — report below
      // connect-level → try next endpoint
    }
  }

  if (!connection || !endpointUsed) {
    const clientIpHint = lastError ? clientIpFromMessage(lastError.message) : undefined
    const isAccess = lastError ? ACCESS_LEVEL_CODES.has(lastError.code) : false
    return {
      ...base,
      durationMs: Date.now() - startedAt,
      error: lastError ? { ...lastError, clientIpHint } : { code: 'NO_ENDPOINT', message: 'No MySQL endpoint could be reached' },
      hint: isAccess
        ? 'The MySQL server answered but refused this client. If the code is ER_ACCESS_DENIED_ERROR / ER_HOST_NOT_PRIVILEGED, add the client IP shown in the message to the InfinityFree Remote MySQL whitelist (client panel → MySQL → Remote MySQL), then retry.'
        : 'No endpoint answered a TCP handshake. Check the endpoint chain and any firewall between this machine and the database server.',
    }
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
      endpointUsed,
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
      endpointUsed,
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
      hint: 'The endpoint chain is slow or hanging — retry, or raise the timeout.',
    }),
  )
}
