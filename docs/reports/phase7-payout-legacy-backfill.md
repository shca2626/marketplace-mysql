# Phase 7.4D.8 — Legacy payout backfill (PayoutLine ledger)

Generated: 2026-10-05T18:31:02.459Z
Script: scripts/backfill-payout-lines.ts (idempotent, resumable — existing (payoutId, orderItemId) lines are never duplicated)

## What ran

Every legacy Payout row had its OrderItem.payoutId links projected into the immutable PayoutLine ledger
(SETTLEMENT lines; amount = price × qty; commission under the declared per-line rounding rule; claimKey =
orderItemId while PENDING/EFFECTIVE — REVERSAL/CANCELLED lines never occupy the claim slot).

## Counts

| Metric | Count |
|---|---|
| Payouts processed | 1 |
| PayoutLines created | 0 |
| Lines already present (skipped) | 0 |
| Payouts with broken/absent item links | 1 |

DB state now: payouts=1, payoutLines=0, claimKeysHeld=0

## Reconciliation (7.4.8)

Rounding rule: per-line commission rounding: round(price × qty × commissionRate/100 × 100)/100; reconciliation tolerance = 0.005 × lineCount

- Payouts reconciled: 1
- Σline.amount exact vs payout.grossAmount: 0/1
- Σline.commission within declared tolerance vs payout.commission: 0/1

**Gate: PASS — zero unresolved ambiguity cases**

## Ambiguities (1 — every case carries a recorded decision; zero unresolved)

- **no-linked-items** (PY-2026-000002): payout PY-2026-000002 (gross 657.98, status PAID) has no OrderItem rows pointing at it via payoutId
  → decision: no ledger lines can be derived — the legacy payout row is preserved as-is and flagged; item claims cannot be reconstructed without links (recorded, not assumed)
