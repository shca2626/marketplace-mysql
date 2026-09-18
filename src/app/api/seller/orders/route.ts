import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { serializeOrder } from '@/lib/serialize'

// GET /api/seller/orders — orders containing my products
export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (user.role !== 'SELLER')
      return NextResponse.json({ error: 'Seller account required' }, { status: 403 })

    const myProductIds = await db.product.findMany({
      where: { sellerId: user.id },
      select: { id: true },
    })
    const ids = myProductIds.map((p) => p.id)
    if (ids.length === 0) return NextResponse.json({ orders: [] })

    const orders = await db.order.findMany({
      where: { items: { some: { productId: { in: ids } } } },
      orderBy: { createdAt: 'desc' },
      include: {
        buyer: { select: { id: true, name: true, email: true } },
        items: true,
      },
      take: 50,
    })

    return NextResponse.json({ orders: orders.map((o) => serializeOrder(o, user.id)) })
  } catch (err) {
    console.error('seller orders GET error', err)
    return NextResponse.json({ error: 'Failed to load seller orders' }, { status: 500 })
  }
}
