import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { listOrgInvitations, createOrgInvitation, OrgRbacError } from '@/server/modules/org-rbac/service'
import { assertSameOrigin } from '@/lib/http'

const inviteSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  name: z.string().trim().max(60).optional().nullable(),
  roleId: z.string().min(1),
})

// GET /api/organizations/[id]/invitations
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id } = await ctx.params
    const invitations = await listOrgInvitations(user!.id, id)
    return NextResponse.json({ invitations })
  } catch (err) {
    if (err instanceof OrgRbacError) {
      return NextResponse.json({ error: err.message, code: 'DENIED' }, { status: err.status })
    }
    console.error('org invitations GET error', err)
    return NextResponse.json({ error: 'Failed to load invitations' }, { status: 500 })
  }
}

// POST /api/organizations/[id]/invitations — invite by email with an org role
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id } = await ctx.params
    const parsed = inviteSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    const invitation = await createOrgInvitation(user!.id, id, parsed.data)
    return NextResponse.json({ invitation }, { status: 201 })
  } catch (err) {
    if (err instanceof OrgRbacError) {
      return NextResponse.json({ error: err.message, code: 'DENIED' }, { status: err.status })
    }
    console.error('org invitations POST error', err)
    return NextResponse.json({ error: 'Failed to create invitation' }, { status: 500 })
  }
}
