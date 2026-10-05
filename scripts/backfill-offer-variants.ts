// ─────────────────────────────────────────────────────────────────────────────
// PHASE 7.6.4 — OFFER-VARIANT MIGRATION (lastplan v5 7.6.4 / D9, H1)
//
//   bun scripts/backfill-offer-variants.ts
//
// a. Offers on variant products get their OfferVariant rows from catalog
//    defaults: for every ProductOffer whose product HAS ProductVariant rows,
//    one OfferVariant per ACTIVE variant { price (null = inherit the offer
//    price), stock, sku, isActive: true } — unless a row already exists for
//    (offerId, variantId). Offers on products without variants are skipped.
//    The (offer, variant) pair becomes the purchase-time authority (D9);
//    catalog-level variant price/stock stay presentation defaults for the
//    product owner's primary listing.
//
// b. Existing QuoteLines adopt the offer identity from their RFQ line where
//    provable: QuoteLine.offerId ← RfqLine.offerId (only when currently
//    NULL — resumable) and QuoteLine.offerVariantId ← RfqLine.offerVariantId,
//    each validated to belong to the same product as the quoted line.
//    availableStock is NEVER reconstructed — H1: quoted terms are never
//    reconstructed from a live offer; the snapshot stays NULL and that
//    decision is recorded in the report. Rows where adoption is impossible
//    (e.g. mismatched product) are ambiguity cases with decisions.
//
// Report: docs/reports/phase7-offer-variant-backfill.json + .md
// ─────────────────────────────────────────────────────────────────────────────
import { assertNotProd } from './lib/assert-not-prod'
import { db } from '../src/lib/db'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const REPORT_JSON = resolve(process.cwd(), 'docs/reports/phase7-offer-variant-backfill.json')
const REPORT_MD = resolve(process.cwd(), 'docs/reports/phase7-offer-variant-backfill.md')

type Ambiguity = {
  scope: string
  identifier: string
  kind: string
  detail: string
  decision: string | null
}

