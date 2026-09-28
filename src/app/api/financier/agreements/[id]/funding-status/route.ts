import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { reportFundingStatus } from '@/server/modules/financing/agreements'
import { FinancingError } from '@/server/modules/financing/shared'

// POST /api/financier/agreements/[id]/funding-status — report funding
// progress (PENDING → REPORTED_FUNDED → REPORTED_SETTLED), each report
// recorded as a typed FinancingEvent (track-only ledger — D-002).
const schema = z.object({
  fundingStatus: z.enum(['REPORTED_FUNDED', 'REPORTED_SETTLED']),
  event: z.object({
    type: z.enum(['DISBURSEMENT', 'REPAYMENT', 'EARLY_SETTLEMENT', 'LATE_FEE', 'NOTE']),
    eventDate: z.string().optional(),
    amount: z.number().positive().max(1_000_000_000).nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
  }),
})

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financier:funding', { limit: 60, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid funding report', details: parsed.error.flatten() }, { status: 400 })
    }
    const agreement = await reportFundingStatus(user.id, id, parsed.data)
    return NextResponse.json({ agreement })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('funding status error', err)
    return NextResponse.json({ error: 'Failed to report the funding status' }, { status: 500 })
  }
}
