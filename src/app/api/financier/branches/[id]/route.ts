import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { requireFinancierStaffOrThrow } from '@/server/modules/financing/guards'
import { deactivateBranch, financingError, updateBranch } from '@/server/modules/financing/catalog'
import { branchUpdateSchema } from '@/server/modules/financing/types'

// /api/financier/branches/[id] — update or deactivate (soft) an own branch.

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financier:branches', { limit: 30, windowMs: 60_000 }, user!.id)
  if (rl) return rl

  try {
    const staff = await requireFinancierStaffOrThrow({ id: user!.id }, 'org.profile.update')
    const { id } = await ctx.params
    const parsed = branchUpdateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid branch payload' },
        { status: 400 }
      )
    }
    const branch = await updateBranch(staff, id, parsed.data)
    return NextResponse.json({ branch })
  } catch (err) {
    const svc = financingError(err)
    if (svc) return NextResponse.json({ error: svc.message }, { status: svc.status })
    console.error('financier branch PATCH error', err)
    return NextResponse.json({ error: 'Failed to update branch' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  try {
    const staff = await requireFinancierStaffOrThrow({ id: user!.id }, 'org.profile.update')
    const { id } = await ctx.params
    await deactivateBranch(staff, id)
    return NextResponse.json({ ok: true, status: 'deactivated' })
  } catch (err) {
    const svc = financingError(err)
    if (svc) return NextResponse.json({ error: svc.message }, { status: svc.status })
    console.error('financier branch DELETE error', err)
    return NextResponse.json({ error: 'Failed to deactivate branch' }, { status: 500 })
  }
}
