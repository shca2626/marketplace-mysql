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

/**
 * AUTHSEC-1 — consume a password-reset token and set the new password.
 * Side effects: single-use token burn (inside consume), sessionVersion bump
 * (kills every live session), remaining reset tokens deleted, confirmation
 * email to the account owner.
 */
const resetSchema = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/, 'Invalid reset link'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100),
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
    const { token, password } = parsed.data

    const userId = await consumePasswordResetToken(token)
    if (!userId) {
      return NextResponse.json(
        { error: 'This reset link is invalid, already used, or expired. Request a new one.' },
        { status: 400 }
      )
    }

    const user = await db.user.update({
      where: { id: userId },
      data: { password: hashPassword(password) },
    })
    await bumpSessionVersion(userId)
    await db.passwordResetToken.deleteMany({ where: { userId } })

    const mail = passwordChangedEmail({ name: user.name })
    void sendMail({ to: user.email, ...mail }).catch((err) => {
      console.error(`[auth] password-changed notice failed for user ${userId}:`, err)
    })

    await recordAudit({
      actorId: userId,
      actorType: 'USER',
      action: 'USER_PASSWORD_RESET',
      entityType: 'User',
      entityId: userId,
      summary: `Password reset completed: ${user.email}`,
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
