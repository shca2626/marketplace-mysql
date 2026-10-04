import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireStepUpMfa } from '@/server/guards'
import { markPayoutPaid, PayoutServiceError } from '@/server/modules/payouts/service'
import { assertSameOrigin } from '@/lib/http'

// POST /api/admin/payouts/[id]/mark-paid — the wire transfer went out.
// Notifies the vendor, writes an audit row.
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
    const note = typeof body?.note === 'string' ? body.note : undefined
    const payout = await markPayoutPaid(user!.id, id, note)
    return NextResponse.json({
      payout: { id: payout.id, number: payout.number, status: payout.status, paidAt: payout.paidAt?.toISOString() ?? null },
    })
  } catch (err) {
    if (err instanceof PayoutServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('payout mark-paid error', err)
    return NextResponse.json({ error: 'Failed to mark payout paid' }, { status: 500 })
  }
}
