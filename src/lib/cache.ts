// Tagged in-memory TTL cache (day-1 core infrastructure).
// ───────────────────────────────────────────────────────────
// Purpose: absorb repeated heavy reads (categories with counts, catalog
// definitions, brand facets, home sections) without a network cache layer.
// Design is deliberately interface-shaped: swap the internals for Redis
// (`get/set/del` per key + tag sets) without touching call sites.
//
// Usage:
//   const cats = await cached('categories:v1', loadCategories, { ttlMs: 60_000, tags: ['categories'] })
//   invalidateTags('products')  // after any product write
//
// Stats are exposed for a future admin endpoint; a `peekCache()` lets routes
// set an X-Cache header for observability.

type CacheEntry = {
  value: unknown
  expiresAt: number
  tags: string[]
  createdAt: number
}

// ── Cross-route-module storage ─────────────────────────────────────────────
// In dev, Turbopack compiles each API route into its own module graph — a
// plain module-level Map would exist ONCE PER ROUTE BUNDLE, and
// invalidateTags() called from a write route would never clear entries cached
// by read routes. Attaching the maps to globalThis gives every bundle the same
// instance (the same pattern lib/db.ts uses for the Prisma client).
const globalForCache = globalThis as unknown as {
  __vendoraCacheStore?: Map<string, CacheEntry>
  __vendoraCacheTags?: Map<string, Set<string>>
}

const store: Map<string, CacheEntry> = (globalForCache.__vendoraCacheStore ??= new Map())
const tagIndex: Map<string, Set<string>> = (globalForCache.__vendoraCacheTags ??= new Map()) // tag → keys

export const CACHE_TAGS = {
  products: 'products',
  categories: 'categories',
  catalog: 'catalog',
  home: 'home',
  user: (id: string) => `user:${id}`,
} as const

export interface CacheOptions {
  ttlMs?: number
  tags?: string[]
}

let hits = 0
let misses = 0

export async function cached<T>(key: string, loader: () => Promise<T>, opts: CacheOptions = {}): Promise<T> {
  const ttl = opts.ttlMs ?? 60_000
  const now = Date.now()

  const existing = store.get(key)
  if (existing) {
    if (existing.expiresAt > now) {
      hits++
      return existing.value as T
    }
    removeEntry(key)
  }

  misses++
  const value = await loader()
  const entry: CacheEntry = { value, expiresAt: Date.now() + ttl, tags: opts.tags ?? [], createdAt: now }

  // Don't cache miss/undefined results — loader errors already throw through.
  if (value !== undefined && value !== null) {
    store.set(key, entry)
    for (const tag of entry.tags) {
      let keys = tagIndex.get(tag)
      if (!keys) tagIndex.set(tag, (keys = new Set()))
      keys.add(key)
    }
  }
  return value
}

/** Was the last `cached(key)` call a hit? (for X-Cache headers) */
export function peekCache(key: string): boolean {
  const e = store.get(key)
  return !!e && e.expiresAt > Date.now()
}

/** Purge every entry carrying any of the given tags. Returns purged count. */
export function invalidateTags(...tags: string[]): number {
  let purged = 0
  for (const tag of tags) {
    const keys = tagIndex.get(tag)
    if (!keys) continue
    for (const key of keys) {
      if (store.delete(key)) purged++
    }
    tagIndex.delete(tag)
  }
  return purged
}

function removeEntry(key: string) {
  const e = store.get(key)
  if (!e) return
  store.delete(key)
  for (const tag of e.tags) tagIndex.get(tag)?.delete(key)
}

export function cacheStats() {
  return { entries: store.size, hits, misses, hitRate: hits + misses === 0 ? 0 : hits / (hits + misses) }
}
