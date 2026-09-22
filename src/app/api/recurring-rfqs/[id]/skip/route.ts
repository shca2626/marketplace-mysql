import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { skipCycle, RecurringServiceError } from '@/server/modules/rfq/recurring'

// POST /api/recurring-rfqs/[id]/skip — push the next run out by one cycle
// (platform setting recurring.buyerSkipCycle gates this).

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'recurring:skip', { limit: 20, windowMs: 60_000 })
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const schedule = await skipCycle(id, { id: user!.id, role: user!.role })
    return NextResponse.json({ schedule })
  } catch (err) {
    if (err instanceof RecurringServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('recurring skip error', err)
    return NextResponse.json({ error: 'Failed to skip cycle' }, { status: 500 })
  }
}
