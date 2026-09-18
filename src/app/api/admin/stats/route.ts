import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

// GET /api/admin/stats — READ-ONLY platform analytics overview.
// Admin-only (session role check); aggregates existing data, writes nothing.
export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (user.role !== 'ADMIN')
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

    const now = new Date()
    const daysAgo7 = new Date(now)
    daysAgo7.setDate(daysAgo7.getDate() - 7)

    const [
      usersTotal,
      buyers,
      sellers,
      productsTotal,
      activeListings,
      ordersTotal,
      reviewsTotal,
      newUsers7d,
      allOrders,
      liveItems,
      productAggs,
      recentOrdersRaw,
    ] = await Promise.all([
      db.user.count(),
      db.user.count({ where: { role: 'BUYER' } }),
      db.user.count({ where: { role: 'SELLER' } }),
      db.product.count(),
      db.product.count({ where: { status: 'ACTIVE' } }),
      db.order.count(),
      db.review.count(),
      db.user.count({ where: { createdAt: { gte: daysAgo7 } } }),
      // include cancelled orders (status counts), exclude from revenue below
      db.order.findMany({
        select: { id: true, total: true, status: true, createdAt: true },
      }),
      db.orderItem.findMany({
        where: { order: { status: { not: 'CANCELLED' } } },
        select: { sellerId: true, price: true, quantity: true },
      }),
      db.product.findMany({
        select: {
          id: true,
          title: true,
          soldCount: true,
          price: true,
          categoryId: true,
          category: { select: { id: true, name: true, slug: true } },
          sellerId: true,
          rating: true,
          reviewCount: true,
        },
      }),
      db.order.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: {
          buyer: { select: { id: true, name: true } },
          items: { select: { title: true, image: true } },
        },
      }),
    ])

    // ── Revenue totals + status buckets ──
    const liveOrders = allOrders.filter((o) => o.status !== 'CANCELLED')
    const revenue = liveOrders.reduce((sum, o) => sum + o.total, 0)
    const aov = liveOrders.length > 0 ? revenue / liveOrders.length : 0

    const statusOrder = ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED']
    const statusMap = new Map<string, { count: number; revenue: number }>()
    for (const s of statusOrder) statusMap.set(s, { count: 0, revenue: 0 })
    for (const o of allOrders) {
      const bucket = statusMap.get(o.status) ?? { count: 0, revenue: 0 }
      bucket.count += 1
      if (o.status !== 'CANCELLED') bucket.revenue += o.total
      statusMap.set(o.status, bucket)
    }
    const ordersByStatus = [...statusMap.entries()]
      .filter(([, v]) => v.count > 0)
      .map(([status, v]) => ({ status, count: v.count, revenue: Math.round(v.revenue * 100) / 100 }))

    // ── Revenue by day, last 14 days (order-level GMV) ──
    const dayMap = new Map<string, { revenue: number; orders: number }>()
    for (let d = 13; d >= 0; d--) {
      const day = new Date(now)
      day.setHours(0, 0, 0, 0)
      day.setDate(day.getDate() - d)
      dayMap.set(day.toISOString().slice(0, 10), { revenue: 0, orders: 0 })
    }
    for (const o of liveOrders) {
      const key = o.createdAt.toISOString().slice(0, 10)
      const bucket = dayMap.get(key)
      if (bucket) {
        bucket.revenue += o.total
        bucket.orders += 1
      }
    }
    const revenueByDay = [...dayMap.entries()].map(([date, v]) => ({
      date,
      revenue: Math.round(v.revenue * 100) / 100,
      orders: v.orders,
    }))

    // ── Seller aggregation: GMV + units from live order items,
    //    product counts + weighted avg rating from product rows ──
    interface SellerAgg {
      name: string
      storeName: string | null
      revenue: number
      unitsSold: number
      products: number
      ratingWeight: number
      ratingReviews: number
    }
    const sellerMap = new Map<string, SellerAgg>()
    const sellerUsers = await db.user.findMany({
      select: { id: true, name: true, storeName: true },
      where: { role: 'SELLER' },
    })
    for (const u of sellerUsers) {
      sellerMap.set(u.id, {
        name: u.name,
        storeName: u.storeName,
        revenue: 0,
        unitsSold: 0,
        products: 0,
        ratingWeight: 0,
        ratingReviews: 0,
      })
    }
    for (const it of liveItems) {
      const entry = sellerMap.get(it.sellerId)
      if (!entry) continue
      entry.revenue += it.price * it.quantity
      entry.unitsSold += it.quantity
    }
    for (const p of productAggs) {
      const entry = sellerMap.get(p.sellerId)
      if (!entry) continue
      entry.products += 1
      if (p.reviewCount > 0) {
        entry.ratingWeight += p.rating * p.reviewCount
        entry.ratingReviews += p.reviewCount
      }
    }
    const topSellers = [...sellerMap.entries()]
      .map(([id, v]) => ({
        id,
        name: v.name,
        storeName: v.storeName,
        revenue: Math.round(v.revenue * 100) / 100,
        unitsSold: v.unitsSold,
        products: v.products,
        rating:
          v.ratingReviews > 0
            ? Math.round((v.ratingWeight / v.ratingReviews) * 10) / 10
            : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)

    // ── Top categories (by units sold) ──
    const catMap = new Map<
      string,
      { name: string; slug: string; unitsSold: number; revenue: number; products: number }
    >()
    for (const p of productAggs) {
      const cat = p.category
      const entry =
        catMap.get(cat.id) ?? { name: cat.name, slug: cat.slug, unitsSold: 0, revenue: 0, products: 0 }
      entry.unitsSold += p.soldCount
      entry.revenue += p.soldCount * p.price
      entry.products += 1
      catMap.set(cat.id, entry)
    }
    const topCategories = [...catMap.entries()]
      .map(([id, v]) => ({ id, ...v, revenue: Math.round(v.revenue * 100) / 100 }))
      .sort((a, b) => b.unitsSold - a.unitsSold)
      .slice(0, 6)

    // ── Recent orders (8) ──
    const recentOrders = recentOrdersRaw.map((o) => ({
      id: o.id,
      total: o.total,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
      buyer: o.buyer,
      itemCount: o.items.length,
      firstItemTitle: o.items[0]?.title ?? null,
      firstItemImage: o.items[0]?.image ?? null,
    }))

    return NextResponse.json({
      stats: {
        totals: {
          users: usersTotal,
          buyers,
          sellers,
          products: productsTotal,
          activeListings,
          orders: ordersTotal,
          revenue: Math.round(revenue * 100) / 100,
          aov: Math.round(aov * 100) / 100,
          reviews: reviewsTotal,
          newUsers7d,
        },
        ordersByStatus,
        revenueByDay,
        topSellers,
        topCategories,
        recentOrders,
      },
    })
  } catch (err) {
    console.error('admin stats GET error', err)
    return NextResponse.json({ error: 'Failed to load admin stats' }, { status: 500 })
  }
}
