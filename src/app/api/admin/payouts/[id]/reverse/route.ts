import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin, requireStepUpMfa } from '@/server/guards'
import { reversePayout, PayoutServiceError } from '@/server/modules/payouts/service'
import { assertSameOrigin } from '@/lib/http'

const schema = z.object({ reason: z.string().trim().min(3).max(500) })

// POST /api/admin/payouts/[id]/reverse — PAID payout correction (Phase 7.4A.2
// case (b)): appends REVERSAL ledger entries, flips the originals EFFECTIVE →
// REVERSED, and frees the claims so a corrected payout can reissue. History
// is never rewritten. Sensitive money action → fresh step-up MFA (6.7.5).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const { user, error } = await requireAdmin('payouts.manage')
  if (error) return error
  const su = await requireStepUpMfa()
  if (su.error) return su.error
  try {
    const { id } = await ctx.params
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'A reversal reason is required' }, { status: 400 })
    }
    const payout = await reversePayout(user!.id, id, parsed.data.reason)
    return NextResponse.json({
      payout: {
        id: payout!.id,
        number: payout!.number,
        status: payout!.status,
        note: payout!.note,
      },
    })
  } catch (err) {
    if (err instanceof PayoutServiceError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('payout reverse error', err)
    return NextResponse.json({ error: 'Failed to reverse payout' }, { status: 500 })
  }
}
