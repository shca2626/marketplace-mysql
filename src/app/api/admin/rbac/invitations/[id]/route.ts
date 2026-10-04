import { NextRequest, NextResponse } from 'next/server'
import { requireAdminAny, requireStepUpMfa } from '@/server/guards'
import { assertSameOrigin } from '@/lib/http'
import { revokeInvitation, RbacServiceError } from '@/server/modules/rbac/service'

// DELETE /api/admin/rbac/invitations/[id] — revoke a pending invitation
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireAdminAny(['staff.invite', 'rbac.manage'])
  if (error) return error
  // Phase 6 (6.7.5): sensitive action — requires a fresh MFA confirmation.
  const su = await requireStepUpMfa()
  if (su.error) return su.error
  try {
    const { id } = await ctx.params
    await revokeInvitation(user!, id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof RbacServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('rbac invitation DELETE error', err)
    return NextResponse.json({ error: 'Failed to revoke invitation' }, { status: 500 })
  }
}
