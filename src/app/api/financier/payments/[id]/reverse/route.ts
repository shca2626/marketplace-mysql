import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { requireFinancierContext, FinancingError } from '@/server/modules/financing/shared'
import { reversePayment } from '@/server/modules/financing/installments'

// POST /api/financier/payments/[id]/reverse — reverse (part of) an allocated
// payment: a NEW REVERSAL row mirroring the original's allocations. A note is
// required; the optional amount is expressed in the agreement currency and
// caps at the original's allocated amount.
const schema = z.object({
  amount: z.number().positive().max(1_000_000_000).optional(),
  note: z.string().trim().min(3).max(500),
})

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financier:payment', { limit: 40, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl
  try {
    await requireFinancierContext(user.id)
    const { id } = await ctx.params
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'A reversal note is required (amount optional)', details: parsed.error.flatten() }, { status: 400 })
    }
    const payment = await reversePayment(user.id, id, parsed.data)
    return NextResponse.json({ payment })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier payment reverse error', err)
    return NextResponse.json({ error: 'Failed to reverse the payment' }, { status: 500 })
  }
}
