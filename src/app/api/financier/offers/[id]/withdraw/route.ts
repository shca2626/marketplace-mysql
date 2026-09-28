import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { withdrawOffer } from '@/server/modules/financing/offers'
import { FinancingError } from '@/server/modules/financing/shared'

// POST /api/financier/offers/[id]/withdraw — SENT → WITHDRAWN. When no other
// SENT offer remains, the request falls back to UNDER_FINANCIER_REVIEW.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financier:withdraw-offer', { limit: 30, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const offer = await withdrawOffer(user.id, id)
    return NextResponse.json({ offer })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('offer withdraw error', err)
    return NextResponse.json({ error: 'Failed to withdraw the offer' }, { status: 500 })
  }
}
