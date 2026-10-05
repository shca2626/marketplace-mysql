import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { serializeOrder } from '@/lib/serialize'
import { computePricing } from '@/lib/pricing'
import { findActiveCoupon, type ActiveCoupon } from '@/server/modules/coupons/service'
import { needsApproval, createOrderApprovalRequest, notifyOrderApprovalRequested } from '@/server/modules/approvals/service'
import { ensurePayment, succeedPayment, notifyOrderPaid } from '@/server/modules/payments/service'
import { createFulfillmentGroups, releaseExpiredReservations } from '@/server/modules/orders/service'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'

const checkoutSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string(),
        quantity: z.number().int().min(1).max(99),
        variantId: z.string().optional().nullable(), // purchased ProductVariant, if any
        offerId: z.string().optional().nullable(), // Phase 4: buy a SPECIFIC vendor offer (multi-vendor)
      })
    )
    .min(1, 'Your cart is empty'),
  fullName: z.string().min(2, 'Full name is required').max(80),
  address: z.string().min(5, 'Address is required').max(200),
  city: z.string().min(2, 'City is required').max(80),
  country: z.string().min(2, 'Country is required').max(80),
  zip: z.string().min(3, 'ZIP code is required').max(20),
  phone: z.string().max(30).optional().nullable(),
  couponCode: z.string().trim().max(24).optional().nullable(),
  paymentMethod: z.enum(['CARD', 'BANK_TRANSFER']).optional(), // absent = CARD (legacy callers)
})

/** 7.3.1: thrown inside the checkout transaction when a conditional atomic
 * decrement matched 0 rows (concurrent buyer took the last units) — rolls
 * the whole order back so exactly one order survives the race. */
class StockConflict extends Error {
  constructor(public kind: 'product' | 'variant' | 'offer' | 'offerVariant', public rowId: string) {
    super(`stock race on ${kind} ${rowId}`)
  }
}

/** 9.1.3: a cart line resolved to no authoritative price (curated record
 * without a vendor offer) — 400 with sourcing messaging, never a legacy
 * price/stock fallback. */
class UnpurchasableLine extends Error {
  constructor(public title: string) {
    super(`unpurchasable line ${title}`)
  }
}

