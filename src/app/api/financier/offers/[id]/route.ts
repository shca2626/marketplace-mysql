import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { requireFinancierStaffOrThrow } from '@/server/modules/financing/guards'
import { financingError } from '@/server/modules/financing/catalog'
import { withdrawOffer } from '@/server/modules/financing/offers'

// PATCH /api/financier/offers/[id] — withdraw a SENT offer (freeing a slot
// for a revision; the request itself stays open).

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financier:offers', { limit: 20, windowMs: 60_000 }, user!.id)
  if (rl) return rl

  try {
    const staff = await requireFinancierStaffOrThrow({ id: user!.id }, 'financier.offers.manage')
    const { id } = await ctx.params
    await req.json().catch(() => null) // body optional — withdraw takes none
    const result = await withdrawOffer(user.id, id)
    return NextResponse.json(result)
  } catch (err) {
    const svc = financingError(err)
    if (svc) return NextResponse.json({ error: svc.message }, { status: svc.status })
    console.error('financier offer withdraw error', err)
    return NextResponse.json({ error: 'Failed to withdraw offer' }, { status: 500 })
  }
}
