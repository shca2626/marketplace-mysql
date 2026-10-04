import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminAny, requireStepUpMfa } from '@/server/guards'
import { assertSameOrigin } from '@/lib/http'
import { createInvitation, listInvitations, RbacServiceError } from '@/server/modules/rbac/service'

// GET /api/admin/rbac/invitations — staff invitation list
// (invitations for protected roles are hidden from non-super-admins — RBACSEC-1)
export async function GET() {
  const { user, error } = await requireAdminAny(['staff.view', 'staff.invite', 'rbac.roles.view', 'rbac.manage'])
  if (error) return error
  try {
    const invitations = await listInvitations(user!)
    return NextResponse.json({ invitations })
  } catch (err) {
    console.error('rbac invitations GET error', err)
    return NextResponse.json({ error: 'Failed to load invitations' }, { status: 500 })
  }
}

const inviteSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  name: z.string().trim().max(60).nullable().optional(),
  roleId: z.string().min(1),
})

// POST /api/admin/rbac/invitations — invite new platform staff by email
// (only for roles within the actor's own permissions — RBACSEC-1)
export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireAdminAny(['staff.invite', 'rbac.manage'])
  if (error) return error
  // Phase 6 (6.7.5): sensitive action — requires a fresh MFA confirmation.
  const su = await requireStepUpMfa()
  if (su.error) return su.error
  try {
    const parsed = inviteSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const invitation = await createInvitation(user!, parsed.data)
    return NextResponse.json({ invitation }, { status: 201 })
  } catch (err) {
    if (err instanceof RbacServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('rbac invitations POST error', err)
    return NextResponse.json({ error: 'Failed to create invitation' }, { status: 500 })
  }
}
