import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { recordAudit } from '@/server/modules/audit/service'
import { bumpSessionVersion } from '@/lib/auth-tokens'

/**
 * AUTHSEC-1 — "Sign out everywhere": bumps the user's sessionVersion so every
 * stateless token (this browser included) stops resolving. The client then
 * clears its local state and redirects home.
 */
export async function POST(req: NextRequest) {
  try {
    const csrf = assertSameOrigin(req)
    if (csrf) return csrf

    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    }
    // Per-user policy (not per-IP): the actor is authenticated here.
    const rl = enforceRateLimit(req, 'signOutEverywhere', RATE_LIMITS.passwordReset, user.id)
    if (rl) return rl

    await bumpSessionVersion(user.id)

    await recordAudit({
      actorId: user.id,
      actorType: 'USER',
      action: 'USER_SESSIONS_REVOKED',
      entityType: 'User',
      entityId: user.id,
      summary: `Signed out of all devices: ${user.email}`,
    })

    return NextResponse.json({ ok: true, message: 'Signed out on all devices.' })
  } catch (err) {
    console.error('sign-out-everywhere error', err)
    return NextResponse.json({ error: 'Action failed' }, { status: 500 })
  }
}
