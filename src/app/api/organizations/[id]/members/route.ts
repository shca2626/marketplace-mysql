import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { addOrganizationMember, OrgServiceError } from '@/server/modules/organizations/service'
import { listOrgMembers, changeMemberRole, removeMember, OrgRbacError } from '@/server/modules/org-rbac/service'
import { assertSameOrigin } from '@/lib/http'

const addMemberSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  role: z.enum(['ADMIN', 'BUYER', 'APPROVER', 'VIEWER']),
  jobTitle: z.string().trim().max(80).optional().nullable(),
})

const changeRoleSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(['ADMIN', 'BUYER', 'APPROVER', 'VIEWER']),
})

const removeSchema = z.object({ userId: z.string().min(1) })

// GET /api/organizations/[id]/members — full team roster with role assignments
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id } = await ctx.params
    const members = await listOrgMembers(user!.id, id)
    return NextResponse.json({ members })
  } catch (err) {
    if (err instanceof OrgRbacError) {
      return NextResponse.json({ error: err.message, code: 'DENIED' }, { status: err.status })
    }
    console.error('org members GET error', err)
    return NextResponse.json({ error: 'Failed to load members' }, { status: 500 })
  }
}

// POST /api/organizations/[id]/members — OWNER/ADMIN adds an existing user
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id } = await ctx.params
    const body = await req.json()
    const parsed = addMemberSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    const member = await addOrganizationMember(id, user!.id, parsed.data)
    return NextResponse.json({ member }, { status: 201 })
  } catch (err) {
    if (err instanceof OrgServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('org members POST error', err)
    return NextResponse.json({ error: 'Failed to add member' }, { status: 500 })
  }
}

// PATCH /api/organizations/[id]/members — change a member's role (last-owner protected)
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id } = await ctx.params
    const parsed = changeRoleSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    const member = await changeMemberRole(user!.id, id, parsed.data.userId, parsed.data.role)
    return NextResponse.json({ member })
  } catch (err) {
    if (err instanceof OrgRbacError) {
      return NextResponse.json({ error: err.message, code: 'DENIED' }, { status: err.status })
    }
    console.error('org members PATCH error', err)
    return NextResponse.json({ error: 'Failed to change role' }, { status: 500 })
  }
}

// DELETE /api/organizations/[id]/members — remove a member (last-owner protected)
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id } = await ctx.params
    const parsed = removeSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }
    await removeMember(user!.id, id, parsed.data.userId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof OrgRbacError) {
      return NextResponse.json({ error: err.message, code: 'DENIED' }, { status: err.status })
    }
    console.error('org members DELETE error', err)
    return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 })
  }
}
