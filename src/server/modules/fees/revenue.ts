import { db } from '@/lib/db'
import { FEE_EVENTS, type FeeEvent, type FeeDimension } from './service'

// ─────────────────────────────────────────────────────────────────────────────
// REVENUE CONSOLE ENGINE — Phase 11.3 (lastplan v5 §11).
//
// Reconciles the immutable FeeAssessment ledger (11.1) against the three
// external money sources it is supposed to mirror, TO THE CENT:
//
//   ORDER_COMMISSION      ledger  Σ FeeAssessment(event)          ← net of
//                          vs     Σ Payout.commission over payouts CREATED
//                                 in the window with status PENDING|PAID.
//                                 CANCELLED payouts are EXCLUDED — they never
//                                 receive an assessment (the hook only fires
//                                 on live payouts), so counting their
//                                 commission would fabricate a difference.
//
//   FINANCING_SUCCESS     ledger  Σ FeeAssessment(event)
//                          vs     Σ FinancingFee(type='SUCCESS', status≠'WAIVED')
//                                 created in the window. WAIVED is the
//                                 financing-side analog of a reversal — it is
//                                 dropped from the external sum exactly like
//                                 a REVERSAL row nets out of the ledger.
//
//   SUBSCRIPTION_RENEWAL  ledger  Σ FeeAssessment(event)
//                          vs     Σ SubscriptionInvoice(status='PAID') created
//                                 in the window. FAILED invoices never write
//                                 an assessment, so they are not owed.
//
// Multi-currency: amounts are NEVER summed across currencies. Every total is
// a per-currency subtotal (cent-exact: round2 on every accumulation), and the
// demo data is honest about that (USD commissions + YER financing fees).
//
// Reversal semantics: REVERSAL rows carry negative amounts, so a plain Σ over
// the ledger rows is already net-of-reversals — no row is ever rewritten.
//
// "Legacy" external rows (payouts / fees / invoices created BEFORE the fee
// engine went live) are expected to have no assessment. The go-live marker is
// data-driven: the earliest FeeRule.effectiveFrom (the Phase 11 seed) — never
// a hardcoded date.
// ─────────────────────────────────────────────────────────────────────────────

/** Round to cents — every money accumulation goes through this. */
const round2 = (n: number): number => Math.round(n * 100) / 100

export interface CurrencyAmount {
  currency: string
  amount: number
}

/** Per-currency accumulator — the only way money is totaled in this module. */
class CurrencySums {
  private m = new Map<string, number>()
  add(currency: string, amount: number): void {
    this.m.set(currency, round2((this.m.get(currency) ?? 0) + amount))
  }
  entries(): CurrencyAmount[] {
    return [...this.m.entries()]
      .map(([currency, amount]) => ({ currency, amount }))
      .sort((a, b) => a.currency.localeCompare(b.currency))
  }
}

// ── window parsing (same convention as the Phase-10 analytics routes) ────────

export interface ResolvedRange {
  from: Date | null
  to: Date | null
}

/** 'YYYY-MM-DD' → UTC day boundaries (from = 00:00:00, to = 23:59:59.999). */
export function resolveRange(from?: string | null, to?: string | null): ResolvedRange {
  const out: ResolvedRange = { from: null, to: null }
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) out.from = new Date(`${from}T00:00:00.000Z`)
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) out.to = new Date(`${to}T23:59:59.999Z`)
  return out
}

function assessedAtWhere(r: ResolvedRange) {
  return {
    ...(r.from ? { gte: r.from } : {}),
    ...(r.to ? { lte: r.to } : {}),
  }
}

// ── reconciliation types ─────────────────────────────────────────────────────

export interface ReconcileCurrencyRow {
  currency: string
  ledgerSum: number
  externalSum: number
  /** ledgerSum − externalSum, cent-exact. 0 = reconciled. */
  difference: number
  reconciled: boolean
}

export interface UnreconciledItem {
  refType: 'PAYOUT' | 'AGREEMENT' | 'SUBSCRIPTION_INVOICE'
  refId: string
  /** Human reference (PY-2026-000002 / AGR-2026-000002 / SUB-2026-000001). */
  label: string
  amount: number
  currency: string
  createdAt: string
  /** Created before the fee engine went live — expected to have no assessment. */
  legacy: boolean
}

