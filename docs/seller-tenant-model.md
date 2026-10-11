# Seller tenant identity model (lastplan v5 §6.13 / §2.1 D10 — the spec Phase 7.0 implements)

> **Status: RECORDED** (2026-10-04, Phase 6/6.13). This document is the binding
> spec for Phase 7.0 (seller tenant substrate). **Any deviation from it during
> implementation re-opens the decision** (lastplan 6.13.2).
>
> Basis: lastplan v5 §2.1 (D10, rewritten per reviewer items S1/S2/S3), the
> owner's binding decision Q3 ("Finish Product/Offer attribution 100% — including
> the variant×offer model"), and the owner's standing directive to proceed
> through the plan's phases. Buyer duality carries the plan's recommendation
> as the working assumption with an explicit owner-override window (§4) —
> the 7.0 substrate is identical under either answer, so Phase 7 is not
> blocked by it.

## 1. The three-concept identity model (S1) — no existing column is relabeled

1. **`sellerOrgId` — the authoritative vendor tenant.** Added to
   `ProductOffer`, `OrderItem`, `Payout` (+ `PayoutLine`), `OrderFulfillment`,
   `Quote`. It is the organization that owns the selling relationship:
   grouping, settlement, fulfillment, RBAC scope, subscription attachment,
   limits, analytics.

2. **The existing `sellerId` columns — historical seller-account identity,
   meaning preserved.** `ProductOffer.sellerId` remains *the seller account
   offering the product*; `OrderItem.sellerId` remains *the seller account
   attributed the sale*; `Payout.sellerId` remains *the seller account
   receiving the payout*; `Quote.sellerId` remains *the fulfilling seller
   account*; `Product.sellerId` remains *the owning seller account* (until
   Phase 9's curated nullability). These are **vendor identity, not actors** —
   they are never described or used as "who performed the action."

3. **Actual actors — separate fields where the action matters.**
   `Quote.createdById` already records the issuing actor. `Payout` gains
   `executedById` (who confirmed the transfer); generation/mark-paid actors
   also flow to the AuditLog. `ProductOffer` creation actor comes from the
   AuditLog (no actor column is invented where none is needed).

## 2. Full field mapping (S2) — every seller-identity touchpoint

| Record / path | Treatment |
|---|---|
| Seller-owned `Product` records | **Normalized offer (authoritative):** the 7.0 backfill creates one ACTIVE `ProductOffer` per seller-owned product from its current price/stock (the "primary listing offer"), so **the offer layer becomes the single authoritative source of seller attribution for commerce**. `Product.sellerId` remains the historical owner account; Phase 9 later makes it nullable for curated records (9.1). The product's own price/stock become read-model presentation for that offer (7.3's single-authority rule applies). |
| `ProductOffer` | `sellerOrgId` added (authoritative tenant); `sellerId` retained as the seller-account identity (§1.2). |
| `OrderItem` / `Payout` / `PayoutLine` / `OrderFulfillment` | `sellerOrgId` added (authoritative); `sellerId` retained as historical seller-account identity. |
| `Quote` | `sellerOrgId` added (seller-org-scoped authorization for issuing/managing quotes); `sellerId` retained as the historical fulfilling-seller account; `createdById` is the actor (existing). |
| Primary-product purchase & RFQ paths | After the normalized-offer backfill they are **offer-backed** like everything else; attribution, pricing, and stock authority flow the offer path; RFQ lines without an explicit offer target remain open-to-offers (existing semantics) and resolve attribution through whichever offer is transacted. |
| Seller analytics, moderation | Re-keyed to `sellerOrgId` (authoritative); existing user-keyed aggregates retained as historical views during migration. |
| Seller coupons | `Coupon` has **no seller field today** (platform-only); the seller coupons of 8.3 attach to `sellerOrgId` from day one. |
| Store policies/settings | Land on `SellerProfile` (7.0), which belongs to the seller org. |

## 3. Verification ≠ suspension (S3 — feeds the 8.5 publish policy)

