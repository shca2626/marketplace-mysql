import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { listOrgRoles, createOrgRole, OrgRbacError } from '@/server/modules/org-rbac/service'
import { assertSameOrigin } from '@/lib/http'

const createRoleSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(500).optional().nullable(),
  permissions: z.array(z.string()).min(1).max(50),
})

// GET /api/organizations/[id]/roles — system + custom org roles (orgType-filtered)
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id } = await ctx.params
    const roles = await listOrgRoles(user!.id, id)
    return NextResponse.json({ roles })
  } catch (err) {
    if (err instanceof OrgRbacError) {
      return NextResponse.json({ error: err.message, code: 'DENIED' }, { status: err.status })
    }
    console.error('org roles GET error', err)
    return NextResponse.json({ error: 'Failed to load roles' }, { status: 500 })
  }
}

// POST /api/organizations/[id]/roles — create a custom org role
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id } = await ctx.params
    const parsed = createRoleSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    const role = await createOrgRole(user!.id, id, parsed.data)
    return NextResponse.json({ role }, { status: 201 })
  } catch (err) {
    if (err instanceof OrgRbacError) {
      return NextResponse.json({ error: err.message, code: 'DENIED' }, { status: err.status })
    }
    console.error('org roles POST error', err)
    return NextResponse.json({ error: 'Failed to create role' }, { status: 500 })
  }
}
