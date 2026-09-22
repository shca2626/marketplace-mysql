import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { listPayouts } from '@/server/modules/payouts/service'

// GET /api/admin/payouts — settlement console: payout batches with status
// totals (pending / paid / cancelled) and commission collected.
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error
  try {
    const sp = req.nextUrl.searchParams
    const result = await listPayouts({
      q: sp.get('q') ?? undefined,
      status: sp.get('status') ?? undefined,
      page: parseInt(sp.get('page') || '1') || 1,
      limit: parseInt(sp.get('limit') || '20') || 20,
    })
    return NextResponse.json(result)
  } catch (err) {
    console.error('admin payouts GET error', err)
    return NextResponse.json({ error: 'Failed to load payouts' }, { status: 500 })
  }
}
