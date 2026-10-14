import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { financingError } from '@/server/modules/financing/catalog'
import { declineOffer } from '@/server/modules/financing/offers'

// POST /api/financing/offers/[id]/decline — the applicant declines one offer
// (the request stays OFFERED while other offers remain open).

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financing:offers', { limit: 20, windowMs: 60_000 }, user!.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const result = await declineOffer(user!.id, id)
    return NextResponse.json(result)
  } catch (err) {
    const svc = financingError(err)
    if (svc) return NextResponse.json({ error: svc.message }, { status: svc.status })
    console.error('offer decline error', err)
    return NextResponse.json({ error: 'Failed to decline offer' }, { status: 500 })
  }
}
