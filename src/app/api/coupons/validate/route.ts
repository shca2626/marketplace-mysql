import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { couponDiscount } from '@/lib/pricing'
import { findActiveCoupon } from '@/server/modules/coupons/service'

const validateSchema = z.object({
  code: z.string().trim().min(1).max(24),
  subtotal: z.number().min(0).max(1_000_000),
})

// POST /api/coupons/validate — preview a coupon against the current cart.
// Display-only convenience; POST /api/orders re-validates authoritatively.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = validateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
    const { code, subtotal } = parsed.data

    const coupon = await findActiveCoupon(code)
    if (!coupon) {
      return NextResponse.json({ error: 'That code doesn’t exist — check the spelling' }, { status: 404 })
    }
    if (subtotal < coupon.minSubtotal) {
      return NextResponse.json(
        { error: `This code needs a minimum order of $${coupon.minSubtotal}` },
        { status: 400 }
      )
    }

    if (coupon.firstOrderOnly) {
      const user = await getSessionUser()
      if (!user) {
        return NextResponse.json({ error: 'Sign in to use this code' }, { status: 401 })
      }
      const priorOrders = await db.order.count({ where: { buyerId: user.id } })
      if (priorOrders > 0) {
        return NextResponse.json(
          { error: 'This code is only valid on your first order' },
          { status: 400 }
        )
      }
    }

    return NextResponse.json({
      valid: true,
      coupon: {
        code: coupon.code,
        percentOff: coupon.percentOff,
        description: coupon.description,
      },
      discount: couponDiscount(subtotal, coupon),
    })
  } catch (err) {
    console.error('coupon validate error', err)
    return NextResponse.json({ error: 'Failed to validate coupon' }, { status: 500 })
  }
}
