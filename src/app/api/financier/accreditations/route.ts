import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { requireFinancierContext } from '@/server/modules/financing/shared'
import { financierAccreditationInbox } from '@/server/modules/financing/accreditation'
import { FinancingError } from '@/server/modules/financing/shared'

// GET /api/financier/accreditations — accreditation inbox: ONLY forwarded+
// accreditation requests (R-4 structural exclusion), grant/reject/revoke view.
export async function GET(req: NextRequest) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const ctx = await requireFinancierContext(user.id, 'financier.requests.view')
    const sp = req.nextUrl.searchParams
    const result = await financierAccreditationInbox(ctx.organizationId, {
      status: sp.get('status') ?? undefined,
      page: Number(sp.get('page')) || 1,
      limit: Number(sp.get('limit')) || 20,
    })
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier accreditations GET error', err)
    return NextResponse.json({ error: 'Failed to load the accreditation inbox' }, { status: 500 })
  }
}
