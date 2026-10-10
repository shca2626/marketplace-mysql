import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { revokeOrgInvitation, OrgRbacError } from '@/server/modules/org-rbac/service'
import { assertSameOrigin } from '@/lib/http'

// DELETE /api/organizations/[id]/invitations/[invitationId] — revoke a pending invite
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string; invitationId: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id, invitationId } = await ctx.params
    await revokeOrgInvitation(user!.id, id, invitationId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof OrgRbacError) {
      return NextResponse.json({ error: err.message, code: 'DENIED' }, { status: err.status })
    }
    console.error('org invitation DELETE error', err)
    return NextResponse.json({ error: 'Failed to revoke invitation' }, { status: 500 })
  }
}
