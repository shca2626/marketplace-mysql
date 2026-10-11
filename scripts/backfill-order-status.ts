// ─────────────────────────────────────────────────────────────────────────────
// PHASE 7.7.7 — LEGACY ORDER-STATUS INITIALIZATION + AMBIGUITY REPORT
// (lastplan v5 7.7.7 / S6, B6; dimensions split per 7.7.1–7.7.2)
//
//   bun scripts/backfill-order-status.ts
//
// For EVERY order, initializes the new dimensions from the provable legacy
// mapping, creates the per-seller-group fulfillment substrate, and records
// every mixed signal as an ambiguity with a decision (gate = zero rows
// WITHOUT a recorded decision — never "zero unmapped by assumption").
//
//   paymentStatus (financial) — from legacy status + payment-row evidence:
//     PENDING_PAYMENT            → AWAITING_PAYMENT
//     PENDING_APPROVAL           → payment SUCCEEDED ? PAID : AWAITING_PAYMENT
//     PAID/PROCESSING/SHIPPED/DELIVERED
//                                 → payment SUCCEEDED ? PAID
//                                   : payment row PENDING/FAILED/CANCELLED →
//                                     AWAITING_PAYMENT (mixed signal, recorded)
//                                   : no payment row → PAID from the legacy
//                                     state machine (recorded, not assumed)
//     CANCELLED                  → payment SUCCEEDED ? PAID (kept — refund
//                                   states only from COMPLETED refund ledger
//                                   evidence, 7.7.1; recorded) : AWAITING_PAYMENT
//
//   fulfillmentStatus (derived roll-up) — via the OrderFulfillment substrate:
//     per order, items grouped by sellerOrgId (fallback sellerId); ONE
//     OrderFulfillment row per group with the documented UNIFORM mapping
//     applied identically to every group:
//       DELIVERED→DELIVERED · SHIPPED→SHIPPED · PROCESSING→PROCESSING ·
//       PAID/PENDING_PAYMENT/PENDING_APPROVAL→UNFULFILLED · CANCELLED→CANCELLED
//     roll-up: all CANCELLED→CANCELLED · CANCELLED mixed→PARTIALLY_CANCELLED ·
//       all DELIVERED→FULFILLED · all UNFULFILLED→UNFULFILLED · any non-
//       uniform non-cancelled mix→PARTIALLY_FULFILLED · all same→that status
//
//   Order.currency = 'USD' where NULL.
//
// Resumable: orders already initialized (paymentStatus beyond the default AND
// fulfillment groups present) are skipped; item links are guarded by the
// OrderFulfillmentItem.orderItemId unique constraint, so a crashed run
// resumes without duplicating groups.
// ─────────────────────────────────────────────────────────────────────────────
import { assertNotProd } from './lib/assert-not-prod'
import { db } from '../src/lib/db'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const REPORT_JSON = resolve(process.cwd(), 'docs/reports/phase7-order-status-backfill.json')
const REPORT_MD = resolve(process.cwd(), 'docs/reports/phase7-order-status-backfill.md')

const FULFILLMENT_LIMITATION =
  'legacy data cannot prove per-seller partial fulfillment — a globally SHIPPED order initializes every group as SHIPPED; no historical per-seller evidence exists or is implied'

type Ambiguity = {
  orderId: string
  legacyStatus: string
  kind: string
  detail: string
  decision: string | null
}

/** Uniform legacy→group-status mapping (S6) — identical for every seller group. */
function uniformGroupStatus(legacyStatus: string): string {
  switch (legacyStatus) {
    case 'DELIVERED':
      return 'DELIVERED'
    case 'SHIPPED':
      return 'SHIPPED'
    case 'PROCESSING':
      return 'PROCESSING'
    case 'CANCELLED':
      return 'CANCELLED'
    default:
      // PAID, PENDING_PAYMENT, PENDING_APPROVAL — nothing provably shipped
      return 'UNFULFILLED'
  }
}

