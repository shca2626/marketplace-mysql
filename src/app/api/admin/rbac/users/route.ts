import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { searchUsers } from '@/server/modules/rbac/service'

// GET /api/admin/rbac/users?q= — user search for the grant-role picker
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin('staff.view')
  if (error) return error
  try {
    const { searchParams } = new URL(req.url)
    const users = await searchUsers(searchParams.get('q') ?? '')
    return NextResponse.json({ users })
  } catch (err) {
    console.error('rbac users GET error', err)
    return NextResponse.json({ error: 'Failed to search users' }, { status: 500 })
  }
}
