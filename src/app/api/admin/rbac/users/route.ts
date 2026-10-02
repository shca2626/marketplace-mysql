import { NextRequest, NextResponse } from 'next/server'
import { requireAdminAny } from '@/server/guards'
import { searchUsers } from '@/server/modules/rbac/service'

// GET /api/admin/rbac/users?q= — user search for the grant-role picker
// (legacy ADMIN accounts are hidden from non-super-admin staff — RBACSEC-1)
export async function GET(req: NextRequest) {
  const { user, error } = await requireAdminAny(['staff.view', 'staff.manage', 'rbac.roles.view', 'rbac.manage'])
  if (error) return error
  try {
    const { searchParams } = new URL(req.url)
    const users = await searchUsers(user!, searchParams.get('q') ?? '')
    return NextResponse.json({ users })
  } catch (err) {
    console.error('rbac users GET error', err)
    return NextResponse.json({ error: 'Failed to search users' }, { status: 500 })
  }
}