Seller verification moves to `SellerProfile.verificationState`
(`UNVERIFIED | PENDING | VERIFIED | REJECTED`); `Organization.status`
remains **operational** (ACTIVE/SUSPENDED/…). An unverified seller org is
operationally ACTIVE so the owner's default-ALLOW publish policy (binding Q1)
works as chosen; the 8.5 policy and its mitigations consult
`verificationState`; **suspension remains the operational hard block** (always
blocked from publishing, every path). `Organization.status =
PENDING_VERIFICATION` is never used to represent "unverified seller" — that
conflates onboarding state with trust state and would accidentally block the
owner's policy.

## 4. Buyer duality — working assumption + owner override window

**Recorded assumption (plan §2.1 recommendation): YES on all three
sub-points.** A seller organization may also act as a buyer organization —
but only through the same machinery as any buyer:

1. **Buyer machinery prerequisite** — an active membership with buyer roles
   and the org being operationally ACTIVE (no seller-specific shortcuts).
2. **Approval-flow participation** — if duality holds, the seller org
   participates in buyer approval flows (approval thresholds,
   `ApprovalRequest`) exactly like any buyer org.
3. **Financing eligibility as buyer** — the seller org **may** be eligible
   for financing as a buyer, subject to financier accreditation/KYC exactly
   like any other org (the financing gate is KYC/accreditation, not
   seller-ness).

**Owner override window:** the owner may flip any sub-point with a recorded
worklog note before the dependent feature ships (approval-flow participation
is consumed in Phase 8; financing-as-buyer in Phase 10). The Phase 7.0
substrate — SellerProfile, `sellerOrgId` columns, backfill, RBAC scope — is
**identical under either answer**, which is why 7.0 is not blocked by this
sub-decision.

## 5. D9 — Variant×offer data model (confirmed in the same window; lands at 7.6)

**Accepted (recommended): `OfferVariant`** — per-offer variant rows
(`@@unique([offerId, variantId])`) with price override, per-variant stock
authority, sku, isActive. `OrderItem.offerVariantId` records the actual
(offer, variant) sold; `RfqLine.offerVariantId` + `QuoteLine.offerVariantId`
persist the identity through the RFQ/quote path with commercial snapshots
(7.6). Catalog-level `ProductVariant` price/stock become presentation /
defaults for the product owner's primary listing — the purchase authority is
always the (offer, variant) actually sold.

*Alternative (rejected, documented):* variants as shared catalog choices
with every offer covering all variants on identical terms — cannot express
the required two-vendor test (different per-variant availability/pricing)
and eliminates per-variant vendor price competition, contradicting Q7's 3P
model.

## 6. What Phase 7.0 implements from this spec (binding scope)

1. **`SellerProfile`** — 1:1 `Organization` (unique organizationId);
   ownerUserId; `verificationState` per §3. Store settings land here in 8.3.
2. **Identity columns per §1/§2** — `sellerOrgId` on `ProductOffer`,
   `OrderItem`, `Payout` (+ `PayoutLine`), `OrderFulfillment`, `Quote`;
   `Payout.executedById`; existing `sellerId` columns retained unchanged.
3. **Normalized primary offers (§2 row 1)** — one ACTIVE `ProductOffer` per
   seller-owned product from its current price/stock; from that point the
   offer layer is the single authoritative source of seller attribution for
   commerce.
4. **Reviewed, resumable backfill** — one organization + SellerProfile + OWNER
   membership per existing seller user; `sellerOrgId` set on offers, order
   items, payouts, quotes, fulfillments; primary offers created; new writes
   set both identifiers from creation. **Backfill verification is a gate:**
   every seller user has an org; every offer's `sellerOrgId` matches its
   seller's org; every seller-owned product has a primary offer — results
   committed.
5. **RBAC `SELLER_SCOPED` resolution switches to the org**
   (`ctx.orgId` = seller org) — same machinery as every other org scope.
6. **Tests** — offer's `sellerOrgId` matches its seller-account's org;
   multi-member seller orgs (a second SELLER-role member manages
   offers/payouts under the org); buyer duality per §4's recorded assumption
   (seller org places an order as a buyer org through standard buyer
   machinery).
