import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'

/**
 * Orders (Phase 7.3 + 7.7) — dimension split machinery.
 *
 * fulfillmentStatus is a DERIVED roll-up over the per-seller-group
 * OrderFulfillment rows (7.7.2), with an explicit tested derivation rule:
 *
 *   every group CANCELLED                          → CANCELLED
 *   CANCELLED mixed with anything live             → PARTIALLY_CANCELLED
 *   every group DELIVERED                          → FULFILLED
 *   every group UNFULFILLED                        → UNFULFILLED
 *   all groups share one non-terminal status       → that status
 *       (PROCESSING / SHIPPED / DELIVERED)
 *   otherwise (a live mix)                         → PARTIALLY_FULFILLED
 *
 * Reservations (7.3.3): approval-pending orders hold stock; a configurable
 * TTL (default 48h, PlatformSetting "reservations" → ttlHours) releases the
 * reservation — order cancelled, stock returned, claims untouched.
 */

export class OrderServiceError extends Error {
  constructor(message: string, public status = 400) {
    super(message)
  }
}

type Tx = Prisma.TransactionClient
type Db = typeof db

// ── Fulfillment roll-up (7.7.2) ─────────────────────────────────────────────

const GROUP_WEIGHT: Record<string, number> = {
  UNFULFILLED: 0,
  PROCESSING: 1,
  SHIPPED: 2,
  DELIVERED: 3,
  CANCELLED: -1,
}

export function deriveFulfillmentStatus(groups: Array<{ status: string }>): string {
  if (groups.length === 0) return 'UNFULFILLED'
  const statuses = groups.map((g) => g.status)
  const cancelled = statuses.filter((s) => s === 'CANCELLED')
  if (cancelled.length === statuses.length) return 'CANCELLED'
  if (cancelled.length > 0) return 'PARTIALLY_CANCELLED'
  if (statuses.every((s) => s === 'DELIVERED')) return 'FULFILLED'
  if (statuses.every((s) => s === 'UNFULFILLED')) return 'UNFULFILLED'
  const distinct = new Set(statuses)
  if (distinct.size === 1) return statuses[0] // all PROCESSING, all SHIPPED, …
  return 'PARTIALLY_FULFILLED'
}

/** Re-derive + persist the order's fulfillmentStatus from its groups, and
 * keep the legacy single `status` roughly in sync (it is retained read-only
 * for migration per 7.7.4 — old readers keep working; the dimensions are
 * authoritative). Returns the updated order row. */
export async function refreshFulfillmentRollup(tx: Tx, orderId: string) {
  const groups = await tx.orderFulfillment.findMany({ where: { orderId }, select: { status: true } })
  const fulfillmentStatus = deriveFulfillmentStatus(groups)

  const order = await tx.order.findUnique({ where: { id: orderId }, select: { status: true, paymentStatus: true } })
  if (!order) throw new OrderServiceError('Order not found', 404)

  // Legacy column sync (best-effort equivalent for old readers):
  //   payment-pending states stay; cancelled rollup → CANCELLED;
  //   otherwise the furthest-advanced live group wins.
  let legacyStatus = order.status
  if (fulfillmentStatus === 'CANCELLED' || fulfillmentStatus === 'PARTIALLY_CANCELLED') {
    legacyStatus = 'CANCELLED'
  } else if (['PENDING_PAYMENT', 'PENDING_APPROVAL'].includes(order.status)) {
    legacyStatus = order.status
  } else {
    const weights = groups.map((g) => GROUP_WEIGHT[g.status] ?? 0)
    const max = weights.length ? Math.max(...weights) : 0
    const min = weights.length ? Math.min(...weights) : 0
    legacyStatus = max <= 0 ? order.status : max >= 3 ? 'DELIVERED' : max === 2 ? 'SHIPPED' : min >= 1 ? 'PROCESSING' : order.status
    if (legacyStatus !== 'DELIVERED' && max < min) legacyStatus = order.status // defensive: never backwards
  }

  return tx.order.update({
    where: { id: orderId },
    data: { fulfillmentStatus, ...(legacyStatus !== order.status ? { status: legacyStatus } : {}) },
  })
}

