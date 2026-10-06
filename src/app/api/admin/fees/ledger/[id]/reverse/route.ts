import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { reverseAssessment, FeeServiceError } from '@/server/modules/fees/service'
import { assertSameOrigin } from '@/lib/http'

// POST /api/admin/fees/ledger/[id]/reverse — append a REVERSAL row for an
// APPLIED assessment (Phase 11.3). The original row is never touched; the net
// contribution of the pair is zero. The mandatory reason (min 10 chars) and the
// acting admin land on the reversal row itself — the ledger is the evidence.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireAdmin('payouts.manage')
  if (error) return error
  try {
    const { id } = await ctx.params
    const body = (await req.json().catch(() => ({}))) as { reason?: unknown }
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
    if (reason.length < 10) {
      return NextResponse.json(
        { error: 'A reversal requires a reason of at least 10 characters — it is permanent ledger evidence.' },
        { status: 400 }
      )
    }

    const reversal = await reverseAssessment(id, reason, user!.id)
    return NextResponse.json({ assessment: reversal })
  } catch (err) {
    if (err instanceof FeeServiceError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    }
    console.error('admin fees reverse error', err)
    return NextResponse.json({ error: 'Failed to reverse the assessment' }, { status: 500 })
  }
}
