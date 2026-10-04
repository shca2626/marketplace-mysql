import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireStepUpMfa } from '@/server/guards'
import { generatePayout, PayoutServiceError } from '@/server/modules/payouts/service'
import { assertSameOrigin } from '@/lib/http'

// POST /api/admin/payouts/generate — settle every paid, unsettled order item
// of one vendor into a new payout batch (atomically stamps OrderItem.payoutId).
export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireAdmin('payouts.manage')
  if (error) return error
  // Phase 6 (6.7.5): sensitive action — requires a fresh MFA confirmation.
  const su = await requireStepUpMfa()
  if (su.error) return su.error
  try {
    const body = await req.json()
    if (typeof body?.sellerId !== 'string' || !body.sellerId) {
      return NextResponse.json({ error: 'sellerId is required' }, { status: 400 })
    }
    const payout = await generatePayout(user!.id, body.sellerId)
    return NextResponse.json(
      {
        payout: {
          id: payout.id,
          number: payout.number,
          itemCount: payout.itemCount,
          grossAmount: Number(payout.grossAmount),
          commissionRate: payout.commissionRate,
          commission: Number(payout.commission),
          netAmount: Number(payout.netAmount),
          status: payout.status,
        },
      },
      { status: 201 }
    )
  } catch (err) {
    if (err instanceof PayoutServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('payout generate error', err)
    return NextResponse.json({ error: 'Failed to generate payout' }, { status: 500 })
  }
}
