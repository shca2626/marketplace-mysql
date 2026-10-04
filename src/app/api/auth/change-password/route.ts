import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getSessionUser, hashPassword, setSessionCookie, verifyPassword } from '@/lib/auth'
import { assertSameOrigin, enforceRateLimit, clientIp } from '@/lib/http'
import { recordAudit } from '@/server/modules/audit/service'
import { bumpSessionVersion } from '@/lib/auth-tokens'
import { passwordChangedEmail } from '@/lib/emails/auth-emails'
import { sendMail } from '@/lib/mailer'

/**
 * POST /api/auth/change-password — change the password from INSIDE the app
 * while signed in (BUY-211). Mirrors the AUTHSEC-1 reset-password semantics:
 *   • the current password must be proven first (session alone is not enough —
 *     a stolen laptop cookie cannot silently take over the account),
 *   • the new password follows the registration rules (8–100 chars),
 *   • sessionVersion is bumped (every OTHER device signs out) and this
 *     browser is immediately re-issued a token for the new epoch, so the
 *     current session survives the change,
 *   • the account owner gets a fire-and-forget notice email.
 */
const changeSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters')
    .max(100, 'New password must be at most 100 characters'),
})

export async function POST(req: NextRequest) {
  try {
    const csrf = assertSameOrigin(req)
    if (csrf) return csrf

    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Please sign in first' }, { status: 401 })

    // Per-user policy — same damping family as passwordReset (token consumption
    // attempts) since both mutate the credential.
    const rl = enforceRateLimit(req, 'changePassword', { limit: 10, windowMs: 30 * 60_000 }, user.id)
    if (rl) return rl

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 })
    }

    const parsed = changeSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const { currentPassword, newPassword } = parsed.data

    if (!verifyPassword(currentPassword, user.password)) {
      return NextResponse.json(
        { error: 'Your current password is incorrect — check it and try again.' },
        { status: 400 }
      )
    }
    if (currentPassword === newPassword) {
      return NextResponse.json(
        { error: 'The new password must be different from your current password.' },
        { status: 400 }
      )
    }

    await db.user.update({
      where: { id: user.id },
      data: { password: hashPassword(newPassword) },
    })

    // Sign-out-everywhere semantics for OTHER sessions; this one stays valid by
    // re-issuing its cookie against the new sessionVersion epoch.
    const newVersion = await bumpSessionVersion(user.id)
    await setSessionCookie(user.id, newVersion, {
      userAgent: req.headers.get('user-agent'),
      ip: clientIp(req),
    })

    if (user.email) {
      const mail = passwordChangedEmail({ name: user.name })
      void sendMail({ to: user.email, ...mail }).catch((err) => {
        console.error(`[auth] password-changed notice failed for user ${user.id}:`, err)
      })
    }

    await recordAudit({
      actorId: user.id,
      actorType: 'USER',
      action: 'USER_PASSWORD_CHANGED',
      entityType: 'User',
      entityId: user.id,
      summary: `Password changed while signed in: ${user.email}`,
    })

    return NextResponse.json({
      ok: true,
      message: 'Password updated. Other devices were signed out; you stay signed in here.',
    })
  } catch (err) {
    console.error('change-password error', err)
    return NextResponse.json({ error: 'Could not change your password' }, { status: 500 })
  }
}
