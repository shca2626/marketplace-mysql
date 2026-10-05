# Phase 7.7.7 — Legacy order-status initialization + ambiguity report

Generated: 2026-10-05T18:31:01.231Z
Script: scripts/backfill-order-status.ts (idempotent, resumable — item links are unique-guarded)

## What ran

Every order got paymentStatus + fulfillmentStatus initialized from the provable mapping, plus the per-seller-group
fulfillment substrate (one OrderFulfillment per sellerOrgId group, uniform legacy mapping, items linked with
their quantities), then the fulfillmentStatus roll-up. The legacy single `status` column is retained read-only.

**Uniform-mapping limitation (verbatim, S6):** legacy data cannot prove per-seller partial fulfillment — a globally SHIPPED order initializes every group as SHIPPED; no historical per-seller evidence exists or is implied

## Counts

| Metric | Count |
|---|---|
| Orders processed (this DB total) | 20 |
| Fulfillment groups created (cumulative) | 70 |
| Fulfillment item links created (cumulative) | 70 |
| Currency defaults applied (USD) | 0 |
| Orders skipped (already initialized) | 0 |

Payment-status distribution (post-backfill): PAID=19, AWAITING_PAYMENT=1
Fulfillment-status distribution (post-backfill): PROCESSING=3, SHIPPED=5, FULFILLED=6, UNFULFILLED=6

DB state now: orders=20, fulfillmentGroups=35, itemLinks=35, ordersWithNonDefaultPaymentStatus=19, ordersWithNonDefaultFulfillmentStatus=14, unlinkedOrderItems=0

## Ambiguities (15 — every row carries a recorded decision; zero unresolved)

- **no-payment-row** (order 7mvnf0il, legacy PROCESSING): legacy status PROCESSING with NO payment row — the payment-evidence gap cannot be closed from stored records
  → decision: mapped paymentStatus=PAID from the legacy state machine (STATUS_FLOW PAID→PROCESSING→SHIPPED→DELIVERED — post-payment states only; checkout settles CARD inline at order creation); the evidence gap is recorded here, not assumed away
- **no-payment-row** (order y0s9g96x, legacy SHIPPED): legacy status SHIPPED with NO payment row — the payment-evidence gap cannot be closed from stored records
  → decision: mapped paymentStatus=PAID from the legacy state machine (STATUS_FLOW PAID→PROCESSING→SHIPPED→DELIVERED — post-payment states only; checkout settles CARD inline at order creation); the evidence gap is recorded here, not assumed away
- **no-payment-row** (order 169mqtth, legacy DELIVERED): legacy status DELIVERED with NO payment row — the payment-evidence gap cannot be closed from stored records
  → decision: mapped paymentStatus=PAID from the legacy state machine (STATUS_FLOW PAID→PROCESSING→SHIPPED→DELIVERED — post-payment states only; checkout settles CARD inline at order creation); the evidence gap is recorded here, not assumed away
- **no-payment-row** (order bx3twikw, legacy DELIVERED): legacy status DELIVERED with NO payment row — the payment-evidence gap cannot be closed from stored records
  → decision: mapped paymentStatus=PAID from the legacy state machine (STATUS_FLOW PAID→PROCESSING→SHIPPED→DELIVERED — post-payment states only; checkout settles CARD inline at order creation); the evidence gap is recorded here, not assumed away
- **no-payment-row** (order f503r9dw, legacy PAID): legacy status PAID with NO payment row — the payment-evidence gap cannot be closed from stored records
  → decision: mapped paymentStatus=PAID from the legacy state machine (STATUS_FLOW PAID→PROCESSING→SHIPPED→DELIVERED — post-payment states only; checkout settles CARD inline at order creation); the evidence gap is recorded here, not assumed away
- **no-payment-row** (order 083jhvx7, legacy PROCESSING): legacy status PROCESSING with NO payment row — the payment-evidence gap cannot be closed from stored records
  → decision: mapped paymentStatus=PAID from the legacy state machine (STATUS_FLOW PAID→PROCESSING→SHIPPED→DELIVERED — post-payment states only; checkout settles CARD inline at order creation); the evidence gap is recorded here, not assumed away
