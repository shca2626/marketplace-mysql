# Phase 7.0 — Seller-org substrate backfill (lastplan 7.0.3 + 7.0.4)

Generated: 2026-10-05T18:29:50.318Z
Spec: docs/seller-tenant-model.md (binding) · scripts/backfill-seller-orgs.ts (idempotent, resumable)
Counts below are cumulative across runs; reconciliation is re-derived from live DB state on every run.

## What ran

For every candidate seller user (role=SELLER plus any user referenced as ProductOffer.sellerId / Product.sellerId):
org resolution (reuse an owned org, else create one) → SellerProfile → OWNER membership → sellerOrgId stamping on
offers / order items / payouts / quotes → normalized primary offers for every seller-owned product.

## Counts

| Metric | Count |
|---|---|
| Sellers processed | 30 |
| Orgs created | 10 |
| Orgs reused (existing OWNER membership) | 20 |
| SellerProfiles created | 30 |
| OWNER memberships created | 10 |
| ProductOffers stamped (sellerOrgId) | 3 |
| OrderItems stamped (sellerOrgId) | 70 |
| Payouts stamped (sellerOrgId) | 1 |
| Quotes stamped (sellerOrgId) | 4 |
| Primary offers created (ACTIVE) | 66 |
| Products already covered by an offer | 0 (status distribution: none) |

DB state now: organizations=24, sellerProfiles=15, productOffers=33, productOffersWithSellerOrgId=33, orderItemsWithSellerOrgId=35, quotesWithSellerOrgId=2, payoutsWithSellerOrgId=1

## Reconciliation — the 7.0 gate (every check must be ZERO mismatches)

| # | Check | Mismatches |
|---|---|---|
| 1 | Every seller user has org + SellerProfile + OWNER membership | 0 |
| 2 | Every ProductOffer.sellerOrgId matches its seller's org | 0 |
| 3 | Every seller-owned Product has ≥1 offer row (any status) | 0 |
| 4 | Every OrderItem/Payout/Quote sellerOrgId matches its seller's org | 0 |
| 5 | No NULL sellerOrgId on rows belonging to a seller WITH an org | 0 |

**Gate: PASS — zero mismatches on all five checks**

## Ambiguities (1 — all carry a recorded decision)

- **primary-offer normalization on non-ACTIVE products**: 1 seller-owned Product(s) in status ARCHIVED received a status='ACTIVE' primary ProductOffer per the 7.0.3 spec ("one ACTIVE ProductOffer per seller-owned product")
  → decision: kept ACTIVE per spec; every commerce path (checkout, offer listing) independently validates Product.status — archived products remain unbuyable through their primary offer

From this point the offer layer is the single authoritative source of seller attribution for commerce
(docs/seller-tenant-model.md §2 row 1); the product's own price/stock are the read-model for its primary offer.
