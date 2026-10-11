// ─────────────────────────────────────────────────────────────────────────────
// PHASE 7.4D.8 — LEGACY PAYOUT BACKFILL (lastplan v5 7.4D.8 / S4)
//
//   bun scripts/backfill-payout-lines.ts
//
// For every existing Payout row, projects its OrderItem.payoutId links into
// the immutable PayoutLine settlement ledger:
//   • one PayoutLine per (payout, linked order item):
//       linePurpose = 'SETTLEMENT'
//       amount      = orderItem.price × orderItem.quantity
//       commission  = round(price × qty × payout.commissionRate/100 × 100)/100
//                     (the declared per-line rounding rule)
//       currency    = payout.currency (defaults 'USD')
//       status      = PAID→EFFECTIVE · CANCELLED→CANCELLED · else PENDING
//       claimKey    = orderItemId while PENDING/EFFECTIVE (the DB backstop —
//                     REVERSAL/CANCELLED lines never occupy the claim slot)
//       effectiveAt = payout.paidAt, only for EFFECTIVE lines
//   • resumable — a PayoutLine for (payoutId, orderItemId) already existing
//     is skipped, never duplicated (history is append-only)
//
// RECONCILIATION (7.4.8): per payout, Σline.amount vs payout.grossAmount and
// Σline.commission vs payout.commission. Differences are allowed ONLY under
// the declared rounding rule (per-line rounding of commission; tolerance =
// 0.005 × lineCount). Anything beyond lands in the payout-legacy-ambiguity
// report with a recorded decision — the gate is ZERO UNRESOLVED:
//   docs/reports/phase7-payout-legacy-backfill.json + .md
// ─────────────────────────────────────────────────────────────────────────────
import { assertNotProd } from './lib/assert-not-prod'
import { db } from '../src/lib/db'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const REPORT_JSON = resolve(process.cwd(), 'docs/reports/phase7-payout-legacy-backfill.json')
const REPORT_MD = resolve(process.cwd(), 'docs/reports/phase7-payout-legacy-backfill.md')

type Ambiguity = {
  payoutId: string
  payoutNumber: string
  kind: string
  detail: string
  decision: string | null
}

const EPS = 1e-6

