import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { revokeOrgRoleAssignment, OrgRbacError } from '@/server/modules/org-rbac/service'
import { assertSameOrigin } from '@/lib/http'

// DELETE /api/organizations/[id]/assignments/[assignmentId] — revoke (immediate effect)
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string; assignmentId: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id, assignmentId } = await ctx.params
    await revokeOrgRoleAssignment(user!.id, id, assignmentId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof OrgRbacError) {
      return NextResponse.json({ error: err.message, code: 'DENIED' }, { status: err.status })
    }
    console.error('org assignment DELETE error', err)
    return NextResponse.json({ error: 'Failed to revoke assignment' }, { status: 500 })
  }
}
