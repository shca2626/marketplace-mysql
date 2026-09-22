import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { serializeOrder } from '@/lib/serialize'
import { cancelApprovalForOrder } from '@/server/modules/approvals/service'
import { cancelPaymentForOrder } from '@/server/modules/payments/service'

const STATUS_FLOW = ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED']

// GET /api/orders/[id] — single order (buyer or participating seller)
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const order = await db.order.findUnique({
      where: { id },
      include: { items: true, payment: true, buyer: { select: { id: true, name: true, email: true } } },
    })
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    const isBuyer = order.buyerId === user.id
    const isSeller = order.items.some((i) => i.sellerId === user.id)
    const isAdmin = user.role === 'ADMIN'
    if (!isBuyer && !isSeller && !isAdmin)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    return NextResponse.json({ order: serializeOrder(order, isSeller && !isBuyer ? user.id : undefined) })
  } catch (err) {
    console.error('order GET error', err)
    return NextResponse.json({ error: 'Failed to load order' }, { status: 500 })
  }
}

// PATCH /api/orders/[id] — seller advances fulfillment status, OR buyer cancels a PAID order
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()

    // ── Buyer cancellation flow ─────────────────────────────
    const cancelParsed = z.object({ action: z.literal('cancel') }).safeParse(body)
    if (cancelParsed.success) {
      const order = await db.order.findUnique({ where: { id }, include: { items: true } })
      if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      if (order.buyerId !== user.id)
        return NextResponse.json({ error: 'Only the buyer can cancel this order' }, { status: 403 })
      if (order.status !== 'PAID' && order.status !== 'PENDING_APPROVAL' && order.status !== 'PENDING_PAYMENT')
        return NextResponse.json(
          { error: 'This order can no longer be cancelled — it is already being processed' },
          { status: 400 }
        )

      const updated = await db.$transaction(async (tx) => {
        // Withdraw any pending org approval + void the pending payment
        await cancelApprovalForOrder(tx, id)
        await cancelPaymentForOrder(tx, id)
        // Restock every item and roll back sold counts
        for (const item of order.items) {
          if (item.variantId) {
            await tx.productVariant
              .update({
                where: { id: item.variantId },
                data: { stock: { increment: item.quantity } },
              })
              .catch(() => undefined) // variant may have been deleted
          }
          await tx.product.update({
            where: { id: item.productId },
            data: {
              stock: { increment: item.quantity },
              soldCount: { decrement: item.quantity },
            },
          })
        }
        return tx.order.update({
          where: { id },
          data: { status: 'CANCELLED' },
          include: { items: true, payment: true, buyer: { select: { id: true, name: true, email: true } } },
        })
      })

      return NextResponse.json({ order: serializeOrder(updated, user.id) })
    }

    // ── Seller fulfillment flow ─────────────────────────────
    const parsed = z.object({ status: z.enum(['PROCESSING', 'SHIPPED', 'DELIVERED']) }).safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })

    const order = await db.order.findUnique({ where: { id }, include: { items: true } })
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    const isSeller = order.items.some((i) => i.sellerId === user.id)
    const isAdmin = user.role === 'ADMIN'
    if (!isSeller && !isAdmin) return NextResponse.json({ error: 'Only the seller can update fulfillment' }, { status: 403 })

    if (order.status === 'PENDING_APPROVAL')
      return NextResponse.json(
        { error: 'This order is awaiting the buying company\'s approval — fulfillment unlocks once approved' },
        { status: 400 }
      )

    if (order.status === 'PENDING_PAYMENT')
      return NextResponse.json(
        { error: 'This order is awaiting payment — fulfillment unlocks once the payment is confirmed' },
        { status: 400 }
      )

    const currentIdx = STATUS_FLOW.indexOf(order.status)
    const nextIdx = STATUS_FLOW.indexOf(parsed.data.status)
    if (nextIdx !== currentIdx + 1) {
      return NextResponse.json(
        { error: `Cannot move from ${order.status} to ${parsed.data.status}` },
        { status: 400 }
      )
    }

    const updated = await db.order.update({
      where: { id },
      data: { status: parsed.data.status },
      include: { items: true, payment: true, buyer: { select: { id: true, name: true, email: true } } },
    })

    return NextResponse.json({ order: serializeOrder(updated, user.id) })
  } catch (err) {
    console.error('order PATCH error', err)
    return NextResponse.json({ error: 'Failed to update order' }, { status: 500 })
  }
}