// ── Group creation (order creation time) ────────────────────────────────────

/** Create the per-seller-group OrderFulfillment rows for a fresh order
 * (one group per distinct sellerOrgId — falling back to sellerId when the
 * org is unknown — plus one platform group for seller-less items). */
export async function createFulfillmentGroups(
  tx: Tx,
  orderId: string,
  items: Array<{ id: string; quantity: number; sellerId: string; sellerOrgId: string | null }>
) {
  const groups = new Map<string, { sellerOrgId: string | null; sellerId: string; items: Array<{ id: string; quantity: number }> }>()
  for (const item of items) {
    const key = item.sellerOrgId ?? `user:${item.sellerId}`
    if (!groups.has(key)) groups.set(key, { sellerOrgId: item.sellerOrgId, sellerId: item.sellerId, items: [] })
    groups.get(key)!.items.push({ id: item.id, quantity: item.quantity })
  }
  for (const g of groups.values()) {
    const created = await tx.orderFulfillment.create({
      data: {
        orderId,
        sellerOrgId: g.sellerOrgId,
        sellerId: g.sellerId,
        status: 'UNFULFILLED',
      },
    })
    for (const item of g.items) {
      await tx.orderFulfillmentItem.create({
        data: { fulfillmentId: created.id, orderItemId: item.id, quantity: item.quantity },
      })
    }
  }
}

// ── Seller fulfillment advance (PATCH /api/orders/[id]) ─────────────────────

export const FULFILLMENT_ADVANCE: Record<string, string> = {
  PROCESSING: 'SHIPPED',
  SHIPPED: 'DELIVERED',
}
const ADVANCEABLE = ['UNFULFILLED', 'PROCESSING', 'SHIPPED']

/** Advance the SELLER's OWN groups on an order (a multi-vendor order only
 * moves that seller's slice) + carrier/tracking metadata, then roll up. */
export async function advanceSellerFulfillment(
  orderId: string,
  sellerUserId: string,
  target: 'PROCESSING' | 'SHIPPED' | 'DELIVERED',
  meta: { carrier?: string; trackingNumber?: string } = {}
) {
  return db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } })
    if (!order) throw new OrderServiceError('Order not found', 404)
    const myItemIds = new Set(order.items.filter((i) => i.sellerId === sellerUserId).map((i) => i.id))
    if (myItemIds.size === 0) throw new OrderServiceError('You are not a seller on this order', 403)

    // Payment gate: fulfillment unlocks when money moved (or NET terms).
    if (['PENDING_PAYMENT', 'PENDING_APPROVAL'].includes(order.status))
      throw new OrderServiceError(
        'This order is awaiting payment/approval — fulfillment unlocks once it clears',
        409
      )

    const groups = await tx.orderFulfillment.findMany({
      where: { orderId },
      include: { items: true },
    })
    // Groups containing THIS seller's items are theirs to advance (org tenant
    // or account fallback — the three-concept identity at work).
    const mine = groups.filter((g) => g.items.some((li) => myItemIds.has(li.orderItemId)))
    if (mine.length === 0) throw new OrderServiceError('No fulfillment group for this seller on the order', 404)

    const now = new Date()
    for (const group of mine) {
      if (!ADVANCEABLE.includes(group.status))
        throw new OrderServiceError(
          `Your group is ${group.status} — the transition to ${target} is not legal from there`,
          409
        )
      if (group.status === 'UNFULFILLED' && target !== 'PROCESSING')
        throw new OrderServiceError('Fulfillment starts at PROCESSING first', 409)
      if (FULFILLMENT_ADVANCE[group.status] !== undefined && FULFILLMENT_ADVANCE[group.status] !== target)
        throw new OrderServiceError(`Cannot move from ${group.status} to ${target}`, 409)

      await tx.orderFulfillment.update({
        where: { id: group.id },
        data: {
          status: target,
          ...(meta.carrier ? { carrier: meta.carrier.slice(0, 80) } : {}),
          ...(meta.trackingNumber ? { trackingNumber: meta.trackingNumber.slice(0, 80) } : {}),
          ...(target === 'SHIPPED' ? { shippedAt: now } : {}),
          ...(target === 'DELIVERED' ? { deliveredAt: now } : {}),
        },
      })
    }

    const updated = await refreshFulfillmentRollup(tx, orderId)
    return tx.order.findUnique({
      where: { id: orderId },
      include: { items: true, payment: true, buyer: { select: { id: true, name: true, email: true } } },
    })
  })
}

