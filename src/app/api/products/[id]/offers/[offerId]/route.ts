import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionUser } from '@/lib/auth'
import { updateOffer, archiveOffer, serializeOffer, OfferError } from '@/server/modules/catalog/offers'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'

const patchSchema = z.object({
  price: z.number().positive().max(1_000_000).optional(),
  compareAtPrice: z.number().positive().nullable().optional(),
  stock: z.number().int().min(0).max(100_000).optional(),
  moq: z.number().int().min(1).max(1_000_000).nullable().optional(),
  sku: z.string().trim().max(64).nullable().optional(),
  priceTiers: z
    .array(
      z.object({
        from: z.number().int().min(1).max(1_000_000),
        to: z.number().int().min(1).max(1_000_000).nullable(),
        price: z.number().positive().max(1_000_000),
      })
    )
    .max(20)
    .optional()
    .nullable(),
  freeShipping: z.boolean().optional(),
  shippingFee: z.number().min(0).max(10_000).nullable().optional(),
  processingDays: z.number().int().min(1).max(60).nullable().optional(),
  leadTimeNote: z.string().trim().max(200).nullable().optional(),
  status: z.enum(['ACTIVE', 'PAUSED']).optional(), // PAUSE/RESUME by the seller
})

// PATCH /api/products/[id]/offers/[offerId] — the offer owner edits their
// offer (price/stock/terms) or pauses/resumes it. PENDING_REVIEW/REJECTED
// offers only change through platform review.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; offerId: string }> }) {
  try {
    const csrf = assertSameOrigin(req)
    if (csrf) return csrf

    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Please sign in first' }, { status: 401 })

    const rl = enforceRateLimit(req, 'offerWrite', { limit: 30, windowMs: 10 * 60_000 }, user.id)
    if (rl) return rl

    const parsed = patchSchema.safeParse(await req.json())
    if (!parsed.success)
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid patch' }, { status: 400 })

    const { offerId } = await ctx.params
    const offer = await updateOffer(user.id, offerId, parsed.data)
    return NextResponse.json({ offer: serializeOffer(offer) })
  } catch (err) {
    if (err instanceof OfferError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('offer PATCH error', err)
    return NextResponse.json({ error: 'Failed to update offer' }, { status: 500 })
  }
}

// DELETE /api/products/[id]/offers/[offerId] — withdraw (archive) the offer.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string; offerId: string }> }) {
  try {
    const csrf = assertSameOrigin(req)
    if (csrf) return csrf

    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Please sign in first' }, { status: 401 })

    const { offerId } = await ctx.params
    const offer = await archiveOffer(user.id, offerId)
    return NextResponse.json({ offer: serializeOffer(offer), archived: true })
  } catch (err) {
    if (err instanceof OfferError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('offer DELETE error', err)
    return NextResponse.json({ error: 'Failed to withdraw offer' }, { status: 500 })
  }
}
