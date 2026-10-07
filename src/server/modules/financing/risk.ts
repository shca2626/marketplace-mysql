import { db } from '@/lib/db'
import { recordAudit } from '@/server/modules/audit/service'
import { FinancingError, iso } from './shared'
import { assertFinancierCanSee } from './requests'
import { summarizeApplicantHistory } from './analytics'

// ─────────────────────────────────────────────────────────────────────────────
// RISK SCORING (Phase 10 — lastplan v5 §10.2). DECISION-SUPPORT by default.
//
// Six weighted factors (amount / tenor / guarantee / capacity / history /
// documents), each independently scored 0–100 (higher = lower risk) then
// weighted by the financier's RiskConfig (weights 0–100 each, normalized to
// 100% at compute time). The composite score bands LOW ≥70 | MEDIUM ≥40 |
// HIGH <40. Auto-approve / auto-decline fire ONLY when the financier has
// explicitly enabled auto-decision — the default verdict is always
// DECISION_SUPPORT (a human underwriter decides; plan: "auto-decision only if
// explicitly enabled").
// One RiskAssessment row per request (requestId unique — upsert on recompute).
// ─────────────────────────────────────────────────────────────────────────────

// ── DTOs ────────────────────────────────────────────────────────────────────

export interface RiskConfigDTO {
  id: string
  financierProfileId: string
  autoDecisionEnabled: boolean
  autoApproveThreshold: number
  autoDeclineThreshold: number
  weightAmount: number
  weightTenor: number
  weightGuarantee: number
  weightCapacity: number
  weightHistory: number
  weightDocuments: number
  updatedAt: string
  updatedBy: { id: string; name: string } | null
}

export interface RiskFactorDTO {
  name: string
  weight: number // normalized share 0–1
  score: number // 0–100, higher = lower risk
  contribution: number // weight × score
  note: string
}

export interface RiskAssessmentDTO {
  id: string
  requestId: string
  requestNumber: string
  applicantName: string
  serviceName: string
  score: number
  band: 'LOW' | 'MEDIUM' | 'HIGH'
  decision: 'DECISION_SUPPORT' | 'AUTO_APPROVE' | 'AUTO_DECLINE'
  factors: RiskFactorDTO[]
  computedAt: string
  computedBy: { id: string; name: string }
}

export interface RiskConfigPatch {
  autoDecisionEnabled?: boolean
  autoApproveThreshold?: number
  autoDeclineThreshold?: number
  weightAmount?: number
  weightTenor?: number
  weightGuarantee?: number
  weightCapacity?: number
  weightHistory?: number
  weightDocuments?: number
}

const WEIGHT_FIELDS = [
  'weightAmount',
  'weightTenor',
  'weightGuarantee',
  'weightCapacity',
  'weightHistory',
  'weightDocuments',
] as const

const FACTOR_LABELS: Record<(typeof WEIGHT_FIELDS)[number], string> = {
  weightAmount: 'Requested amount vs program range',
  weightTenor: 'Tenor vs financed norms',
  weightGuarantee: 'Guarantee type & availability',
  weightCapacity: 'Installment capacity vs schedule',
  weightHistory: 'Applicant history on the platform',
  weightDocuments: 'Verified documents ratio',
}

const clamp = (n: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n))

// ── Config (lazy-upsert default row per financier) ───────────────────────────

export async function getRiskConfig(financierOrgId: string): Promise<RiskConfigDTO> {
  const profile = await db.financierProfile.findUnique({
    where: { organizationId: financierOrgId },
    select: { id: true },
  })
  if (!profile) throw new FinancingError('Financier profile not found', 404)
  let config = await db.riskConfig.findUnique({ where: { financierProfileId: profile.id } })
  if (!config) {
    try {
      config = await db.riskConfig.create({ data: { financierProfileId: profile.id } })
    } catch {
      config = await db.riskConfig.findUniqueOrThrow({ where: { financierProfileId: profile.id } })
    }
  }
  const updatedBy = config.updatedById
    ? await db.user.findUnique({ where: { id: config.updatedById }, select: { id: true, name: true } })
    : null
  return serializeRiskConfig(config, updatedBy)
}

