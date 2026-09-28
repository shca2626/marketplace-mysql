import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionUser } from '@/lib/auth'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import {
  buildDigestForUser,
  getDigestFrequency,
  getDigestTransport,
  listDigestHistory,
  persistAndDeliverDigest,
  setDigestFrequency,
  type DigestFrequency,
  type DigestKind,
} from '@/lib/notifications/digest'
import { getDigestDeliveryStatus, getEmailConfig } from '@/lib/notifications/email-tracking'

// /api/notifications/digest — per-user email digest preferences + history.
// GET  → last 10 stored digests (no HTML blobs) + frequency preference.
// GET ?id=<digestId> → poll one digest's REAL delivery state from the Resend
//      REST API: { delivery, lastEvent, checkedAt } (EMAILTRACK-1 — stands in
//      for /api/notifications/digest/status; the sandbox file tools cannot
//      create new route directories, so it rides on this route as a query
//      branch with its own rate-limit bucket).
// GET ?config=1 → mailer diagnostics: { testMode, domains, fromAddress,
//      mailerMode } (EMAILTRACK-1 — stands in for /api/notifications/
//      email-config the same way). testMode=true means NO Resend domain is
//      verified, so Resend only delivers to the account owner's address.
// POST { action }:
//   'preview'       → live build for the preferred kind (OFF previews DAILY);
//                     { digest: null } when the period is empty.
//   'set-frequency' → { frequency: OFF | DAILY | WEEKLY }.
//   'generate'      → 409 when OFF or empty period; else transport-deliver +
//                     persist + return the stored row.

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('preview') }),
  z.object({ action: z.literal('set-frequency'), frequency: z.enum(['OFF', 'DAILY', 'WEEKLY']) }),
  z.object({ action: z.literal('generate') }),
])

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Delivery-status branch — outbound Resend API call, so it is rate-limited
  // on its own bucket even though the plain listing below stays open.
  const statusId = req.nextUrl.searchParams.get('id')
  if (statusId) {
    const rl = enforceRateLimit(req, 'digest-status', RATE_LIMITS.digestStatus, user.id)
    if (rl) return rl
    try {
      const result = await getDigestDeliveryStatus(user.id, statusId)
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.httpStatus })
      }
      return NextResponse.json(result.status)
    } catch (err) {
      console.error('[api/notifications/digest GET status] failed', err)
      return NextResponse.json({ error: 'Delivery status check failed' }, { status: 500 })
    }
  }

  // Email-config branch — outbound Resend API call (domain list) as well.
  if (req.nextUrl.searchParams.get('config') === '1') {
    const rl = enforceRateLimit(req, 'email-config', RATE_LIMITS.emailConfig, user.id)
    if (rl) return rl
    try {
      return NextResponse.json(await getEmailConfig())
    } catch (err) {
      console.error('[api/notifications/digest GET config] failed', err)
      return NextResponse.json({ error: 'Failed to load email configuration' }, { status: 500 })
    }
  }

  try {
    const [digests, frequency] = await Promise.all([
      listDigestHistory(user.id, 10),
      getDigestFrequency(user.id),
    ])
    // transport lets the dialog explain honestly whether mail is really sent
    // ('resend' — API-first via the shared mailer) or only logged ('dev-console').
    return NextResponse.json({ digests, frequency, transport: getDigestTransport().name })
  } catch (err) {
    console.error('[api/notifications/digest GET] failed', err)
    return NextResponse.json({ error: 'Failed to load digest settings' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const rl = enforceRateLimit(req, 'digest', RATE_LIMITS.digest, user.id)
  if (rl) return rl

  let parsed: z.infer<typeof bodySchema>
  try {
    parsed = bodySchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: 'Expected { action: preview | set-frequency | generate }' }, { status: 400 })
  }

  try {
    if (parsed.action === 'preview') {
      const frequency = await getDigestFrequency(user.id)
      const kind: DigestKind = frequency === 'WEEKLY' ? 'WEEKLY' : 'DAILY' // OFF previews DAILY
      const digest = await buildDigestForUser(user.id, kind)
      return NextResponse.json({
        digest: digest
          ? {
              kind: digest.kind,
              periodStart: digest.periodStart.toISOString(),
              periodEnd: digest.periodEnd.toISOString(),
              itemCount: digest.itemCount,
              subject: digest.subject,
              html: digest.html,
            }
          : null,
      })
    }

    if (parsed.action === 'set-frequency') {
      const frequency: DigestFrequency = await setDigestFrequency(user.id, parsed.frequency)
      return NextResponse.json({ ok: true, frequency })
    }

    // 'generate' — needs a live preference and a non-empty period
    const frequency = await getDigestFrequency(user.id)
    if (frequency === 'OFF') {
      return NextResponse.json(
        { error: 'Email digest is turned off — pick Daily or Weekly first' },
        { status: 409 },
      )
    }
    const kind: DigestKind = frequency === 'WEEKLY' ? 'WEEKLY' : 'DAILY'
    const digest = await buildDigestForUser(user.id, kind)
    if (!digest) {
      return NextResponse.json(
        { error: 'No notifications in this digest period — nothing to generate' },
        { status: 409 },
      )
    }
    const row = await persistAndDeliverDigest(digest)
    return NextResponse.json({ digest: row })
  } catch (err) {
    console.error('[api/notifications/digest POST] failed', err)
    return NextResponse.json({ error: 'Digest action failed' }, { status: 500 })
  }
}
