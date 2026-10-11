import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import {
  adminListObligations,
  adminStatementCandidates,
  CommissionServiceError,
} from '@/server/modules/commission/service'

// GET /api/admin/commission/obligations — the commission ledger.
// Filters: status, sellerId, q, page. Includes statement candidates (sellers
// with ungrouped PENDING obligations) for the "prepare statement" flow.
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error
  try {
    const { searchParams } = new URL(req.url)
    const [result, candidates] = await Promise.all([
      adminListObligations({
        status: searchParams.get('status') ?? undefined,
        sellerId: searchParams.get('sellerId') ?? undefined,
        q: searchParams.get('q') ?? undefined,
        page: Number(searchParams.get('page') ?? 1),
        limit: Number(searchParams.get('limit') ?? 20),
      }),
      adminStatementCandidates(),
    ])
    return NextResponse.json({ ...result, candidates })
  } catch (err) {
    if (err instanceof CommissionServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin commission obligations GET error', err)
    return NextResponse.json({ error: 'Failed to load commission obligations' }, { status: 500 })
  }
}
