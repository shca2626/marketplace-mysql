/**
 * FTP-hosting storage driver (STORE-1) — InfinityFree htdocs/storage.
 * ─────────────────────────────────────────────────────────────────────────
 * PUBLIC-URL MODEL: files land in /htdocs/storage/ on the hosting account and
 * serve directly from `${STORAGE_PUBLIC_BASE}/<key>` (default
 * https://yusr.site.je/storage/<key>) with NO anti-bot challenge (verified:
 * 200 image/png for browser / empty / email-proxy user agents).
 *
 * INFINITYFREE QUIRKS THIS DRIVER DESIGNS AROUND (verified against the host):
 *  1. A file with an IMAGE EXTENSION but non-image content gets auto-chmodded
 *     000 by InfinityFree → permanent 403, edge-cached for 30 days. So image
 *     magic bytes are validated BEFORE upload and a mismatched file NEVER
 *     lands there (it is rejected client-facing with a 415 instead).
 *  2. The edge cache keeps 200/403 responses for 30 days → filenames are
 *     ALWAYS unique (Date.now().toString(36) + 6 random hex chars) and files
 *     are never rewritten in place under the same name.
 *  3. The host executes PHP → executable extensions (.php .phtml .phar
 *     .cgi .pl .py .sh .htaccess) are REJECTED outright, before any storage
 *     (local OR remote) is touched.
 *  4. Plain FTP: port 21, secure:false, host ftpupload.net. The FTP password
 *     is shared with the MySQL account (FTP_PASS defaults to MYSQL_PASSWORD).
 *  5. iFastNet/InfinityFree caps single FTP uploads around 10 MB → larger
 *     files skip FTP entirely and take the local-disk fallback (a warning,
 *     never an error).
 *
 * GRACEFUL FALLBACK (the core contract): ANY FTP problem — basic-ftp not
 * installed, connection refused, auth failure, timeout, oversize, mid-transfer
 * drop — degrades to the local-disk driver (STORAGE_ROOT, default ./uploads)
 * with a console.warn explaining why. saveUpload()/put() NEVER throw for
 * FTP-side failures; the returned/stored URL always matches where the bytes
 * actually live. A 60s circuit-breaker cooldown after a connection failure
 * keeps request latency flat while the host is down.
 *
 * Server-side only (node:crypto / node:fs / node:stream + basic-ftp).
 */

import { randomBytes } from 'node:crypto'
import { Readable, Writable } from 'node:stream'
import { LocalDiskStorage } from './local-disk'
import { StorageError, type StorageAdapter, type StoredFile, type PutOptions } from './types'
import { isVaultKey } from './namespace'
import { envVar, resolveStorageDriverName } from './env'

// ── Extension policy ────────────────────────────────────────────────────────

/** Only these extensions may ever enter storage (mission whitelist, STORE-1). */
export const ALLOWED_UPLOAD_EXTENSIONS = [
  '.png', '.jpg', '.jpeg', '.webp', '.gif',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt', '.zip',
] as const
const ALLOWED_EXT_SET = new Set<string>(ALLOWED_UPLOAD_EXTENSIONS)

/** Never allowed in storage — the hosting account EXECUTES these (rule 3). */
export const FORBIDDEN_EXECUTABLE_EXTENSIONS = [
  '.php', '.phtml', '.phar', '.cgi', '.pl', '.py', '.sh', '.htaccess',
] as const
const FORBIDDEN_EXT_SET = new Set<string>(FORBIDDEN_EXECUTABLE_EXTENSIONS)

// ── Image magic-byte validation (rule 1: InfinityFree locks fakes to 000) ────
// Same signatures as sniffImageMime() in image-pipeline.ts (kept local to
// avoid a circular import: index.ts → ftp-hosting.ts → image-pipeline.ts → index.ts).

type MagicCheck = (buf: Buffer) => boolean