// ── Cancellation (buyer / TTL release) ──────────────────────────────────────

/** Cancel every fulfillment group + roll up (used by buyer cancel and the
 * reservation TTL release). Stock restock is the caller's responsibility. */
export async function cancelFulfillmentGroups(tx: Tx, orderId: string) {
  await tx.orderFulfillment.updateMany({ where: { orderId, status: { not: 'CANCELLED' } }, data: { status: 'CANCELLED' } })
  await refreshFulfillmentRollup(tx, orderId)
}

// ── Approval-pending reservation TTL (7.3.3) ───────────────────────────────

interface ReservationsConfig {
  ttlHours: number
}

const DEFAULT_RESERVATIONS: ReservationsConfig = { ttlHours: 48 }

async function getReservationsConfig(): Promise<ReservationsConfig> {
  const row = await db.platformSetting.findUnique({ where: { key: 'reservations' } })
  if (!row) return DEFAULT_RESERVATIONS
  try {
    const parsed = JSON.parse(row.value) as Partial<ReservationsConfig>
    const h = Number(parsed.ttlHours)
    return { ttlHours: Number.isFinite(h) && h >= 1 && h <= 720 ? h : DEFAULT_RESERVATIONS.ttlHours }
  } catch {
    return DEFAULT_RESERVATIONS
  }
}

let lastSweep = 0
const SWEEP_THROTTLE_MS = 60_000 // at most one sweep per minute per process

/** Release expired approval-pending reservations: orders still awaiting org
 * approval past the TTL are cancelled — stock returned (conditional,
 * atomic), approval withdrawn, payment voided. Throttled; safe to call from
 * any read surface. Returns the count of released orders. */
export async function releaseExpiredReservations(force = false): Promise<number> {
  if (!force && Date.now() - lastSweep < SWEEP_THROTTLE_MS) return 0
  lastSweep = Date.now()

  const cfg = await getReservationsConfig()
  const cutoff = new Date(Date.now() - cfg.ttlHours * 3600_000)
  const stale = await db.order.findMany({
    where: {
      status: 'PENDING_APPROVAL',
      createdAt: { lt: cutoff },
      approvalRequest: { status: 'PENDING' },
    },
    include: { items: true },
  })
  if (stale.length === 0) return 0

  for (const order of stale) {
    await db.$transaction(async (tx) => {
      await tx.approvalRequest.updateMany({
        where: { orderId: order.id, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      })
      await tx.payment.updateMany({ where: { orderId: order.id, status: 'PENDING' }, data: { status: 'CANCELLED' } })
      // 7.3.4: restock mirrors the conditional decrement (atomic increment)
      for (const item of order.items) {
        if (item.variantId) {
          await tx.productVariant
            .update({ where: { id: item.variantId }, data: { stock: { increment: item.quantity } } })
            .catch(() => undefined)
        }
        await tx.product
          .update({ where: { id: item.productId }, data: { stock: { increment: item.quantity }, soldCount: { decrement: item.quantity } } })
          .catch(() => undefined)
      }
      await cancelFulfillmentGroups(tx, order.id)
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'CANCELLED', paymentStatus: 'AWAITING_PAYMENT', fulfillmentStatus: 'CANCELLED' },
      })
    })
  }
  return stale.length
}
