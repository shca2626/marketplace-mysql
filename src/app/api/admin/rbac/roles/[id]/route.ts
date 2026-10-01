import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin } from '@/lib/http'
import { deleteRole, RbacServiceError, updateRole } from '@/server/modules/rbac/service'

const updateSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  description: z.string().max(500).nullable().optional(),
  permissionKeys: z.array(z.string()).min(1).optional(),
})

// PATCH /api/admin/rbac/roles/[id] — rename / re-permission a role
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireAdmin('rbac.manage')
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

// DELETE /api/admin/rbac/roles/[id] — delete a custom, unassigned role
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireAdmin('rbac.manage')
  if (error) return error
  try {
    const { id } = await ctx.params
    await deleteRole(user!, id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof RbacServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('rbac role DELETE error', err)
    return NextResponse.json({ error: 'Failed to delete role' }, { status: 500 })
  }
}
