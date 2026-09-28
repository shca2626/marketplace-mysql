/**
 * Vendora — InfinityFree hosting client (server/CLI only, no 'use client').
 * Shared by scripts/mysql-sync.ts (the `bun run mysql:sync` pipeline, SYNC-1)
 * and usable from any server-side route that needs to talk to the hosting.
 *
 * The hosting is used for MySQL + image storage ONLY — the app itself stays in
 * this dev environment (owner ruling, SYNC-1). Everything here targets
 * https://yusr.site.je (InfinityFree free hosting).
 *
 * TWO provider quirks this module absorbs (verified live 2026-09-28):
 *
 *   1. ANTI-BOT CHALLENGE: every text response (import.php JSON included)
 *      requested WITHOUT a valid __test cookie is answered 200 with an
 *      HTML page that loads /aes.js and computes
 *          document.cookie = "__test=" + toHex(slowAES.decrypt(c, 2, a, b))
 *      from three 16-byte hex variables inlined in the page
 *          var a=toNumbers("…"),b=toNumbers("…"),c=toNumbers("…");
 *      slowAES mode 2 == AES-128-CBC, key=a, iv=b, data=c. The decrypted hex
 *      IS the __test cookie value (valid 6h, path=/). The cookie is solved
 *      with node:crypto — no JS execution needed.
 *      BINARY/image responses never carry the challenge, and curl/wget
 *      User-Agents get their TCP connection RESET by the edge — so every
 *      request here goes out with a desktop-Chrome User-Agent.
 *
 *   2. FTP: files upload via `curl -sS --max-time 90 -T …` (curl ships with
 *      the sandbox/system; execFile avoids shell-quoting pitfalls).
 *
 * .env fallback: bun run auto-loads .env, but direct `bun scripts/x.ts` may
 * not — so every env read falls back to a manual fs parse of .env (same
 * approach as src/lib/mysql-check.ts).
 */
import { execFile } from 'child_process'
import { readFileSync } from 'fs'
import { createDecipheriv } from 'node:crypto'

// ── Constants ───────────────────────────────────────────────────────────────

/** Site-wide defaults for the user's InfinityFree account. */
export const INFINITYFREE_DEFAULTS = {
  /** Public base URL of the hosting (import.php bridge lives at the root). */
  baseUrl: 'https://yusr.site.je',
} as const

/** Desktop Chrome UA — the edge resets curl/wget connections (verified). */
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'

const CHALLENGE_TIMEOUT_MS = 15_000
const REQUEST_TIMEOUT_MS = 45_000 // import.php data phase runs up to ~25s of PHP
const FTP_TIMEOUT_SEC = 90
const FTP_EXEC_TIMEOUT_MS = (FTP_TIMEOUT_SEC + 15) * 1000

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

// ── FTP config + upload ─────────────────────────────────────────────────────

export interface FtpConfig {
  host: string
  user: string
  password: string
  /** Absolute FTP base directory of the website (no trailing slash). */
  base: string
}

/**
 * FTP credentials: FTP_HOST (default 'ftpupload.net'), FTP_USER (falls back to
 * MYSQL_USER, then 'if0_43035558'), FTP_PASS (falls back to MYSQL_PASSWORD),
 * FTP_BASE (default '/htdocs'). FTP_USER/FTP_PASS share the InfinityFree
 * account's MySQL login by design — same account, same panel.
 */
export function resolveFtpConfig(): FtpConfig {
  const host = envVar('FTP_HOST') || 'ftpupload.net'
  const user = envVar('FTP_USER') || envVar('MYSQL_USER') || 'if0_43035558'
  const password = envVar('FTP_PASS') || envVar('MYSQL_PASSWORD') || ''
  const rawBase = envVar('FTP_BASE') || '/htdocs'
  const base = '/' + rawBase.replace(/^\/+|\/+$/g, '')
  return { host, user, password, base }
}

