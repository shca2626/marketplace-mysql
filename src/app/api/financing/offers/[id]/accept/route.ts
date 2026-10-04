import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { financingError } from '@/server/modules/financing/catalog'
import { acceptOffer } from '@/server/modules/financing/requests'

// POST /api/financing/offers/[id]/accept — the applicant accepts a SENT offer.
// Sibling requests in the same multiGroupId auto-decline; an AGR- agreement
// is created and the platform SUCCESS fee accrues (all inside the service).

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financing:offers', { limit: 20, windowMs: 60_000 }, user!.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const result = await acceptOffer({ user: { id: user!.id, role: user!.role }, offerId: id })
    return NextResponse.json(result)
  } catch (err) {
    const svc = financingError(err)
    if (svc) return NextResponse.json({ error: svc.message }, { status: svc.status })
    console.error('offer accept error', err)
    return NextResponse.json({ error: 'Failed to accept offer' }, { status: 500 })
  }
}
