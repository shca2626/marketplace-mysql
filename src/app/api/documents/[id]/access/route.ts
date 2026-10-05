import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, clientIp, enforceRateLimit } from '@/lib/http'
import { issueVaultUrl, reapExpiredGrantsThrottled } from '@/server/modules/documents/vault'

// POST /api/documents/[id]/access — issue a ONE-TIME, minutes-TTL retrieval
// URL for a private-vault document (6.6.4). The response URL points at the
// authenticated proxy route /api/vault/<id> and is bound (HMAC) to
// {document, user, nonce, expiry}; retrieval consumes the nonce and
// re-authorizes access. Issuance is audited as DOCUMENT_URL_ISSUED —
// a distinct event from DOCUMENT_FILE_RETRIEVED (6.6.5).
//
// Body (optional): { ttlSeconds?: number } — callers may only SHORTEN the
// TTL (cap = server default 300s); never extend.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'documents:access', { limit: 120, windowMs: 60_000 }, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    let ttlSeconds: number | undefined
    try {
      const body = await req.json()
      const raw = Number((body as { ttlSeconds?: unknown })?.ttlSeconds)
      if (Number.isFinite(raw) && raw >= 1) ttlSeconds = Math.floor(raw)
    } catch {
      // empty/absent body is fine — default TTL
    }

    const issued = await issueVaultUrl(user.id, id, { ttlSeconds, ip: clientIp(req) })

    // opportunistic hygiene — expired grant reaper (throttled, never blocks)
    void reapExpiredGrantsThrottled()

    return NextResponse.json(issued, { status: 201 })
  } catch (err) {
    const status = (err as { status?: number }).status
    if (status === 403 || status === 404) {
      return NextResponse.json({ error: (err as Error).message }, { status })
    }
    console.error('documents access-url issue error', err)
    return NextResponse.json({ error: 'Could not issue a document link' }, { status: 500 })
  }
}
