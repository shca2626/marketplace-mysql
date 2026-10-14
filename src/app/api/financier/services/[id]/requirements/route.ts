import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { financingError } from '@/server/modules/financing/catalog'
import { attachServiceRequirement, listServiceRequirements } from '@/server/modules/financing/conditions'
import { requirementAttachSchema } from '@/server/modules/financing/types'

// /api/financier/services/[id]/requirements — the per-service composer editor.
// GET  → all attachments (incl. inactive) for the financier's own service.
// POST → attach a condition template with required/order/instructions/autoPass.

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id } = await ctx.params
    // Authorization is enforced per-action inside the service
    // (assertFinancierStaffOfService holds financier.services.manage).
    const requirements = await listServiceRequirements(id)
    return NextResponse.json({ requirements })
  } catch (err) {
    const svc = financingError(err)
    if (svc) return NextResponse.json({ error: svc.message }, { status: svc.status })
    console.error('financier requirements GET error', err)
    return NextResponse.json({ error: 'Failed to load requirements' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financier:requirements', { limit: 60, windowMs: 60_000 }, user!.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const parsed = requirementAttachSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid attachment payload' },
        { status: 400 }
      )
    }
    const requirement = await attachServiceRequirement(user!.id, {
      serviceId: id,
      ...parsed.data,
    })
    return NextResponse.json({ requirement }, { status: 201 })
  } catch (err) {
    const svc = financingError(err)
    if (svc) return NextResponse.json({ error: svc.message }, { status: svc.status })
    console.error('financier requirements POST error', err)
    return NextResponse.json({ error: 'Failed to attach requirement' }, { status: 500 })
  }
}
