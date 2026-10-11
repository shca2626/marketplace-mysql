import { NextRequest, NextResponse } from 'next/server'
import { clientIp, enforceRateLimit } from '@/lib/http'
import { handleWebhookDelivery } from '@/server/modules/kyc/provider/webhook'

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/kyc/webhook/[providerKey] — the EXTERNAL provider decision channel
// (Phase 12.4). PUBLIC route by design: the HMAC-SHA256 signature IS the
// authentication (X-Vendora-Signature over
// `${X-Vendora-Timestamp}.${X-Vendora-Nonce}.${rawBody}`).
//
//   valid + fresh + new eventId → decision applied once, 200
//   duplicate eventId           → no-op, 200 {duplicate: true}
//   replayed nonce              → 400 (DB unique constraint is the enforcement)
//   stale timestamp (>±5min)   → 400 replay-window rejection
//   missing/invalid signature   → 401 + receive-log row + audited
//
// Every delivery (valid or not) writes an immutable KycWebhookEvent row.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_BODY_BYTES = 64 * 1024

export async function POST(req: NextRequest, ctx: { params: Promise<{ providerKey: string }> }) {
  const { providerKey } = await ctx.params

  // Nice-to-have damping — the signature + replay protection is the core.
  const rl = enforceRateLimit(req, 'kyc:webhook', { limit: 120, windowMs: 60_000 }, clientIp(req))
  if (rl) return rl

  const rawBody = await req.text()
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Webhook body too large' }, { status: 413 })
  }

  const result = await handleWebhookDelivery({
    providerKey,
    rawBody,
    signature: req.headers.get('x-vendora-signature'),
    timestamp: req.headers.get('x-vendora-timestamp'),
    nonce: req.headers.get('x-vendora-nonce'),
    ip: clientIp(req),
  })
  return NextResponse.json(result.body, { status: result.status })
}
