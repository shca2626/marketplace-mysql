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
// Only image extensions our pipeline can produce are served, with nosniff.

const EXT_MIME: Record<string, string> = {
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
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
  const data = await storage.getOrNull(key) // traversal-safe (keys validated inside)
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
