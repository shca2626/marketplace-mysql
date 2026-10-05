import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { assertSameOrigin, clientIp, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { recordAudit } from '@/server/modules/audit/service'
import { appBaseUrl, issuePasswordResetToken } from '@/lib/auth-tokens'
import { passwordResetEmail } from '@/lib/emails/auth-emails'
import { sendMail } from '@/lib/mailer'
import { normalizeIdentifier } from '@/lib/phone'
import { issueOtp } from '@/server/modules/otp/service'

/**
 * PHASE 3 — "Forgot password" by phone OR email.
 *   email → unchanged email-link flow (AUTHSEC-1)
 *   phone → WhatsApp OTP flow: request a RESET code here, verify it at
 *           /api/auth/otp/verify, then POST /api/auth/reset-password with
 *           { phone, otpToken, password }.
 * Always answers { ok: true } (no account enumeration).
 */
const forgotSchema = z.object({
  identifier: z.string().min(3, 'Enter your phone number or email').max(60).optional(),
  email: z.string().max(60).optional(), // legacy field — treated as the identifier
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

    const rawIdentifier = (parsed.data.identifier ?? parsed.data.email ?? '').trim()
    const identified = normalizeIdentifier(rawIdentifier)
    if (!identified) {
      return NextResponse.json({ error: 'Enter a valid phone number or email address' }, { status: 400 })
    }

    const user =
      (await db.user.findUnique({
        where: identified.kind === 'phone' ? { phone: identified.value } : { email: identified.value },
        select: { id: true, email: true, phone: true, status: true, name: true },
      })) ?? null

    if (identified.kind === 'email') {
      if (user && user.status !== 'SUSPENDED' && user.email) {
        const { raw } = await issuePasswordResetToken(user.id)
        const resetUrl = `${appBaseUrl()}/?view=reset-password&token=${raw}`
        const mail = passwordResetEmail({ name: user.name, resetUrl })
        const result = await sendMail({ to: user.email, ...mail })
        if (!result.ok) {
          console.error(`[auth] password-reset mail failed for user ${user.id}: ${result.error}`)
        }
      }
    } else if (user && user.status !== 'SUSPENDED') {
      // Phone path — issue a WhatsApp OTP (dev-console fallback keeps QA moving)
      const otp = await issueOtp({ phone: identified.value, purpose: 'RESET', ip: clientIp(req), userId: user.id })
      if (!otp.ok) {
        // Throttled — surface the same uniform message anyway (no enumeration),
        // the retry hint travels with the 429 from the OTP endpoint normally,
        // but here we keep the forgot-password contract stable.
        console.warn(`[auth] reset OTP throttled for ${identified.value}: ${otp.error}`)
      }
    }

    await recordAudit({
      actorType: 'SYSTEM',
      action: 'USER_PASSWORD_RESET_REQUESTED',
      entityType: 'User',
      entityId: user?.id,
      summary: `Password reset requested via ${identified.kind}`,
    })

    return NextResponse.json({
      ok: true,
      via: identified.kind,
      message:
        identified.kind === 'phone'
          ? 'If an account exists for that number, a reset code was sent to its WhatsApp. Enter it on the reset page.'
          : 'If an account exists for that email, a reset link is on its way. Check your inbox (and spam folder).',
    })
  } catch (err) {
    console.error('forgot-password error', err)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
