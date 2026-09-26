import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionUser } from '@/lib/auth'
import { buyerPayOrder, PaymentServiceError } from '@/server/modules/payments/service'
import { assertSameOrigin } from '@/lib/http'

const paySchema = z.object({
  method: z.enum(['CARD', 'BANK_TRANSFER', 'INVOICE']).optional(),
  reference: z.string().max(160).optional(),
})

// POST /api/orders/[id]/pay — buyer settles a PENDING_PAYMENT order.
// CARD (simulated gateway) confirms instantly; BANK_TRANSFER records the
// transfer reference for operator confirmation.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const csrf = assertSameOrigin(req)
    if (csrf) return csrf
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Please sign in first' }, { status: 401 })
    const { id } = await ctx.params

    const parsed = paySchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }

    const result = await buyerPayOrder(user.id, id, parsed.data)
    return NextResponse.json({
      paid: result.paid,
      payment: result.payment
        ? {
            id: result.payment.id,
            method: result.payment.method,
            status: result.payment.status,
            reference: result.payment.reference,
            instructions: result.payment.instructions,
            dueAt: result.payment.dueAt?.toISOString() ?? null,
            amount: Number(result.payment.amount),
          }
        : null,
      order: result.order ? { id: result.order.id, status: result.order.status } : null,
    })
  } catch (err) {
    if (err instanceof PaymentServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('order pay error', err)
    return NextResponse.json({ error: 'Failed to process payment' }, { status: 500 })
  }
}
