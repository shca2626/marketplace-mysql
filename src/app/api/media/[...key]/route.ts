import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getStorage } from '@/lib/storage'
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
