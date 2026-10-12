import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { adminRequestDossier, financingError, resolveAdminRequestType } from '@/server/modules/financing/catalog'
import { adminOpenReview } from '@/server/modules/financing/requests'
import { adminOpenAccreditationReview as openAccreditation } from '@/server/modules/financing/accreditation'

// /api/admin/financing/requests/[id] — the gate console's full dossier
// (polymorphic over both request types).
// GET   → request detail (submissions w/ templates, offers, agreement) +
//         the applicant's vault documents + additive User profile snapshot.
// PATCH → { action: 'open' } — SUBMITTED → UNDER_PLATFORM_REVIEW.

const actionSchema = z.object({ action: z.literal('open') })

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin('financing.gate.view')
  if (error) return error
  const csrf = assertSameOrigin(_req)
  if (csrf) return csrf
  const rl = enforceRateLimit(_req, 'admin:financing', { limit: 120, windowMs: 60_000 }, user!.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const dossier = await adminRequestDossier({ id: user!.id, role: user!.role }, id)
    return NextResponse.json(dossier)
  } catch (err) {
    const svc = financingError(err)
    if (svc) return NextResponse.json({ error: svc.message }, { status: svc.status })
    console.error('admin financing request GET error', err)
    return NextResponse.json({ error: 'Failed to load dossier' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin('financing.gate.review')
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
    const admin = { id: user!.id, role: user!.role }

    const type = await resolveAdminRequestType(id)
    if (type === 'FINANCING') {
      return NextResponse.json(await adminOpenReview({ admin, requestId: id }))
    }
    if (type === 'ACCREDITATION') {
      return NextResponse.json(await openAccreditation({ admin, requestId: id }))
    }
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  } catch (err) {
    const svc = financingError(err)
    if (svc) return NextResponse.json({ error: svc.message }, { status: svc.status })
    console.error('admin financing request PATCH error', err)
    return NextResponse.json({ error: 'Failed to open review' }, { status: 500 })
  }
}
