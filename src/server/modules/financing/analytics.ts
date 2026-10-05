import { db } from '@/lib/db'
import { FinancingError } from './shared'

// ─────────────────────────────────────────────────────────────────────────────
// PORTFOLIO ANALYTICS (Phase 10 — lastplan v5 §10.1). READ-ONLY.
//
// Three lenses on the financier's book, all org-scoped through
// offer.request.service.financierProfile.organizationId (the same structural
// chain every financier view uses):
//   • Funnel   — requests received → offers sent → offers accepted →
//                agreements active/completed (each stage counted by its own
//                timestamp inside the optional date range).
//   • Volume   — disbursed volume (CONFIRMED DisbursementRecord rows, PLUS
//                the legacy DISBURSEMENT FinancingEvent fallback for
//                agreements without a confirmed record — never double
//                counted), outstanding principal, overdue amount, NPL count
//                and the 30/60/90 aging buckets derived from the installment
//                ledger (10.8: effective paid = allocations of non-reversal
//                payments − allocations of reversal rows).
//   • Slices   — per-branch (agreement city ↔ branch city, case-insensitive)
//                and per-program (FinancierService) rows.
// No writes: analytics NEVER mutates the book — the money facts it reads are
// reported by 10.5 disbursement ops / 10.8 payments (track-only, D-002).
// ─────────────────────────────────────────────────────────────────────────────

// ── DTOs ────────────────────────────────────────────────────────────────────

export interface AgingBucketDTO {
  count: number
  amount: number
}

export interface BranchAnalyticsRow {
  branchId: string | null
  branchName: string
  city: string | null
  requests: number
  agreements: number
  disbursed: number
  outstanding: number
}

export interface ProgramAnalyticsRow {
  serviceId: string
  serviceName: string
  requests: number
  agreements: number
  disbursed: number
  outstanding: number
}

export interface PortfolioOverviewDTO {
  funnel: {
    requestsReceived: number
    offersSent: number
    offersAccepted: number
    approvalRate: number | null
    agreementsActive: number
    agreementsCompleted: number
  }
  volume: {
    disbursedVolume: number
    outstandingPrincipal: number
    overdueAmount: number
    nplCount: number
    aging: {
      D1_30: AgingBucketDTO
      D31_60: AgingBucketDTO
      D61_90: AgingBucketDTO
      D90_PLUS: AgingBucketDTO
    }
  }
  branches: BranchAnalyticsRow[]
  programs: ProgramAnalyticsRow[]
  range: { from: string | null; to: string | null }
}

export type AnalyticsCsvType = 'overview' | 'aging' | 'branches' | 'programs'

// ── Date range + text helpers ────────────────────────────────────────────────

interface ResolvedRange {
  from: Date | null
  to: Date | null
}

/** Parse optional YYYY-MM-DD bounds; `to` becomes inclusive end-of-day. */
function resolveRange(from?: string | null, to?: string | null): ResolvedRange {
  const out: ResolvedRange = { from: null, to: null }
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) out.from = new Date(`${from}T00:00:00.000Z`)
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) out.to = new Date(`${to}T23:59:59.999Z`)
  return out
}

function inRange(d: Date | null | undefined, r: ResolvedRange): boolean {
  if (!d) return false
  if (r.from && d.getTime() < r.from.getTime()) return false
  if (r.to && d.getTime() > r.to.getTime()) return false
  return true
}

/** Case-insensitive city comparison that survives apostrophe variants
 *  (Sana'a / Sana'a / Sana`a) and stray whitespace. */
