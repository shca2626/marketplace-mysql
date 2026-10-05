import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { approveRefund, RefundServiceError } from '@/server/modules/refunds/service'
import { assertSameOrigin } from '@/lib/http'

const schema = z.object({ note: z.string().max(1000).optional() })

// POST /api/admin/refunds/[id]/approve — REQUESTED → APPROVED: the refund
// OBLIGATION is established (nothing paid yet — completion needs evidence).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const { user, error } = await requireAdmin('payments.capture')
  if (error) return error
  try {
    const { id } = await ctx.params
    const parsed = schema.safeParse(await req.json().catch(() => ({})))
    const refund = await approveRefund(user!.id, id, parsed.success ? parsed.data.note : undefined)
    return NextResponse.json({ refund })
  } catch (err) {
    if (err instanceof RefundServiceError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('admin refund approve error', err)
    return NextResponse.json({ error: 'Failed to approve refund' }, { status: 500 })
  }
}
