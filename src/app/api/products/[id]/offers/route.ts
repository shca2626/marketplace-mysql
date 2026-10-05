import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionUser } from '@/lib/auth'
import { listPublicOffers, attachOffer, serializeOffer, OfferError } from '@/server/modules/catalog/offers'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'

// GET /api/products/[id]/offers — public multi-vendor offers on a listing.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const offers = await listPublicOffers(id)
    return NextResponse.json({ offers: offers.map(serializeOffer) })
  } catch (err) {
    console.error('product offers GET error', err)
    return NextResponse.json({ error: 'Failed to load offers' }, { status: 500 })
  }
}

const offerSchema = z.object({
  price: z.number().positive('Price must be positive').max(1_000_000),
  compareAtPrice: z.number().positive().nullable().optional(),
  stock: z.number().int().min(0, 'Stock cannot be negative').max(100_000),
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
})

// POST /api/products/[id]/offers — "Sell this product": attach the signed-in
// seller's offer to another seller's (or the platform's) catalog listing.
// Guards: KYC L2, good standing, not the listing owner, one offer per product.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const csrf = assertSameOrigin(req)
    if (csrf) return csrf

    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Please sign in first' }, { status: 401 })

    const rl = enforceRateLimit(req, 'offerWrite', { limit: 20, windowMs: 10 * 60_000 }, user.id)
    if (rl) return rl

    const parsed = offerSchema.safeParse(await req.json())
    if (!parsed.success)
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid offer' }, { status: 400 })

    const { id } = await ctx.params
    const offer = await attachOffer(
      { id: user.id, role: user.role, status: user.status, kycLevel: user.kycLevel ?? 0 },
      id,
      parsed.data
    )
    return NextResponse.json(
      {
        offer: serializeOffer(offer),
        ...(offer.status === 'PENDING_REVIEW'
          ? { reviewQueued: true, message: 'Your offer was submitted for platform review — it goes live once approved.' }
          : {}),
      },
      { status: 201 }
    )
  } catch (err) {
    if (err instanceof OfferError) return NextResponse.json({ error: err.message }, { status: err.status })
    // Plain Errors carrying a status (e.g. the KYC publish gate's 403) must
    // surface their actionable message, not a 500.
    const status = (err as { status?: number }).status
    if (typeof status === 'number' && status >= 400 && status < 500)
      return NextResponse.json({ error: (err as Error).message }, { status })
    console.error('product offers POST error', err)
    return NextResponse.json({ error: 'Failed to attach offer' }, { status: 500 })
  }
}
