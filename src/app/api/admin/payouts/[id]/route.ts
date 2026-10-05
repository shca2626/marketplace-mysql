import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { getPayoutDetail, PayoutServiceError } from '@/server/modules/payouts/service'

// GET /api/admin/payouts/[id] — payout detail with the FULL settlement
// ledger (Phase 7.4B): every PayoutLine (SETTLEMENT / REISSUE / REVERSAL),
// claim keys, transfer discipline fields, per-line order-item context.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin('payouts.view')
  if (error) return error
  try {
    const { id } = await ctx.params
    const payout = await getPayoutDetail(id)
    return NextResponse.json({ payout })
  } catch (err) {
    if (err instanceof PayoutServiceError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('payout detail GET error', err)
    return NextResponse.json({ error: 'Failed to load payout' }, { status: 500 })
  }
}
