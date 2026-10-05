import { mkdir, readFile, unlink, access, writeFile } from 'node:fs/promises'
import { isAbsolute, join, resolve, sep } from 'node:path'
import { StorageError, type StorageAdapter, type StoredFile, type PutOptions } from './types'

// Local-disk storage adapter (the default driver).
// ────────────────────────────────────────────────
// Files live under STORAGE_ROOT (default: ./uploads at the project root),
// mirroring the key scheme verbatim: "2026/09/{sha8}-{rand6}.{role}.webp".
// Keys are validated BEFORE any filesystem touch — traversal payloads
// ("../", absolute paths, backslashes, NUL bytes, empty segments) are
// rejected with StorageError INVALID_KEY, which /api/media maps to 404.

const DEFAULT_ROOT = join(process.cwd(), 'uploads')

/** Key shape: "seg/segs..." where each segment is filename-safe. */
const SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

function validateKey(key: string): string {
  if (!key || key.length > 512) {
    throw new StorageError('Invalid storage key', 'INVALID_KEY')
  }
  if (isAbsolute(key) || key.includes('..') || key.includes('\\') || key.includes('\0')) {
    throw new StorageError('Invalid storage key', 'INVALID_KEY')
  }
  const segments = key.split('/')
  for (const seg of segments) {
    if (!SEGMENT_RE.test(seg)) {
      throw new StorageError('Invalid storage key', 'INVALID_KEY')
    }
  }
  return key
}

export class LocalDiskStorage implements StorageAdapter {
  readonly name = 'local-disk'
  private readonly root: string

  constructor(root?: string) {
    this.root = resolve(root ?? process.env.STORAGE_ROOT ?? DEFAULT_ROOT)
  }

  private path(key: string): string {
    return join(this.root, validateKey(key))
  }

  async put(key: string, data: Buffer, _opts?: PutOptions): Promise<StoredFile> {
    // local-disk serves nothing directly — /api/media is the only reader and
    // it hard-404s vault keys, so public/private writes are identical here.
    const target = this.path(key)
    try {
      await mkdir(resolve(target, '..'), { recursive: true })
      await writeFile(target, data)
      return { key, size: data.byteLength }
    } catch (err) {
      throw new StorageError(`Failed to write "${key}": ${(err as Error).message}`, 'WRITE_FAILED')
    }
  }

  async get(key: string): Promise<Buffer> {
    const data = await this.getOrNull(key)
    if (!data) throw new StorageError(`No object at "${key}"`, 'NOT_FOUND')
    return data
  }

  async getOrNull(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.path(key))
    } catch (err) {
      const e = err as NodeJS.ErrnoException
      if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return null
      if (e instanceof StorageError) throw e
      throw new StorageError(`Failed to read "${key}": ${e.message}`, 'READ_FAILED')
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await access(this.path(key))
      return true
    } catch {
      return false
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      await unlink(this.path(key))
      return true
    } catch (err) {
      const e = err as NodeJS.ErrnoException
      if (e.code === 'ENOENT') return false
      if (e instanceof StorageError) throw e
      throw new StorageError(`Failed to delete "${key}": ${e.message}`, 'WRITE_FAILED')
    }
  }

  absolutePath(key: string): string | null {
    try {
      return this.path(key)
    } catch {
      return null
    }
  }
}

// Keep `sep` referenced for platform-correct future path splits (Win-safe hygiene).
void sep
