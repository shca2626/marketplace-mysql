import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { adminFailPayment, PaymentServiceError } from '@/server/modules/payments/service'
import { assertSameOrigin } from '@/lib/http'

// POST /api/admin/payments/[id]/fail — operator could not verify the transfer.
// Marks the payment FAILED (buyer stays on PENDING_PAYMENT and can retry);
// notifies the buyer with the reason.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireAdmin('payments.capture')
  if (error) return error
  try {
    const { id } = await ctx.params
    const body = await req.json().catch(() => ({}))
    const note = typeof body?.note === 'string' ? body.note : undefined
    const payment = await adminFailPayment(user!.id, id, note)
    return NextResponse.json({
      payment: { id: payment!.id, status: payment!.status, method: payment!.method },
    })
  } catch (err) {
    if (err instanceof PaymentServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('payment fail error', err)
    return NextResponse.json({ error: 'Failed to mark payment' }, { status: 500 })
  }
}
