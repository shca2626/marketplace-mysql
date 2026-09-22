import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { previewPayout, PayoutServiceError } from '@/server/modules/payouts/service'

// GET /api/admin/payouts/preview?sellerId= — the payout math for one vendor
// before generating: unsettled items, gross, commission rate, net.
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error
  try {
    const sellerId = req.nextUrl.searchParams.get('sellerId')
    if (!sellerId) return NextResponse.json({ error: 'sellerId is required' }, { status: 400 })
    const preview = await previewPayout(sellerId)
    return NextResponse.json({ preview })
  } catch (err) {
    if (err instanceof PayoutServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('payout preview error', err)
    return NextResponse.json({ error: 'Failed to preview payout' }, { status: 500 })
  }
}
