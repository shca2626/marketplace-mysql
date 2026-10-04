import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { reviewQuote, RfqServiceError } from '@/server/modules/rfq/service'

// POST /api/quotes/[id]/review — admin quote-routing review.
// APPROVE releases a queued quote to the buyer; REJECT declines it with a reason.
// Phase 6 (6.1.2): explicit permission key — the bare legacy admin gate is gone.

const reviewSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  note: z.string().trim().max(500).optional(),
})

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin('rfq.quotes.review')
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'quote:review', { limit: 60, windowMs: 60_000 })
  if (rl) return rl

  try {
    const parsed = reviewSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Approve or reject — with an optional note' }, { status: 400 })
    }
    const { id } = await ctx.params
    const quote = await reviewQuote(id, user!, parsed.data.decision, parsed.data.note)
    return NextResponse.json({ quote })
  } catch (err) {
    if (err instanceof RfqServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('quote review error', err)
    return NextResponse.json({ error: 'Failed to review quote' }, { status: 500 })
  }
}