const normCity = (s: string) =>
  s.trim().toLowerCase().replace(/[\u2018\u2019\u02BB`]/g, "'")

export function sameCity(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  return normCity(a) === normCity(b)
}

/** Whole days between two dates (positive = `later − earlier`). */
function daysBetween(earlier: Date, later: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / 86_400_000)
}

function emptyBucket(): AgingBucketDTO {
  return { count: 0, amount: 0 }
}

// ── The overview ─────────────────────────────────────────────────────────────

/** Agreement row shape used by every volume computation below. */
interface AgreementLedgerRow {
  id: string
  number: string
  status: string
  fundingStatus: string
  createdAt: Date
  activityCity: string | null
  serviceId: string
  serviceName: string
  installments: { id: string; installmentNo: number; dueDate: Date; amount: number }[]
  events: { type: string; eventDate: Date; amount: number | null }[]
  disbursement: { status: string; amount: number; confirmedAt: Date | null; createdAt: Date } | null
}

async function loadAgreementLedger(financierOrgId: string): Promise<AgreementLedgerRow[]> {
  const agreements = await db.financingAgreement.findMany({
    where: { offer: { request: { service: { financierProfile: { organizationId: financierOrgId } } } } },
    include: {
      offer: {
        include: {
          request: { select: { activityCity: true, serviceId: true, service: { select: { name: true } } } },
          installments: { orderBy: { installmentNo: 'asc' } },
        },
      },
      events: { orderBy: { eventDate: 'asc' } },
      disbursement: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })
  return agreements.map((a) => ({
    id: a.id,
    number: a.number,
    status: a.status,
    fundingStatus: a.fundingStatus,
    createdAt: a.createdAt,
    activityCity: a.offer.request.activityCity,
    serviceId: a.offer.request.serviceId,
    serviceName: a.offer.request.service.name,
    installments: a.offer.installments.map((i) => ({
      id: i.id,
      installmentNo: i.installmentNo,
      dueDate: i.dueDate,
      amount: i.amount,
    })),
    events: a.events.map((e) => ({ type: e.type, eventDate: e.eventDate, amount: e.amount })),
    disbursement: a.disbursement
      ? {
          status: a.disbursement.status,
          amount: a.disbursement.amount,
          confirmedAt: a.disbursement.confirmedAt,
          createdAt: a.disbursement.createdAt,
        }
      : null,
  }))
}

/** Effective paid per installment id = Σ allocations of non-reversal payments
 *  (reversalOfId == null, any lifecycle status) − Σ allocations of reversal
 *  rows (reversalOfId != null). This is 10.8's reversal math: a full reversal
 *  nets to zero, a partial reversal leaves the remaining applied amount. */
async function effectivePaidByInstallment(
  installmentIds: string[]
): Promise<Map<string, number>> {
  const paid = new Map<string, number>()
  if (!installmentIds.length) return paid
  const allocations = await db.installmentAllocation.findMany({
    where: { installmentId: { in: installmentIds } },
    select: {
      installmentId: true,
      amount: true,
      payment: { select: { reversalOfId: true, status: true } },
    },
    take: 5000,
  })
  for (const alloc of allocations) {
    const delta = alloc.payment.reversalOfId == null ? alloc.amount : -alloc.amount
    paid.set(alloc.installmentId, (paid.get(alloc.installmentId) ?? 0) + delta)
  }
  return paid
}

export async function portfolioOverview(
  financierOrgId: string,
  filter?: { from?: string | null; to?: string | null }
): Promise<PortfolioOverviewDTO> {
  const range = resolveRange(filter?.from, filter?.to)
  const orgWhere = {
    offer: { request: { service: { financierProfile: { organizationId: financierOrgId } } } },
  }

  // ── Funnel (each stage by its own timestamp inside the range) ─────────────
  const [requestsReceived, offersSent, offersAccepted, agreementsActive, agreementsCompleted] =
    await Promise.all([
      db.financingRequest.count({
        where: {
          service: { financierProfile: { organizationId: financierOrgId } },
          status: { not: 'DRAFT' },
          ...(range.from || range.to
            ? { createdAt: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) } }
            : {}),
        },
      }),
      db.financingOffer.count({
        where: {
          request: { service: { financierProfile: { organizationId: financierOrgId } } },
          sentAt: {
            not: null,
            ...(range.from || range.to
              ? { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) }
              : {}),
          },
        },
      }),
      db.financingOffer.count({
        where: {
          request: { service: { financierProfile: { organizationId: financierOrgId } } },
          acceptedAt: {
            not: null,
            ...(range.from || range.to
              ? { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) }
              : {}),
          },
        },
      }),
      db.financingAgreement.count({ where: { ...orgWhere, status: 'ACTIVE' } }),
      db.financingAgreement.count({ where: { ...orgWhere, status: 'COMPLETED' } }),
    ])

  // ── Ledger: agreements + installments + payments ──────────────────────────
  const ledger = await loadAgreementLedger(financierOrgId)
  const paidByInstallment = await effectivePaidByInstallment(
    ledger.flatMap((a) => a.installments.map((i) => i.id))
  )

  // Volume — CONFIRMED DisbursementRecord first; agreements WITHOUT a
  // confirmed record contribute their legacy DISBURSEMENT events (the
  // track-only ledger) so pre-10.5 books still count. Never both.
  let disbursedVolume = 0
  for (const a of ledger) {
    if (a.disbursement && a.disbursement.status === 'CONFIRMED') {
      const at = a.disbursement.confirmedAt ?? a.disbursement.createdAt
      if (inRange(at, range)) disbursedVolume += a.disbursement.amount
    } else {
      for (const e of a.events) {
        if (e.type === 'DISBURSEMENT' && e.amount != null && inRange(e.eventDate, range)) {
          disbursedVolume += e.amount
        }
      }
    }
  }

  // Outstanding / overdue / aging / NPL — current state, not range-filtered.
  const now = new Date()
  let outstandingPrincipal = 0
  let overdueAmount = 0
  const aging = { D1_30: emptyBucket(), D31_60: emptyBucket(), D61_90: emptyBucket(), D90_PLUS: emptyBucket() }
  const nplAgreements = new Set<string>()
  for (const a of ledger) {
    if (a.status === 'DEFAULTED') nplAgreements.add(a.id)
    for (const i of a.installments) {
      const outstanding = Math.max(0, i.amount - (paidByInstallment.get(i.id) ?? 0))
      if (outstanding <= 0.009) continue
      outstandingPrincipal += outstanding
      if (i.dueDate.getTime() < now.getTime()) {
        overdueAmount += outstanding
        const late = daysBetween(i.dueDate, now)
        if (late >= 90) {
          aging.D90_PLUS.count++
          aging.D90_PLUS.amount += outstanding
          nplAgreements.add(a.id)
        } else if (late >= 61) {
          aging.D61_90.count++
          aging.D61_90.amount += outstanding
        } else if (late >= 31) {
          aging.D31_60.count++
          aging.D31_60.amount += outstanding
        } else {
          aging.D1_30.count++
          aging.D1_30.amount += outstanding
        }
      }
    }
  }

  // ── Per-branch slice (city match, case-insensitive) ──────────────────────
  const branches = await db.financierBranch.findMany({
    where: { financierProfile: { organizationId: financierOrgId } },
    select: { id: true, name: true, city: true },
    orderBy: { position: 'asc' },
  })
  const branchRows: BranchAnalyticsRow[] = branches.map((b) => ({
    branchId: b.id,
    branchName: b.name,
    city: b.city,
    requests: 0,
    agreements: 0,
    disbursed: 0,
    outstanding: 0,
  }))
  const unassigned: BranchAnalyticsRow = {
    branchId: null,
    branchName: 'Unassigned',
    city: null,
    requests: 0,
    agreements: 0,
    disbursed: 0,
    outstanding: 0,
  }

  const requestsForSlices = await db.financingRequest.findMany({
    where: {
      service: { financierProfile: { organizationId: financierOrgId } },
      status: { not: 'DRAFT' },
    },
    select: { activityCity: true, serviceId: true, createdAt: true },
    take: 2000,
  })

  const branchByCity = new Map<string, BranchAnalyticsRow>()
  for (const row of branchRows) {
    if (row.city) branchByCity.set(normCity(row.city), row)
  }
  const branchOfAgreement = (a: AgreementLedgerRow): BranchAnalyticsRow | null =>
    (a.activityCity && branchByCity.get(normCity(a.activityCity))) || null

  for (const r of requestsForSlices) {
    if (range.from || range.to) {
      if (!inRange(r.createdAt, range)) continue
    }
    const row = r.activityCity ? branchByCity.get(normCity(r.activityCity)) ?? null : null
    const target = row ?? unassigned
    target.requests++
  }
  for (const a of ledger) {
    const target = branchOfAgreement(a) ?? unassigned
    if (inRange(a.createdAt, range) || (!range.from && !range.to)) target.agreements++
    if (a.disbursement && a.disbursement.status === 'CONFIRMED') {
      const at = a.disbursement.confirmedAt ?? a.disbursement.createdAt
      if (inRange(at, range)) target.disbursed += a.disbursement.amount
    } else {
      for (const e of a.events) {
        if (e.type === 'DISBURSEMENT' && e.amount != null && inRange(e.eventDate, range)) {
          target.disbursed += e.amount
        }
      }
    }
    for (const i of a.installments) {
      target.outstanding += Math.max(0, i.amount - (paidByInstallment.get(i.id) ?? 0))
    }
  }
  const branchSlice = [...branchRows]
  if (unassigned.requests > 0 || unassigned.agreements > 0 || unassigned.disbursed > 0 || unassigned.outstanding > 0) {
    branchSlice.push(unassigned)
  }

  // ── Per-program slice (FinancierService) ──────────────────────────────────
  const programMap = new Map<string, ProgramAnalyticsRow>()
  const services = await db.financierService.findMany({
    where: { financierProfile: { organizationId: financierOrgId } },
    select: { id: true, name: true },
  })
  for (const svc of services) {
    programMap.set(svc.id, {
      serviceId: svc.id,
      serviceName: svc.name,
      requests: 0,
      agreements: 0,
      disbursed: 0,
      outstanding: 0,
    })
  }
  for (const r of requestsForSlices) {
    const row = programMap.get(r.serviceId)
    if (!row) continue
    if (range.from || range.to) {
      if (!inRange(r.createdAt, range)) continue
    }
    row.requests++
  }
  for (const a of ledger) {
    let row = programMap.get(a.serviceId)
    if (!row) {
      row = { serviceId: a.serviceId, serviceName: a.serviceName, requests: 0, agreements: 0, disbursed: 0, outstanding: 0 }
      programMap.set(a.serviceId, row)
    }
    if (!range.from && !range.to) row.agreements++
    else if (inRange(a.createdAt, range)) row.agreements++
    if (a.disbursement && a.disbursement.status === 'CONFIRMED') {
      const at = a.disbursement.confirmedAt ?? a.disbursement.createdAt
      if (inRange(at, range)) row.disbursed += a.disbursement.amount
    } else {
      for (const e of a.events) {
        if (e.type === 'DISBURSEMENT' && e.amount != null && inRange(e.eventDate, range)) {
          row.disbursed += e.amount
        }
      }
    }
    for (const i of a.installments) {
      row.outstanding += Math.max(0, i.amount - (paidByInstallment.get(i.id) ?? 0))
    }
  }

  return {
    funnel: {
      requestsReceived,
      offersSent,
      offersAccepted,
      approvalRate: offersSent > 0 ? offersAccepted / offersSent : null,
      agreementsActive,
      agreementsCompleted,
    },
    volume: {
      disbursedVolume,
      outstandingPrincipal,
      overdueAmount,
      nplCount: nplAgreements.size,
      aging,
    },
    branches: branchSlice,
    programs: [...programMap.values()],
    range: { from: filter?.from ?? null, to: filter?.to ?? null },
  }
}

// ── CSV export ───────────────────────────────────────────────────────────────

/** RFC-4180 escaping: quote when needed, double embedded quotes. */
function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value)
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function csvLine(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(',')
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Build the CSV export for one of the four analytics lenses. */
export async function exportAnalyticsCsv(
  financierOrgId: string,
  type: AnalyticsCsvType,
  filter?: { from?: string | null; to?: string | null }
): Promise<string> {
  const o = await portfolioOverview(financierOrgId, filter)
  const lines: string[] = []

  if (type === 'overview') {
    lines.push(csvLine(['Metric', 'Value']))
    lines.push(csvLine(['Requests received', o.funnel.requestsReceived]))
    lines.push(csvLine(['Offers sent', o.funnel.offersSent]))
    lines.push(csvLine(['Offers accepted', o.funnel.offersAccepted]))
    lines.push(csvLine(['Approval rate', o.funnel.approvalRate == null ? '' : `${round2(o.funnel.approvalRate * 100)}%`]))
    lines.push(csvLine(['Agreements active', o.funnel.agreementsActive]))
    lines.push(csvLine(['Agreements completed', o.funnel.agreementsCompleted]))
    lines.push(csvLine(['Disbursed volume', round2(o.volume.disbursedVolume)]))
    lines.push(csvLine(['Outstanding principal', round2(o.volume.outstandingPrincipal)]))
    lines.push(csvLine(['Overdue amount', round2(o.volume.overdueAmount)]))
    lines.push(csvLine(['NPL agreements', o.volume.nplCount]))
    lines.push(csvLine(['Aging 1-30 days (count / amount)', o.volume.aging.D1_30.count, round2(o.volume.aging.D1_30.amount)]))
    lines.push(csvLine(['Aging 31-60 days (count / amount)', o.volume.aging.D31_60.count, round2(o.volume.aging.D31_60.amount)]))
    lines.push(csvLine(['Aging 61-90 days (count / amount)', o.volume.aging.D61_90.count, round2(o.volume.aging.D61_90.amount)]))
    lines.push(csvLine(['Aging 90+ days (count / amount)', o.volume.aging.D90_PLUS.count, round2(o.volume.aging.D90_PLUS.amount)]))
    lines.push(csvLine(['Range from', o.range.from ?? '']))
    lines.push(csvLine(['Range to', o.range.to ?? '']))
  } else if (type === 'aging') {
    lines.push(
      csvLine([
        'Agreement', 'Request city', 'Program', 'Installment no', 'Due date',
        'Days late', 'Bucket', 'Scheduled', 'Effective paid', 'Outstanding',
      ])
    )
    const ledger = await loadAgreementLedger(financierOrgId)
    const paid = await effectivePaidByInstallment(ledger.flatMap((a) => a.installments.map((i) => i.id)))
    const now = new Date()
    const rows: (string | number | null)[][] = []
    for (const a of ledger) {
      for (const i of a.installments) {
        const outstanding = Math.max(0, i.amount - (paid.get(i.id) ?? 0))
        if (outstanding <= 0.009 || i.dueDate.getTime() >= now.getTime()) continue
        const late = daysBetween(i.dueDate, now)
        const bucket = late >= 90 ? '90+' : late >= 61 ? '61-90' : late >= 31 ? '31-60' : '1-30'
        rows.push([
          a.number, a.activityCity ?? '', a.serviceName, i.installmentNo,
          i.dueDate.toISOString().slice(0, 10), late, bucket,
          round2(i.amount), round2(paid.get(i.id) ?? 0), round2(outstanding),
        ])
      }
    }
    rows.sort((x, y) => Number(x[5]) - Number(y[5]))
    for (const r of rows) lines.push(csvLine(r))
  } else if (type === 'branches') {
    lines.push(csvLine(['Branch', 'City', 'Requests', 'Agreements', 'Disbursed', 'Outstanding']))
    for (const b of o.branches) {
      lines.push(csvLine([b.branchName, b.city ?? '', b.requests, b.agreements, round2(b.disbursed), round2(b.outstanding)]))
    }
  } else {
    lines.push(csvLine(['Program', 'Requests', 'Agreements', 'Disbursed', 'Outstanding']))
    for (const p of o.programs) {
      lines.push(csvLine([p.serviceName, p.requests, p.agreements, round2(p.disbursed), round2(p.outstanding)]))
    }
  }

  return `${lines.join('\r\n')}\r\n`
}

// ── Shared: risk history inputs (10.2 factor 5 reuses the aging math) ───────

export interface ApplicantHistorySummary {
  total: number
  completed: number
  defaulted: number
  overdue90: number
}

/** Prior agreement performance of an applicant (by request creator). */
export async function summarizeApplicantHistory(
  applicantUserId: string,
  options?: { excludeRequestIds?: string[] }
): Promise<ApplicantHistorySummary> {
  const prior = await db.financingAgreement.findMany({
    where: {
      offer: {
        request: {
          createdById: applicantUserId,
          ...(options?.excludeRequestIds?.length ? { id: { notIn: options.excludeRequestIds } } : {}),
        },
      },
    },
    include: { offer: { include: { installments: { select: { id: true, dueDate: true, amount: true } } } } },
    take: 100,
  })
  const installmentIds = prior.flatMap((a) => a.offer.installments.map((i) => i.id))
  const paid = await effectivePaidByInstallment(installmentIds)
  const now = new Date()
  const summary: ApplicantHistorySummary = { total: prior.length, completed: 0, defaulted: 0, overdue90: 0 }
  for (const a of prior) {
    if (a.status === 'COMPLETED') summary.completed++
    if (a.status === 'DEFAULTED') summary.defaulted++
    let hit = false
    for (const i of a.offer.installments) {
      const outstanding = Math.max(0, i.amount - (paid.get(i.id) ?? 0))
      if (outstanding > 0.009 && daysBetween(i.dueDate, now) >= 90) {
        hit = true
        break
      }
    }
    if (hit) summary.overdue90++
  }
  return summary
}
