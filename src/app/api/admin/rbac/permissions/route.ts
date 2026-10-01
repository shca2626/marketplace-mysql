import { NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { getCatalog } from '@/server/modules/rbac/service'

// GET /api/admin/rbac/permissions — the permission catalog (domains → permissions)
export async function GET() {
  const { error } = await requireAdmin('staff.view')
  if (error) return error
  return NextResponse.json({ domains: getCatalog() })
}