/** Order.fulfillmentStatus roll-up over the group statuses (7.7.2). */
function rollupFulfillment(groupStatuses: string[], legacyStatus: string): string {
  if (groupStatuses.length === 0) {
    // defensive: an order without items cannot have group evidence — the
    // uniform mapping of the legacy status is the only signal available
    const mapped = uniformGroupStatus(legacyStatus)
    return mapped === 'DELIVERED' ? 'FULFILLED' : mapped
  }
  const uniq = new Set(groupStatuses)
  if (uniq.size === 1) {
    const s = groupStatuses[0]
    if (s === 'CANCELLED') return 'CANCELLED'
    if (s === 'DELIVERED') return 'FULFILLED'
    return s // UNFULFILLED | PROCESSING | SHIPPED
  }
  if (uniq.has('CANCELLED')) return 'PARTIALLY_CANCELLED'
  return 'PARTIALLY_FULFILLED'
}

type PaymentResult = { paymentStatus: string; ambiguity: Omit<Ambiguity, 'orderId' | 'legacyStatus'> | null }

/** paymentStatus mapping with evidence (7.7.7 provable table). */
function mapPaymentStatus(legacyStatus: string, payment: { status: string; method: string; dueAt: Date | null } | null): PaymentResult {
  const payStatus = payment?.status

  if (legacyStatus === 'PENDING_PAYMENT') return { paymentStatus: 'AWAITING_PAYMENT', ambiguity: null }

  if (legacyStatus === 'PENDING_APPROVAL') {
    return { paymentStatus: payStatus === 'SUCCEEDED' ? 'PAID' : 'AWAITING_PAYMENT', ambiguity: null }
  }

  if (legacyStatus === 'CANCELLED') {
    if (payStatus === 'SUCCEEDED') {
      return {
        paymentStatus: 'PAID',
        ambiguity: {
          kind: 'cancelled-with-succeeded-payment',
          detail: `legacy status CANCELLED but the payment row is SUCCEEDED${payment ? ` (${payment.method})` : ''} — no refund ledger exists yet`,
          decision:
            'retained PAID; no completed-refund evidence — refund states settable ONLY from COMPLETED refund ledger evidence (7.7.1)',
        },
      }
    }
    return { paymentStatus: 'AWAITING_PAYMENT', ambiguity: null }
  }

  // PAID / PROCESSING / SHIPPED / DELIVERED
  if (payStatus === 'SUCCEEDED') return { paymentStatus: 'PAID', ambiguity: null }

  if (payStatus && ['PENDING', 'FAILED', 'CANCELLED'].includes(payStatus)) {
    return {
      paymentStatus: 'AWAITING_PAYMENT',
      ambiguity: {
        kind: 'mixed-signal-payment-not-succeeded',
        detail: `legacy status ${legacyStatus} is post-payment, but the payment row is ${payStatus} (${payment!.method}) — the financial ledger contradicts the legacy global status`,
        decision:
          'payment ledger wins: paymentStatus=AWAITING_PAYMENT — the Payment row is the financial fact; the legacy global status is treated as fulfillment-only evidence for this order',
      },
    }
  }

  // no payment row at all — the legacy state machine itself is the assertion
  return {
    paymentStatus: 'PAID',
    ambiguity: {
      kind: 'no-payment-row',
      detail: `legacy status ${legacyStatus} with NO payment row — the payment-evidence gap cannot be closed from stored records`,
      decision:
        'mapped paymentStatus=PAID from the legacy state machine (STATUS_FLOW PAID→PROCESSING→SHIPPED→DELIVERED — post-payment states only; checkout settles CARD inline at order creation); the evidence gap is recorded here, not assumed away',
    },
  }
}

