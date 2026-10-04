import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getSessionUser, toSessionUser } from '@/lib/auth'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { recordAudit } from '@/server/modules/audit/service'
import { buildSessionRbac } from '@/server/modules/rbac/service'

const schema = z.object({
  storeName: z.string().min(2, 'Store name must be at least 2 characters').max(60),
  storeBio: z.string().max(300).optional().nullable(),
})

// POST /api/auth/become-seller — upgrade buyer account to seller
export async function POST(req: NextRequest) {
  try {
    const csrf = assertSameOrigin(req)
    if (csrf) return csrf

    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Please sign in first' }, { status: 401 })

    const rl = enforceRateLimit(req, 'become-seller', { limit: 5, windowMs: 10 * 60_000 }, user.id)
    if (rl) return rl

    if (user.role === 'SELLER') {
      const rbac = await buildSessionRbac(user)
      return NextResponse.json({ user: toSessionUser(user, rbac) })
    }
    // Admins must not lose their platform role through the storefront flow —
    // this guard prevents the "staff downgraded to seller" regression.
    // Phase 6: staff = any platform-scope RBAC assignment (or the legacy ADMIN badge).
    const staffAssignment = await db.userRole.findFirst({ where: { userId: user.id, organizationId: '' }, select: { id: true } })
    if (user.role === 'ADMIN' || staffAssignment) {
      return NextResponse.json(
        { error: 'Admin accounts already have full marketplace access' },
        { status: 403 }
      )
    }

    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const updated = await db.user.update({
      where: { id: user.id },
      data: {
        role: 'SELLER',
        storeName: parsed.data.storeName,
        storeBio: parsed.data.storeBio ?? null,
      },
    })

    await recordAudit({
      actorId: user.id,
      actorType: 'USER',
      action: 'USER_BECAME_SELLER',
      entityType: 'User',
      entityId: user.id,
      summary: `Account upgraded to seller: "${updated.storeName}"`,
    })

    const rbac = await buildSessionRbac(updated)
    return NextResponse.json({ user: toSessionUser(updated, rbac) })
  } catch (err) {
    console.error('become-seller error', err)
    return NextResponse.json({ error: 'Failed to upgrade account' }, { status: 500 })
  }
}
