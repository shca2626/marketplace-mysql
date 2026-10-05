import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { setSessionCookie, toSessionUser, verifyPassword, currentSessionToken, revokeSessionByToken } from '@/lib/auth'
import { assertSameOrigin, clientIp, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS, resetRateLimit } from '@/lib/rate-limit'
import { recordAudit } from '@/server/modules/audit/service'
import { buildSessionRbac } from '@/server/modules/rbac/service'
import { normalizeIdentifier } from '@/lib/phone'
import { isMfaEnrolled, mfaStatus, verifyMfaCode } from '@/server/modules/mfa/service'

/**
 * PHASE 3 — sign in with phone OR email (+ password).
 *   Phone: Yemeni mobile in any format ("777555888", "+967 777 555 888") or a
 *          generic E.164 number for staff accounts with international lines.
 *   Email: unchanged legacy path — every existing account keeps working.
 * The client may send either { identifier } or the legacy { email } field.
 *
 * PHASE 6 (lastplan v5 6.7): when the account has MFA enrolled, the password
 * alone is NOT enough — the response carries { mfaRequired: true } (HTTP 401)
 * and NO session cookie is issued until the client resubmits with a valid
 * { code } (TOTP or backup code). Successful MFA marks the session registry
 * row mfaSatisfiedAt (the step-up freshness anchor, 6.7.5).
 */
const loginSchema = z.object({
  identifier: z.string().min(3, 'Enter your phone number or email').max(60).optional(),
  email: z.string().max(60).optional(), // legacy field — treated as the identifier
  password: z.string().min(1, 'Password is required'),
  code: z.string().trim().max(20).optional(), // Phase 6: MFA code (TOTP / backup)
})

export async function POST(req: NextRequest) {
  try {
    // CSRF: login is an unsafe method on an auth route — block cross-site posts
    // (login-CSRF / session-fixation vector). Same-origin browsers pass; curl
    // (no Origin) is allowed and rate-limited separately below.
    const csrf = assertSameOrigin(req)
    if (csrf) return csrf

    // Brute-force damping per client IP. Failed attempts stay counted; a
    // successful login resets the bucket so honest users are never locked out.
    const rl = enforceRateLimit(req, 'login', RATE_LIMITS.login)
    if (rl) return rl

    const body = await req.json()
    const parsed = loginSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const rawIdentifier = (parsed.data.identifier ?? parsed.data.email ?? '').trim()
    const identified = normalizeIdentifier(rawIdentifier)
    if (!identified) {
      return NextResponse.json(
        { error: 'Enter a valid phone number or email address' },
        { status: 400 }
      )
    }

    const user = await db.user.findUnique({
      where: identified.kind === 'phone' ? { phone: identified.value } : { email: identified.value },
    })
    if (!user || !verifyPassword(parsed.data.password, user.password)) {
      // Auth-event audit (security roadmap §11): failed sign-in attempts are
      // recorded WITHOUT credentials or the attempted identifier — actorless.
      await recordAudit({
        actorType: 'SYSTEM',
        action: 'USER_LOGIN_FAILED',
        entityType: 'User',
        summary: 'Failed sign-in attempt (invalid credentials)',
        metadata: { ip: clientIp(req), via: identified.kind },
      })
      return NextResponse.json(
        { error: 'Invalid phone/email or password' },
        { status: 401 }
      )
    }
    // Suspended vendors (and any suspended account) cannot sign in — a clear
    // message instead of a silent rejection.
    if (user.status === 'SUSPENDED') {
      await recordAudit({
        actorType: 'SYSTEM',
        action: 'USER_LOGIN_FAILED',
        entityType: 'User',
        entityId: user.id,
        summary: 'Blocked sign-in attempt on suspended account',
        metadata: { reason: 'suspended' },
      })
      return NextResponse.json(
        { error: 'This account has been suspended by the platform administrator. Contact support to resolve this.' },
        { status: 403 }
      )
    }

    // ── Phase 6: MFA challenge (6.7.9) ─────────────────────────────────────
    const enrolled = await isMfaEnrolled(user.id)
    if (enrolled) {
      if (!parsed.data.code) {
        return NextResponse.json(
          {
            error: 'Enter the 6-digit code from your authenticator app (or a backup code).',
            mfaRequired: true,
          },
          { status: 401 }
        )
      }
      const verify = await verifyMfaCode(user.id, parsed.data.code)
      if (!verify.ok) {
        await recordAudit({
          actorType: 'SYSTEM',
          action: 'MFA_CHALLENGE_FAILED',
          entityType: 'User',
          entityId: user.id,
          summary: 'Failed MFA challenge at sign-in',
          metadata: { reason: verify.reason },
        })
        return NextResponse.json(
          {
            error: 'That code is not valid — codes rotate every 30 seconds; check your authenticator clock.',
            mfaRequired: true,
          },
          { status: 401 }
        )
      }
    }

    // Kill any stale pre-login session token this browser still holds (e.g. a
    // revoked one) so the registry never accumulates zombie rows.
    await revokeSessionByToken(await currentSessionToken(), 'LOGOUT')

    await setSessionCookie(user.id, user.sessionVersion, {
      userAgent: req.headers.get('user-agent'),
      ip: clientIp(req),
      mfaSatisfied: enrolled, // the login challenge WAS the MFA event (6.7.5)
    })

    // Break-glass accounts are login-alerted + audited on EVERY use (6.2.3).
    if (user.isBreakGlass) {
      await recordAudit({
        actorId: user.id,
        actorType: 'ADMIN',
        action: 'BREAK_GLASS_LOGIN',
        entityType: 'User',
        entityId: user.id,
        summary: `BREAK-GLASS account sign-in from ${clientIp(req)}`,
        metadata: { ip: clientIp(req), userAgent: req.headers.get('user-agent')?.slice(0, 200) ?? null },
      })
      console.error(`[auth] ⚠️ BREAK-GLASS LOGIN — ${user.email ?? user.id} @ ${clientIp(req)}`)
    }

    await recordAudit({
      actorId: user.id,
      actorType: 'USER',
      action: 'USER_LOGIN',
      entityType: 'User',
      entityId: user.id,
      summary: `Signed in via ${identified.kind}: ${identified.value}${enrolled ? ' (+MFA)' : ''}`,
    })
    resetRateLimit(`login:${clientIp(req)}`)
    const rbac = await buildSessionRbac(user)
    const mfa = await mfaStatus(user.id)
    return NextResponse.json({
      user: toSessionUser(user, rbac),
      mfa: { enrolled: mfa.enrolled, required: mfa.required },
    })
  } catch (err) {
    console.error('login error', err)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