async function main() {
  assertNotProd()

  // ── a. OfferVariant rows from catalog defaults ──────────────────────────────
  const offers = await db.productOffer.findMany({
    orderBy: { createdAt: 'asc' },
    include: { product: { include: { variants: { where: { isActive: true }, orderBy: { position: 'asc' } } } } },
  })
  const thisRun = {
    offersScanned: offers.length,
    offersOnVariantProducts: 0,
    offersSkippedNoVariants: 0,
    offerVariantsCreated: 0,
    offerVariantsAlreadyPresent: 0,
    inactiveVariantsNotReplicated: 0,
    quoteLinesExamined: 0,
    quoteLinesOfferIdStamped: 0,
    quoteLinesOfferVariantIdStamped: 0,
    quoteLinesNothingProvable: 0,
  }
  const ambiguities: Ambiguity[] = []

  for (const offer of offers) {
    const variants = offer.product.variants
    if (variants.length === 0) {
      thisRun.offersSkippedNoVariants++
      continue
    }
    thisRun.offersOnVariantProducts++
    const existing = await db.offerVariant.findMany({
      where: { offerId: offer.id },
      select: { variantId: true },
    })
    const existingVariantIds = new Set(existing.map((v) => v.variantId))
    for (const variant of variants) {
      if (existingVariantIds.has(variant.id)) {
        thisRun.offerVariantsAlreadyPresent++
        continue
      }
      await db.offerVariant.create({
        data: {
          offerId: offer.id,
          variantId: variant.id,
          price: variant.price, // null = inherit the offer price (D9)
          stock: variant.stock,
          sku: variant.sku,
          isActive: true,
        },
      })
      thisRun.offerVariantsCreated++
    }
    // inactive catalog variants are deliberately NOT replicated — record why
    const inactive = await db.productVariant.count({ where: { productId: offer.productId, isActive: false } })
    if (inactive > 0) {
      thisRun.inactiveVariantsNotReplicated += inactive
      ambiguities.push({
        scope: 'OfferVariant',
        identifier: `offer ${offer.id}`,
        kind: 'inactive-catalog-variants-not-replicated',
        detail: `product ${offer.productId} has ${inactive} inactive ProductVariant row(s); only active variants get OfferVariant rows`,
        decision: 'inactive catalog variants are not purchasable and receive no offer-variant authority row (D9); if a variant is reactivated later, its OfferVariant row is created then',
      })
    }
  }

  // ── b. QuoteLine offer-identity adoption from RFQ lines (H1-safe) ─────────
  const quoteLines = await db.quoteLine.findMany({
    orderBy: { id: 'asc' },
    include: { rfqLine: true, product: { select: { id: true } } },
  })
  for (const ql of quoteLines) {
    thisRun.quoteLinesExamined++
    const rfq = ql.rfqLine

    if (!rfq?.offerId) {
      // open-to-offers RFQ line — nothing provable to adopt
      thisRun.quoteLinesNothingProvable++
      continue
    }
    if (ql.offerId && ql.offerId === rfq.offerId) {
      thisRun.quoteLinesNothingProvable++ // already adopted (resumable)
      continue
    }
    if (ql.offerId && ql.offerId !== rfq.offerId) {
      ambiguities.push({
        scope: 'QuoteLine',
        identifier: `quoteLine ${ql.id}`,
        kind: 'offer-id-conflict',
        detail: `QuoteLine already carries offerId ${ql.offerId} while its RFQ line targets offer ${rfq.offerId}`,
        decision: 'kept the existing QuoteLine.offerId — an issued quote line is a snapshot that is never rewritten (H1); the conflict is recorded, not resolved by overwrite',
      })
      continue
    }

    // ql.offerId is NULL and the RFQ line has one — validate the pair
    const offer = await db.productOffer.findUnique({ where: { id: rfq.offerId } })
    if (!offer) {
      ambiguities.push({
        scope: 'QuoteLine',
        identifier: `quoteLine ${ql.id}`,
        kind: 'rfq-offer-missing',
        detail: `RFQ line references offer ${rfq.offerId} which no longer exists`,
        decision: 'left QuoteLine.offerId NULL — a dangling reference is not adoption evidence',
      })
      continue
    }
    if (offer.productId !== ql.productId) {
      ambiguities.push({
        scope: 'QuoteLine',
        identifier: `quoteLine ${ql.id}`,
        kind: 'offer-product-mismatch',
        detail: `RFQ line offer ${rfq.offerId} belongs to product ${offer.productId} but the quote line is for product ${ql.productId}`,
        decision: 'left QuoteLine.offerId NULL — the (offer, product) pair fails validation; adoption must fail closed (7.6.3)',
      })
      continue
    }

    await db.quoteLine.update({ where: { id: ql.id }, data: { offerId: offer.id } })
    thisRun.quoteLinesOfferIdStamped++

    if (rfq.offerVariantId) {
      const ov = await db.offerVariant.findUnique({
        where: { offerId_variantId: { offerId: offer.id, variantId: rfq.offerVariantId } },
      })
      if (!ov) {
        ambiguities.push({
          scope: 'QuoteLine',
          identifier: `quoteLine ${ql.id}`,
          kind: 'offer-variant-missing',
          detail: `RFQ line references offerVariant ${rfq.offerVariantId} which does not exist as a row on offer ${offer.id}`,
          decision: 'offer identity adopted, offerVariantId left unset — the referenced (offer, variant) pair cannot be validated (7.6.3 fails closed)',
        })
      } else if (ov.offerId !== offer.id) {
        ambiguities.push({
          scope: 'QuoteLine',
          identifier: `quoteLine ${ql.id}`,
          kind: 'offer-variant-pair-mismatch',
          detail: `RFQ line's offerVariantId ${rfq.offerVariantId} belongs to a different offer than the referenced offer`,
          decision: 'offer identity adopted, offerVariantId left unset — the (offer, variant) pair fails validation (7.6.3)',
        })
      } else {
        await db.quoteLine.update({ where: { id: ql.id }, data: { offerVariantId: rfq.offerVariantId } })
        thisRun.quoteLinesOfferVariantIdStamped++
      }
    }

    // H1 — availableStock is never reconstructed from a live offer
    ambiguities.push({
      scope: 'QuoteLine',
      identifier: `quoteLine ${ql.id}`,
      kind: 'availableStock-not-provable',
      detail: `offer identity adopted from the RFQ line; the applicable inventory at quote time cannot be proven retroactively`,
      decision: 'availableStock snapshot left NULL — H1: quoted terms (including inventory) are never reconstructed from a live offer after issuance',
    })
  }

  // standing decisions recorded in every report run (even when zero rows hit
  // the branch) — the gate requires decisions, not silence
  const notes = [
    `${thisRun.quoteLinesNothingProvable} QuoteLine(s) had RFQ lines without offerId — open-to-offers RFQ semantics; no offer identity exists to adopt, offerId/offerVariantId correctly remain NULL (no gap)`,
    'availableStock is never reconstructed retroactively (H1) — every pre-migration QuoteLine keeps a NULL inventory snapshot; only quotes issued after 7.6 carry live snapshots',
  ]

  // ── verification + report ─────────────────────────────────────────────────
  const unresolved = ambiguities.filter((a) => !a.decision)
  const dbStateAfter = {
    offerVariants: await db.offerVariant.count(),
    quoteLinesWithOfferId: await db.quoteLine.count({ where: { offerId: { not: null } } }),
    quoteLinesWithOfferVariantId: await db.quoteLine.count({ where: { offerVariantId: { not: null } } }),
    // every ACTIVE catalog variant of an offer's product is covered by an
    // OfferVariant row on that offer
    offersFullyCovered: 0,
    offersPartiallyCovered: 0,
  }
  for (const offer of offers) {
    if (offer.product.variants.length === 0) continue
    const covered = await db.offerVariant.count({
      where: { offerId: offer.id, variantId: { in: offer.product.variants.map((v) => v.id) } },
    })
    if (covered === offer.product.variants.length) dbStateAfter.offersFullyCovered++
    else dbStateAfter.offersPartiallyCovered++
  }
  const gatePassed =
    unresolved.length === 0 && dbStateAfter.offersPartiallyCovered === 0

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
    task: 'Phase 7.6.4 OfferVariant migration + QuoteLine offer-identity adoption (lastplan 7.6.4 / D9, H1)',
    counts: cumulative,
    thisRun,
    dbStateAfter,
    notes,
    ambiguities,
    gate: gatePassed
      ? 'PASS — every active catalog variant on every offer-covered product has an OfferVariant row; zero unresolved ambiguity cases'
      : 'FAIL — see dbStateAfter / ambiguities',
  }

  mkdirSync(resolve(process.cwd(), 'docs/reports'), { recursive: true })
  writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2) + '\n')

  const md = `# Phase 7.6.4 — OfferVariant migration + QuoteLine offer adoption

Generated: ${report.generatedAt}
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
| Offers scanned | ${cumulative.offersScanned ?? 0} |
| Offers on variant products | ${cumulative.offersOnVariantProducts ?? 0} |
| Offers skipped (product has no variants) | ${cumulative.offersSkippedNoVariants ?? 0} |
| OfferVariants created | ${cumulative.offerVariantsCreated ?? 0} |
| OfferVariants already present (skipped) | ${cumulative.offerVariantsAlreadyPresent ?? 0} |
| Inactive catalog variants not replicated | ${cumulative.inactiveVariantsNotReplicated ?? 0} |
| QuoteLines examined | ${cumulative.quoteLinesExamined ?? 0} |
| QuoteLines offerId stamped | ${cumulative.quoteLinesOfferIdStamped ?? 0} |
| QuoteLines offerVariantId stamped | ${cumulative.quoteLinesOfferVariantIdStamped ?? 0} |
| QuoteLines with nothing provable to adopt | ${cumulative.quoteLinesNothingProvable ?? 0} |

DB state now: offerVariants=${dbStateAfter.offerVariants}, quoteLinesWithOfferId=${dbStateAfter.quoteLinesWithOfferId}, quoteLinesWithOfferVariantId=${dbStateAfter.quoteLinesWithOfferVariantId}, offersFullyCovered=${dbStateAfter.offersFullyCovered}, offersPartiallyCovered=${dbStateAfter.offersPartiallyCovered}

## Standing decisions

${notes.map((n) => `- ${n}`).join('\n')}

## Ambiguities (${ambiguities.length} — every case carries a recorded decision)

${ambiguities.length === 0 ? '_none_' : ambiguities.map((a) => `- **${a.kind}** (${a.identifier}): ${a.detail}\n  → decision: ${a.decision}`).join('\n')}

**Gate: ${report.gate}**
`
  writeFileSync(REPORT_MD, md)

  console.log('\n─── 7.6.4 offer-variant backfill ──────────────────────')
  console.log(JSON.stringify({ thisRun, dbStateAfter }, null, 2))
  console.log(`ambiguities: ${ambiguities.length} (unresolved: ${unresolved.length})`)
  console.log(`gate: ${report.gate}`)
  console.log(`reports: ${REPORT_JSON}`)
  await db.$disconnect()
  if (!gatePassed) process.exit(1)
}

main().catch((err) => {
  console.error('backfill-offer-variants crashed:', err)
  process.exit(1)
})
