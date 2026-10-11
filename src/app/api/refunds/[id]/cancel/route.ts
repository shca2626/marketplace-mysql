import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { cancelRefund, RefundServiceError } from '@/server/modules/refunds/service'
import { assertSameOrigin } from '@/lib/http'

// POST /api/refunds/[id]/cancel — the buyer cancels their own pending
// refund request (REQUESTED/APPROVED → CANCELLED).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = await ctx.params
    const refund = await cancelRefund(user.id, id)
    return NextResponse.json({ refund })
  } catch (err) {
    if (err instanceof RefundServiceError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('refund cancel error', err)
    return NextResponse.json({ error: 'Failed to cancel refund' }, { status: 500 })
  }
}
