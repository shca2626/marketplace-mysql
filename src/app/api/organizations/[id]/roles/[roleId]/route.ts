import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { updateOrgRole, deleteOrgRole, OrgRbacError } from '@/server/modules/org-rbac/service'
import { assertSameOrigin } from '@/lib/http'

const updateRoleSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  permissions: z.array(z.string()).min(1).max(50).optional(),
})

// PATCH /api/organizations/[id]/roles/[roleId] — edit a custom org role
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; roleId: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id, roleId } = await ctx.params
    const parsed = updateRoleSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    const role = await updateOrgRole(user!.id, id, roleId, parsed.data)
    return NextResponse.json({ role })
  } catch (err) {
    if (err instanceof OrgRbacError) {
      return NextResponse.json({ error: err.message, code: 'DENIED' }, { status: err.status })
    }
    console.error('org role PATCH error', err)
    return NextResponse.json({ error: 'Failed to update role' }, { status: 500 })
  }
}

// DELETE /api/organizations/[id]/roles/[roleId] — delete a custom org role
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string; roleId: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id, roleId } = await ctx.params
    const result = await deleteOrgRole(user!.id, id, roleId)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    if (err instanceof OrgRbacError) {
      return NextResponse.json({ error: err.message, code: 'DENIED' }, { status: err.status })
    }
    console.error('org role DELETE error', err)
    return NextResponse.json({ error: 'Failed to delete role' }, { status: 500 })
  }
}
