import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { listPublicServices } from '@/server/modules/financing/services'
import { nudgeFinancingSweeps } from '@/server/modules/financing/requests'

// GET /api/financing/services — public directory of ACTIVE financing +
// accreditation services (kind/category/city/search filters, paginated).
// Suspended institutions never appear (their offers are not accepting apps).
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (user && user.status === 'SUSPENDED') {
      return NextResponse.json({ error: 'Your account is suspended' }, { status: 403 })
    }
    void nudgeFinancingSweeps()
    const sp = req.nextUrl.searchParams
    const result = await listPublicServices({
      kind: sp.get('kind') ?? undefined,
      category: sp.get('category') ?? undefined,
      city: sp.get('city') ?? undefined,
      search: sp.get('q') ?? sp.get('search') ?? undefined,
      page: Number(sp.get('page')) || 1,
      limit: Number(sp.get('limit')) || 20,
    })
    return NextResponse.json(result)
  } catch (err) {
    console.error('financing services GET error', err)
    return NextResponse.json({ error: 'Failed to load services' }, { status: 500 })
  }
}
