import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { setSessionCookie, toSessionUser, verifyPassword } from '@/lib/auth'
import { assertSameOrigin, clientIp, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS, resetRateLimit } from '@/lib/rate-limit'
import { recordAudit } from '@/server/modules/audit/service'

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
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
    const { email, password } = parsed.data

    const user = await db.user.findUnique({ where: { email: email.toLowerCase() } })
    if (!user || !verifyPassword(password, user.password)) {
      // Auth-event audit (security roadmap §11): failed sign-in attempts are
      // recorded WITHOUT credentials or the attempted identifier — actorless.
      await recordAudit({
        actorType: 'SYSTEM',
        action: 'USER_LOGIN_FAILED',
        entityType: 'User',
        summary: 'Failed sign-in attempt (invalid credentials)',
        metadata: { ip: clientIp(req) },
      })
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
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

    await setSessionCookie(user.id)
    await recordAudit({
      actorId: user.id,
      actorType: 'USER',
      action: 'USER_LOGIN',
      entityType: 'User',
      entityId: user.id,
      summary: `Signed in: ${user.email}`,
    })
    resetRateLimit(`login:${clientIp(req)}`)
    return NextResponse.json({ user: toSessionUser(user) })
  } catch (err) {
    console.error('login error', err)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
