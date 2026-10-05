import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin, requireStepUpMfa } from '@/server/guards'
import { completeRefund, RefundServiceError } from '@/server/modules/refunds/service'
import { assertSameOrigin } from '@/lib/http'

const schema = z.object({
  paymentReference: z.string().trim().min(3).max(190), // execution evidence — REQUIRED
  note: z.string().max(1000).optional(),
})

// POST /api/admin/refunds/[id]/complete — APPROVED → COMPLETED, the
// EXECUTION event (Phase 7.7.3): REQUIRES a payment reference (PSP refund
// id or the manual-money reference). Atomically releases the affected items'
// payout claims, appends REVERSAL entries on the PayoutLine ledger, and
// re-derives the order's paymentStatus from COMPLETED refunds only.
// Sensitive money action → fresh step-up MFA (6.7.5).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const { user, error } = await requireAdmin('payments.capture')
  if (error) return error
  const su = await requireStepUpMfa()
  if (su.error) return su.error
  try {
    const { id } = await ctx.params
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'A payment reference is required to complete a refund' },
        { status: 400 }
      )
    }
    const refund = await completeRefund(user!.id, id, parsed.data)
    return NextResponse.json({ refund })
  } catch (err) {
    if (err instanceof RefundServiceError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('admin refund complete error', err)
    return NextResponse.json({ error: 'Failed to complete refund' }, { status: 500 })
  }
}
