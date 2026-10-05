// ─────────────────────────────────────────────────────────────────────────────
// PHASE 7.7.7 ORDER-STATUS BACKFILL — DOCUMENTED ROLLBACK (one-shot inverse of
// scripts/backfill-order-status.ts)
//
//   bun scripts/unwind-phase7-order-status.ts
//
// Undoes exactly what the 7.7.7 initialization created:
//   • deletes every OrderFulfillmentItem + OrderFulfillment row (both tables
//     were empty before the backfill — Phase 7 created them)
//   • resets Order.paymentStatus → 'AWAITING_PAYMENT' and
//     Order.fulfillmentStatus → 'UNFULFILLED' (the schema defaults they held
//     before the backfill)
//   • leaves Order.currency and the legacy `status` column untouched
// Also removes docs/reports/phase7-order-status-backfill.{json,md}.
// ONE-SHOT by design; no-op when no fulfillment rows exist.
// ─────────────────────────────────────────────────────────────────────────────
import { assertNotProd } from './lib/assert-not-prod'
import { db } from '../src/lib/db'
import { existsSync, rmSync } from 'fs'
import { resolve } from 'path'

const REPORT_JSON = resolve(process.cwd(), 'docs/reports/phase7-order-status-backfill.json')
const REPORT_MD = resolve(process.cwd(), 'docs/reports/phase7-order-status-backfill.md')

async function main() {
  assertNotProd()

  const groups = await db.orderFulfillment.count()
  if (groups === 0) {
    console.log('nothing to unwind — no OrderFulfillment rows exist (already rolled back?)')
    await db.$disconnect()
    return
  }

  const delItems = await db.orderFulfillmentItem.deleteMany({})
  const delGroups = await db.orderFulfillment.deleteMany({})
  const resetOrders = await db.order.updateMany({
    data: { paymentStatus: 'AWAITING_PAYMENT', fulfillmentStatus: 'UNFULFILLED' },
  })
  console.log(`  fulfillment item links deleted: ${delItems.count}`)
  console.log(`  fulfillment groups deleted: ${delGroups.count}`)
  console.log(`  orders reset to defaults: ${resetOrders.count}`)

  const now = {
    fulfillmentGroups: await db.orderFulfillment.count(),
    itemLinks: await db.orderFulfillmentItem.count(),
    defaultPayment: await db.order.count({ where: { paymentStatus: 'AWAITING_PAYMENT' } }),
    defaultFulfillment: await db.order.count({ where: { fulfillmentStatus: 'UNFULFILLED' } }),
    orders: await db.order.count(),
  }
  const ok = now.fulfillmentGroups === 0 && now.itemLinks === 0 && now.defaultPayment === now.orders && now.defaultFulfillment === now.orders
  console.log('  baseline check:', ok ? `MATCH — ${now.orders} orders back on schema defaults, substrate empty` : `MISMATCH: ${JSON.stringify(now)}`)

  for (const f of [REPORT_JSON, REPORT_MD]) {
    if (existsSync(f)) {
      rmSync(f)
      console.log(`  removed ${f}`)
    }
  }

  await db.$disconnect()
  if (!ok) process.exit(1)
}

main().catch((err) => {
  console.error('unwind crashed:', err)
  process.exit(1)
})