export interface EventReconciliation {
  event: FeeEvent
  /** Per-currency ledger vs external sums (never summed across currencies). */
  currencies: ReconcileCurrencyRow[]
  /** Assessments in the window for this event (applied + reversal rows). */
  ledgerCount: number
  /** External items in the window with no assessment. */
  unreconciled: UnreconciledItem[]
  unreconciledCount: number
  /** Of which created before Phase 11 went live (expected, muted in the UI). */
  legacyCount: number
  /** The documented matching semantics for this event. */
  note: string
}

export interface MonthlyBucket {
  /** 'YYYY-MM' (UTC). */
  ym: string
  /** event → currency → net amount (reversals are negative rows). */
  netByEvent: Record<string, Record<string, number>>
  /** currency → net total (per-currency — never summed across currencies). */
  netTotal: Record<string, number>
}

export interface ReconcileResult {
  from: string | null
  to: string | null
  generatedAt: string
  /** Data-driven Phase 11 go-live marker (earliest FeeRule.effectiveFrom). */
  phase11LiveAt: string | null
  events: EventReconciliation[]
  monthlyBuckets: MonthlyBucket[]
  /** REVERSAL rows in the window. */
  reversalCount: number
}

const EVENT_NOTES: Record<FeeEvent, string> = {
  ORDER_COMMISSION:
    'External = Σ Payout.commission over payouts created in the window with status PENDING or PAID — CANCELLED payouts never receive an assessment, so their commission is excluded. Commission obligations (B2B intermediary flow) also land here with calcInputs.flow = "obligation".',
  FINANCING_SUCCESS:
    'External = Σ FinancingFee (type SUCCESS, status ≠ WAIVED) created in the window — WAIVED is the financing-side analog of a ledger reversal.',
  SUBSCRIPTION_RENEWAL:
    'External = Σ SubscriptionInvoice (status PAID) created in the window — FAILED invoices never write an assessment.',
  ACCREDITATION:
    'External = none yet — the platform accrues this commission only through the fee engine (recorded when the platform gate forwards an accreditation to the institution). Ledger is the source of truth.',
  SPONSORSHIP:
    'External = none — sponsorship/featuring purchases are not billed through subscriptions; the ledger is the source of truth when a SPONSORSHIP rule is configured.',
  FINANCING_REFERRAL:
    'External = none — the referral/service fee accrues only when the platform enables a rule; the ledger is the source of truth.',
}

// ── the reconciliation ───────────────────────────────────────────────────────