// POST /api/orders — checkout
export async function POST(req: NextRequest) {
  try {
    // CSRF + checkout throttling (money route)
    const csrf = assertSameOrigin(req)
    if (csrf) return csrf

    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Please sign in to place an order' }, { status: 401 })

    const rl = enforceRateLimit(req, 'order', RATE_LIMITS.order, user.id)
    if (rl) return rl

    const body = await req.json()
    const parsed = checkoutSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const { items, couponCode: rawCouponCode, paymentMethod, ...shipping } = parsed.data
    const method = paymentMethod ?? 'CARD'

    // Deduplicate + validate stock (product-level and, when selected, variant-level)
    const productIds = [...new Set(items.map((i) => i.productId))]
    const products = await db.product.findMany({ where: { id: { in: productIds } } })
    const productMap = new Map(products.map((p) => [p.id, p]))

    // Vendor-lifecycle guard: a suspended vendor's catalog is un-purchasable
    // (9.1: curated rows carry sellerId null — excluded from this check).
    const sellerIds = [...new Set(products.map((p) => p.sellerId).filter((s): s is string => !!s))]
    const suspendedSellers = await db.user.findMany({
      where: { id: { in: sellerIds }, status: 'SUSPENDED' },
      select: { storeName: true, name: true },
    })
    if (suspendedSellers.length > 0) {
      const store = suspendedSellers[0].storeName ?? suspendedSellers[0].name
      return NextResponse.json(
        { error: `"${store}" is currently unavailable — remove their items from your cart to continue` },
        { status: 400 }
      )
    }

    const variantIds = [...new Set(items.map((i) => i.variantId).filter((v): v is string => !!v))]
    const variantRows = variantIds.length
      ? await db.productVariant.findMany({ where: { id: { in: variantIds } } })
      : []
    const variantMap = new Map(variantRows.map((v) => [v.id, v]))

    // Phase 4 — multi-vendor offers: resolve selected offer rows. An offer line
    // prices from the OFFER (not the listing), ships from the offer's seller,
    // and decrements offer stock (the listing's own stock belongs to its owner).
    const offerIds = [...new Set(items.map((i) => i.offerId).filter((v): v is string => !!v))]
    const offerRows = offerIds.length
      ? await db.productOffer.findMany({ where: { id: { in: offerIds } } })
      : []
    const offerMap = new Map(offerRows.map((o) => [o.id, o]))

    // Resolve the authoritative unit price per cart line (variant price overrides retail)
    const linePrice = (item: (typeof items)[number]): number | null => {
      if (!item.variantId) return null
      const v = variantMap.get(item.variantId)
      return v && v.productId === item.productId ? (v.price ?? null) : null
    }

    // 7.6.3 pair validation: wherever an (offer, variant) pair is consumed the
    // pair must exist, be active, and belong to the same product — fail closed.
    const offerVariantIds = [
      ...new Set(
        items
          .filter((i) => i.offerId && i.variantId)
          .map((i) => `${i.offerId}:${i.variantId}`)
      ),
    ]
    const offerVariantRows = offerVariantIds.length
      ? await db.offerVariant.findMany({
          where: { offerId: { in: offerVariantIds.map((k) => k.split(':')[0]) } },
          include: { offer: { select: { productId: true, status: true } } },
        })
      : []
    const offerVariantMap = new Map(offerVariantRows.map((ov) => [`${ov.offerId}:${ov.variantId}`, ov]))
    const offerVariantStock = new Map<string, number>()

    for (const item of items) {
      const p = productMap.get(item.productId)
      if (!p) return NextResponse.json({ error: 'A product in your cart no longer exists' }, { status: 400 })
      if (p.status !== 'ACTIVE')
        return NextResponse.json({ error: `"${p.title}" is no longer available` }, { status: 400 })
      // ── 9.1.2/9.1.3 PURCHASABILITY RULE: a curated catalog record
      // (sellerId null) is buyable ONLY through a real vendor's ACTIVE offer.
      // No legacy price/stock fallback exists for curated items, by design.
      if (p.sellerId === null && !item.offerId) {
        return NextResponse.json(
          {
            error: `"${p.title}" is a Vendora catalog record — pick a vendor offer to purchase it. Browse the vendors selling this item on its product page.`,
            code: 'CURATED_REQUIRES_OFFER',
          },
          { status: 400 }
        )
      }
      if (item.offerId) {
        // Offer line — validate the offer itself (product, status, seller, stock)
        const o = offerMap.get(item.offerId)
        if (!o || o.productId !== item.productId || o.status !== 'ACTIVE')
          return NextResponse.json(
            { error: `The selected offer for "${p.title}" is no longer available` },
            { status: 400 }
          )
        const offerSeller = await db.user.findUnique({ where: { id: o.sellerId }, select: { status: true } })
        if (offerSeller?.status === 'SUSPENDED')
          return NextResponse.json(
            { error: `The seller of an offer in your cart is currently unavailable` },
            { status: 400 }
          )
        if (item.variantId) {
          // 7.6: the (offer, variant) pair is the purchase-time authority (D9)
          const ov = offerVariantMap.get(`${item.offerId}:${item.variantId}`)
          if (!ov || !ov.isActive || ov.offer.productId !== item.productId)
            return NextResponse.json(
              { error: `The selected option for "${p.title}" is not available on this offer` },
              { status: 400 }
            )
          if (ov.stock < item.quantity)
            return NextResponse.json(
              { error: `Only ${ov.stock} left in stock for "${p.title}" (selected offer option)` },
              { status: 400 }
            )
          offerVariantStock.set(`${item.offerId}:${item.variantId}`, (offerVariantStock.get(`${item.offerId}:${item.variantId}`) ?? 0) + item.quantity)
        } else if (o.stock < item.quantity)
          return NextResponse.json(
            { error: `Only ${o.stock} left in stock for "${p.title}" (selected offer)` },
            { status: 400 }
          )
      } else if (item.variantId) {
        const v = variantMap.get(item.variantId)
        if (!v || v.productId !== item.productId || !v.isActive)
          return NextResponse.json(
            { error: `The selected option for "${p.title}" is no longer available` },
            { status: 400 }
          )
        if (v.stock < item.quantity)
          return NextResponse.json(
            { error: `Only ${v.stock} left in stock for "${p.title}" (${v.name})` },
            { status: 400 }
          )
      } else if (p.stock < item.quantity) {
        return NextResponse.json(
          { error: `Only ${p.stock} left in stock for "${p.title}"` },
          { status: 400 }
        )
      }
    }

    // Resolve the authoritative unit price per cart line — FAIL-CLOSED (9.1.3):
    // no `?? p.price` legacy fallback on offer lines. Curated lines carry an
    // offer (validated above); seller-owned lines may use the listing price
    // (the primary listing IS that seller's offer — 7.0 single-authority rule).
    const lineUnitPrice = (i: (typeof items)[number]): number | null => {
      const p = productMap.get(i.productId)!
      if (i.offerId) {
        const offer = offerMap.get(i.offerId)
        if (!offer) return null
        if (i.variantId) {
          const ov = offerVariantMap.get(`${i.offerId}:${i.variantId}`)
          return ov?.price ?? offer.price
        }
        return offer.price
      }
      const vp = linePrice(i)
      if (vp != null) return vp
      return p.sellerId != null ? p.price : null // curated without offer — unreachable post-validation
    }

    const subtotal = items.reduce((sum, i) => {
      const unit = lineUnitPrice(i)
      if (unit == null) throw new UnpurchasableLine(productMap.get(i.productId)?.title ?? 'An item')
      return sum + unit * i.quantity
    }, 0)

    // ── Coupon validation (authoritative, re-checked server-side) ──
    let coupon: ActiveCoupon | null = null
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

    // ── B2B context: attach the buyer's active organization, and route the
    // order for approval when a BUYER-role member reaches the org threshold ──
    const membership = await db.organizationMember.findFirst({
      where: { userId: user.id, organization: { status: 'ACTIVE' } },
      include: { organization: true },
    })
    const orgId = membership?.organizationId ?? null
    const routeForApproval =
      !!membership &&
      needsApproval(
        {
          status: membership.organization.status,
          approvalThreshold: membership.organization.approvalThreshold
            ? Number(membership.organization.approvalThreshold)
            : null,
        },
        membership.role,
        pricing.total
      )

    // Seller-org resolution (7.0): items carry the authoritative org tenant —
    // the offer's org when buying via an offer, else the product owner's org.
    // 9.1: curated rows contribute no seller (nulls filtered out).
    const sellerIdsForOrg = [
      ...new Set(
        [...products.map((p) => p.sellerId), ...offerRows.map((o) => o.sellerId)].filter(
          (s): s is string => !!s
        )
      ),
    ]
    const sellerOrgRows = await db.sellerProfile.findMany({
      where: { ownerUserId: { in: sellerIdsForOrg } },
      select: { ownerUserId: true, organizationId: true },
    })
    const sellerOrgMap = new Map(sellerOrgRows.map((sp) => [sp.ownerUserId, sp.organizationId]))

    // 20s timeout — remote-Aiven latency headroom (same as payouts/refunds):
    // checkout performs many sequential conditional-decrement queries and the
    // default 5s interactive-transaction limit can expire mid-transaction.
    const { order, paymentCaptured } = await db.$transaction(
      async (tx) => {
      const created = await tx.order.create({
        data: {
          buyerId: user.id,
          total: pricing.total,
          // CARD settles inside this transaction; bank transfers wait for the
          // buyer's wire + operator capture; approval-routed orders pay after
          // the org clears them.
          status: routeForApproval ? 'PENDING_APPROVAL' : method === 'CARD' ? 'PAID' : 'PENDING_PAYMENT',
          // 7.7 dimension split — money dimension mirrors the legacy gate
          paymentStatus: 'AWAITING_PAYMENT',
          fulfillmentStatus: 'UNFULFILLED',
          currency: 'USD',
          organizationId: orgId,
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
              const variant = i.variantId ? variantMap.get(i.variantId) : undefined
              const offer = i.offerId ? offerMap.get(i.offerId) : undefined
              const ov = i.offerId && i.variantId ? offerVariantMap.get(`${i.offerId}:${i.variantId}`) : undefined
              const effectiveSellerId = offer ? offer.sellerId : p.sellerId
              // 9.1: curated records (sellerId null) were validated to carry an
              // offer above — this guard is the type-level fail-closed backstop.
              if (!effectiveSellerId) throw new UnpurchasableLine(p.title)
              return {
                productId: p.id,
                sellerId: effectiveSellerId,
                sellerOrgId: sellerOrgMap.get(effectiveSellerId) ?? null,
                quantity: i.quantity,
                price: lineUnitPrice(i) ?? offer?.price ?? p.price, // 9.1.3: validated fail-closed upstream; last resort keeps TS honest
                title: p.title,
                image,
                variantId: offer ? null : (variant?.id ?? null),
                variantName: offer ? null : (variant?.name ?? null),
                offerId: offer?.id ?? null,
                offerVariantId: ov?.id ?? null,
              }
            }),
          },
        },
        include: { items: true },
      })

      // 7.7.2: per-seller-group fulfillment substrate for the fresh order
      await createFulfillmentGroups(
        tx,
        created.id,
        created.items.map((it) => ({ id: it.id, quantity: it.quantity, sellerId: it.sellerId, sellerOrgId: it.sellerOrgId }))
      )

      // 7.3.1: conditional atomic decrements everywhere — `updateMany where
      // stock >= qty`, count-verified; any mismatch throws and rolls the WHOLE
      // transaction back (two parallel last-unit checkouts → exactly one order).
      const takeStock = async (kind: 'product' | 'variant' | 'offer' | 'offerVariant', rowId: string, qty: number) => {
        if (qty <= 0) return
        if (kind === 'product') {
          const res = await tx.product.updateMany({
            where: { id: rowId, stock: { gte: qty } },
            data: { stock: { decrement: qty }, soldCount: { increment: qty } },
          })
          if (res.count !== 1) throw new StockConflict(kind, rowId)
        } else if (kind === 'variant') {
          const res = await tx.productVariant.updateMany({ where: { id: rowId, stock: { gte: qty } }, data: { stock: { decrement: qty } } })
          if (res.count !== 1) throw new StockConflict(kind, rowId)
        } else if (kind === 'offer') {
          const res = await tx.productOffer.updateMany({
            where: { id: rowId, stock: { gte: qty } },
            data: { stock: { decrement: qty }, soldCount: { increment: qty } },
          })
          if (res.count !== 1) throw new StockConflict(kind, rowId)
        } else {
          const res = await tx.offerVariant.updateMany({ where: { id: rowId, stock: { gte: qty } }, data: { stock: { decrement: qty } } })
          if (res.count !== 1) throw new StockConflict(kind, rowId)
        }
      }

      for (const i of items) {
        const p = productMap.get(i.productId)!
        if (i.offerId) {
          if (i.variantId) {
            // (offer, variant) pair is the single stock authority (D9/7.3.2)
            const ov = offerVariantMap.get(`${i.offerId}:${i.variantId}`)!
            await takeStock('offerVariant', ov.id, i.quantity)
            await tx.product.update({ where: { id: p.id }, data: { soldCount: { increment: i.quantity } } })
          } else {
            await takeStock('offer', i.offerId, i.quantity)
            await tx.product.update({ where: { id: p.id }, data: { soldCount: { increment: i.quantity } } })
          }
          continue
        }
        // Variant stock is authoritative per combination; product.stock is the
        // derived read-model for the owner's primary listing (7.3.2)
        if (i.variantId && variantMap.has(i.variantId)) {
          await takeStock('variant', i.variantId, i.quantity)
        }
        await takeStock('product', p.id, i.quantity)
      }

      let paymentCaptured = false
      if (routeForApproval) {
        await createOrderApprovalRequest(tx, {
          organizationId: orgId!,
          orderId: created.id,
          requester: { id: user.id, name: user.name },
          amount: pricing.total,
        })
      } else {
        // Money settlement — CARD succeeds inline (simulated gateway);
        // BANK_TRANSFER parks the order in PENDING_PAYMENT with instructions.
        const payment = await ensurePayment(tx, {
          orderId: created.id,
          amount: pricing.total,
          method,
          orderRef: created.id.slice(-8).toUpperCase(),
        })
        if (method === 'CARD') {
          const settled = await succeedPayment(tx, {
            paymentId: payment.id,
            reference: `SIM-${Date.now().toString(36).toUpperCase()}`,
          })
          paymentCaptured = settled.orderBecamePaid
        }
      }
      return { order: created, paymentCaptured }
      },
      { timeout: 20_000 } // remote-Aiven latency headroom
    )

    // Bell event for the org's approvers (after the tx commits — no ghost pings on rollback)
    if (routeForApproval) {
      await notifyOrderApprovalRequested({
        organizationId: orgId!,
        requesterId: user.id,
        requesterName: user.name,
        amount: pricing.total,
        itemCount: order.items.length,
      })
    }

    // PAID fan-out for instantly-settled card checkouts (after the tx
    // commits — the buyer gets a receipt-style confirmation, participating
    // sellers learn fulfillment is unlocked)
    if (paymentCaptured) {
      await notifyOrderPaid(order.id)
    }

    const paymentRow = await db.payment.findUnique({ where: { orderId: order.id } })

    return NextResponse.json(
      {
        order: serializeOrder(order),
        pendingApproval: routeForApproval,
        pendingPayment: order.status === 'PENDING_PAYMENT',
        payment: paymentRow
          ? {
              method: paymentRow.method,
              status: paymentRow.status,
              instructions: paymentRow.instructions,
              dueAt: paymentRow.dueAt?.toISOString() ?? null,
            }
          : null,
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
    // 7.3.1: a conditional-decrement mismatch surfaces as a friendly race
    // message, not a 500 — the buyer can retry with the stock that remains.
    if (err instanceof StockConflict) {
      return NextResponse.json(
        { error: 'Another shopper just bought the last units — the cart was refreshed with the stock that remains. Please review and try again.' },
        { status: 409 }
      )
    }
    // 9.1.3: curated-without-offer line — sourcing messaging, no legacy fallback
    if (err instanceof UnpurchasableLine) {
      return NextResponse.json(
        {
          error: `"${err.title}" is a Vendora catalog record — pick a vendor offer to purchase it.`,
          code: 'CURATED_REQUIRES_OFFER',
        },
        { status: 400 }
      )
    }
    console.error('orders POST error', err)
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 })
  }
}

// GET /api/orders — my purchase history (also lazily sweeps expired
// approval reservations — 7.3.3, throttled to once per minute per process)
export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    releaseExpiredReservations().catch(() => {})

    const orders = await db.order.findMany({
      where: { buyerId: user.id },
      orderBy: { createdAt: 'desc' },
      include: { items: true, payment: true, refunds: { select: { id: true, status: true, number: true, amountTotal: true, createdAt: true } } },
    })

    return NextResponse.json({ orders: orders.map((o) => serializeOrder(o)) })
  } catch (err) {
    console.error('orders GET error', err)
    return NextResponse.json({ error: 'Failed to load orders' }, { status: 500 })
  }
}
