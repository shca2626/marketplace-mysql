import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/server/guards'

// GET /api/admin/orders — every order on the platform, filterable by status,
// payment status and free-text (buyer name/email, order id, PO number).
// This is the platform owner's order oversight surface (read-only; fulfillment
// transitions stay with sellers via PATCH /api/orders/[id]).
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin('orders.view')
  if (error) return error
  try {
    const sp = req.nextUrl.searchParams
    const q = sp.get('q')?.trim() || ''
    const status = sp.get('status') || ''
    const paymentStatus = sp.get('paymentStatus') || ''
    const page = Math.max(1, parseInt(sp.get('page') || '1') || 1)
    const limit = Math.min(50, Math.max(1, parseInt(sp.get('limit') || '20') || 20))

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (paymentStatus) where.paymentStatus = paymentStatus // 7.7: dimension filter
    if (sp.get('fulfillmentStatus')) where.fulfillmentStatus = sp.get('fulfillmentStatus')
    if (q) {
      where.OR = [
        { id: { contains: q } },
        { poNumber: { contains: q } },
        { fullName: { contains: q } },
        { buyer: { name: { contains: q } } },
        { buyer: { email: { contains: q } } },
      ]
    }

    const [total, orders] = await Promise.all([
      db.order.count({ where }),
      db.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          items: { select: { id: true, sellerId: true, title: true, quantity: true, price: true } },
          buyer: { select: { id: true, name: true, email: true } },
          organization: { select: { id: true, name: true } },
          payment: true,
        },
      }),
    ])

    // Status + money roll-ups for the header strip (7.7: both dimensions)
    const [statusRows, paymentRows, fulfillmentRows, revenueRow] = await Promise.all([
      db.order.groupBy({ by: ['status'], _count: { _all: true } }),
      db.order.groupBy({ by: ['paymentStatus'], _count: { _all: true } }),
      db.order.groupBy({ by: ['fulfillmentStatus'], _count: { _all: true } }),
      db.order.aggregate({
        where: { status: { not: 'CANCELLED' } },
        _sum: { total: true },
        _avg: { total: true },
      }),
    ])
    const statusCounts = Object.fromEntries(statusRows.map((r) => [r.status, r._count._all]))
    const paymentCounts = Object.fromEntries(paymentRows.map((r) => [r.paymentStatus, r._count._all]))
    const fulfillmentCounts = Object.fromEntries(fulfillmentRows.map((r) => [r.fulfillmentStatus, r._count._all]))

    const sellerIds = [...new Set(orders.flatMap((o) => o.items.map((i) => i.sellerId)))]
    const sellers = sellerIds.length
      ? await db.user.findMany({ where: { id: { in: sellerIds } }, select: { id: true, name: true, storeName: true } })
      : []
    const sellerMap = new Map(sellers.map((s) => [s.id, s.storeName ?? s.name]))

    return NextResponse.json({
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      totals: {
        revenue: Math.round((revenueRow._sum.total ?? 0) * 100) / 100,
        aov: Math.round((revenueRow._avg.total ?? 0) * 100) / 100,
        statusCounts,
        paymentCounts,
        fulfillmentCounts,
      },
      orders: orders.map((o) => ({
        id: o.id,
        total: o.total,
        status: o.status,
        paymentStatus: o.paymentStatus,
        fulfillmentStatus: o.fulfillmentStatus,
        currency: o.currency,
        fullName: o.fullName,
        city: o.city,
        country: o.country,
        createdAt: o.createdAt.toISOString(),
        buyer: o.buyer,
        organization: o.organization,
        itemCount: o.items.length,
        sellerNames: [...new Set(o.items.map((i) => sellerMap.get(i.sellerId) ?? 'Unknown'))],
        sourceType: o.sourceType,
        poNumber: o.poNumber,
        paymentTerms: o.paymentTerms,
        payment: o.payment
          ? {
              method: o.payment.method,
              status: o.payment.status,
              reference: o.payment.reference,
              dueAt: o.payment.dueAt?.toISOString() ?? null,
              paidAt: o.payment.paidAt?.toISOString() ?? null,
            }
          : null,
      })),
    })
  } catch (err) {
    console.error('admin orders GET error', err)
    return NextResponse.json({ error: 'Failed to load orders' }, { status: 500 })
  }
}
