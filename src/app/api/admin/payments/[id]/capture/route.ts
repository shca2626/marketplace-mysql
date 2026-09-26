import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { adminCapturePayment, PaymentServiceError } from '@/server/modules/payments/service'
import { assertSameOrigin } from '@/lib/http'

// POST /api/admin/payments/[id]/capture — operator confirms the money arrived
// (bank transfer slip / settled invoice). Flips the payment to SUCCEEDED and
// the order to PAID (cart orders); notifies the buyer; writes an audit row.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireAdmin()
  if (error) return error
  try {
    const { id } = await ctx.params
    const body = await req.json().catch(() => ({}))
    const note = typeof body?.note === 'string' ? body.note : undefined
    const payment = await adminCapturePayment(user!.id, id, note)
    return NextResponse.json({
      payment: {
        id: payment!.id,
        status: payment!.status,
        paidAt: payment!.paidAt?.toISOString() ?? null,
        method: payment!.method,
        amount: Number(payment!.amount),
      },
    })
  } catch (err) {
    if (err instanceof PaymentServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('payment capture error', err)
    return NextResponse.json({ error: 'Failed to capture payment' }, { status: 500 })
  }
}
