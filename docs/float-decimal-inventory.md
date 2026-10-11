# Phase 7.1 — Float → Decimal field inventory (the reviewed migration artifact)

Generated: Phase 7 implementation round · `prisma/schema.prisma` live scan
Status: **INVENTORY ONLY — the actual conversion follows the staged 7.1/7.1b protocol (dual-write → backfill → flag-flip → observation → drop), never a big-bang type flip.**

Per lastplan v5 §7.1: *"The count of Float columns is context, not a migration target."* All 55 Float columns in the schema classify as MONEY / RATE / MEASUREMENT / RATING / GEO — **only monetary fields migrate**. The inventory below carries, per monetary field: table, column, current type, target type, currency behavior, rounding rule, and backfill source of truth.

## Summary

| Class | Columns | Migrates? |
|---|---|---|
| MONEY | 26 | **YES** (all 26 below) |
| RATE (commission/fee/profit/penalty %, FX rate) | 9 | YES — DECIMAL(18,6), reviewed natural scale |
| MEASUREMENT (weight, dimensions) | 6 | no |
| RATING (product ratings) | 3 | no |
| GEO / misc | 11 | no |

## Monetary fields (the migration set)

Target types per 7.1.2: settled totals/fees → `DECIMAL(15,2)`; unit prices, commission rates, FX rates, intermediate math → `DECIMAL(18,6)`.

| Table | Column | Now | Target | Currency behavior | Rounding rule | Backfill source of truth |
|---|---|---|---|---|---|---|
| Product | price | Float | D(15,2) | fixed USD (implicit; catalog is USD-native) | cents, half-up | the row itself (Float → Decimal cast; ≤ 2dp by construction) |
| Product | compareAtPrice | Float | D(15,2) | fixed USD | cents | the row itself |
| ProductOffer | price | Float | D(18,6) | fixed USD (offer = product currency) | 6dp intermediate; display cents | the row itself |
| ProductOffer | compareAtPrice | Float | D(15,2) | fixed USD | cents | the row itself |
| ProductOffer | shippingFee | Float? | D(15,2) | fixed USD | cents | the row itself |
| ProductVariant | price | Float? | D(18,6) | fixed USD (null = inherit product) | 6dp | the row itself |
| ProductVariant | compareAtPrice | Float? | D(15,2) | fixed USD | cents | the row itself |
| OfferVariant | price | Float? | D(18,6) | fixed USD (null = inherit offer) | 6dp | the row itself |
| PriceListEntry | price | Float | D(18,6) | PriceList.currency (row-context; lists carry explicit codes) | 6dp | the row itself |
| Order | total | Float | D(15,2) | **Order.currency (row-context, Phase 7.2)** — explicit column since 7.7 | cents (computePricing already rounds to cents) | recompute = Σ items price×qty + pricing adjustments; drift beyond declared rounding BLOCKS (7.1.4) |
| OrderItem | price | Float | D(18,6) | Order.currency of the parent row | 6dp (snapshot at purchase) | the row itself |
| Quote | subtotal | Float | D(15,2) | **Quote.currency (row-context)** | cents | Σ quote lines (recompute + declared-rounding diff only) |
| Quote | discountTotal | Float | D(15,2) | Quote.currency | cents | the row itself |
| Quote | shippingTotal | Float | D(15,2) | Quote.currency | cents | the row itself |
| Quote | taxTotal | Float | D(15,2) | Quote.currency | cents | the row itself |
| Quote | total | Float | D(15,2) | Quote.currency | cents | subtotal − discount + shipping + tax (declared-rounding diff only) |
| QuoteLine | unitPrice | Float | D(18,6) | Quote.currency (H1 snapshot — never reconstructed) | 6dp | the row itself |
| RfqLine | targetPrice | Float? | D(18,6) | Quote.currency context at quote time; otherwise USD | 6dp | the row itself |
| ApprovalRequest | amount | Float | D(15,2) | the approved order/quote's currency (row-context) | cents | the row itself |
| Payment | amount | Float | D(15,2) | Payment.currency (explicit, row-context) | cents | Order.total of the parent |
| Payout | grossAmount | Float | D(15,2) | Payout.currency (explicit since 7.4) | cents | Σ PayoutLine.amount (the ledger is authoritative post-7.4) |
| Payout | commission | Float | D(15,2) | Payout.currency | cents | Σ PayoutLine.commission (per-line rounded — declared rule; tolerance 0.005×lineCount) |
| Payout | netAmount | Float | D(15,2) | Payout.currency | cents | gross − commission (derived) |
| PayoutLine | amount | Float | D(15,2) | PayoutLine.currency (explicit) | cents (per-line rounding — the 7.4D.8 backfill proved it) | the row itself |
| PayoutLine | commission | Float | D(15,2) | PayoutLine.currency | cents per line | the row itself |
| Refund | amountTotal | Float | D(15,2) | Refund.currency (explicit) | cents | Σ RefundAllocation buckets |
| RefundAllocation | amount, bucketShipping, bucketDiscounts, bucketTaxes | Float | D(15,2) | Refund.currency | cents | the row itself |
| Coupon | minSubtotal, discountValue | Float | D(15,2) | fixed USD (retail coupon domain) | cents | the row itself |
| Organization | creditLimit | Float | D(15,2) | fixed USD | cents | the row itself |
| FinancingRequest | amountRequested/approved/disbursed, downpaymentAmount | Float | D(15,2) | **YER-native (financing domain)** — FinancingRequest.currency | cents | the row itself |
| FinancierService | amountMin/amountMax, feeFlat | Float | D(15,2) | service.currency (YER default) | cents | the row itself |
| FinancingOffer | amount, feeFlat, installmentTotal | Float | D(15,2) | offer currency (row-context) | cents | the row itself |
| FinancingOfferInstallment | amount, fee | Float | D(15,2) | parent offer currency | cents | the row itself |
| FinancingAgreement | principal/downpayment/financed/totalProfit/totalPayable/installmentAmount | Float | D(15,2) | agreement currency | cents | the row itself |
| FinancingFee | amount | Float | D(15,2) | fee currency (row-context) | cents | the row itself |

