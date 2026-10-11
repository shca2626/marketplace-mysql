import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { listRefunds, RefundServiceError } from '@/server/modules/refunds/service'

// GET /api/admin/refunds — the refund queue (Phase 7.7.3): obligation vs
// execution, item-level. Filters: ?status=&q=&page=&limit=
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin('payments.view')
  if (error) return error
  try {
    const sp = req.nextUrl.searchParams
    const result = await listRefunds({
      status: sp.get('status') ?? undefined,
      q: sp.get('q') ?? undefined,
      page: parseInt(sp.get('page') || '1') || 1,
      limit: parseInt(sp.get('limit') || '20') || 20,
    })
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof RefundServiceError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('admin refunds GET error', err)
    return NextResponse.json({ error: 'Failed to load refunds' }, { status: 500 })
  }
}
