# Phase 7.4D.8 — Legacy payout backfill (PayoutLine ledger)

Generated: 2026-10-05T02:15:01.980Z
Script: scripts/backfill-payout-lines.ts (idempotent, resumable — existing (payoutId, orderItemId) lines are never duplicated)

## What ran

Every legacy Payout row had its OrderItem.payoutId links projected into the immutable PayoutLine ledger
(SETTLEMENT lines; amount = price × qty; commission under the declared per-line rounding rule; claimKey =
orderItemId while PENDING/EFFECTIVE — REVERSAL/CANCELLED lines never occupy the claim slot).

## Counts

| Metric | Count |
|---|---|
| Payouts processed | 0 |
| PayoutLines created | 0 |
| Lines already present (skipped) | 0 |
| Payouts with broken/absent item links | 0 |

DB state now: payouts=0, payoutLines=0, claimKeysHeld=0

## Reconciliation (7.4.8)

Rounding rule: per-line commission rounding: round(price × qty × commissionRate/100 × 100)/100; reconciliation tolerance = 0.005 × lineCount

- Payouts reconciled: 0
- Σline.amount exact vs payout.grossAmount: 0/0
- Σline.commission within declared tolerance vs payout.commission: 0/0

**Gate: PASS — zero unresolved ambiguity cases**

## Ambiguities (0 — every case carries a recorded decision; zero unresolved)

_none_