const isJpeg: MagicCheck = (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
const isPng: MagicCheck = (b) => b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
const isGif: MagicCheck = (b) => b.length >= 4 && b.slice(0, 4).toString('ascii') === 'GIF8'
const isWebp: MagicCheck = (b) =>
  b.length >= 12 && b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP'

const IMAGE_SIGNATURES: Record<string, MagicCheck> = {
  '.jpg': isJpeg,
  '.jpeg': isJpeg,
  '.png': isPng,
  '.gif': isGif,
  '.webp': isWebp,
}

/** 415-tagged error, the same pattern processImageUpload uses. */
function invalidUpload(message: string): Error {
  return Object.assign(new Error(message), { status: 415 })
}

/**
 * Final extension of an original filename, lowercased, path-stripped.
 * Returns '' when there is no usable extension (dotfiles like ".htaccess"
 * intentionally have none — they are caught by the executable check instead).
 */
export function extractFileExtension(originalName: string): string {
  const base = (originalName || '').replace(/[\r\n\0]/g, '').split(/[\\/]/).pop() ?? ''
  const dot = base.lastIndexOf('.')
  if (dot <= 0 || dot === base.length - 1) return ''
  return base.slice(dot).toLowerCase()
}

/**
 * Extension gate for EVERYTHING that enters storage (both drivers).
 * Throws a 415-tagged error on: executables (outright, clearest message),
 * non-whitelisted extensions, missing extension.
 */
export function assertUploadExtensionAllowed(originalName: string): string {
  const lowered = (originalName || '').toLowerCase().replace(/[\r\n\0]/g, '')
  const base = lowered.split(/[\\/]/).pop() ?? ''
  if (base === '.htaccess' || base.endsWith('.htaccess')) {
    throw invalidUpload('Server configuration files (.htaccess) are not allowed in storage')
  }
  const ext = extractFileExtension(originalName)
  if (!ext) {
    throw invalidUpload('File has no extension — the storage whitelist requires one')
  }
  if (FORBIDDEN_EXT_SET.has(ext)) {
    throw invalidUpload(`Executable files (${ext}) are not allowed in storage`)
  }
  if (!ALLOWED_EXT_SET.has(ext)) {
    throw invalidUpload(
      `Unsupported file type "${ext}" — allowed: ${[...ALLOWED_EXT_SET].join(' ')}`,
    )
  }
  return ext
}

/**
 * Image magic-byte gate (InfinityFree rule 1): when the extension claims an
 * image, the buffer MUST carry that image's signature — otherwise the host
 * auto-chmods the file to 000 (permanent, edge-cached 403). Non-image
 * extensions pass through (no signature rule defined for them).
 */
export function assertImageMagicBytesMatch(ext: string, buffer: Buffer): void {
  const check = IMAGE_SIGNATURES[ext]
  if (!check) return
  if (!check(buffer)) {
    throw invalidUpload(
      `This file claims to be a ${ext} image but its content is not a real image — refusing to upload it to the public hosting (the host permanently locks fake images)`,
    )
  }
}

// ── Unique filename generation (rule 2: edge caches 200/403 for 30 days) ────

/** `${Date.now().toString(36)}-${6 random hex}${ext}` — never reused, never rewritten. */
export function generateUniqueUploadName(ext: string): string {
  return `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}${ext}`
}

// ── Key validation (same rules as LocalDiskStorage) ───────────────────────────

const SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

function validateStorageKey(key: string): string {
  if (!key || key.length > 512) throw new StorageError('Invalid storage key', 'INVALID_KEY')
  if (key.includes('..') || key.includes('\\') || key.includes('\0') || key.startsWith('/')) {
    throw new StorageError('Invalid storage key', 'INVALID_KEY')
  }
  for (const seg of key.split('/')) {
    if (!SEGMENT_RE.test(seg)) throw new StorageError('Invalid storage key', 'INVALID_KEY')
  }
  return key
}

// ── Config resolution (env vars with .env-file fallback + hosting defaults) ──

export interface FtpStorageConfig {
  host: string
  port: number
  user: string
  password: string
  /** Absolute remote directory, no trailing slash (default /htdocs/storage). */
  remoteDir: string
  /** Public URL base, no trailing slash (default https://yusr.site.je/storage). */
  publicBase: string
}

function normalizeDir(dir: string, fallback: string): string {
  const trimmed = dir.trim().replace(/\/+$/, '').trim()
  if (!trimmed) return fallback
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

export function resolveFtpStorageConfig(): FtpStorageConfig {
  // FTP_PASS defaults to the MySQL password — same credential on this hosting.
  const password = envVar('FTP_PASS') ?? envVar('MYSQL_PASSWORD') ?? ''
  const port = Number(envVar('FTP_PORT'))
  return {
    host: envVar('FTP_HOST') || 'ftpupload.net',
    port: Number.isFinite(port) && port > 0 ? port : 21,
    user: envVar('FTP_USER') || 'if0_43035558',
    password,
    remoteDir: normalizeDir(envVar('FTP_REMOTE_DIR') ?? '', '/htdocs/storage'),
    publicBase: (envVar('STORAGE_PUBLIC_BASE') || 'https://yusr.site.je/storage').trim().replace(/\/+$/, ''),
  }
}

/** iFastNet caps single FTP file uploads ~10 MB — bigger files go local. */
export function ftpMaxFileBytes(): number {
  const n = Number(envVar('FTP_MAX_FILE_BYTES'))
  return Number.isFinite(n) && n > 0 ? n : 10 * 1024 * 1024
}

// ── basic-ftp client pool (queued, pooled, circuit-broken) ──────────────────
// basic-ftp is a DEPENDENCY INSTALLED SEPARATELY (STORE-1: package.json is
// handled elsewhere). The import is dynamic and wrapped — a missing module,
// a refused connection or a timeout never throws past this layer.
//
// FTP is a stateful protocol (one command channel, one CWD) so all FTP work
// is serialized through a promise chain; the client is pooled for
// FTP_IDLE_POOL_MS so one image upload (4 webp renditions) reuses a single
// connection, and a pooled-but-stale connection is retried exactly once on a
// fresh one.

type FtpModule = typeof import('basic-ftp')
type FtpClient = import('basic-ftp').Client

const FTP_IDLE_POOL_MS = 15_000
const FTP_COOLDOWN_MS = 60_000

let modulePromise: Promise<FtpModule> | null = null
let pooledClient: FtpClient | null = null
let pooledAt = 0
let cooldownUntil = 0
let ftpChain: Promise<unknown> = Promise.resolve()

function ftpUnavailableError(reason: string): Error {
  return Object.assign(new Error(`FTP storage unavailable: ${reason}`), { ftpUnavailable: true })
}

async function loadFtpModule(): Promise<FtpModule> {
  if (!modulePromise) {
    modulePromise = import('basic-ftp').catch((err) => {
      modulePromise = null // allow a later retry (e.g. deps installed at runtime)
      throw err
    })
  }
  return modulePromise
}

function closeQuietly(client: FtpClient | null | undefined): void {
  if (!client) return
  try {
    client.close()
  } catch {
    /* already closed */
  }
  if (pooledClient === client) pooledClient = null
}

async function connectFtpClient(cfg: FtpStorageConfig): Promise<FtpClient> {
  if (Date.now() < cooldownUntil) {
    throw ftpUnavailableError(`connection circuit open until ${new Date(cooldownUntil).toISOString()}`)
  }
  let mod: FtpModule
  try {
    mod = await loadFtpModule()
  } catch (err) {
    // Module missing → every write takes the local fallback immediately.
    throw ftpUnavailableError(`basic-ftp module not installed (${(err as Error).message})`)
  }
  const client = new mod.Client() // default task timeout: 30s
  try {
    await client.access({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, secure: false })
  } catch (err) {
    cooldownUntil = Date.now() + FTP_COOLDOWN_MS // breaker: fail fast for a minute
    try {
      client.close()
    } catch {
      /* ignore */
    }
    throw ftpUnavailableError(
      `connect to ${cfg.host}:${cfg.port} as ${cfg.user} failed (${(err as Error).message})`,
    )
  }
  return client
}

async function performFtp<T>(op: (client: FtpClient) => Promise<T>): Promise<T> {
  const candidate = pooledClient
  if (candidate && !candidate.closed && Date.now() - pooledAt < FTP_IDLE_POOL_MS) {
    // Pooled connection still fresh — reuse it.
    try {
      const result = await op(candidate)
      pooledAt = Date.now()
      return result
    } catch {
      // A pooled connection can be dropped server-side while idle —
      // retry exactly once on a brand-new connection before giving up.
      closeQuietly(candidate)
      return performFtp(op)
    }
  }
  closeQuietly(candidate)
  const client = await connectFtpClient(resolveFtpStorageConfig())
  pooledClient = client
  try {
    const result = await op(client)
    pooledAt = Date.now()
    return result
  } catch (err) {
    closeQuietly(client)
    throw err
  }
}

/** Serialized FTP access — never two commands on the control channel at once. */
function withFtp<T>(op: (client: FtpClient) => Promise<T>): Promise<T> {
  const run = ftpChain.then(() => performFtp(op))
  ftpChain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

function remotePathOf(cfg: FtpStorageConfig, key: string): string {
  return `${cfg.remoteDir}/${key}`
}

// ── Shared persistence core (used by BOTH put() and saveUpload) ──────────────

async function uploadToFtpClient(client: FtpClient, cfg: FtpStorageConfig, key: string, data: Buffer): Promise<void> {
  const remotePath = remotePathOf(cfg, key)
  const dir = remotePath.slice(0, remotePath.lastIndexOf('/'))
  await client.ensureDir(dir) // absolute path — creates 2026/09/... segments as needed
  await client.uploadFrom(Readable.from(data), remotePath)
}

// ── The StorageAdapter ──────────────────────────────────────────────────────

/**
 * FTP-hosting driver. Writes go to the hosting over FTP with local-disk
 * fallback; reads prefer the local fallback copy (files written while FTP was
 * down) and otherwise expect the caller to use publicUrl() — /api/media
 * redirects to the public URL instead of proxying FTP downloads.
 */
export class FtpHostingStorage implements StorageAdapter {
  readonly name = 'ftp-hosting'
  /** Local-disk fallback + read path for files that never made it to the host. */
  private readonly local = new LocalDiskStorage()

  async put(key: string, data: Buffer, opts?: PutOptions): Promise<StoredFile> {
    validateStorageKey(key)
    if (data.byteLength === 0) throw invalidUpload('Empty file')
    const ext = assertUploadExtensionAllowed(key)
    assertImageMagicBytesMatch(ext, data) // never let a fake image reach the host

    // 6.6.1 — private-vault bytes NEVER reach the public hosting: local only.
    if (opts?.private || isVaultKey(key)) {
      return this.local.put(key, data)
    }

    try {
      await this.writeToFtp(key, data)
      return { key, size: data.byteLength }
    } catch (err) {
      // GRACEFUL FALLBACK — never throw for FTP-side problems.
      console.warn(
        `[storage] ftp-hosting: FTP write of "${key}" failed (${(err as Error).message}) — falling back to local disk`,
      )
      return this.local.put(key, data)
    }
  }

  private async writeToFtp(key: string, data: Buffer): Promise<void> {
    if (data.byteLength > ftpMaxFileBytes()) {
      // iFastNet caps FTP uploads ~10 MB — do not even attempt, go local.
      throw ftpUnavailableError(`file is ${data.byteLength} bytes, over the hosting FTP limit`)
    }
    const cfg = resolveFtpStorageConfig()
    await withFtp((client) => uploadToFtpClient(client, cfg, key, data))
  }

  async get(key: string): Promise<Buffer> {
    const data = await this.getOrNull(key)
    if (!data) throw new StorageError(`No object at "${key}"`, 'NOT_FOUND')
    return data
  }

  async getOrNull(key: string): Promise<Buffer | null> {
    validateStorageKey(key)
    // 6.6.1 — vault keys never exist on the public host; local read ONLY
    // (never dial FTP for them, belt-and-braces even if someone manually
    // uploaded bytes there).
    if (isVaultKey(key)) return this.local.getOrNull(key)
    // Local fallback first — a file written while FTP was down lives here.
    const localData = await this.local.getOrNull(key)
    if (localData) return localData
    try {
      const cfg = resolveFtpStorageConfig()
      return await withFtp((client) => {
        const chunks: Buffer[] = []
        const sink = new Writable({
          write(chunk, _enc, cb) {
            chunks.push(Buffer.from(chunk))
            cb()
          },
        })
        return client.downloadTo(sink, remotePathOf(cfg, key)).then(() => Buffer.concat(chunks))
      })
    } catch (err) {
      console.warn(`[storage] ftp-hosting: FTP read of "${key}" failed (${(err as Error).message})`)
      return null
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      validateStorageKey(key)
    } catch {
      return false
    }
    if (await this.local.exists(key)) return true
    try {
      const cfg = resolveFtpStorageConfig()
      await withFtp((client) => client.size(remotePathOf(cfg, key)))
      return true
    } catch {
      return false
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      validateStorageKey(key)
    } catch {
      return false
    }
    let deleted = false
    // 6.6.1 — vault keys only ever exist locally; never dial the public host.
    if (!isVaultKey(key)) {
      try {
        const cfg = resolveFtpStorageConfig()
        await withFtp((client) => client.remove(remotePathOf(cfg, key)))
        deleted = true
      } catch (err) {
        console.warn(`[storage] ftp-hosting: FTP delete of "${key}" failed (${(err as Error).message}) — the file may linger on the hosting`)
      }
    }
    try {
      deleted = (await this.local.delete(key)) || deleted
    } catch (err) {
      console.warn(`[storage] ftp-hosting: local delete of "${key}" failed (${(err as Error).message})`)
    }
    return deleted
  }

  absolutePath(key: string): string | null {
    return this.local.absolutePath(key) // local fallback copy (may not exist)
  }

  /**
   * Direct public URL for a key on this driver (the hosting serves files
   * with no anti-bot challenge). /api/media uses this to redirect instead of
   * proxying bytes through the app.
   */
  publicUrl(key: string): string | null {
    // 6.6.1 — vault keys are NEVER publicly served: no public URL exists.
    if (isVaultKey(key)) return null
    try {
      const clean = validateStorageKey(key)
      return `${resolveFtpStorageConfig().publicBase}/${clean}`
    } catch {
      return null
    }
  }

  /** Local fallback disk only (no network) — null when the bytes are not local. */
  async readLocalFallback(key: string): Promise<Buffer | null> {
    try {
      return await this.local.getOrNull(key)
    } catch {
      return null
    }
  }
}

// ── saveUpload — the driver-facing upload API (STORE-1) ──────────────────────

export interface SaveUploadInput {
  buffer: Buffer
  originalName: string
  mimeType?: string
}

export interface SaveUploadResult {
  /** Where the file is actually served from — matches `storage`. */
  url: string
  storage: 'ftp-hosting' | 'local-disk'
  /** Storage key / filename the bytes were written under (local fallback path). */
  key: string
}

/**
 * Validate + uniquely name + persist a user file.
 *
 *  - extension whitelist & executable blacklist enforced (throws 415-tagged),
 *  - image magic bytes verified before anything is uploaded (InfinityFree
 *    permanently locks extension/content mismatches),
 *  - unique filename every time (edge caches 200/403 for 30 days),
 *  - FTP_HOSTING driver: upload to /htdocs/storage over FTP; ANY FTP problem
 *    (missing basic-ftp, connection, auth, timeout, >10 MB) falls back to
 *    local disk with a console.warn — this function only throws for
 *    validation errors (bad extension / fake image / empty file) and local
 *    write failures, never for FTP problems,
 *  - local-disk driver (default when STORAGE_DRIVER is unset): writes under
 *    STORAGE_ROOT (./uploads) and serves via /api/media/<name>.
 */
export async function saveUpload(file: SaveUploadInput): Promise<SaveUploadResult> {
  const buffer = file.buffer
  if (!buffer || buffer.byteLength === 0) throw invalidUpload('Empty file')

  const ext = assertUploadExtensionAllowed(file.originalName)
  assertImageMagicBytesMatch(ext, buffer)

  const name = generateUniqueUploadName(ext)
  const isFtpDriver = resolveStorageDriverName() === 'ftp-hosting'
  const local = new LocalDiskStorage()

  const saveLocal = async (): Promise<SaveUploadResult> => {
    await local.put(name, buffer)
    return { url: `/api/media/${name}`, storage: 'local-disk', key: name }
  }

  if (!isFtpDriver) return saveLocal()

  const cfg = resolveFtpStorageConfig()
  try {
    if (buffer.byteLength > ftpMaxFileBytes()) {
      throw ftpUnavailableError(`file is ${buffer.byteLength} bytes, over the hosting FTP limit`)
    }
    await withFtp((client) => uploadToFtpClient(client, cfg, name, buffer))
    return { url: `${cfg.publicBase}/${name}`, storage: 'ftp-hosting', key: name }
  } catch (err) {
    console.warn(
      `[storage] ftp-hosting: FTP upload of "${name}" failed (${(err as Error).message}) — falling back to local disk`,
    )
    return saveLocal()
  }
}
