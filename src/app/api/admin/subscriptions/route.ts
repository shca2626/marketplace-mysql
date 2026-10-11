import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { listSubscriptions, SubscriptionServiceError } from '@/server/modules/subscriptions/service'

// GET /api/admin/subscriptions — every seller-org subscription (Phase 11.2).
// Filters: ?status=ACTIVE|TRIALING|GRACE|DOWNGRADED|CANCELLED and ?q=<org name>.
// Guard: payouts.view (monetization console reads through the payouts family).
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin('payouts.view')
  if (error) return error
  try {
    const sp = req.nextUrl.searchParams
    const status = sp.get('status')?.trim().toUpperCase() ?? ''
    const q = sp.get('q')?.trim() ?? ''
    const subscriptions = await listSubscriptions({
      ...(status ? { status } : {}),
      ...(q ? { q } : {}),
    })
    return NextResponse.json({ subscriptions })
  } catch (err) {
    if (err instanceof SubscriptionServiceError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    }
    console.error('admin subscriptions GET error', err)
    return NextResponse.json({ error: 'Failed to load subscriptions' }, { status: 500 })
  }
}
