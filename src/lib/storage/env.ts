// Storage env resolution — process.env first, .env file as fallback.
// ─────────────────────────────────────────────────────────────────────
// Mirrors the envFromFile/envVar pattern of src/lib/mysql-check.ts: `bun run`
// auto-loads .env into process.env, but direct `bun scripts/x.ts` / node runs
// may not — reading .env directly keeps storage config resolvable everywhere.
// Deliberately dependency-free (no mysql2 here, unlike mysql-check.ts) so any
// server module can import it cheaply. Server-side only (node:fs).

import { readFileSync } from 'node:fs'

function envFromFile(key: string): string | undefined {
  try {
    const raw = readFileSync('.env', 'utf8')
    const m = raw.match(new RegExp(`^${key}="?([^"\\r\\n]*)"?$`, 'm'))
    return m?.[1] || undefined
  } catch {
    return undefined // no .env / unreadable — process.env is the only source
  }
}

/** Env var with .env-file fallback (same semantics as mysql-check.ts). */
export function envVar(key: string): string | undefined {
  return process.env[key] ?? envFromFile(key)
}

/** Active storage driver: 'local-disk' (default when unset) | 'ftp-hosting'. */
export function resolveStorageDriverName(): string {
  return (envVar('STORAGE_DRIVER') || 'local-disk').trim()
}
