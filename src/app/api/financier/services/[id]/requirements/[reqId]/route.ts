import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { financingError } from '@/server/modules/financing/catalog'
import { detachServiceRequirement, updateServiceRequirement } from '@/server/modules/financing/conditions'
import { requirementUpdateSchema } from '@/server/modules/financing/types'

// /api/financier/services/[id]/requirements/[reqId]
// PATCH   → reorder / reconfigure (isRequired, instructions, autoPass).
// DELETE  → detach — ALWAYS soft (isActive=false; submissions are the record).

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; reqId: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financier:requirements', { limit: 60, windowMs: 60_000 }, user!.id)
  if (rl) return rl

  try {
    const { reqId } = await ctx.params
    const parsed = requirementUpdateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid requirement payload' },
        { status: 400 }
      )
    }
    const requirement = await updateServiceRequirement(user!.id, reqId, parsed.data)
    return NextResponse.json({ requirement })
  } catch (err) {
    const svc = financingError(err)
    if (svc) return NextResponse.json({ error: svc.message }, { status: svc.status })
    console.error('financier requirement PATCH error', err)
    return NextResponse.json({ error: 'Failed to update requirement' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string; reqId: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financier:requirements', { limit: 60, windowMs: 60_000 }, user!.id)
  if (rl) return rl

  try {
    const { reqId } = await ctx.params
    await detachServiceRequirement(user!.id, reqId)
    return NextResponse.json({ ok: true, status: 'detached' })
  } catch (err) {
    const svc = financingError(err)
    if (svc) return NextResponse.json({ error: svc.message }, { status: svc.status })
    console.error('financier requirement DELETE error', err)
    return NextResponse.json({ error: 'Failed to detach requirement' }, { status: 500 })
  }
}
