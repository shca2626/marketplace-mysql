import { NextResponse } from 'next/server'
import { requireAdminAny } from '@/server/guards'
import { getCatalog } from '@/server/modules/rbac/service'

// GET /api/admin/rbac/permissions — the permission catalog (domains → permissions)
export async function GET() {
  const { error } = await requireAdminAny(['staff.view', 'rbac.roles.view', 'rbac.manage'])
  if (error) return error
  return NextResponse.json({ domains: getCatalog() })
}