function serializeRiskConfig(
  config: {
    id: string
    financierProfileId: string
    autoDecisionEnabled: boolean
    autoApproveThreshold: number
    autoDeclineThreshold: number
    weightAmount: number
    weightTenor: number
    weightGuarantee: number
    weightCapacity: number
    weightHistory: number
    weightDocuments: number
    updatedAt: Date
    updatedById: string | null
  },
  updatedBy: { id: string; name: string } | null
): RiskConfigDTO {
  return {
    id: config.id,
    financierProfileId: config.financierProfileId,
    autoDecisionEnabled: config.autoDecisionEnabled,
    autoApproveThreshold: config.autoApproveThreshold,
    autoDeclineThreshold: config.autoDeclineThreshold,
    weightAmount: config.weightAmount,
    weightTenor: config.weightTenor,
    weightGuarantee: config.weightGuarantee,
    weightCapacity: config.weightCapacity,
    weightHistory: config.weightHistory,
    weightDocuments: config.weightDocuments,
    updatedAt: config.updatedAt.toISOString(),
    updatedBy: updatedBy ? { id: updatedBy.id, name: updatedBy.name } : null,
  }
}

/** Institution owners/admins only — the scoring policy is org-wide. */
export async function updateRiskConfig(
  staffUserId: string,
  financierOrgId: string,
  patch: RiskConfigPatch
): Promise<RiskConfigDTO> {
  const profile = await db.financierProfile.findUnique({
    where: { organizationId: financierOrgId },
    select: { id: true },
  })
  if (!profile) throw new FinancingError('Financier profile not found', 404)
  const membership = await db.organizationMember.findFirst({
    where: { userId: staffUserId, organizationId: financierOrgId, role: { in: ['OWNER', 'ADMIN'] } },
  })
  if (!membership) throw new FinancingError('Only institution owners and admins can change risk settings', 403)

  for (const field of WEIGHT_FIELDS) {
    const v = patch[field]
    if (v !== undefined && (!Number.isFinite(v) || v < 0 || v > 100)) {
      throw new FinancingError(`Weight for "${FACTOR_LABELS[field]}" must be between 0 and 100`)
    }
  }
  if (
    patch.autoApproveThreshold !== undefined &&
    (patch.autoApproveThreshold < 0 || patch.autoApproveThreshold > 100)
  ) {
    throw new FinancingError('Auto-approve threshold must be between 0 and 100')
  }
  if (
    patch.autoDeclineThreshold !== undefined &&
    (patch.autoDeclineThreshold < 0 || patch.autoDeclineThreshold > 100)
  ) {
    throw new FinancingError('Auto-decline threshold must be between 0 and 100')
  }

  await getRiskConfig(financierOrgId) // lazy-upsert the row first
  const updated = await db.riskConfig.update({
    where: { financierProfileId: profile.id },
    data: { ...patch, updatedById: staffUserId },
  })
  await recordAudit({
    actorId: staffUserId,
    actorType: 'USER',
    action: 'RISK_CONFIG_UPDATED',
    entityType: 'RiskConfig',
    entityId: updated.id,
    summary: `Risk scoring config updated${patch.autoDecisionEnabled !== undefined ? ` — auto-decision ${patch.autoDecisionEnabled ? 'ENABLED' : 'disabled'}` : ''}`,
    metadata: { ...patch },
  })
  const user = await db.user.findUnique({ where: { id: staffUserId }, select: { id: true, name: true } })
  return serializeRiskConfig(updated, user)
}

// ── The six factors ──────────────────────────────────────────────────────────

interface FactorInput {
  amountRequested: number
  currency: string
  tenorRequestedMonths: number | null
  monthlyInstallmentCapacity: number | null
  guaranteeType: string | null
  guaranteeStatus: string | null
}

