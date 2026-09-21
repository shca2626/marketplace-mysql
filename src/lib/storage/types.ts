// Storage abstraction (day-1 core infrastructure)
// ───────────────────────────────────────────────
// All persisted files (product media today, invoices/exports tomorrow) go through
// this interface. The default driver is local-disk (single-node deployments);
// an S3/R2 driver can be added by implementing StorageAdapter and registering it
// in index.ts — no call-site changes needed.
//
// Keys are content-derived and immutable ("2026/09/{sha8}-{rand6}"), which is what
// makes the /api/media response cache safely immutable.

export interface StoredFile {
  key: string
  size: number
}

export interface StorageAdapter {
  readonly name: string

  /** Persist bytes at `key` (creates parent dirs as needed). */
  put(key: string, data: Buffer): Promise<StoredFile>

  /** Read bytes at `key`. Throws if missing. */
  get(key: string): Promise<Buffer>

  /** Read bytes at `key` — null when missing. */
  getOrNull(key: string): Promise<Buffer | null>

  /** True if a file exists at `key`. */
  exists(key: string): Promise<boolean>

  /** Remove `key`. Returns false when missing (idempotent delete). */
  delete(key: string): Promise<boolean>

  /** Resolved absolute path for a key (local driver only; others return null). */
  absolutePath(key: string): string | null
}

export class StorageError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_FOUND' | 'WRITE_FAILED' | 'INVALID_KEY' | 'READ_FAILED',
  ) {
    super(message)
    this.name = 'StorageError'
  }
}
