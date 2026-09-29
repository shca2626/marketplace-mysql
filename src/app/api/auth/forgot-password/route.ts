import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { recordAudit } from '@/server/modules/audit/service'
import { appBaseUrl, issuePasswordResetToken } from '@/lib/auth-tokens'
import { passwordResetEmail } from '@/lib/emails/auth-emails'
import { sendMail } from '@/lib/mailer'

/**
 * AUTHSEC-1 — "Forgot password" request.
 * Always answers { ok: true } (no account enumeration); the email is only
 * minted + sent when the account exists. Rate-limited per IP.
 */
const forgotSchema = z.object({
  email: z.string().email('Invalid email address'),
})

export async function POST(req: NextRequest) {
  try {
    const csrf = assertSameOrigin(req)
    if (csrf) return csrf
    const rl = enforceRateLimit(req, 'passwordForgot', RATE_LIMITS.passwordForgot)
    if (rl) return rl

    const body = await req.json()
    const parsed = forgotSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const user = await db.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } })
    if (user && user.status !== 'SUSPENDED') {
      const { raw } = await issuePasswordResetToken(user.id)
      const resetUrl = `${appBaseUrl()}/?view=reset-password&token=${raw}`
      const mail = passwordResetEmail({ name: user.name, resetUrl })
      const result = await sendMail({ to: user.email, ...mail })
      if (!result.ok) {
        // The user must never learn about transport trouble here — the response
        // stays uniform; the failure is logged for ops instead.
        console.error(`[auth] password-reset mail failed for user ${user.id}: ${result.error}`)
      }
      await recordAudit({
        actorType: 'SYSTEM',
        action: 'USER_PASSWORD_RESET_REQUESTED',
        entityType: 'User',
        entityId: user.id,
        summary: 'Password reset link requested',
      })
    } else if (user) {
      // Suspended account — audit only; identical response to the client.
      await recordAudit({
        actorType: 'SYSTEM',
        action: 'USER_PASSWORD_RESET_REQUESTED',
        entityType: 'User',
        entityId: user.id,
        summary: 'Password reset link requested on suspended account (blocked)',
      })
    }

    return NextResponse.json({
      ok: true,
      message: 'If an account exists for that email, a reset link is on its way. Check your inbox (and spam folder).',
    })
  } catch (err) {
    console.error('forgot-password error', err)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