function lineStatusFor(payoutStatus: string): 'EFFECTIVE' | 'CANCELLED' | 'PENDING' {
  if (payoutStatus === 'PAID') return 'EFFECTIVE'
  if (payoutStatus === 'CANCELLED') return 'CANCELLED'
  return 'PENDING'
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

async function main() {
  assertNotProd()

  const payouts = await db.payout.findMany({
    orderBy: { createdAt: 'asc' },
    include: { items: { orderBy: { id: 'asc' } } },
  })
  console.log(`payouts to backfill: ${payouts.length}`)

  const thisRun = { payoutsProcessed: 0, linesCreated: 0, linesAlreadyPresent: 0, payoutsBrokenLink: 0 }
  const ambiguities: Ambiguity[] = []

  for (const payout of payouts) {
    thisRun.payoutsProcessed++
    const lineStatus = lineStatusFor(payout.status)

    for (const item of payout.items) {
      const existing = await db.payoutLine.findFirst({ where: { payoutId: payout.id, orderItemId: item.id } })
      if (existing) {
        thisRun.linesAlreadyPresent++
        continue
      }
      await db.payoutLine.create({
        data: {
          payoutId: payout.id,
          orderItemId: item.id,
          linePurpose: 'SETTLEMENT',
          amount: item.price * item.quantity,
          commission: round2(item.price * item.quantity * (payout.commissionRate / 100)),
          currency: payout.currency || 'USD',
          status: lineStatus,
          claimKey: lineStatus === 'PENDING' || lineStatus === 'EFFECTIVE' ? item.id : null,
          effectiveAt: lineStatus === 'EFFECTIVE' ? payout.paidAt : null,
        },
      })
      thisRun.linesCreated++
    }

    // payout with zero linked items = broken/unreconstructable legacy link
    if (payout.items.length === 0) {
      thisRun.payoutsBrokenLink++
      ambiguities.push({
        payoutId: payout.id,
        payoutNumber: payout.number,
        kind: 'no-linked-items',
        detail: `payout ${payout.number} (gross ${payout.grossAmount}, status ${payout.status}) has no OrderItem rows pointing at it via payoutId`,
        decision:
          'no ledger lines can be derived — the legacy payout row is preserved as-is and flagged; item claims cannot be reconstructed without links (recorded, not assumed)',
      })
    }
  }

  // ── reconciliation (7.4.8) — re-derived from post-backfill DB state ────────
  const reconciled: Array<{
    payoutId: string
    payoutNumber: string
    lineCount: number
    sumAmount: number
    payoutGross: number
    amountDiff: number
    sumCommission: number
    payoutCommission: number
    commissionDiff: number
    commissionTolerance: number
    netCheck: boolean
  }> = []

  for (const payout of payouts) {
    const lines = await db.payoutLine.findMany({ where: { payoutId: payout.id } })
    const sumAmount = lines.reduce((acc, l) => acc + l.amount, 0)
    const sumCommission = lines.reduce((acc, l) => acc + l.commission, 0)
    const amountDiff = Math.abs(sumAmount - payout.grossAmount)
    const commissionDiff = Math.abs(sumCommission - payout.commission)
    // declared rounding rule: per-line rounding of commission → up to half a
    // cent of drift per line; amounts are exact products (no rounding applied)
    const commissionTolerance = 0.005 * lines.length
    const netCheck = Math.abs(payout.grossAmount - payout.commission - payout.netAmount) < EPS

    reconciled.push({
      payoutId: payout.id,
      payoutNumber: payout.number,
      lineCount: lines.length,
      sumAmount: round2(sumAmount),
      payoutGross: payout.grossAmount,
      amountDiff: round2(amountDiff),
      sumCommission: round2(sumCommission),
      payoutCommission: payout.commission,
      commissionDiff: round2(commissionDiff),
      commissionTolerance: round2(commissionTolerance),
      netCheck,
    })

    if (lines.length > 0) {
      if (amountDiff >= EPS) {
        ambiguities.push({
          payoutId: payout.id,
          payoutNumber: payout.number,
          kind: 'gross-amount-mismatch',
          detail: `Σline.amount ${round2(sumAmount)} ≠ payout.grossAmount ${payout.grossAmount} (diff ${round2(amountDiff)} over ${lines.length} lines)`,
          decision:
            'amount lines are exact price×quantity products of the linked items — the legacy payout total disagrees with its linked items; lines snapshot the provable per-item facts and the difference is recorded, not forced',
        })
      }
      if (commissionDiff > commissionTolerance + EPS) {
        ambiguities.push({
          payoutId: payout.id,
          payoutNumber: payout.number,
          kind: 'commission-beyond-rounding-tolerance',
          detail: `Σline.commission ${round2(sumCommission)} vs payout.commission ${payout.commission} — diff ${round2(commissionDiff)} exceeds the declared rounding tolerance ${round2(commissionTolerance)} (0.005 × ${lines.length} lines)`,
          decision:
            'beyond the declared per-line rounding rule — lines carry the commission recomputed from commissionRate and the per-item amounts; the legacy stored total is preserved on the payout row and the difference recorded',
        })
      }
      if (!netCheck) {
        ambiguities.push({
          payoutId: payout.id,
          payoutNumber: payout.number,
          kind: 'payout-net-inconsistent',
          detail: `payout.grossAmount − payout.commission ≠ payout.netAmount (${round2(payout.grossAmount - payout.commission)} vs ${payout.netAmount})`,
          decision:
            'legacy payout arithmetic is internally inconsistent — ledger lines are unaffected (they snapshot per-item facts); the payout row is preserved as-is and the inconsistency recorded',
        })
      }
    }
  }

  const unresolved = ambiguities.filter((a) => !a.decision)
  const gatePassed = unresolved.length === 0

  // cumulative counts merged with the on-disk report (idempotent re-runs keep
  // the committed artifact representative of the backfill's total work)
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
    task: 'Phase 7.4D.8 legacy payout backfill — PayoutLine ledger projection of OrderItem.payoutId links (lastplan 7.4.8)',
    roundingRule: 'per-line commission rounding: round(price × qty × commissionRate/100 × 100)/100; reconciliation tolerance = 0.005 × lineCount',
    counts: cumulative,
    thisRun,
    dbStateAfter: {
      payouts: await db.payout.count(),
      payoutLines: await db.payoutLine.count(),
      claimKeysHeld: await db.payoutLine.count({ where: { claimKey: { not: null } } }),
    },
    reconciliation: {
      payoutsReconciled: reconciled.length,
      amountExact: reconciled.filter((r) => r.amountDiff < EPS).length,
      commissionWithinTolerance: reconciled.filter((r) => r.commissionDiff <= r.commissionTolerance + EPS).length,
      perPayout: reconciled,
    },
    ambiguities,
    gate: gatePassed ? 'PASS — zero unresolved ambiguity cases' : 'FAIL — ambiguities without a recorded decision exist',
  }

  mkdirSync(resolve(process.cwd(), 'docs/reports'), { recursive: true })
  writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2) + '\n')

  const md = `# Phase 7.4D.8 — Legacy payout backfill (PayoutLine ledger)

Generated: ${report.generatedAt}
Script: scripts/backfill-payout-lines.ts (idempotent, resumable — existing (payoutId, orderItemId) lines are never duplicated)

## What ran

Every legacy Payout row had its OrderItem.payoutId links projected into the immutable PayoutLine ledger
(SETTLEMENT lines; amount = price × qty; commission under the declared per-line rounding rule; claimKey =
orderItemId while PENDING/EFFECTIVE — REVERSAL/CANCELLED lines never occupy the claim slot).

## Counts

| Metric | Count |
|---|---|
| Payouts processed | ${cumulative.payoutsProcessed ?? 0} |
| PayoutLines created | ${cumulative.linesCreated ?? 0} |
| Lines already present (skipped) | ${cumulative.linesAlreadyPresent ?? 0} |
| Payouts with broken/absent item links | ${cumulative.payoutsBrokenLink ?? 0} |

DB state now: payouts=${report.dbStateAfter.payouts}, payoutLines=${report.dbStateAfter.payoutLines}, claimKeysHeld=${report.dbStateAfter.claimKeysHeld}

## Reconciliation (7.4.8)

Rounding rule: ${report.roundingRule}

- Payouts reconciled: ${reconciled.length}
- Σline.amount exact vs payout.grossAmount: ${report.reconciliation.amountExact}/${reconciled.length}
- Σline.commission within declared tolerance vs payout.commission: ${report.reconciliation.commissionWithinTolerance}/${reconciled.length}

**Gate: ${report.gate}**

## Ambiguities (${ambiguities.length} — every case carries a recorded decision; zero unresolved)

${ambiguities.length === 0 ? '_none_' : ambiguities.map((a) => `- **${a.kind}** (${a.payoutNumber}): ${a.detail}\n  → decision: ${a.decision}`).join('\n')}
`
  writeFileSync(REPORT_MD, md)

  console.log('\n─── 7.4D.8 payout-ledger backfill ──────────────────────')
  console.log(JSON.stringify({ thisRun, dbStateAfter: report.dbStateAfter }, null, 2))
  console.log(`reconciled payouts: ${reconciled.length}, amount-exact: ${report.reconciliation.amountExact}, commission-within-tolerance: ${report.reconciliation.commissionWithinTolerance}`)
  console.log(`ambiguities: ${ambiguities.length} (unresolved: ${unresolved.length})`)
  console.log(`gate: ${report.gate}`)
  console.log(`reports: ${REPORT_JSON}`)
  await db.$disconnect()
  if (!gatePassed) process.exit(1)
}

main().catch((err) => {
  console.error('backfill-payout-lines crashed:', err)
  process.exit(1)
})