/** Join FTP_BASE + segments into an absolute FTP path: ('a','b') → '/htdocs/a/b'. */
export function ftpRemotePath(...segments: string[]): string {
  const cfg = resolveFtpConfig()
  const parts = [cfg.base, ...segments.map((s) => s.replace(/^\/+|\/+$/g, ''))]
    .filter((p) => p !== '' && p !== '.')
  return parts.join('/')
}

/**
 * Upload one file to the hosting via `curl -T`.
 *
 * @param localPath  absolute or cwd-relative path of the local file.
 * @param remotePath ABSOLUTE FTP path starting with '/' (e.g. '/htdocs/import.php');
 *                   a relative path is resolved against FTP_BASE.
 * @throws on curl failure (exit code + stderr excerpt) or missing password.
 */
export async function ftpUpload(localPath: string, remotePath: string): Promise<void> {
  const cfg = resolveFtpConfig()
  if (!cfg.password) {
    throw new Error('FTP password missing — set FTP_PASS (or MYSQL_PASSWORD) in .env')
  }
  const target = remotePath.startsWith('/') ? remotePath : ftpRemotePath(remotePath)
  const url = `ftp://${cfg.host}${target}`
  await new Promise<void>((resolvePromise, reject) => {
    execFile(
      'curl',
      [
        '-sS',
        '--max-time',
        String(FTP_TIMEOUT_SEC),
        '-T',
        localPath,
        url,
        '--user',
        `${cfg.user}:${cfg.password}`,
      ],
      { timeout: FTP_EXEC_TIMEOUT_MS, maxBuffer: 1024 * 1024 },
      (err, _stdout, stderr) => {
        if (err) {
          const e = err as Error & { code?: number | string }
          const detail = (stderr ? String(stderr) : e.message).trim().slice(0, 500)
          reject(new Error(`FTP upload of ${localPath} → ${url} failed (curl exit ${e.code ?? '?'}): ${detail}`))
        } else {
          resolvePromise()
        }
      },
    )
  })
}

// ── Anti-bot challenge solver ────────────────────────────────────────────────

/** Shape of the extracted slowAES challenge variables. */
interface ChallengeVars {
  key: Buffer // a — AES-128 key
  iv: Buffer // b — CBC IV
  data: Buffer // c — ciphertext
}

/**
 * True when the body is an InfinityFree anti-bot challenge page (references
 * /aes.js and inlines the toNumbers variables). JSON/empty bodies never match.
 */
function isChallengeBody(body: string): boolean {
  return body.includes('aes.js') && body.includes('toNumbers(')
}

/**
 * Extract `a=toNumbers("…"),b=toNumbers("…"),c=toNumbers("…")` from a challenge
 * page. Returns null when the page is not a challenge (or the shape changed).
 */
function extractChallengeVars(body: string): ChallengeVars | null {
  const m =
    /a=toNumbers\("([0-9a-fA-F]{32})"\),\s*b=toNumbers\("([0-9a-fA-F]{32})"\),\s*c=toNumbers\("([0-9a-fA-F]{32})"\)/.exec(
      body,
    )
  if (!m) return null
  return { key: Buffer.from(m[1], 'hex'), iv: Buffer.from(m[2], 'hex'), data: Buffer.from(m[3], 'hex') }
}

