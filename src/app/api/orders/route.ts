import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { serializeOrder } from '@/lib/serialize'
import { computePricing } from '@/lib/pricing'
import { findActiveCoupon } from '@/server/modules/coupons/service'

const checkoutSchema = z.object({
  items: z
    .array(z.object({ productId: z.string(), quantity: z.number().int().min(1).max(99) }))
    .min(1, 'Your cart is empty'),
  fullName: z.string().min(2, 'Full name is required').max(80),
  address: z.string().min(5, 'Address is required').max(200),
  city: z.string().min(2, 'City is required').max(80),
  country: z.string().min(2, 'Country is required').max(80),
  zip: z.string().min(3, 'ZIP code is required').max(20),
  phone: z.string().max(30).optional().nullable(),
  couponCode: z.string().trim().max(24).optional().nullable(),
})

// POST /api/orders — checkout
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Please sign in to place an order' }, { status: 401 })

    const body = await req.json()
    const parsed = checkoutSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const { items, couponCode: rawCouponCode, ...shipping } = parsed.data

    // Deduplicate + validate stock
    const productIds = [...new Set(items.map((i) => i.productId))]
    const products = await db.product.findMany({ where: { id: { in: productIds } } })
    const productMap = new Map(products.map((p) => [p.id, p]))

    for (const item of items) {
      const p = productMap.get(item.productId)
      if (!p) return NextResponse.json({ error: 'A product in your cart no longer exists' }, { status: 400 })
      if (p.status !== 'ACTIVE')
        return NextResponse.json({ error: `"${p.title}" is no longer available` }, { status: 400 })
      if (p.stock < item.quantity)
        return NextResponse.json(
          { error: `Only ${p.stock} left in stock for "${p.title}"` },
          { status: 400 }
        )
    }

    const subtotal = items.reduce((sum, i) => {
      const p = productMap.get(i.productId)!
      return sum + p.price * i.quantity
    }, 0)

    // ── Coupon validation (authoritative, re-checked server-side) ──
    let coupon = null
    if (rawCouponCode) {
      coupon = await findActiveCoupon(rawCouponCode)
      if (!coupon) {
        return NextResponse.json({ error: 'Invalid coupon code' }, { status: 400 })
      }
      if (subtotal < coupon.minSubtotal) {
        return NextResponse.json(
          { error: `Coupon requires a minimum order of $${coupon.minSubtotal}` },
          { status: 400 }
        )
      }
      if (coupon.firstOrderOnly) {
        const priorOrders = await db.order.count({ where: { buyerId: user.id } })
        if (priorOrders > 0) {
          return NextResponse.json(
            { error: 'This coupon is only valid on your first order' },
            { status: 400 }
          )
        }
      }
    }

    // ── Server-authoritative pricing (matches lib/pricing used by the UI) ──
    const pricing = computePricing(subtotal, coupon)

    const order = await db.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          buyerId: user.id,
          total: pricing.total,
          status: 'PAID',
          ...shipping,
          phone: shipping.phone ?? null,
          items: {
            create: items.map((i) => {
              const p = productMap.get(i.productId)!
              let image: string | null = null
              try {
                const imgs = JSON.parse(p.images || '[]')
                if (Array.isArray(imgs) && imgs.length > 0) image = imgs[0]
              } catch {
                image = null
              }
              return {
                productId: p.id,
                sellerId: p.sellerId,
                quantity: i.quantity,
                price: p.price,
                title: p.title,
                image,
              }
            }),
          },
        },
        include: { items: true },
      })

      for (const i of items) {
        const p = productMap.get(i.productId)!
        await tx.product.update({
          where: { id: p.id },
          data: {
            stock: { decrement: i.quantity },
            soldCount: { increment: i.quantity },
          },
        })
      }
      return created
    })

    return NextResponse.json(
      {
        order: serializeOrder(order),
        pricing: {
          subtotal: pricing.subtotal,
          discount: pricing.discount,
          shipping: pricing.shipping,
          total: pricing.total,
          couponCode: coupon?.code ?? null,
        },
      },
      { status: 201 }
    )
  } catch (err) {
    console.error('orders POST error', err)
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 })
  }
}

// GET /api/orders — my purchase history
export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const orders = await db.order.findMany({
      where: { buyerId: user.id },
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    })

    return NextResponse.json({ orders: orders.map((o) => serializeOrder(o)) })
  } catch (err) {
    console.error('orders GET error', err)
    return NextResponse.json({ error: 'Failed to load orders' }, { status: 500 })
  }
}
