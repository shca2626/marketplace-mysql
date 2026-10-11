import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { clientIp, enforceRateLimit } from '@/lib/http'
import { consumeVaultUrl, VaultConsumeError } from '@/server/modules/documents/vault'

// GET /api/vault/[documentId]?exp=&nonce=&sig= — the authenticated proxy
// (6.6.4 / B8): streams private-vault bytes. Every retrieval:
//   1. re-authenticates the session (401 otherwise),
//   2. verifies the HMAC signature (bound to document + user + nonce + exp),
//   3. enforces the URL expiry + one-time nonce (atomic consume — replays 410),
//   4. RE-AUTHORIZES against the 6.8 access policy,
//   5. audits DOCUMENT_FILE_RETRIEVED,
//   6. and only then streams — NO redirects to storage/CDN, no-store caching.
//
// Responses are uncacheable by design: vault URLs are single-use and
// minutes-TTL; a shared cache or CDN must never hold them.
export async function GET(req: NextRequest, ctx: { params: Promise<{ documentId: string }> }) {
  const rl = enforceRateLimit(req, 'vault:read', { limit: 240, windowMs: 60_000 })
  if (rl) return rl

  try {
    const { documentId } = await ctx.params
    const sp = req.nextUrl.searchParams
    const exp = Number(sp.get('exp'))
    const nonce = sp.get('nonce') ?? ''
    const sig = sp.get('sig') ?? ''
    if (!Number.isFinite(exp) || !nonce || !sig) {
      return NextResponse.json({ error: 'Malformed document link' }, { status: 400 })
    }

    const user = await getSessionUser()
    const result = await consumeVaultUrl(user?.id ?? null, documentId, exp, nonce, sig, { ip: clientIp(req) })

    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        'Content-Type': result.mime,
        'Content-Length': String(result.buffer.byteLength),
        // 6.6.4 — minutes-TTL, uncacheable
        'Cache-Control': 'no-store, private, max-age=0',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline',
        // vault bytes are only ever loaded by the app itself
        'Cross-Origin-Resource-Policy': 'same-origin',
        'Referrer-Policy': 'no-referrer',
      },
    })
  } catch (err) {
    if (err instanceof VaultConsumeError) {
      const headers =
        err.reason === 'EXPIRED' || err.reason === 'REPLAYED'
          ? { 'Cache-Control': 'no-store' }
          : undefined
      return NextResponse.json({ error: err.message, code: err.reason }, { status: err.status, headers })
    }
    console.error('vault proxy error', err)
    return NextResponse.json({ error: 'Could not retrieve the document' }, { status: 500 })
  }
}