function scoreAmount(
  input: FactorInput,
  range: { min: number | null; max: number | null }
): { score: number; note: string } {
  const { min, max } = range
  if (min == null && max == null) {
    return { score: 60, note: 'No program ticket range configured — neutral posture' }
  }
  const amount = input.amountRequested
  if (max != null && amount > max) {
    const overshoot = amount / max
    const score = clamp(Math.round(90 - 60 * (overshoot - 1)))
    return {
      score,
      note: `${Math.round((overshoot - 1) * 100)}% above the program maximum ${max.toLocaleString()} ${input.currency}`,
    }
  }
  if (min != null && amount < min) {
    return {
      score: 65,
      note: `Below the program minimum ${min.toLocaleString()} ${input.currency} — moderate: verify the ask fits the product`,
    }
  }
  const lo = min != null ? `${min.toLocaleString()}` : 'open'
  const hi = max != null ? `${max.toLocaleString()}` : 'open'
  return { score: 90, note: `Inside the program range ${lo}–${hi} ${input.currency}` }
}

function scoreTenor(tenor: number | null): { score: number; note: string } {
  if (tenor == null) return { score: 50, note: 'No tenor requested — neutral' }
  if (tenor <= 24) return { score: 90, note: `${tenor} months — short tenor` }
  if (tenor <= 36) return { score: 75, note: `${tenor} months — standard tenor` }
  if (tenor <= 60) return { score: 50, note: `${tenor} months — extended tenor` }
  return { score: 30, note: `${tenor} months — long tenor` }
}

function scoreGuarantee(
  guaranteeType: string | null,
  guaranteeStatus: string | null
): { score: number; note: string } {
  let score: number
  if (guaranteeStatus === 'AVAILABLE') score = 90
  else if (guaranteeStatus === 'PARTIALLY_AVAILABLE') score = 60
  else if (guaranteeStatus == null) score = 40
  else score = 25
  const strong = ['BANK_GUARANTEE', 'GOLD', 'MORTGAGE']
  const bonus = guaranteeType && strong.includes(guaranteeType) ? 10 : 0
  if (bonus) score = clamp(score + bonus)
  const statusText =
    guaranteeStatus == null
      ? 'no availability stated'
      : guaranteeStatus.toLowerCase().replace(/_/g, ' ')
  const typeText = guaranteeType ? guaranteeType.toLowerCase().replace(/_/g, ' ') : 'none stated'
  return { score, note: `Guarantee: ${typeText}, ${statusText}${bonus ? ' — strong collateral bonus' : ''}` }
}

function scoreCapacity(
  amountRequested: number,
  tenor: number | null,
  capacity: number | null
): { score: number; note: string } {
  if (capacity == null || capacity <= 0) {
    return { score: 40, note: 'No monthly installment capacity stated — neutral-low' }
  }
  const months = tenor ?? 36
  const estimated = amountRequested / months
  const ratio = capacity / estimated
  if (ratio >= 2) {
    return { score: 90, note: `Capacity ≈ ${ratio.toFixed(1)}× the estimated monthly installment` }
  }
  if (ratio >= 1.5) {
    return { score: 75, note: `Capacity ≈ ${ratio.toFixed(1)}× the estimated monthly installment` }
  }
  if (ratio >= 1) {
    return { score: 50, note: `Capacity ≈ ${ratio.toFixed(1)}× the estimated monthly installment — tight` }
  }
  return {
    score: 20,
    note: `Capacity ${Math.round(ratio * 100)}% of the estimated monthly installment — insufficient`,
  }
}

function scoreHistory(
  summary: {
    total: number
    completed: number
    defaulted: number
    overdue90: number
  },
  scope?: { crossInstitution: boolean }
): { score: number; note: string } {
  if (summary.total === 0) {
    return {
      score: 55,
      note: scope?.crossInstitution
        ? 'No prior agreements on the platform — neutral'
        : 'No prior agreements with this institution — neutral',
    }
  }
  const completedRatio = summary.completed / summary.total
  const defaultedRatio = summary.defaulted / summary.total
  const overdueRatio = summary.overdue90 / summary.total
  const score = clamp(Math.round(60 + 35 * completedRatio - 40 * defaultedRatio - 20 * overdueRatio))
  const stats = `${summary.total} prior agreement(s): ${summary.completed} completed, ${summary.defaulted} defaulted, ${summary.overdue90} with 90+ day arrears`
  return {
    score,
    // TENANT-AUDIT F-07: the note names the data scope explicitly —
    // cross-institution aggregates appear only with the applicant's
    // data-transfer consent; otherwise this institution's own history.
    note: scope?.crossInstitution
      ? `${stats} (platform-wide, with applicant data-transfer consent)`
      : `${stats} (this institution only — applicant did not consent to cross-institution sharing)`,
  }
}

