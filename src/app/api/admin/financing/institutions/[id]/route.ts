import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { financingError } from '@/server/modules/financing/catalog'
import { adminUpdateOrganization } from '@/server/modules/organizations/service'

// PATCH /api/admin/financing/institutions/[id] — verify / suspend /
// reactivate a financier ORGANIZATION (the org status transition is reused
// from the existing organizations service — audit + verifiedAt included).

const actionSchema = z.object({
  action: z.enum(['verify', 'suspend', 'reactivate']),
})

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'admin:financing', { limit: 60, windowMs: 60_000 }, user!.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const parsed = actionSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
    const status = parsed.data.action === 'suspend' ? 'SUSPENDED' : 'ACTIVE'
    const organization = await adminUpdateOrganization(id, user!.id, { status })
    return NextResponse.json({ organization })
  } catch (err) {
    const svc = financingError(err)
    if (svc) return NextResponse.json({ error: svc.message }, { status: svc.status })
    console.error('admin institution PATCH error', err)
    return NextResponse.json({ error: 'Failed to update institution' }, { status: 500 })
  }
}
