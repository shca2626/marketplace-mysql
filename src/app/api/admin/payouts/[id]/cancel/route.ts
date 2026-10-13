import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireStepUpMfa } from '@/server/guards'
import { cancelPayout, PayoutServiceError } from '@/server/modules/payouts/service'
import { assertSameOrigin } from '@/lib/http'

// POST /api/admin/payouts/[id]/cancel — void a pending payout; its order items
// return to the unsettled pool for a corrected batch.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireAdmin('payouts.manage')
  if (error) return error
  // Phase 6 (6.7.5): sensitive action — requires a fresh MFA confirmation.
  const su = await requireStepUpMfa()
  if (su.error) return su.error
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
