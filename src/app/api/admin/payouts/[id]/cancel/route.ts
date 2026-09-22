import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { cancelPayout, PayoutServiceError } from '@/server/modules/payouts/service'

// POST /api/admin/payouts/[id]/cancel — void a pending payout; its order items
// return to the unsettled pool for a corrected batch.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin()
  if (error) return error
  try {
    const { id } = await ctx.params
    const body = await req.json().catch(() => ({}))
    const reason = typeof body?.reason === 'string' ? body.reason : undefined
    const payout = await cancelPayout(user!.id, id, reason)
    return NextResponse.json({ payout: { id: payout.id, number: payout.number, status: payout.status } })
  } catch (err) {
    if (err instanceof PayoutServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('payout cancel error', err)
    return NextResponse.json({ error: 'Failed to cancel payout' }, { status: 500 })
  }
}
