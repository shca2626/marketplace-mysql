import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { recordAudit } from '@/server/modules/audit/service'
import { consumeEmailVerificationToken } from '@/lib/auth-tokens'

/**
 * AUTHSEC-1 — consume an email-verification token and stamp emailVerifiedAt.
 * Idempotent for already-verified accounts (the link may be re-clicked).
 */
const confirmSchema = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/, 'Invalid verification link'),
})

export async function POST(req: NextRequest) {
  try {
    const csrf = assertSameOrigin(req)
    if (csrf) return csrf
    const rl = enforceRateLimit(req, 'emailVerifyConfirm', RATE_LIMITS.passwordReset)
    if (rl) return rl

    const body = await req.json()
    const parsed = confirmSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'This verification link is malformed. Request a new one from Account → Security.' },
        { status: 400 }
      )
    }

    const userId = await consumeEmailVerificationToken(parsed.data.token)
    if (!userId) {
      return NextResponse.json(
        { error: 'This verification link is invalid, already used, or expired. Request a new one from Account → Security.' },
        { status: 400 }
      )
    }

    const user = await db.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    })

    await recordAudit({
      actorId: userId,
      actorType: 'USER',
      action: 'USER_EMAIL_VERIFIED',
      entityType: 'User',
      entityId: userId,
      summary: `Email verified: ${user.email}`,
    })

    return NextResponse.json({
      ok: true,
      email: user.email,
      message: 'Email verified — your account is fully confirmed.',
    })
  } catch (err) {
    console.error('verify-email confirm error', err)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}