export async function reconcileRevenue(range: ResolvedRange): Promise<ReconcileResult> {
  const window = assessedAtWhere(range)

  // Data-driven Phase 11 go-live marker: the earliest rule's effectiveFrom.
  const earliestRule = await db.feeRule.findFirst({
    orderBy: { effectiveFrom: 'asc' },
    select: { effectiveFrom: true },
  })
  const phase11LiveAt = earliestRule?.effectiveFrom ?? null

  // 1 ── the ledger side: every assessment in the window.
  const assessments = await db.feeAssessment.findMany({
    where: { assessedAt: window },
    select: {
      event: true,
      amount: true,
      currency: true,
      status: true,
      refType: true,
      refId: true,
      assessedAt: true,
    },
  })

  // 2 ── the external sides.
  // Payouts CREATED in the window, PENDING+PAID only (see header comment).
  const payouts = await db.payout.findMany({
    where: {
      createdAt: window,
      status: { in: ['PENDING', 'PAID'] },
    },
    select: { id: true, number: true, commission: true, currency: true, createdAt: true },
  })
  // SUCCESS financing fees in the window, WAIVED excluded. FinancingFee has no
  // currency column — the agreement's offer currency is the fee's currency.
  const fees = await db.financingFee.findMany({
    where: { type: 'SUCCESS', status: { not: 'WAIVED' }, createdAt: window },
    select: {
      agreementId: true,
      amount: true,
      createdAt: true,
      agreement: { select: { id: true, number: true, offer: { select: { currency: true } } } },
    },
  })
  // PAID subscription invoices created in the window.
  const invoices = await db.subscriptionInvoice.findMany({
    where: { status: 'PAID', createdAt: window },
    select: { id: true, number: true, amount: true, currency: true, createdAt: true },
  })

  // 3 ── index the ledger per event: currency sums + assessed ref keys.
  const ledgerSums = new Map<string, CurrencySums>()
  const ledgerCounts = new Map<string, number>()
  const assessedRefs = new Map<string, Set<string>>()
  for (const e of FEE_EVENTS) {
    ledgerSums.set(e, new CurrencySums())
    assessedRefs.set(e, new Set())
    ledgerCounts.set(e, 0)
  }
  let reversalCount = 0
  const buckets = new Map<string, MonthlyBucket>()
  for (const a of assessments) {
    if (!ledgerSums.has(a.event)) continue // unknown event — not ours to judge
    ledgerSums.get(a.event)!.add(a.currency, a.amount)
    ledgerCounts.set(a.event, (ledgerCounts.get(a.event) ?? 0) + 1)
    if (a.status === 'REVERSAL') reversalCount++
    // Ref matching is defensive: hooks may store the internal id or the human
    // number — index both keys.
    if (a.refId) assessedRefs.get(a.event)!.add(a.refId)
    // monthly buckets (net-of-reversals: reversal rows are negative)
    const ym = `${a.assessedAt.getUTCFullYear()}-${String(a.assessedAt.getUTCMonth() + 1).padStart(2, '0')}`
    const bucket =
      buckets.get(ym) ?? { ym, netByEvent: {}, netTotal: {} }
    const byEvent = (bucket.netByEvent[a.event] ??= {})
    byEvent[a.currency] = round2((byEvent[a.currency] ?? 0) + a.amount)
    bucket.netTotal[a.currency] = round2((bucket.netTotal[a.currency] ?? 0) + a.amount)
    buckets.set(ym, bucket)
  }

  // 4 ── per-event reconciliation.
  const events: EventReconciliation[] = []

  // ORDER_COMMISSION
  {
    const ext = new CurrencySums()
    const assessed = assessedRefs.get('ORDER_COMMISSION')!
    const unreconciled: UnreconciledItem[] = []
    for (const p of payouts) {
      const legacy = phase11LiveAt ? p.createdAt < phase11LiveAt : false
      // Legacy (pre-ledger) rows are LISTED but excluded from the diff —
      // the engine never assessed them, so they cannot reconcile; counting
      // them would keep the board red forever. The active reconciliation
      // covers the engine-era universe.
      if (!legacy) ext.add(p.currency, p.commission)
      if (!assessed.has(p.id) && !assessed.has(p.number)) {
        unreconciled.push({
          refType: 'PAYOUT',
          refId: p.id,
          label: p.number,
          amount: round2(p.commission),
          currency: p.currency,
          createdAt: p.createdAt.toISOString(),
          legacy,
        })
      }
    }
    events.push(buildEvent('ORDER_COMMISSION', ledgerSums, ledgerCounts, ext, unreconciled))
  }

  // FINANCING_SUCCESS
  {
    const ext = new CurrencySums()
    const assessed = assessedRefs.get('FINANCING_SUCCESS')!
    const unreconciled: UnreconciledItem[] = []
    const seenAgreements = new Set<string>()
    for (const f of fees) {
      const currency = f.agreement?.offer?.currency ?? 'YER'
      const legacy = phase11LiveAt ? f.createdAt < phase11LiveAt : false
      // Pre-ledger fees are listed but excluded from the diff (see ORDER_COMMISSION).
      if (!legacy) ext.add(currency, f.amount)
      // One agreement can accrue at most one SUCCESS fee row per accept; only
      // list the agreement once if ANY of its fees is unassessed.
      const key = `${f.agreementId}`
      if (!seenAgreements.has(key)) {
        seenAgreements.add(key)
        if (!assessed.has(f.agreementId) && !assessed.has(f.agreement?.number ?? '')) {
          unreconciled.push({
            refType: 'AGREEMENT',
            refId: f.agreementId,
            label: f.agreement?.number ?? f.agreementId,
            amount: round2(f.amount),
            currency,
            createdAt: f.createdAt.toISOString(),
            legacy,
          })
        }
      }
    }
    events.push(buildEvent('FINANCING_SUCCESS', ledgerSums, ledgerCounts, ext, unreconciled))
  }

  // SUBSCRIPTION_RENEWAL
  {
    const ext = new CurrencySums()
    const assessed = assessedRefs.get('SUBSCRIPTION_RENEWAL')!
    const unreconciled: UnreconciledItem[] = []
    for (const inv of invoices) {
      const legacy = phase11LiveAt ? inv.createdAt < phase11LiveAt : false
      // Pre-ledger invoices are listed but excluded from the diff (see ORDER_COMMISSION).
      if (!legacy) ext.add(inv.currency, inv.amount)
      if (!assessed.has(inv.id) && !assessed.has(inv.number)) {
        unreconciled.push({
          refType: 'SUBSCRIPTION_INVOICE',
          refId: inv.id,
          label: inv.number,
          amount: round2(inv.amount),
          currency: inv.currency,
          createdAt: inv.createdAt.toISOString(),
          legacy,
        })
      }
    }
    events.push(buildEvent('SUBSCRIPTION_RENEWAL', ledgerSums, ledgerCounts, ext, unreconciled))
  }

  const monthlyBuckets = [...buckets.values()].sort((a, b) => a.ym.localeCompare(b.ym))

  return {
    from: range.from?.toISOString() ?? null,
    to: range.to?.toISOString() ?? null,
    generatedAt: new Date().toISOString(),
    phase11LiveAt: phase11LiveAt?.toISOString() ?? null,
    events,
    monthlyBuckets,
    reversalCount,
  }
}

