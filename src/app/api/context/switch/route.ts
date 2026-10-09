import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { assertSameOrigin } from '@/lib/http'
import { getSessionUser } from '@/lib/auth'
import { ACTIVE_ORG_COOKIE } from '@/server/authz/context'
import { recordAudit } from '@/server/modules/audit/service'

export const dynamic = 'force-dynamic'

const switchSchema = z.object({
  /** 'personal' returns to the personal context; an org id selects it (validated). */
  organizationId: z.string().max(191),
})

/**
 * POST /api/context/switch — select the active context (personal or one of
 * the user's organizations). The cookie is a SELECTOR only: membership is
 * re-verified server-side on every request by the authz resolver. Switching
 * never carries permissions across contexts — the resolver recomputes grants
 * for the new context from scratch.
 */
export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Please sign in first', code: 'UNAUTHENTICATED' }, { status: 401 })
  }

  const parsed = switchSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', code: 'INVALID_CONTEXT' }, { status: 400 })
  }
  const { organizationId } = parsed.data
  const cookieStore = await cookies()

  if (organizationId === 'personal' || organizationId === '') {
    cookieStore.delete(ACTIVE_ORG_COOKIE)
    return NextResponse.json({ ok: true, activeOrg: null })
  }

  // Selector → proof: live membership + org status check.
  const membership = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId: user.id } },
    include: { organization: { select: { id: true, name: true, orgType: true, status: true, slug: true } } },
  })
  if (!membership) {
    return NextResponse.json(
      { error: 'You are not a member of that organization', code: 'NO_MEMBERSHIP' },
      { status: 403, headers: { 'X-Authz-Deny': 'NO_MEMBERSHIP' } }
    )
  }
  if (membership.organization.status === 'SUSPENDED') {
    return NextResponse.json(
      { error: 'That organization is suspended', code: 'ORG_SUSPENDED' },
      { status: 403, headers: { 'X-Authz-Deny': 'ORG_SUSPENDED' } }
    )
  }

  cookieStore.set(ACTIVE_ORG_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })

  await recordAudit({
    actorId: user.id,
    actorType: 'USER',
    action: 'CONTEXT_SWITCHED',
    entityType: 'Organization',
    entityId: organizationId,
    summary: `Active context switched to "${membership.organization.name}"`,
    metadata: { organizationId, orgType: membership.organization.orgType },
  })

  return NextResponse.json({
    ok: true,
    activeOrg: {
      id: membership.organization.id,
      name: membership.organization.name,
      slug: membership.organization.slug,
      orgType: membership.organization.orgType,
      status: membership.organization.status,
      membershipRole: membership.role,
    },
  })
}
