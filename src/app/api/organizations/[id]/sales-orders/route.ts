import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveAuthzContext } from '@/server/authz/context'
import { userHasOrgPermission } from '@/server/authz/evaluator'

export const dynamic = 'force-dynamic'

// GET /api/organizations/[id]/sales-orders — incoming sales for the company's
// offers (org.sales.view). Returns orders that contain at least one OrderItem
// with sellerOrgId = org, with only that org's items attached.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authz = await resolveAuthzContext()
  if (authz.error) {
    return NextResponse.json({ error: authz.error.message, code: authz.error.reason }, { status: authz.error.status })
  }
  const { id } = await ctx.params
  const member = authz.orgs.find((o) => o.id === id)
  if (!member) {
    return NextResponse.json({ error: 'You are not a member of that organization', code: 'NO_MEMBERSHIP' }, { status: 403 })
  }
  const allowed = await userHasOrgPermission(authz.user.id, id, 'org.sales.view')
  if (!allowed) {
    return NextResponse.json(
      { error: 'This action requires the "org.sales.view" permission', code: 'MISSING_PERMISSION' },
      { status: 403, headers: { 'X-Authz-Deny': 'MISSING_PERMISSION' } }
    )
  }
  try {
    const items = await db.orderItem.findMany({
      where: { sellerOrgId: id },
      include: {
        order: { select: { id: true, buyerId: true, status: true, createdAt: true, fullName: true, city: true, country: true, paymentTerms: true } },
      },
      orderBy: { order: { createdAt: 'desc' } },
      take: 500,
    })
    // The caller's own fulfillment authority for this org (drives the UI's
    // advance buttons; the PATCH endpoint re-checks server-side regardless).
    const canFulfill = await userHasOrgPermission(authz.user.id, id, 'org.sales.fulfill')
    const byOrder = new Map<string, { orderId: string; orderStatus: string; placedAt: string; buyerName: string; city: string; country: string; paymentTerms: string | null; items: { id: string; title: string; quantity: number; price: number; variantName: string | null; status: string }[]; total: number }>()
    for (const it of items) {
      const entry = byOrder.get(it.order.id) ?? {
        orderId: it.order.id,
        orderStatus: it.order.status,
        placedAt: it.order.createdAt.toISOString(),
        buyerName: it.order.fullName,
        city: it.order.city,
        country: it.order.country,
        paymentTerms: it.order.paymentTerms,
        items: [],
        total: 0,
      }
      entry.items.push({ id: it.id, title: it.title, quantity: it.quantity, price: it.price, variantName: it.variantName, status: it.order.status })
      entry.total += it.price * it.quantity
      byOrder.set(it.order.id, entry)
    }
    return NextResponse.json({ salesOrders: [...byOrder.values()], canFulfill })
  } catch (err) {
    console.error('sales orders GET error', err)
    return NextResponse.json({ error: 'Failed to load sales orders' }, { status: 500 })
  }
}
