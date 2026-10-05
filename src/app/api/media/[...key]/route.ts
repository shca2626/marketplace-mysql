import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getStorage } from '@/lib/storage'
import { isVaultKey } from '@/lib/storage/namespace'
import { db } from '@/lib/db'
import { clientIp } from '@/lib/http'
import { RATE_LIMITS, rateLimit } from '@/lib/rate-limit'

// GET /api/media/[...key] — serve a stored rendition.
// ─────────────────────────────────────────────────
// Keys are immutable by construction (content-derived, never rewritten), so
// responses carry `Cache-Control: public, max-age=31536000, immutable` + a
// strong ETag with 304 support — browsers/CDNs fetch each rendition once.
// Only extensions from the storage whitelist are served, with nosniff.
//
// FTP-HOSTING DRIVER (STORE-1): files on the hosting are PUBLIC — when the
// active driver serves files directly (storage.publicUrl), this route
// redirects to the public URL instead of proxying bytes through the app,
// UNLESS a local fallback copy exists (FTP failed at upload time → the bytes
// only live on local disk → serve those inline). The 307 is immutable-cached
// (the key→URL mapping never changes) and the hosting itself edge-caches the
// file (verified: no anti-bot challenge, 30-day edge cache).
//
// VAULT INVALIDATION (6.6.6): beyond the structural vault/ root 404, keys of
// PUBLIC assets that also exist in the private-vault namespace behind an
// AccountDocument are 404'd here — a migrated document's old public key must
// never serve (or REDIRECT) again, even while a stale remote copy lingers on
// the hosting. The blocked-key set is tiny and immutable in practice, so it
// is cached per process (10-min TTL) instead of costing a query per GET.

const EXT_MIME: Record<string, string> = {
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  // Non-image whitelist entries (saveUpload raw-file uploads, local fallback):
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.zip': 'application/zip',
}

// strips a rendition suffix: "2026/09/ab-c.medium.png" → "2026/09/ab-c"
const RENDITION_SUFFIX_RE = /\.(thumb|medium|large|full)\.(png|webp)$/

let blockedKeysCache: { at: number; keys: Set<string> } | null = null
const BLOCKED_KEYS_TTL_MS = 10 * 60_000

/** Public-namespace base keys that have a vault twin backing an AccountDocument (6.6.6). */
async function loadBlockedKeys(): Promise<Set<string>> {
  const now = Date.now()
  if (blockedKeysCache && now - blockedKeysCache.at < BLOCKED_KEYS_TTL_MS) return blockedKeysCache.keys
  let keys = new Set<string>()
  try {
    const docShas = await db.accountDocument.findMany({
      select: { media: { select: { sha256: true } } },
    })
    const shas = [...new Set(docShas.map((d) => d.media.sha256))]
    if (shas.length > 0) {
      const twins = await db.mediaAsset.findMany({
        where: { namespace: 'public-media', sha256: { in: shas } },
        select: { key: true },
      })
      keys = new Set(twins.map((t) => t.key))
    }
  } catch (err) {
    console.error('[media] blocked-keys refresh failed:', err)
    if (blockedKeysCache) return blockedKeysCache.keys // serve stale on transient DB errors
  }
  blockedKeysCache = { at: now, keys }
  return keys
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ key: string[] }> }) {
  // Media is public-read; only the generous per-IP read limit applies.
  const read = rateLimit(`media:${clientIp(req)}`, RATE_LIMITS.mediaRead.limit, RATE_LIMITS.mediaRead.windowMs)
  if (!read.ok) {
    return new NextResponse(null, {
      status: 429,
      headers: { 'Retry-After': String(read.retryAfterSec) },
    })
  }

  const { key: segments } = await ctx.params
  const key = (segments ?? []).join('/')

  // 6.6.6 — INVALIDATION SWEEP: the public media route NEVER serves the
  // private-vault namespace. This is a structural 404 (before any storage
  // lookup, before the FTP publicUrl redirect path) — vault bytes are
  // reachable ONLY through the authenticated proxy /api/vault/<documentId>.
  if (isVaultKey(key)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // 6.6.6 — migrated-document keys: a public asset that now has a vault twin
  // behind an AccountDocument must 404 (never serve, never redirect), even
  // if a stale remote copy lingers on the public hosting.
  const baseKey = key.replace(RENDITION_SUFFIX_RE, '')
  if (baseKey !== key) {
    // a rendition request — check the base key's block status
    const blocked = await loadBlockedKeys()
    if (blocked.has(baseKey)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
  } else {
    // raw key (saveUpload path) — check directly
    const blocked = await loadBlockedKeys()
    if (blocked.has(key)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
  }

  const dot = key.lastIndexOf('.')
  const ext = dot === -1 ? '' : key.slice(dot).toLowerCase()
  const mime = EXT_MIME[ext]
  if (!mime) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const storage = getStorage()

  let data: Buffer | null
  if (storage.publicUrl) {
    // Direct-serve driver (ftp-hosting): local fallback copy first, else
    // hand the request to the public hosting URL.
    data = (await storage.readLocalFallback?.(key)) ?? null
    if (!data) {
      const publicUrl = storage.publicUrl(key)
      if (!publicUrl) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      return NextResponse.redirect(publicUrl, {
        status: 307,
        headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
      })
    }
  } else {
    data = await storage.getOrNull(key) // traversal-safe (keys validated inside)
  }
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const etag = `"${createHash('sha1').update(key).digest('hex').slice(0, 20)}"`
  if (req.headers.get('if-none-match') === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: etag, 'Cache-Control': 'public, max-age=31536000, immutable' },
    })
  }

  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Length': String(data.byteLength),
      'Cache-Control': 'public, max-age=31536000, immutable',
      ETag: etag,
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
      // Uploaded media never carries app credentials — safe to open in isolation.
      'Cross-Origin-Resource-Policy': 'cross-origin',
    },
  })
}
