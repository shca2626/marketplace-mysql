import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { adminListOrganizations, OrgServiceError } from '@/server/modules/organizations/service'

// GET /api/admin/organizations — every business account (filterable)
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error
  try {
    const { searchParams } = new URL(req.url)
    const organizations = await adminListOrganizations({
      status: searchParams.get('status') ?? undefined,
      search: searchParams.get('search') ?? undefined,
    })
    return NextResponse.json({ organizations })
  } catch (err) {
    if (err instanceof OrgServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin orgs GET error', err)
    return NextResponse.json({ error: 'Failed to load organizations' }, { status: 500 })
  }
}
