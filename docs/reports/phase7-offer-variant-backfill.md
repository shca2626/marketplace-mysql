# Phase 7.6.4 — OfferVariant migration + QuoteLine offer adoption

Generated: 2026-10-05T02:23:16.706Z
Script: scripts/backfill-offer-variants.ts (idempotent, resumable — existing (offerId, variantId) rows are never duplicated; offerId is only stamped when NULL)

## What ran

1. Every ProductOffer on a variant-bearing product received OfferVariant rows from catalog defaults
   (price override, per-variant stock, sku, isActive) — the (offer, variant) pair is now the purchase-time
   authority (D9); catalog-level variant price/stock remain presentation defaults for the owner's primary listing.
2. Existing QuoteLines adopted offer identity from their RFQ lines where provable, validated to the same
   product (fail-closed, 7.6.3). H1: availableStock snapshots are never reconstructed — they stay NULL and the
   decision is recorded per line.

## Counts

| Metric | Count |
|---|---|
| Offers scanned | 72 |
| Offers on variant products | 4 |
| Offers skipped (product has no variants) | 68 |
| OfferVariants created | 4 |
| OfferVariants already present (skipped) | 4 |
| Inactive catalog variants not replicated | 0 |
| QuoteLines examined | 4 |
| QuoteLines offerId stamped | 0 |
| QuoteLines offerVariantId stamped | 0 |
| QuoteLines with nothing provable to adopt | 4 |

DB state now: offerVariants=4, quoteLinesWithOfferId=0, quoteLinesWithOfferVariantId=0, offersFullyCovered=2, offersPartiallyCovered=0

## Standing decisions

- 2 QuoteLine(s) had RFQ lines without offerId — open-to-offers RFQ semantics; no offer identity exists to adopt, offerId/offerVariantId correctly remain NULL (no gap)
- availableStock is never reconstructed retroactively (H1) — every pre-migration QuoteLine keeps a NULL inventory snapshot; only quotes issued after 7.6 carry live snapshots

## Ambiguities (0 — every case carries a recorded decision)

_none_

**Gate: PASS — every active catalog variant on every offer-covered product has an OfferVariant row; zero unresolved ambiguity cases**
