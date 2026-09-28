import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionUser } from '@/lib/auth'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import {
  buildDigestForUser,
  getDigestFrequency,
  listDigestHistory,
  persistAndDeliverDigest,
  setDigestFrequency,
  type DigestFrequency,
  type DigestKind,
} from '@/lib/notifications/digest'

// /api/notifications/digest — per-user email digest preferences + history.
// GET  → last 10 stored digests (no HTML blobs) + frequency preference.
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

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const [digests, frequency] = await Promise.all([
      listDigestHistory(user.id, 10),
      getDigestFrequency(user.id),
    ])
    return NextResponse.json({ digests, frequency })
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
