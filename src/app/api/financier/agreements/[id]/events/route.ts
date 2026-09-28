import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { addFinancingEvent, updateAgreementStatus } from '@/server/modules/financing/agreements'
import { FinancingError } from '@/server/modules/financing/shared'

// POST /api/financier/agreements/[id]/events — report additional money facts
// (REPAYMENT / LATE_FEE / NOTE) on an ACTIVE agreement, or close it
// (status: COMPLETED | DEFAULTED | CANCELLED).
const schema = z.object({
  type: z.enum(['DISBURSEMENT', 'REPAYMENT', 'EARLY_SETTLEMENT', 'LATE_FEE', 'NOTE']),
  eventDate: z.string().optional(),
  amount: z.number().positive().max(1_000_000_000).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  status: z.enum(['COMPLETED', 'DEFAULTED', 'CANCELLED']).optional(),
})

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financier:events', { limit: 60, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid event payload', details: parsed.error.flatten() }, { status: 400 })
    }
    const { status, ...event } = parsed.data
    let agreement = await addFinancingEvent(user.id, id, event)
    if (status) {
      agreement = await updateAgreementStatus(user.id, id, status)
    }
    return NextResponse.json({ agreement })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('agreement events error', err)
    return NextResponse.json({ error: 'Failed to report the event' }, { status: 500 })
  }
}