## Rate fields (migrate at natural scale)

| Column | Target | Notes |
|---|---|---|
| User.commissionRate, Payout.commissionRate | D(18,6) | percent; snapshot on Payout |
| PayoutLine.fxRate, ExchangeRate.rate | D(18,6) | FX rates — 7.2 snapshots persist rate + timestamp + source on the record |
| Coupon.discountPercent | D(18,6) | percent |
| FinancierService.feePercent/penaltyRate/latePenaltyPercent/min/maxDownpaymentPercent | D(18,6) | percent family |
| FinancingOffer.ratePercent, FinancingAgreement.profitRate/latePenaltyPercent, FinancingFee.ratePercent | D(18,6) | percent family |

## Non-migrating classes

- **RATING** — Product.rating (aggregate display value)
- **MEASUREMENT** — weight/dimension fields on products + logistics
- **GEO / misc** — coordinates and other non-monetary floats

## Currency-concept separation (7.1.2, live since this round)

Transaction · display · settlement · accounting/base are kept distinct: `Order.currency`/`Payment.currency` (transaction), the storefront FX switcher (display, `GET /api/fx`), `Payout.currency`/`PayoutLine.currency` (settlement), and the configurable accounting base (7.2 substrate — PlatformSetting). Financing stays YER-native; retail stays USD-native.

## The staged protocol this artifact feeds (7.1 → 7.1b — NOT executed in this round)

1. Backup + signed reconciliation baselines (orders, payments, payouts, commissions, financing fees).
2. Per-field type rules (the Target column above) — no blanket conversion.
3. Per-row historical currency from actual data (the Currency behavior column); ambiguous rows listed + resolved before backfill; no blanket default.
4. Shadow Decimal columns → backfill → **diff must contain only declared-rounding differences** (the 7.4D.8 legacy payout backfill already proved this discipline: per-line commission rounding with 0.005×lineCount tolerance, zero unresolved).
5. FX snapshot (rate/timestamp/source) preserved on every converted/derived amount — the PayoutLine + ExchangeRate substrate exists since this round.
6. Writers/readers switch behind a flag; reconcile against baselines; signed report.
7. Flip; 14-day observation with continuous reconciliation; Float drops in a separate reviewed migration.

**Production rollout follows 7.1b's explicit 7-step order (dual-write deployed BEFORE backfill; single-database rollback plans documented; never `db push` against production).**
