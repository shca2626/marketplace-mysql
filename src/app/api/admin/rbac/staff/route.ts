import { NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { listPlatformStaff } from '@/server/modules/rbac/service'

// GET /api/admin/rbac/staff — platform staff grouped by user, with effective permissions
export async function GET() {
  const { error } = await requireAdmin('staff.view')
  if (error) return error
  try {
    const staff = await listPlatformStaff()
    return NextResponse.json({ staff })
  } catch (err) {
    console.error('rbac staff GET error', err)
    return NextResponse.json({ error: 'Failed to load staff' }, { status: 500 })
  }
}
