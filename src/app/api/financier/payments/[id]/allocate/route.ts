import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { requireFinancierContext, FinancingError } from '@/server/modules/financing/shared'
import { allocatePayment } from '@/server/modules/financing/installments'

// POST /api/financier/payments/[id]/allocate — run the waterfall: apply the
// payment's still-unallocated amount to the installment schedule in
// (dueDate, installmentNo) order. Idempotent.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financier:payment', { limit: 80, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl
  try {
    await requireFinancierContext(user.id, 'financier.agreements.manage')
    const { id } = await ctx.params
    const payment = await allocatePayment(user.id, id)
    return NextResponse.json({ payment })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier payment allocate error', err)
    return NextResponse.json({ error: 'Failed to allocate the payment' }, { status: 500 })
  }
}
