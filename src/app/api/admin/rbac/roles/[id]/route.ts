import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminAny } from '@/server/guards'
import { assertSameOrigin } from '@/lib/http'
import { deleteRole, RbacServiceError, updateRole } from '@/server/modules/rbac/service'

const updateSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  description: z.string().max(500).nullable().optional(),
  permissionKeys: z.array(z.string()).min(1).optional(),
})

// PATCH /api/admin/rbac/roles/[id] — rename / re-permission a role
// (protected roles answer 404 for non-super-admins — RBACSEC-1)
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireAdminAny(['rbac.roles.update', 'rbac.manage'])
  if (error) return error
  try {
    const { id } = await ctx.params
    const parsed = updateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const role = await updateRole(user!, id, parsed.data)
    return NextResponse.json({ role })
  } catch (err) {
    if (err instanceof RbacServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('rbac role PATCH error', err)
    return NextResponse.json({ error: 'Failed to update role' }, { status: 500 })
  }
}

// DELETE /api/admin/rbac/roles/[id]?force=1 — delete a custom role.
// With force=1 the role's assignments are revoked (and audited) first, so
// super admins can delete roles that still have members.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireAdminAny(['rbac.roles.delete', 'rbac.manage'])
  if (error) return error
  try {
    const { id } = await ctx.params
    const force = new URL(req.url).searchParams.get('force') === '1'
    const { revoked } = await deleteRole(user!, id, force)
    return NextResponse.json({ ok: true, revoked })
  } catch (err) {
    if (err instanceof RbacServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('rbac role DELETE error', err)
    return NextResponse.json({ error: 'Failed to delete role' }, { status: 500 })
  }
}
