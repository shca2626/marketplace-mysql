import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { requireFinancierStaffOrThrow } from '@/server/modules/financing/guards'
import { financingError } from '@/server/modules/financing/catalog'
import { createOffer } from '@/server/modules/financing/offers'
import { offerCreateSchema } from '@/server/modules/financing/types'

// POST /api/financier/requests/[id]/offers — submit an offer (+installment
// schedule) on a forwarded/under-review request. Revisions allowed while the
// request is OFFERED; the offer lands SENT immediately (v1 has no drafts).

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financier:offers', { limit: 20, windowMs: 60_000 }, user!.id)
  if (rl) return rl

  try {
    const staff = await requireFinancierStaffOrThrow({ id: user!.id }, 'financier.offers.manage')
    const { id } = await ctx.params
    const parsed = offerCreateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid offer payload' },
        { status: 400 }
      )
    }
    const { currency: _currency, ...payload } = parsed.data
    void _currency // offers are denominated per-request; the schema default is display-only
    const offer = await createOffer(user!.id, {
      requestId: id,
      ...payload,
      validUntil: payload.validUntil == null ? null : String(payload.validUntil),
      installments: payload.installments.map((i) => ({ ...i, dueDate: String(i.dueDate) })),
    })
    return NextResponse.json({ offer }, { status: 201 })
  } catch (err) {
    const svc = financingError(err)
    if (svc) return NextResponse.json({ error: svc.message }, { status: svc.status })
    console.error('financier offer POST error', err)
    return NextResponse.json({ error: 'Failed to submit offer' }, { status: 500 })
  }
}
