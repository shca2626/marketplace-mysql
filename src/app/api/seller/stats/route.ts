import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { PLATFORM_COMMISSION_RATE } from '@/lib/pricing'

// GET /api/seller/stats — dashboard KPIs, sales-by-day, top products
export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (user.role !== 'SELLER')
      return NextResponse.json({ error: 'Seller account required' }, { status: 403 })

    const [totalProducts, activeListings, productAgg, itemsWithDates, recentOrders] =
      await Promise.all([
        db.product.count({ where: { sellerId: user.id } }),
        db.product.count({ where: { sellerId: user.id, status: 'ACTIVE' } }),
        db.product.aggregate({
          where: { sellerId: user.id },
          _sum: { soldCount: true },
          _avg: { rating: true },
        }),
        db.orderItem.findMany({
          where: { sellerId: user.id, order: { status: { notIn: ['CANCELLED', 'PENDING_APPROVAL'] } } },
          select: {
            price: true,
            quantity: true,
            orderId: true,
            order: { select: { createdAt: true, status: true } },
          },
        }),
        db.order.findMany({
          where: { items: { some: { sellerId: user.id } } },
          orderBy: { createdAt: 'desc' },
          include: {
            buyer: { select: { id: true, name: true, email: true } },
            items: true,
          },
          take: 5,
        }),
      ])

    const revenue = itemsWithDates.reduce((sum, i) => sum + i.price * i.quantity, 0)

    // ── Payout summary (read-only, derived from live order items) ──
    // Net = gross − platform commission. "Available" covers DELIVERED items
    // (settled), "in transit" covers PAID/PROCESSING/SHIPPED (clearing).
    const round2 = (n: number) => Math.round(n * 100) / 100
    const grossSales = round2(revenue)
    const platformFee = round2(grossSales * PLATFORM_COMMISSION_RATE)
    const netEarnings = round2(grossSales - platformFee)
    let deliveredGross = 0
    let transitGross = 0
    for (const item of itemsWithDates) {
      const amount = item.price * item.quantity
      if (item.order.status === 'DELIVERED') deliveredGross += amount
      else transitGross += amount // PAID | PROCESSING | SHIPPED
    }
    const netOf = (gross: number) => round2(gross - gross * PLATFORM_COMMISSION_RATE)
    const nextPayout = new Date()
    nextPayout.setHours(12, 0, 0, 0)
    nextPayout.setDate(nextPayout.getDate() + ((5 - nextPayout.getDay() + 7) % 7 || 7)) // next Friday
    const payouts = {
      grossSales,
      platformFee,
      netEarnings,
      availableBalance: netOf(deliveredGross),
      inTransitBalance: netOf(transitGross),
      nextPayoutDate: nextPayout.toISOString(),
    }

    // Revenue + distinct order count per day, last 14 days
    const salesByDayMap = new Map<string, { revenue: number; orderIds: Set<string> }>()
    for (let d = 13; d >= 0; d--) {
      const day = new Date()
      day.setHours(0, 0, 0, 0)
      day.setDate(day.getDate() - d)
      salesByDayMap.set(day.toISOString().slice(0, 10), { revenue: 0, orderIds: new Set() })
    }
    for (const item of itemsWithDates) {
      const key = item.order.createdAt.toISOString().slice(0, 10)
      const bucket = salesByDayMap.get(key)
      if (bucket) {
        bucket.revenue += item.price * item.quantity
        bucket.orderIds.add(item.orderId)
      }
    }
    const salesByDay = [...salesByDayMap.entries()].map(([date, v]) => ({
      date,
      revenue: Math.round(v.revenue * 100) / 100,
      orders: v.orderIds.size,
    }))

    const topProductsRaw = await db.product.findMany({
      where: { sellerId: user.id, soldCount: { gt: 0 } },
      orderBy: { soldCount: 'desc' },
      take: 5,
      select: { id: true, title: true, soldCount: true, price: true, images: true },
    })
    const topProducts = topProductsRaw.map((p) => {
      let image: string | null = null
      try {
        const imgs = JSON.parse(p.images || '[]')
        if (Array.isArray(imgs) && imgs.length > 0) image = imgs[0]
      } catch {
        image = null
      }
      return { id: p.id, title: p.title, soldCount: p.soldCount, revenue: p.soldCount * p.price, image }
    })

    return NextResponse.json({
      stats: {
        totalProducts,
        activeListings,
        totalSold: productAgg._sum.soldCount ?? 0,
        revenue: Math.round(revenue * 100) / 100,
        avgRating: Math.round((productAgg._avg.rating ?? 0) * 10) / 10,
        payouts,
        salesByDay,
        topProducts,
        recentOrders: recentOrders.map((o) => ({
          id: o.id,
          total: o.total,
          status: o.status,
          createdAt: o.createdAt.toISOString(),
          buyer: o.buyer,
          itemCount: o.items.filter((i) => i.sellerId === user.id).length,
        })),
      },
    })
  } catch (err) {
    console.error('seller stats GET error', err)
    return NextResponse.json({ error: 'Failed to load stats' }, { status: 500 })
  }
}
