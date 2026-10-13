import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { getSessionUser, SESSION_COOKIE } from '@/lib/auth'
import { assertSameOrigin } from '@/lib/http'
import { sha256Hex } from '@/lib/secret-box'
import { recordAuditTx } from '@/server/modules/audit/service'

/**
 * Phase 6 (6.7.7) — the session registry, self-service.
 *   GET    /api/auth/sessions        → active sessions for THIS account
 *   DELETE /api/auth/sessions { id }  → revoke one session (any device)
 *   DELETE /api/auth/sessions { all } → revoke all OTHER sessions
 *
 * The "all-kill" (including the current browser) remains
 * /api/auth/sign-out-everywhere — the sessionVersion bump.
 */

const revokeSchema = z.object({
  id: z.string().max(64).optional(),
  all: z.boolean().optional(),
})

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Please sign in first' }, { status: 401 })

  const cookieStore = await cookies()
  const currentHash = sha256Hex(cookieStore.get(SESSION_COOKIE)?.value ?? '')

  const rows = await db.sessionRegistry.findMany({
    where: { userId: user.id },
    orderBy: { lastUsedAt: 'desc' },
    take: 50,
  })
  return NextResponse.json({
    sessions: rows.map((r) => ({
      id: r.id,
      current: r.tokenHash === currentHash,
      userAgent: r.userAgent,
      ip: r.ip,
      createdAt: r.createdAt.toISOString(),
      lastUsedAt: r.lastUsedAt.toISOString(),
      revokedAt: r.revokedAt?.toISOString() ?? null,
      revokedReason: r.revokedReason,
      mfaSatisfiedAt: r.mfaSatisfiedAt?.toISOString() ?? null,
    })),
  })
}

export async function DELETE(req: NextRequest) {
  try {
    const csrf = assertSameOrigin(req)
    if (csrf) return csrf

    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Please sign in first' }, { status: 401 })

    const parsed = revokeSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    const { id, all } = parsed.data

    if (all) {
      // Revoke every OTHER session (the current one survives).
      const currentHash = sha256Hex((await cookies()).get(SESSION_COOKIE)?.value ?? '')
      // 6.11: revocation + audit row commit atomically (coverage addition).
      const res = await db.$transaction(async (tx) => {
        const r = await tx.sessionRegistry.updateMany({
          where: { userId: user.id, revokedAt: null, NOT: { tokenHash: currentHash } },
          data: { revokedAt: new Date(), revokedReason: 'REVOKED_BY_USER' },
        })
        if (r.count > 0) {
          await recordAuditTx(tx, {
            actorId: user.id,
            actorType: 'USER',
            action: 'SESSIONS_REVOKED_OTHERS',
            entityType: 'User',
            entityId: user.id,
            summary: `Signed out ${r.count} other device session(s)`,
            metadata: { revoked: r.count },
          })
        }
        return r
      })
      return NextResponse.json({ ok: true, revoked: res.count })
    }

    if (!id) return NextResponse.json({ error: 'Which session?' }, { status: 400 })
    const row = await db.sessionRegistry.findUnique({ where: { id } })
    if (!row || row.userId !== user.id) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }
    if (row.revokedAt) return NextResponse.json({ ok: true, revoked: 0 })
    // 6.11: revocation + audit row commit atomically (coverage addition).
    await db.$transaction(async (tx) => {
      await tx.sessionRegistry.update({
        where: { id },
        data: { revokedAt: new Date(), revokedReason: 'REVOKED_BY_USER' },
      })
      await recordAuditTx(tx, {
        actorId: user.id,
        actorType: 'USER',
        action: 'SESSION_REVOKED',
        entityType: 'SessionRegistry',
        entityId: id,
        summary: `Session revoked (device: ${row.userAgent?.slice(0, 80) ?? 'unknown'})`,
        metadata: { ip: row.ip },
      })
    })
    // If the revoked row is the CURRENT browser's, clear the cookie too.
    const currentHash = sha256Hex((await cookies()).get(SESSION_COOKIE)?.value ?? '')
    if (row.tokenHash === currentHash) {
      const cookieStore = await cookies()
      cookieStore.delete(SESSION_COOKIE)
    }
    return NextResponse.json({ ok: true, revoked: 1 })
  } catch (err) {
    console.error('sessions route error', err)
    return NextResponse.json({ error: 'Failed to manage sessions' }, { status: 500 })
  }
}
