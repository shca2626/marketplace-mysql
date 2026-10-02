import { NextRequest, NextResponse } from 'next/server'
import { requireAdminAny } from '@/server/guards'
import { assertSameOrigin } from '@/lib/http'
import { revokeAssignment, RbacServiceError } from '@/server/modules/rbac/service'

// DELETE /api/admin/rbac/assignments/[id] — revoke a role from a user
// (protected-role seats answer 404 for non-super-admins — RBACSEC-1)
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireAdminAny(['staff.manage', 'rbac.manage'])
  if (error) return error
  try {
    const { id } = await ctx.params
    await revokeAssignment(user!, id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof RbacServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('rbac assignment DELETE error', err)
    return NextResponse.json({ error: 'Failed to revoke assignment' }, { status: 500 })
  }
}