function buildEvent(
  event: FeeEvent,
  ledgerSums: Map<string, CurrencySums>,
  ledgerCounts: Map<string, number>,
  ext: CurrencySums,
  unreconciled: UnreconciledItem[]
): EventReconciliation {
  const ledger = ledgerSums.get(event)!
  const currencies = new Set<string>([...ledger.entries().map((e) => e.currency), ...ext.entries().map((e) => e.currency)])
  const rows: ReconcileCurrencyRow[] = [...currencies].sort().map((currency) => {
    const ledgerSum = ledger.entries().find((e) => e.currency === currency)?.amount ?? 0
    const externalSum = ext.entries().find((e) => e.currency === currency)?.amount ?? 0
    const difference = round2(ledgerSum - externalSum)
    return { currency, ledgerSum, externalSum, difference, reconciled: difference === 0 }
  })
  return {
    event,
    currencies: rows,
    ledgerCount: ledgerCounts.get(event) ?? 0,
    unreconciled,
    unreconciledCount: unreconciled.length,
    legacyCount: unreconciled.filter((u) => u.legacy).length,
    note: EVENT_NOTES[event],
  }
}

// ── financier commission overview (11.3 visibility layer) ─────────────────────

export interface FinancierRuleChip {
  id: string
  version: number
  dimension: FeeDimension
  value: number
}

export interface FinancierCommissionRow {
  orgId: string
  orgName: string
  orgType: string
  /** The org's ACTIVE ORG-scope FINANCING_SUCCESS rule, if one exists. */
  rule: FinancierRuleChip | null
  /** The ACTIVE PLATFORM-scope FINANCING_SUCCESS rule (the default). */
  platformDefault: FinancierRuleChip | null
  /** Net FINANCING_SUCCESS ledger revenue attributable to this org in the window. */
  ledgerNet: CurrencyAmount[]
  ledgerCount: number
}

/**
 * Financier commission customization visibility: every financier org with its
 * ACTIVE FINANCING_SUCCESS rule (ORG scope) vs the platform default, plus the
 * org's net financing-success revenue from the ledger. Read-only — the rules
 * themselves are managed in the Fee Rules tab (11-a).
 */