function scoreDocuments(
  total: number,
  verified: number,
  waived: number,
  rejected: number
): { score: number; note: string } {
  if (total === 0) return { score: 50, note: 'No requirement checklist on this request — neutral' }
  const ratio = (verified + waived) / total
  return {
    score: Math.round(ratio * 100),
    note: `${verified + waived}/${total} checklist items verified or waived${rejected ? `, ${rejected} rejected` : ''}`,
  }
}

// ── Compute (upsert one row per request) ─────────────────────────────────────

export async function computeRiskAssessment(
  staffUserId: string,
  requestId: string
): Promise<RiskAssessmentDTO> {
  const request = await db.financingRequest.findUnique({
    where: { id: requestId },
    include: {
      service: {
        select: {
          name: true,
          amountMin: true,
          amountMax: true,
          financierProfile: {
            select: { id: true, organizationId: true, minTicket: true, maxTicket: true },
          },
        },
      },
      createdBy: { select: { id: true, name: true } },
      submissions: { select: { status: true } },
    },
  })
  if (!request) throw new FinancingError('Request not found', 404)
  await assertFinancierCanSee(staffUserId, request)

  const profile = request.service.financierProfile
  const config = await db.riskConfig.findUnique({ where: { financierProfileId: profile.id } })
  const weights = {
    weightAmount: config?.weightAmount ?? 20,
    weightTenor: config?.weightTenor ?? 10,
    weightGuarantee: config?.weightGuarantee ?? 20,
    weightCapacity: config?.weightCapacity ?? 20,
    weightHistory: config?.weightHistory ?? 15,
    weightDocuments: config?.weightDocuments ?? 15,
  }
  const totalWeight =
    weights.weightAmount +
    weights.weightTenor +
    weights.weightGuarantee +
    weights.weightCapacity +
    weights.weightHistory +
    weights.weightDocuments
  const share = (w: number) => (totalWeight > 0 ? w / totalWeight : 1 / 6)

  const input: FactorInput = {
    amountRequested: request.amountRequested,
    currency: request.currency,
    tenorRequestedMonths: request.tenorRequestedMonths,
    monthlyInstallmentCapacity: request.monthlyInstallmentCapacity,
    guaranteeType: request.guaranteeType,
    guaranteeStatus: request.guaranteeStatus,
  }

  // TENANT-AUDIT F-07: cross-institution applicant history requires the
  // applicant's data-transfer consent (request.consentAt, collected at
  // submit when the program's intake requires it). Without consent the
  // history factor scopes to THIS institution's own agreements — the
  // underwriter no longer learns how many agreements the applicant holds
  // elsewhere.
  const historyConsented = request.consentAt != null
  const history = await summarizeApplicantHistory(request.createdById, {
    excludeRequestIds: [request.id],
    institutionOrgId: historyConsented ? undefined : profile.organizationId,
  })
  const subTotal = request.submissions.length
  const subVerified = request.submissions.filter((s) => s.status === 'VERIFIED').length
  const subWaived = request.submissions.filter((s) => s.status === 'WAIVED').length
  const subRejected = request.submissions.filter((s) => s.status === 'REJECTED').length

  const scored = {
    weightAmount: scoreAmount(input, {
      min: request.service.amountMin ?? profile.minTicket,
      max: request.service.amountMax ?? profile.maxTicket,
    }),
    weightTenor: scoreTenor(input.tenorRequestedMonths),
    weightGuarantee: scoreGuarantee(input.guaranteeType, input.guaranteeStatus),
    weightCapacity: scoreCapacity(input.amountRequested, input.tenorRequestedMonths, input.monthlyInstallmentCapacity),
    weightHistory: scoreHistory(history, { crossInstitution: historyConsented }),
    weightDocuments: scoreDocuments(subTotal, subVerified, subWaived, subRejected),
  }

  const factors: RiskFactorDTO[] = WEIGHT_FIELDS.map((field) => ({
    name: FACTOR_LABELS[field],
    weight: share(weights[field]),
    score: scored[field].score,
    contribution: share(weights[field]) * scored[field].score,
    note: scored[field].note,
  }))

  const score = Math.round(factors.reduce((s, f) => s + f.contribution, 0) * 10) / 10
  const band: RiskAssessmentDTO['band'] = score >= 70 ? 'LOW' : score >= 40 ? 'MEDIUM' : 'HIGH'
  const autoEnabled = config?.autoDecisionEnabled ?? false
  const approveAt = config?.autoApproveThreshold ?? 80
  const declineAt = config?.autoDeclineThreshold ?? 30
  const decision: RiskAssessmentDTO['decision'] = !autoEnabled
    ? 'DECISION_SUPPORT'
    : score >= approveAt
      ? 'AUTO_APPROVE'
      : score < declineAt
        ? 'AUTO_DECLINE'
        : 'DECISION_SUPPORT'

  const row = await db.riskAssessment.upsert({
    where: { requestId },
    create: {
      requestId,
      score,
      band,
      factors: JSON.stringify(factors),
      decision,
      computedById: staffUserId,
    },
    update: {
      score,
      band,
      factors: JSON.stringify(factors),
      decision,
      computedById: staffUserId,
      // RiskAssessment has no updatedAt — the createdAt of the upserted row is
      // the compute timestamp on first write; recomputes keep the original row
      // (requestId unique) and refresh the payload above.
    },
    include: {
      computedBy: { select: { id: true, name: true } },
      request: { select: { number: true } },
    },
  })

  await recordAudit({
    actorId: staffUserId,
    actorType: 'USER',
    action: 'RISK_ASSESSMENT_COMPUTED',
    entityType: 'FinancingRequest',
    entityId: requestId,
    summary: `Risk score ${score} (${band}, ${decision}) computed for ${request.number}`,
    metadata: { score, band, decision },
  })

  return {
    id: row.id,
    requestId,
    requestNumber: request.number,
    applicantName: request.createdBy.name,
    serviceName: request.service.name,
    score,
    band,
    decision,
    factors,
    computedAt: row.createdAt.toISOString(),
    computedBy: { id: row.computedBy.id, name: row.computedBy.name },
  }
}

