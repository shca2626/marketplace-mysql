import { NextResponse } from 'next/server'
import { requireAdminAny } from '@/server/guards'
import { listPlatformStaff } from '@/server/modules/rbac/service'

// GET /api/admin/rbac/staff — platform staff grouped by user, with effective permissions
// (super-admin holders and legacy admins are hidden from non-super-admin staff — RBACSEC-1)
export async function GET() {
  const { user, error } = await requireAdminAny(['staff.view', 'staff.manage', 'rbac.roles.view', 'rbac.manage'])
  if (error) return error
  try {
    const staff = await listPlatformStaff(user!)
    return NextResponse.json({ staff })
  } catch (err) {
    console.error('rbac staff GET error', err)
    return NextResponse.json({ error: 'Failed to load staff' }, { status: 500 })
  }
}
