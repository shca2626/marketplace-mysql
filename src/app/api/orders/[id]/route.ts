import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { serializeOrder } from '@/lib/serialize'
import { cancelApprovalForOrder } from '@/server/modules/approvals/service'
import { cancelPaymentForOrder } from '@/server/modules/payments/service'
import { recordCommissionForDeliveredOrder } from '@/server/modules/commission/service'
import { emitNotifications } from '@/server/modules/notifications/service'
import { assertSameOrigin } from '@/lib/http'
import { userHasOrgPermission } from '@/server/authz/evaluator'
import { userHasPlatformPermission } from '@/server/modules/rbac/service'

const STATUS_FLOW = ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED']

/**
 * Company sellers: a member of the selling organization holding
 * `org.sales.fulfill` may advance fulfillment on orders whose items carry that
 * org's sellerOrgId (shared-catalog offer sales). Mirrors respondToQuote's
 * membership resolution — live membership re-checked server-side on every
 * request; the client never proves organization by assertion.
 */
async function orgFulfillmentAllowed(userId: string, order: { items: { sellerOrgId: string | null }[] }): Promise<string | null> {
  const sellerOrgIds = [...new Set(order.items.map((i) => i.sellerOrgId).filter((v): v is string => !!v))]
  if (sellerOrgIds.length !== 1) return null // multi-org or personal sale — org path does not apply
  const member = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: sellerOrgIds[0], userId } },
    include: { organization: { select: { status: true } } },
  })
  if (!member || member.organization.status !== 'ACTIVE') return null
  const allowed = await userHasOrgPermission(userId, sellerOrgIds[0], 'org.sales.fulfill')
  return allowed ? sellerOrgIds[0] : null
}

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
    // Platform staff with orders.view may inspect any order (canonical check;
    // legacy User.role === 'ADMIN' bypass retired).
    const isPlatform = await userHasPlatformPermission(user.id, 'orders.view')
    if (!isBuyer && !isSeller && !isPlatform)
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
    const csrf = assertSameOrigin(req)
    if (csrf) return csrf
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
    // Platform staff with orders.update may advance fulfillment on any order.
    const isAdmin = await userHasPlatformPermission(user.id, 'orders.update')
    // Company fulfillment path: org member holding org.sales.fulfill
    const fulfilledViaOrg = !isSeller && !isAdmin ? await orgFulfillmentAllowed(user.id, order) : null
    if (!isSeller && !isAdmin && !fulfilledViaOrg)
      return NextResponse.json({ error: 'Only the seller can update fulfillment' }, { status: 403 })

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

    // DELIVERED is the SUCCESSFUL STAGE: the commission trigger runs inside
    // the SAME transaction as the status flip, so an obligation can never
    // dangle against an undelivered order (and vice versa). Idempotent per
    // (order, seller) — repeated transitions are blocked above anyway.
    const updated =
      parsed.data.status === 'DELIVERED'
        ? await db.$transaction(async (tx) => {
            const row = await tx.order.update({
              where: { id },
              data: { status: parsed.data.status },
              include: { items: true, payment: true, buyer: { select: { id: true, name: true, email: true } } },
            })
            await recordCommissionForDeliveredOrder(tx, {
              id: row.id,
              buyerId: row.buyerId,
              items: row.items.map((i) => ({ sellerId: i.sellerId, price: i.price, quantity: i.quantity })),
            })
            return row
          })
        : await db.order.update({
            where: { id },
            data: { status: parsed.data.status },
            include: { items: true, payment: true, buyer: { select: { id: true, name: true, email: true } } },
          })

    // §9.5 notification trail — the buyer is informed of every fulfillment
    // advance. The ACTOR is never self-notified (advancing your own sale is
    // not news to you); other participating sellers see it too.
    {
      const orderRef = updated.poNumber || updated.id.slice(-8).toUpperCase()
      const recipients = new Set<string>([updated.buyerId, ...updated.items.map((i) => i.sellerId)])
      recipients.delete(user.id)
      await emitNotifications(
        [...recipients].map((userId) => ({
          userId,
          type: 'ORDER_STATUS' as const,
          title: `Order ${orderRef} is ${parsed.data.status!.toLowerCase()}`,
          body: `The fulfillment of order ${orderRef} moved to ${parsed.data.status!.toLowerCase()}.`,
          linkView: 'orders' as const,
          linkId: updated.id,
        }))
      )
    }

    return NextResponse.json({ order: serializeOrder(updated, user.id) })
  } catch (err) {
    console.error('order PATCH error', err)
    return NextResponse.json({ error: 'Failed to update order' }, { status: 500 })
  }
}