async function main() {
  assertNotProd()

  const orders = await db.order.findMany({
    orderBy: { createdAt: 'asc' },
    include: { items: true, payment: true, fulfillments: { include: { items: true } } },
  })
  console.log(`orders to initialize: ${orders.length}`)

  const thisRun = {
    ordersProcessed: 0,
    ordersSkippedAlreadyInitialized: 0,
    fulfillmentGroupsCreated: 0,
    fulfillmentItemLinksCreated: 0,
    currencyDefaultsApplied: 0,
  }
  const ambiguities: Ambiguity[] = []
  const orderResults: Array<{
    orderId: string
    legacyStatus: string
    paymentStatus: string
    fulfillmentStatus: string
    groups: Array<{ sellerOrgId: string | null; sellerId: string | null; status: string; itemCount: number }>
    skipped: boolean
  }> = []

  for (const order of orders) {
    // resumability: skip orders already initialized (both dimensions done).
    // The payment mapping is still re-derived so the ambiguity report stays
    // COMPLETE on every run (ambiguities are facts about the legacy mapping,
    // not about this run's writes) — skipped orders emit theirs without
    // performing any writes.
    const alreadyInitialized =
      order.paymentStatus !== 'AWAITING_PAYMENT' && order.fulfillments.length > 0
    if (alreadyInitialized) {
      const skipMapped = mapPaymentStatus(order.status, order.payment)
      if (skipMapped.ambiguity) {
        ambiguities.push({ orderId: order.id, legacyStatus: order.status, ...skipMapped.ambiguity })
      }
      thisRun.ordersSkippedAlreadyInitialized++
      orderResults.push({
        orderId: order.id,
        legacyStatus: order.status,
        paymentStatus: order.paymentStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        groups: order.fulfillments.map((f) => ({
          sellerOrgId: f.sellerOrgId,
          sellerId: f.sellerId,
          status: f.status,
          itemCount: f.items.length,
        })),
        skipped: true,
      })
      continue
    }

    // ── payment dimension ─────────────────────────────────────────────────────
    const mapped = mapPaymentStatus(order.status, order.payment)
    if (mapped.ambiguity) {
      ambiguities.push({ orderId: order.id, legacyStatus: order.status, ...mapped.ambiguity })
    }

    // ── fulfillment substrate (S6) ────────────────────────────────────────────
    // group the order's items by sellerOrgId (fallback: sellerId); an item
    // already linked to a fulfillment is never re-linked (resume-safe)
    const linkedItemIds = new Set(order.fulfillments.flatMap((f) => f.items.map((i) => i.orderItemId)))
    const unlinkedItems = order.items.filter((i) => !linkedItemIds.has(i.id))

    const groupStatus = uniformGroupStatus(order.status)
    const groups = new Map<string, { sellerOrgId: string | null; sellerId: string | null; items: typeof order.items }>()
    for (const item of unlinkedItems) {
      const key = item.sellerOrgId ?? `seller:${item.sellerId}`
      const existing = groups.get(key)
      if (existing) {
        existing.items.push(item)
      } else {
        groups.set(key, { sellerOrgId: item.sellerOrgId, sellerId: item.sellerId, items: [item] })
      }
    }
    for (const group of groups.values()) {
      const uniformSellerId = group.items.every((i) => i.sellerId === group.items[0].sellerId)
        ? group.items[0].sellerId
        : null
      const created = await db.orderFulfillment.create({
        data: {
          orderId: order.id,
          sellerOrgId: group.sellerOrgId,
          sellerId: uniformSellerId,
          status: groupStatus,
        },
      })
      thisRun.fulfillmentGroupsCreated++
      for (const item of group.items) {
        await db.orderFulfillmentItem.create({
          data: { fulfillmentId: created.id, orderItemId: item.id, quantity: item.quantity },
        })
        thisRun.fulfillmentItemLinksCreated++
      }
    }

    // ── roll-up over ALL groups of the order (fresh + pre-existing) ──────────
    const allGroups = await db.orderFulfillment.findMany({
      where: { orderId: order.id },
      select: { status: true },
    })
    const fulfillmentStatus = rollupFulfillment(allGroups.map((g) => g.status), order.status)

    // ── write the dimensions (legacy `status` stays read-only) ───────────────
    await db.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: mapped.paymentStatus,
        fulfillmentStatus,
        ...(order.currency ? {} : { currency: 'USD' }),
      },
    })
    if (!order.currency) thisRun.currencyDefaultsApplied++

    thisRun.ordersProcessed++
    const finalGroups = await db.orderFulfillment.findMany({
      where: { orderId: order.id },
      include: { items: true },
    })
    orderResults.push({
      orderId: order.id,
      legacyStatus: order.status,
      paymentStatus: mapped.paymentStatus,
      fulfillmentStatus,
      groups: finalGroups.map((f) => ({
        sellerOrgId: f.sellerOrgId,
        sellerId: f.sellerId,
        status: f.status,
        itemCount: f.items.length,
      })),
      skipped: false,
    })
    console.log(
      `  order ${order.id.slice(-8)} ${order.status} → payment=${mapped.paymentStatus}, fulfillment=${fulfillmentStatus}, groups=${finalGroups.length}`
    )
  }

  // ── post-state verification ────────────────────────────────────────────────
  const unresolved = ambiguities.filter((a) => !a.decision)
  const dbStateAfter = {
    orders: await db.order.count(),
    fulfillmentGroups: await db.orderFulfillment.count(),
    fulfillmentItemLinks: await db.orderFulfillmentItem.count(),
    ordersWithNonDefaultPaymentStatus: await db.order.count({ where: { paymentStatus: { not: 'AWAITING_PAYMENT' } } }),
    ordersWithNonDefaultFulfillmentStatus: await db.order.count({ where: { fulfillmentStatus: { not: 'UNFULFILLED' } } }),
    unlinkedOrderItems: await db.orderItem.count({
      where: { fulfillmentItems: { none: {} } },
    }),
  }
  const everyOrderHasGroups =
    (await db.order.count({ where: { fulfillments: { none: {} } } })) === 0
  const gatePassed = unresolved.length === 0 && dbStateAfter.unlinkedOrderItems === 0 && everyOrderHasGroups

  // cumulative counts merged with the on-disk report (idempotent re-runs)
  let priorRun: { counts?: Record<string, number> } | null = null
  try {
    priorRun = JSON.parse(readFileSync(REPORT_JSON, 'utf8'))
  } catch {
    /* first run */
  }
  const cumulative: Record<string, number> = { ...(priorRun?.counts ?? {}) }
  for (const key of Object.keys(thisRun) as Array<keyof typeof thisRun>) {
    cumulative[key] = (cumulative[key] ?? 0) + thisRun[key]
  }

  const report = {
    generatedAt: new Date().toISOString(),
    task: 'Phase 7.7.7 legacy order-status initialization + ambiguity report (lastplan 7.7.7 / S6)',
    mapping: {
      payment: {
        PENDING_PAYMENT: 'AWAITING_PAYMENT',
        PENDING_APPROVAL: 'payment SUCCEEDED ? PAID : AWAITING_PAYMENT',
        'PAID/PROCESSING/SHIPPED/DELIVERED':
          'payment SUCCEEDED ? PAID : (payment row PENDING/FAILED/CANCELLED → AWAITING_PAYMENT, mixed signal recorded) : (no payment row → PAID from the legacy state machine, recorded)',
        CANCELLED: 'payment SUCCEEDED ? PAID (retained; refund states only from COMPLETED refund-ledger evidence, 7.7.1) : AWAITING_PAYMENT',
      },
      fulfillmentGroupUniformMapping: {
        DELIVERED: 'DELIVERED',
        SHIPPED: 'SHIPPED',
        PROCESSING: 'PROCESSING',
        'PAID/PENDING_PAYMENT/PENDING_APPROVAL': 'UNFULFILLED',
        CANCELLED: 'CANCELLED',
        _applied: 'identically to every seller group on the order',
      },
      rollup: 'all CANCELLED→CANCELLED; CANCELLED mixed→PARTIALLY_CANCELLED; all DELIVERED→FULFILLED; all UNFULFILLED→UNFULFILLED; any non-uniform non-cancelled mix→PARTIALLY_FULFILLED; all same non-cancelled status→that status',
    },
    limitation: FULFILLMENT_LIMITATION,
    counts: cumulative,
    thisRun,
    dbStateAfter,
    orders: orderResults,
    ambiguities,
    gate: gatePassed
      ? 'PASS — zero ambiguity rows without a recorded decision; every order has fulfillment groups and every item is linked'
      : 'FAIL — see ambiguities / dbStateAfter',
  }

  mkdirSync(resolve(process.cwd(), 'docs/reports'), { recursive: true })
  writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2) + '\n')

  const byPayment: Record<string, number> = {}
  const byFulfillment: Record<string, number> = {}
  for (const o of orderResults) {
    byPayment[o.paymentStatus] = (byPayment[o.paymentStatus] ?? 0) + 1
    byFulfillment[o.fulfillmentStatus] = (byFulfillment[o.fulfillmentStatus] ?? 0) + 1
  }
  const md = `# Phase 7.7.7 — Legacy order-status initialization + ambiguity report

Generated: ${report.generatedAt}
Script: scripts/backfill-order-status.ts (idempotent, resumable — item links are unique-guarded)

## What ran

Every order got paymentStatus + fulfillmentStatus initialized from the provable mapping, plus the per-seller-group
fulfillment substrate (one OrderFulfillment per sellerOrgId group, uniform legacy mapping, items linked with
their quantities), then the fulfillmentStatus roll-up. The legacy single \`status\` column is retained read-only.

**Uniform-mapping limitation (verbatim, S6):** ${FULFILLMENT_LIMITATION}

## Counts

| Metric | Count |
|---|---|
| Orders processed (this DB total) | ${orderResults.length} |
| Fulfillment groups created (cumulative) | ${cumulative.fulfillmentGroupsCreated ?? 0} |
| Fulfillment item links created (cumulative) | ${cumulative.fulfillmentItemLinksCreated ?? 0} |
| Currency defaults applied (USD) | ${cumulative.currencyDefaultsApplied ?? 0} |
| Orders skipped (already initialized) | ${cumulative.ordersSkippedAlreadyInitialized ?? 0} |

Payment-status distribution (post-backfill): ${Object.entries(byPayment).map(([k, v]) => `${k}=${v}`).join(', ')}
Fulfillment-status distribution (post-backfill): ${Object.entries(byFulfillment).map(([k, v]) => `${k}=${v}`).join(', ')}

DB state now: orders=${dbStateAfter.orders}, fulfillmentGroups=${dbStateAfter.fulfillmentGroups}, itemLinks=${dbStateAfter.fulfillmentItemLinks}, ordersWithNonDefaultPaymentStatus=${dbStateAfter.ordersWithNonDefaultPaymentStatus}, ordersWithNonDefaultFulfillmentStatus=${dbStateAfter.ordersWithNonDefaultFulfillmentStatus}, unlinkedOrderItems=${dbStateAfter.unlinkedOrderItems}

## Ambiguities (${ambiguities.length} — every row carries a recorded decision; zero unresolved)

${ambiguities.length === 0 ? '_none_' : ambiguities.map((a) => `- **${a.kind}** (order ${a.orderId.slice(-8)}, legacy ${a.legacyStatus}): ${a.detail}\n  → decision: ${a.decision}`).join('\n')}

**Gate: ${report.gate}**
`
  writeFileSync(REPORT_MD, md)

  console.log('\n─── 7.7.7 order-status backfill ──────────────────────')
  console.log(JSON.stringify({ thisRun, dbStateAfter }, null, 2))
  console.log(`payment distribution: ${JSON.stringify(byPayment)}`)
  console.log(`fulfillment distribution: ${JSON.stringify(byFulfillment)}`)
  console.log(`ambiguities: ${ambiguities.length} (unresolved: ${unresolved.length})`)
  console.log(`gate: ${report.gate}`)
  console.log(`reports: ${REPORT_JSON}`)
  await db.$disconnect()
  if (!gatePassed) process.exit(1)
}

main().catch((err) => {
  console.error('backfill-order-status crashed:', err)
  process.exit(1)
})
