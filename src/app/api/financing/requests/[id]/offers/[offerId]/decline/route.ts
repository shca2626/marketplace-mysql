import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { declineOffer } from '@/server/modules/financing/offers'
import { FinancingError } from '@/server/modules/financing/shared'

// POST /api/financing/requests/[id]/offers/[offerId]/decline — applicant
// declines a SENT offer (the request stays open for revised offers).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; offerId: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financing:decline-offer', { limit: 30, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl

  try {
    const { offerId } = await ctx.params
    const offer = await declineOffer(user.id, offerId)
    return NextResponse.json({ offer })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('offer decline error', err)
    return NextResponse.json({ error: 'Failed to decline the offer' }, { status: 500 })
  }
}