- **no-payment-row** (order g9mm0odf, legacy SHIPPED): legacy status SHIPPED with NO payment row — the payment-evidence gap cannot be closed from stored records
  → decision: mapped paymentStatus=PAID from the legacy state machine (STATUS_FLOW PAID→PROCESSING→SHIPPED→DELIVERED — post-payment states only; checkout settles CARD inline at order creation); the evidence gap is recorded here, not assumed away
- **no-payment-row** (order g75ioa1w, legacy DELIVERED): legacy status DELIVERED with NO payment row — the payment-evidence gap cannot be closed from stored records
  → decision: mapped paymentStatus=PAID from the legacy state machine (STATUS_FLOW PAID→PROCESSING→SHIPPED→DELIVERED — post-payment states only; checkout settles CARD inline at order creation); the evidence gap is recorded here, not assumed away
- **no-payment-row** (order 299snm5x, legacy DELIVERED): legacy status DELIVERED with NO payment row — the payment-evidence gap cannot be closed from stored records
  → decision: mapped paymentStatus=PAID from the legacy state machine (STATUS_FLOW PAID→PROCESSING→SHIPPED→DELIVERED — post-payment states only; checkout settles CARD inline at order creation); the evidence gap is recorded here, not assumed away
- **no-payment-row** (order gfihff8h, legacy PAID): legacy status PAID with NO payment row — the payment-evidence gap cannot be closed from stored records
  → decision: mapped paymentStatus=PAID from the legacy state machine (STATUS_FLOW PAID→PROCESSING→SHIPPED→DELIVERED — post-payment states only; checkout settles CARD inline at order creation); the evidence gap is recorded here, not assumed away
- **no-payment-row** (order x16lzj0t, legacy PROCESSING): legacy status PROCESSING with NO payment row — the payment-evidence gap cannot be closed from stored records
  → decision: mapped paymentStatus=PAID from the legacy state machine (STATUS_FLOW PAID→PROCESSING→SHIPPED→DELIVERED — post-payment states only; checkout settles CARD inline at order creation); the evidence gap is recorded here, not assumed away
- **no-payment-row** (order cyd5bymg, legacy SHIPPED): legacy status SHIPPED with NO payment row — the payment-evidence gap cannot be closed from stored records
  → decision: mapped paymentStatus=PAID from the legacy state machine (STATUS_FLOW PAID→PROCESSING→SHIPPED→DELIVERED — post-payment states only; checkout settles CARD inline at order creation); the evidence gap is recorded here, not assumed away
- **no-payment-row** (order re42d7v3, legacy DELIVERED): legacy status DELIVERED with NO payment row — the payment-evidence gap cannot be closed from stored records
  → decision: mapped paymentStatus=PAID from the legacy state machine (STATUS_FLOW PAID→PROCESSING→SHIPPED→DELIVERED — post-payment states only; checkout settles CARD inline at order creation); the evidence gap is recorded here, not assumed away
- **no-payment-row** (order 4414s5jv, legacy DELIVERED): legacy status DELIVERED with NO payment row — the payment-evidence gap cannot be closed from stored records
  → decision: mapped paymentStatus=PAID from the legacy state machine (STATUS_FLOW PAID→PROCESSING→SHIPPED→DELIVERED — post-payment states only; checkout settles CARD inline at order creation); the evidence gap is recorded here, not assumed away
- **mixed-signal-payment-not-succeeded** (order orll1i4r, legacy SHIPPED): legacy status SHIPPED is post-payment, but the payment row is PENDING (INVOICE) — the financial ledger contradicts the legacy global status
  → decision: payment ledger wins: paymentStatus=AWAITING_PAYMENT — the Payment row is the financial fact; the legacy global status is treated as fulfillment-only evidence for this order

**Gate: PASS — zero ambiguity rows without a recorded decision; every order has fulfillment groups and every item is linked**
