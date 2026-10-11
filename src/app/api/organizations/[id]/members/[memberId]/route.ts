import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import {
  removeOrganizationMember,
  updateOrganizationMemberRole,
  OrgServiceError,
} from '@/server/modules/organizations/service'

/**
 * TENANT-AUDIT Q4: self-service member management for plain COMPANY orgs —
 * previously the business console could ADD members but never remove them or
 * change their roles (only the financier team surface and admin-side actions
 * could). All authorization resolves server-side from the caller's OWNERSHIP/
 * ADMIN membership; financing institutions are pointed back to their
 * role-based team surface (409).
 */

// DELETE /api/organizations/[id]/members/[memberId] — remove a staff member
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string; memberId: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const { user, error } = await requireUser()
  if (error) return error
  const rl = enforceRateLimit(req, 'org-manage-member', { limit: 30, windowMs: 10 * 60_000 }, user!.id)
  if (rl) return rl
  try {
    const { id, memberId } = await ctx.params
    const result = await removeOrganizationMember(id, user!.id, memberId)
    return NextResponse.json({ removed: true, ...result })
  } catch (err) {
    if (err instanceof OrgServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('org member remove error', err)
    return NextResponse.json({ error: 'Failed to remove the member' }, { status: 500 })
  }
}

const patchSchema = z.object({
  role: z.enum(['OWNER', 'ADMIN', 'BUYER', 'APPROVER', 'VIEWER']),
  jobTitle: z.string().max(80).nullable().optional(),
})

// PATCH /api/organizations/[id]/members/[memberId] — change a member's role
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; memberId: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const { user, error } = await requireUser()
  if (error) return error
  const rl = enforceRateLimit(req, 'org-manage-member', { limit: 30, windowMs: 10 * 60_000 }, user!.id)
  if (rl) return rl
  try {
    const { id, memberId } = await ctx.params
    const parsed = patchSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const member = await updateOrganizationMemberRole(id, user!.id, memberId, parsed.data)
    return NextResponse.json({ member })
  } catch (err) {
    if (err instanceof OrgServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('org member role error', err)
    return NextResponse.json({ error: 'Failed to update the member role' }, { status: 500 })
  }
}
