import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { recordAuditTx } from '@/server/modules/audit/service'

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

    // 6.11: version bump + registry revocation + audit row commit atomically.
    const revoked = await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { sessionVersion: { increment: 1 } },
        select: { id: true },
      })
      // Phase 6 (6.7.7): mark every registry row revoked — the version bump
      // kills the tokens; the registry records WHY for the audit trail.
      const res = await tx.sessionRegistry.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'ALL_SESSIONS' },
      })
      await recordAuditTx(tx, {
        actorId: user.id,
        actorType: 'USER',
        action: 'USER_SESSIONS_REVOKED',
        entityType: 'User',
        entityId: user.id,
        summary: `Signed out of all devices: ${user.email}`,
        metadata: { sessionsRevoked: res.count },
      })
      return res.count
    })

    return NextResponse.json({ ok: true, message: 'Signed out on all devices.' })
  } catch (err) {
    console.error('sign-out-everywhere error', err)
    return NextResponse.json({ error: 'Action failed' }, { status: 500 })
  }
}
