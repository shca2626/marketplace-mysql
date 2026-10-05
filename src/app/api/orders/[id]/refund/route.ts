import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionUser } from '@/lib/auth'
import { requestRefund, RefundServiceError } from '@/server/modules/refunds/service'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'

const schema = z.object({
  reason: z.string().trim().min(10, 'Please describe the reason (at least 10 characters)').max(2000),
  items: z
    .array(z.object({ orderItemId: z.string(), quantity: z.number().int().min(1).max(99) }))
    .min(1, 'Select at least one item'),
  shipping: z.number().min(0).max(10000).optional(),
})

// POST /api/orders/[id]/refund — the buyer requests money back on specific
// items of THEIR order (Phase 7.7.3): creates a REQUESTED refund with
// item-level allocations. Only money that actually moved can be refunded.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const rl = enforceRateLimit(req, 'order', RATE_LIMITS.order, user.id)
    if (rl) return rl

    const { id } = await ctx.params
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
    }
    const refund = await requestRefund(user.id, { orderId: id, ...parsed.data })
    return NextResponse.json({ refund }, { status: 201 })
  } catch (err) {
    if (err instanceof RefundServiceError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('order refund POST error', err)
    return NextResponse.json({ error: 'Failed to request refund' }, { status: 500 })
  }
}
