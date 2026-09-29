import { randomBytes } from 'node:crypto'
import { LocalDiskStorage } from './local-disk'
import { FtpHostingStorage } from './ftp-hosting'
import { resolveStorageDriverName } from './env'
import type { StorageAdapter } from './types'

export { StorageError } from './types'
export type { StorageAdapter, StoredFile } from './types'
export { LocalDiskStorage } from './local-disk'
export {
  FtpHostingStorage,
  saveUpload,
  generateUniqueUploadName,
  assertUploadExtensionAllowed,
  assertImageMagicBytesMatch,
  extractFileExtension,
  resolveFtpStorageConfig,
  ALLOWED_UPLOAD_EXTENSIONS,
  FORBIDDEN_EXECUTABLE_EXTENSIONS,
} from './ftp-hosting'
export type { SaveUploadInput, SaveUploadResult, FtpStorageConfig } from './ftp-hosting'

// ── Adapter registry ────────────────────────────────────────────────
// Driver selection is env-driven (STORAGE_DRIVER=local-disk | ftp-hosting,
// unset = local-disk). New drivers (s3, r2, …) register here and implement
// StorageAdapter — call sites never change. Single instance per process.

const DRIVERS: Record<string, () => StorageAdapter> = {
  'local-disk': () => new LocalDiskStorage(),
  'ftp-hosting': () => new FtpHostingStorage(),
}

let instance: StorageAdapter | null = null

export function getStorage(): StorageAdapter {
  if (!instance) {
    // resolveStorageDriverName reads process.env first, then .env directly
    // (mysql-check.ts pattern) — direct `bun scripts/…` runs stay consistent.
    const driver = resolveStorageDriverName()
    const factory = DRIVERS[driver]
    if (!factory) throw new Error(`Unknown STORAGE_DRIVER "${driver}" (available: ${Object.keys(DRIVERS).join(', ')})`)
    instance = factory()
  }
  return instance
}

// ── Key scheme ──────────────────────────────────────────────────────
// Base key: "2026/09/{sha256[0..8]}-{6 random chars}" — date-bucketed for
// browsability, content-prefixed for traceability, unique via random suffix.
// Rendition files: "{base}.{role}.webp". Because keys never change content,
// /api/media can serve them with immutable caching.

export function buildAssetKeyBase(sha256Hex: string): string {
  const now = new Date()
  const yyyy = String(now.getFullYear())
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const sha8 = sha256Hex.slice(0, 8)
  const rand = randomBytes(4).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).padEnd(6, 'x')
  return `${yyyy}/${mm}/${sha8}-${rand}`
}

export function renditionKey(baseKey: string, role: string): string {
  // PNG — NOT webp: the public hosting (InfinityFree) only serves classic
  // image extensions (.png/.jpg/.gif) without the anti-bot HTML challenge;
  // .webp is treated as a document and gets challenge-walled.
  return `${baseKey}.${role}.png`
}

export const MEDIA_ROLES = ['thumb', 'medium', 'large', 'full'] as const
export type MediaRole = (typeof MEDIA_ROLES)[number]
