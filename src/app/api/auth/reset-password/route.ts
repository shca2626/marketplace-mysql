import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { recordAudit } from '@/server/modules/audit/service'
import { bumpSessionVersion, consumePasswordResetToken } from '@/lib/auth-tokens'
import { passwordChangedEmail } from '@/lib/emails/auth-emails'
import { sendMail } from '@/lib/mailer'
import { normalizeYemeniPhone } from '@/lib/phone'
import { verifyOtpProof } from '@/server/modules/otp/service'

/**
 * AUTHSEC-1 + PHASE 3 — set a new password via one of two proofs:
 *   EMAIL path: { token, password }            — 64-hex single-use link token
 *   PHONE path: { phone, otpToken, password }   — WhatsApp OTP possession proof
 *                                              (phone-optional-email accounts)
 * Side effects: token burn / proof consumption, sessionVersion bump (kills
 * every live session), remaining reset tokens deleted, confirmation email
 * when the account has an email.
 */
const resetSchema = z
  .object({
    token: z.string().regex(/^[0-9a-f]{64}$/, 'Invalid reset link').optional(),
    phone: z.string().min(9).max(20).optional(),
    otpToken: z.string().min(20, 'Phone verification is required').max(200).optional(),
    password: z.string().min(8, 'Password must be at least 8 characters').max(100),
  })
  .refine((d) => Boolean(d.token) || Boolean(d.phone && d.otpToken), {
    message: 'A reset token or a verified phone is required',
  })

export async function POST(req: NextRequest) {
  try {
    const csrf = assertSameOrigin(req)
    if (csrf) return csrf
    const rl = enforceRateLimit(req, 'passwordReset', RATE_LIMITS.passwordReset)
    if (rl) return rl

    const body = await req.json()
    const parsed = resetSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const { password } = parsed.data

    // ── Resolve the account by proof ──
    let userId: string | null = null
    if (parsed.data.token) {
      userId = await consumePasswordResetToken(parsed.data.token)
      if (!userId) {
        return NextResponse.json(
          { error: 'This reset link is invalid, already used, or expired. Request a new one.' },
          { status: 400 }
        )
      }
    } else {
      const phone = normalizeYemeniPhone(parsed.data.phone ?? '')
      if (!phone || !parsed.data.otpToken || !verifyOtpProof(parsed.data.otpToken, phone, 'RESET')) {
        return NextResponse.json(
          { error: 'Phone verification is missing or expired — request a new code.' },
          { status: 400 }
        )
      }
      const account = await db.user.findUnique({ where: { phone }, select: { id: true } })
      if (!account) {
        // Uniform failure — no account enumeration
        return NextResponse.json(
          { error: 'This code is invalid, already used, or expired. Request a new one.' },
          { status: 400 }
        )
      }
      userId = account.id
    }

    const user = await db.user.update({
      where: { id: userId },
      data: { password: hashPassword(password) },
    })
    await bumpSessionVersion(userId)
    await db.passwordResetToken.deleteMany({ where: { userId } })
    await db.otpCode.deleteMany({ where: { phone: user.phone ?? '__none__', purpose: 'RESET' } })

    if (user.email) {
      const mail = passwordChangedEmail({ name: user.name })
      void sendMail({ to: user.email, ...mail }).catch((err) => {
        console.error(`[auth] password-changed notice failed for user ${userId}:`, err)
      })
    }

    await recordAudit({
      actorId: userId,
      actorType: 'USER',
      action: 'USER_PASSWORD_RESET',
      entityType: 'User',
      entityId: userId,
      summary: `Password reset completed${user.phone ? ` via phone ${user.phone}` : ''}`,
    })

    return NextResponse.json({
      ok: true,
      message: 'Password updated. Sign in with your new password.',
    })
  } catch (err) {
    console.error('reset-password error', err)
    return NextResponse.json({ error: 'Reset failed' }, { status: 500 })
  }
}