/** Decrypt the challenge: AES-128-CBC(key=a, iv=b, data=c) → hex string. */
function decryptChallengeVars(vars: ChallengeVars): string {
  const decipher = createDecipheriv('aes-128-cbc', vars.key, vars.iv)
  decipher.setAutoPadding(false) // the JS reference (slowAES.decrypt) has no padding
  try {
    return Buffer.concat([decipher.update(vars.data), decipher.final()]).toString('hex')
  } catch (err) {
    throw new Error(
      `could not decrypt the InfinityFree challenge (expected 16-byte blocks): ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

/**
 * Solve the InfinityFree anti-bot challenge for a URL.
 *
 * Fetches `url` once with a desktop-Chrome User-Agent and `Accept: text/html`
 * (15s AbortController timeout). If the response is the aes.js/slowAES
 * challenge page, extracts the key/iv/ciphertext hex variables from the
 * inline script and AES-128-CBC-decrypts them via node:crypto
 * (createDecipheriv, autoPadding off — mirroring slowAES mode 2), producing
 * the `__test` cookie value. If no challenge is present (empty/JSON/plain
 * response), returns an empty cookie — the URL is reachable as-is.
 *
 * @returns `{ cookie }` — cookie is the raw `__test` VALUE (no "name="); '' when
 *          the URL did not serve a challenge.
 */
export async function solveInfinityfreeChallenge(url: string): Promise<{ cookie: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CHALLENGE_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: controller.signal,
      redirect: 'follow',
    })
    const body = await res.text()
    const vars = extractChallengeVars(body)
    if (!vars) return { cookie: '' } // no challenge on this URL — nothing to solve
    return { cookie: decryptChallengeVars(vars) }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`InfinityFree challenge fetch of ${url} timed out after ${CHALLENGE_TIMEOUT_MS / 1000}s`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

// ── JSON GET with transparent challenge handling ────────────────────────────

interface IfResponse {
  status: number
  ok: boolean
  redirected: boolean
  finalUrl: string
  body: string
}

/** Module-level __test cookie (valid 6h) — solved once, reused for the session. */
let cachedTestCookie: string | null = null

async function ifFetch(url: string, testCookie: string | null): Promise<IfResponse> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const headers: Record<string, string> = {
      'User-Agent': BROWSER_UA, // curl/wget UAs get connection-reset by the edge
      Accept: 'application/json, text/plain, */*',
    }
    if (testCookie) headers.Cookie = `__test=${testCookie}`
    const res = await fetch(url, { headers, signal: controller.signal, redirect: 'follow' })
    const body = await res.text()
    return { status: res.status, ok: res.ok, redirected: res.redirected, finalUrl: res.url, body }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`GET ${url} timed out after ${REQUEST_TIMEOUT_MS / 1000}s`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

/**
 * GET a URL on the hosting and parse the response as JSON — transparently
 * solving the anti-bot challenge when it interposes.
 *
 * Flow: fetch with a browser User-Agent (plus the cached `__test` cookie when
 * one has already been solved). If the body is the challenge page, solve it
 * (see solveInfinityfreeChallenge — the variables are extracted from THIS
 * response, no extra round-trip), cache the cookie, and retry the URL with
 * `Cookie: __test=…`. The final body must parse as JSON — a non-JSON body
 * (e.g. an edge error page after a redirect to errors.infinityfree.net)
 * throws with the HTTP status, final URL and a body excerpt.
 *
 * HTTP error statuses do NOT throw when the body is valid JSON — import.php
 * reports its own errors as JSON payloads ({ok:false,…}) and the caller
 * decides how to present them.
 */
export async function ifGetJson(url: string): Promise<any> {
  let res = await ifFetch(url, cachedTestCookie)

  if (isChallengeBody(res.body)) {
    const vars = extractChallengeVars(res.body)
    if (!vars) {
      throw new Error(
        `InfinityFree challenge page detected at ${url} but its key variables could not be extracted (body excerpt: ${res.body.slice(0, 200)})`,
      )
    }
    cachedTestCookie = decryptChallengeVars(vars)
    res = await ifFetch(url, cachedTestCookie)
    if (isChallengeBody(res.body)) {
      throw new Error(
        `InfinityFree challenge persisted after solving at ${url} — the __test cookie was rejected (body excerpt: ${res.body.slice(0, 200)})`,
      )
    }
  }

  try {
    return JSON.parse(res.body)
  } catch {
    const redirectHint = res.redirected && res.finalUrl !== url ? ` — request was redirected to ${res.finalUrl}` : ''
    throw new Error(
      `expected JSON from ${url} (HTTP ${res.status}${redirectHint}) — body excerpt: ${res.body.slice(0, 300)}`,
    )
  }
}
