import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { adminListInstitutions } from '@/server/modules/financing/services'

// GET /api/admin/financing/institutions — financier orgs with profiles +
// stats (services, forwarded requests, live accreditations, fees).
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error
  try {
    const sp = req.nextUrl.searchParams
    const institutions = await adminListInstitutions({
      search: sp.get('q') ?? sp.get('search') ?? undefined,
      status: sp.get('status') ?? undefined,
    })
    return NextResponse.json({ institutions })
  } catch (err) {
    console.error('admin institutions error', err)
    return NextResponse.json({ error: 'Failed to load the institutions' }, { status: 500 })
  }
}
