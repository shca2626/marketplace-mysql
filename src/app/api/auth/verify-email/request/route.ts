import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { recordAudit } from '@/server/modules/audit/service'
import { appBaseUrl, issueEmailVerificationToken } from '@/lib/auth-tokens'
import { emailVerificationEmail } from '@/lib/emails/auth-emails'
import { sendMail } from '@/lib/mailer'

/**
 * AUTHSEC-1 — (re)send the email-verification link for the signed-in user.
 * Per-user rate limit keeps Resend outbound traffic damped.
 */
export async function POST(req: NextRequest) {
  try {
    const csrf = assertSameOrigin(req)
    if (csrf) return csrf

    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    }
    const rl = enforceRateLimit(req, 'emailVerify', RATE_LIMITS.emailVerify, user.id)
    if (rl) return rl

    if (user.emailVerifiedAt) {
      return NextResponse.json({ error: 'This email is already verified.' }, { status: 400 })
    }

    // Phase 3: phone-first accounts have no email to verify — their phone is
    // already OTP-verified at registration.
    if (!user.email) {
      return NextResponse.json(
        { error: 'This account has no email on file — your phone number is already verified.' },
        { status: 400 }
      )
    }

    const { raw } = await issueEmailVerificationToken(user.id)
    const verifyUrl = `${appBaseUrl()}/?view=verify-email&token=${raw}`
    const mail = emailVerificationEmail({ name: user.name, verifyUrl })
    const result = await sendMail({ to: user.email, ...mail })
    if (!result.ok) {
      console.error(`[auth] verification mail failed for user ${user.id}: ${result.error}`)
      return NextResponse.json(
        { error: 'The email could not be sent right now. Please try again in a few minutes.' },
        { status: 502 }
      )
    }

    await recordAudit({
      actorId: user.id,
      actorType: 'USER',
      action: 'USER_EMAIL_VERIFICATION_SENT',
      entityType: 'User',
      entityId: user.id,
      summary: `Verification email sent: ${user.email}`,
    })

    return NextResponse.json({
      ok: true,
      message: 'Verification link sent — check your inbox (and spam folder).',
    })
  } catch (err) {
    console.error('verify-email request error', err)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