export async function financierCommissionOverview(range: ResolvedRange): Promise<FinancierCommissionRow[]> {
  const now = new Date()
  const activeWhere = {
    event: 'FINANCING_SUCCESS' as const,
    isActive: true,
    effectiveFrom: { lte: now },
    OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
  }

  const [profiles, orgRules, platformRule] = await Promise.all([
    db.financierProfile.findMany({ select: { organizationId: true } }),
    db.feeRule.findMany({
      where: { ...activeWhere, scopeType: 'ORG' },
      orderBy: [{ precedence: 'desc' }, { version: 'desc' }, { updatedAt: 'desc' }],
      select: { id: true, scopeId: true, version: true, dimension: true, value: true },
    }),
    db.feeRule.findFirst({
      where: { ...activeWhere, scopeType: 'PLATFORM' },
      orderBy: [{ precedence: 'desc' }, { version: 'desc' }, { updatedAt: 'desc' }],
      select: { id: true, version: true, dimension: true, value: true },
    }),
  ])

  const orgIds = [...new Set(profiles.map((p) => p.organizationId))]
  if (orgIds.length === 0) return []
  const orgs = await db.organization.findMany({
    where: { id: { in: orgIds } },
    select: { id: true, name: true, orgType: true },
  })

  // Highest-precedence ORG rule per org (the resolver's ordering).
  const ruleByOrg = new Map<string, (typeof orgRules)[number]>()
  for (const r of orgRules) {
    if (!ruleByOrg.has(r.scopeId)) ruleByOrg.set(r.scopeId, r)
  }

  // Net ledger revenue per financier org in the window.
  const assessments = await db.feeAssessment.findMany({
    where: {
      event: 'FINANCING_SUCCESS',
      actorOrgId: { in: orgIds },
      assessedAt: assessedAtWhere(range),
    },
    select: { actorOrgId: true, amount: true, currency: true },
  })
  const netByOrg = new Map<string, CurrencySums>()
  const countByOrg = new Map<string, number>()
  for (const a of assessments) {
    if (!a.actorOrgId) continue
    if (!netByOrg.has(a.actorOrgId)) netByOrg.set(a.actorOrgId, new CurrencySums())
    netByOrg.get(a.actorOrgId)!.add(a.currency, a.amount)
    countByOrg.set(a.actorOrgId, (countByOrg.get(a.actorOrgId) ?? 0) + 1)
  }

  const chip = (r: { id: string; version: number; dimension: string; value: number } | null): FinancierRuleChip | null =>
    r ? { id: r.id, version: r.version, dimension: r.dimension as FeeDimension, value: r.value } : null

  return orgs
    .map((o) => ({
      orgId: o.id,
      orgName: o.name,
      orgType: o.orgType,
      rule: chip(ruleByOrg.get(o.id) ?? null),
      platformDefault: chip(platformRule),
      ledgerNet: netByOrg.get(o.id)?.entries() ?? [],
      ledgerCount: countByOrg.get(o.id) ?? 0,
    }))
    .sort((a, b) => a.orgName.localeCompare(b.orgName))
}

// ── CSV export builders (text/csv attachment from /api/admin/fees/export) ────

/** RFC-4180 field escaping. */
function csvField(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvField).join(',')
}

export interface LedgerCsvRow {
  id: string
  assessedAt: string
  event: string
  actorType: string
  actorOrgId: string | null
  refType: string | null
  refId: string | null
  baseAmount: number
  currency: string
  fxRateToUsd: number
  amount: number
  status: string
  ruleVersion: number | null
  idempotencyKey: string
}

export const LEDGER_CSV_HEADER = [
  'id',
  'assessedAt',
  'event',
  'actorType',
  'actorOrgId',
  'refType',
  'refId',
  'baseAmount',
  'currency',
  'fxRateToUsd',
  'amount',
  'status',
  'ruleVersion',
  'idempotencyKey',
]

export function ledgerToCsv(rows: LedgerCsvRow[]): string {
  const lines = [csvRow(LEDGER_CSV_HEADER)]
  for (const r of rows) {
    lines.push(
      csvRow([
        r.id,
        r.assessedAt,
        r.event,
        r.actorType,
        r.actorOrgId,
        r.refType,
        r.refId,
        r.baseAmount,
        r.currency,
        r.fxRateToUsd,
        r.amount,
        r.status,
        r.ruleVersion,
        r.idempotencyKey,
      ])
    )
  }
  return lines.join('\n')
}

export function reconcileToCsv(result: ReconcileResult): string {
  const lines = [
    csvRow([
      'event',
      'currency',
      'ledgerSum',
      'externalSum',
      'difference',
      'reconciled',
      'unreconciledCount',
      'legacyCount',
    ]),
  ]
  for (const e of result.events) {
    if (e.currencies.length === 0) {
      // Nothing in the window — still emit one row so every event is present.
      lines.push(csvRow([e.event, '', 0, 0, 0, 'yes', 0, e.legacyCount]))
      continue
    }
    for (const c of e.currencies) {
      lines.push(
        csvRow([
          e.event,
          c.currency,
          c.ledgerSum,
          c.externalSum,
          c.difference,
          c.reconciled ? 'yes' : 'no',
          e.unreconciledCount,
          e.legacyCount,
        ])
      )
    }
  }
  return lines.join('\n')
}
