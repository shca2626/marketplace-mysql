import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { buildBuyerContext, resolvePrices } from '@/server/modules/pricing/resolver'

const resolveSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().min(1).max(1_000_000),
      })
    )
    .min(1)
    .max(100),
  organizationId: z.string().optional().nullable(),
})

// POST /api/pricing/resolve — resolve unit prices for the current buyer context.
// Returns per-product: resolved unit price, retail list price, source
// (CONTRACT | GROUP | RETAIL) and savings. This is what powers "your price"
// displays on product pages and quantity-aware B2B pricing.
export async function POST(req: NextRequest) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const body = await req.json()
    const parsed = resolveSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    const ctx = await buildBuyerContext(user!.id, parsed.data.organizationId ?? null)
    const prices = await resolvePrices(parsed.data.items, ctx)
    return NextResponse.json({
      context: {
        organizationId: ctx.organizationId,
        organizationStatus: ctx.organizationStatus,
        customerGroupIds: ctx.customerGroupIds,
      },
      prices: [...prices.values()],
    })
  } catch (err) {
    console.error('pricing resolve error', err)
    return NextResponse.json({ error: 'Failed to resolve prices' }, { status: 500 })
  }
}
