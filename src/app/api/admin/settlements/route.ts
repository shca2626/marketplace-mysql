import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { adminListSettlements, SettlementServiceError } from '@/server/modules/settlements/service'

// GET /api/admin/settlements — platform oversight of external settlements
// (status, parties, evidence counts). Filters: status, q, page.
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin('payouts.view')
  if (error) return error
  try {
    const { searchParams } = new URL(req.url)
    const result = await adminListSettlements({
      status: searchParams.get('status') ?? undefined,
      q: searchParams.get('q') ?? undefined,
      page: Number(searchParams.get('page') ?? 1),
      limit: Number(searchParams.get('limit') ?? 20),
    })
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof SettlementServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin settlements GET error', err)
    return NextResponse.json({ error: 'Failed to load settlements' }, { status: 500 })
  }
}