/** Latest stored assessment for a request (financier-visible requests only). */
export async function getRiskAssessment(staffUserId: string, requestId: string): Promise<RiskAssessmentDTO> {
  const request = await db.financingRequest.findUnique({
    where: { id: requestId },
    include: { service: { select: { financierProfile: { select: { organizationId: true } } } } },
  })
  if (!request) throw new FinancingError('Request not found', 404)
  await assertFinancierCanSee(staffUserId, request)
  const row = await db.riskAssessment.findUnique({
    where: { requestId },
    include: {
      computedBy: { select: { id: true, name: true } },
      request: { select: { number: true, createdBy: { select: { name: true } }, service: { select: { name: true } } } },
    },
  })
  if (!row) throw new FinancingError('No risk assessment computed for this request yet', 404)
  return {
    id: row.id,
    requestId,
    requestNumber: row.request.number,
    applicantName: row.request.createdBy.name,
    serviceName: row.request.service.name,
    score: row.score,
    band: row.band as RiskAssessmentDTO['band'],
    decision: row.decision as RiskAssessmentDTO['decision'],
    factors: safeParseFactors(row.factors),
    computedAt: iso(row.createdAt) ?? new Date().toISOString(),
    computedBy: { id: row.computedBy.id, name: row.computedBy.name },
  }
}

function safeParseFactors(raw: string): RiskFactorDTO[] {
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed as RiskFactorDTO[]
  } catch {
    // fall through
  }
  return []
}
