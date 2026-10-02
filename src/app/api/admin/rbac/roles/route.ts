import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminAny } from '@/server/guards'
import { assertSameOrigin } from '@/lib/http'
import { createRole, listRoles, RbacServiceError } from '@/server/modules/rbac/service'

// GET /api/admin/rbac/roles — every role with its permission keys + member count
// (protected roles are only returned to super administrators — RBACSEC-1)
export async function GET() {
  const { user, error } = await requireAdminAny(['staff.view', 'rbac.roles.view', 'rbac.manage'])
  if (error) return error
  try {
    const roles = await listRoles(user!)
    return NextResponse.json({ roles })
  } catch (err) {
    console.error('rbac roles GET error', err)
    return NextResponse.json({ error: 'Failed to load roles' }, { status: 500 })
  }
}

const createSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().max(500).nullable().optional(),
  scope: z.enum(['PLATFORM', 'ORG']),
  permissionKeys: z.array(z.string()).min(1),
})

// POST /api/admin/rbac/roles — create a custom role (within your own permissions)
export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireAdminAny(['rbac.roles.create', 'rbac.manage'])
  if (error) return error
  try {
    const parsed = createSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const role = await createRole(user!, parsed.data)
    return NextResponse.json({ role }, { status: 201 })
  } catch (err) {
    if (err instanceof RbacServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('rbac roles POST error', err)
    return NextResponse.json({ error: 'Failed to create role' }, { status: 500 })
  }
}
