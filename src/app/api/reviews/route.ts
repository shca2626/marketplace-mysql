import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { productInclude, serializeProduct, serializeReview } from '@/lib/serialize'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'

const reviewSchema = z.object({
  productId: z.string(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().min(3, 'Review must be at least 3 characters').max(1000),
})

// POST /api/reviews — create or update a review
export async function POST(req: NextRequest) {
  try {
    const csrf = assertSameOrigin(req)
    if (csrf) return csrf

    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Please sign in to leave a review' }, { status: 401 })

    const rl = enforceRateLimit(req, 'review', RATE_LIMITS.review, user.id)
    if (rl) return rl

    const body = await req.json()
    const parsed = reviewSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const { productId, rating, comment } = parsed.data

    const product = await db.product.findUnique({ where: { id: productId } })
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

    // "Verified purchase" badge if this user bought the product
    const purchased = await db.orderItem.findFirst({
      where: { productId, order: { buyerId: user.id } },
      select: { id: true },
    })

    const review = await db.review.upsert({
      where: { productId_userId: { productId, userId: user.id } },
      update: { rating, comment, verified: Boolean(purchased) },
      create: { productId, userId: user.id, rating, comment, verified: Boolean(purchased) },
      include: { user: { select: { id: true, name: true } } },
    })

    // Recompute aggregates
    const agg = await db.review.aggregate({
      where: { productId },
      _avg: { rating: true },
      _count: { rating: true },
    })
    const updatedProduct = await db.product.update({
      where: { id: productId },
      data: {
        rating: Math.round((agg._avg.rating ?? 0) * 10) / 10,
        reviewCount: agg._count.rating,
      },
      include: productInclude,
    })

    return NextResponse.json({
      review: serializeReview(review),
      product: serializeProduct(updatedProduct),
    })
  } catch (err) {
    console.error('reviews POST error', err)
    return NextResponse.json({ error: 'Failed to submit review' }, { status: 500 })
  }
}
