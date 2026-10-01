import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin } from '@/lib/http'
import { assignRole, listAssignments, RbacServiceError } from '@/server/modules/rbac/service'

// GET /api/admin/rbac/assignments?scope=platform|org&organizationId=&userId=
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin('staff.view')
  if (error) return error
  try {
    const { searchParams } = new URL(req.url)
    const scopeParam = searchParams.get('scope')
    const assignments = await listAssignments({
      scope: scopeParam === 'platform' || scopeParam === 'org' ? scopeParam : undefined,
      userId: searchParams.get('userId') ?? undefined,
      organizationId: searchParams.get('organizationId') ?? undefined,
    })
    return NextResponse.json({ assignments })
  } catch (err) {
    console.error('rbac assignments GET error', err)
    return NextResponse.json({ error: 'Failed to load assignments' }, { status: 500 })
  }
}

const assignSchema = z.object({
  userId: z.string().min(1),
  roleId: z.string().min(1),
  organizationId: z.string().optional(),
})

// POST /api/admin/rbac/assignments — grant a role to a user
export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireAdmin('staff.manage')
  if (error) return error
  try {
    const parsed = assignSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const assignment = await assignRole(user!, parsed.data)
    return NextResponse.json({ assignment }, { status: 201 })
  } catch (err) {
    if (err instanceof RbacServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('rbac assignments POST error', err)
    return NextResponse.json({ error: 'Failed to assign role' }, { status: 500 })
  }
}
