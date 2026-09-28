import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { acceptOffer } from '@/server/modules/financing/offers'
import { FinancingError } from '@/server/modules/financing/shared'

// POST /api/financing/requests/[id]/offers/[offerId]/accept — accept a SENT
// offer: freezes it (+ installments), declines the other SENT offers here and
// on sibling requests, creates the agreement (AGR-) and accrues the platform
// SUCCESS fee.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; offerId: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financing:accept-offer', { limit: 20, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl

  try {
    const { offerId } = await ctx.params
    const result = await acceptOffer(user.id, offerId)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('offer accept error', err)
    return NextResponse.json({ error: 'Failed to accept the offer' }, { status: 500 })
  }
}
