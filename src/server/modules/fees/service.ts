import { db } from '@/lib/db'

// ─────────────────────────────────────────────────────────────────────────────
// FEE ENGINE — Phase 11.1 (lastplan v5 §11): immutable fee assessment.
//
// One rule resolver answers "what fee applies to THIS event for THIS actor":
//   ORG-scoped rule  >  ORG_TYPE-scoped rule  >  PLATFORM-scoped rule
// (missing rows fall through; effective dating + isActive filter; precedence
// breaks ties inside a scope; highest version of a rule is current).
//
// Every fee actually applied writes ONE immutable FeeAssessment row:
//   • idempotencyKey is event-scoped and unique — retries are no-ops
//   • the applied rule is snapshotted (id + version + parameters at
//     application time), so editing/deleting rules later never rewrites
//     history
//   • currency + FX snapshot + calculation inputs land with the amount
//   • reversals are APPENDED rows (status REVERSAL, negative amount,
//     reversalOfId → original) — existing rows are never rewritten
//
// The revenue console (11.3) reconciles against this ledger to the cent.
// Zero-behavior-change migration: when no rule resolves, callers fall back to
// their legacy source (PlatformSetting / rfq-settings / plan price) — day one
// the PLATFORM ORDER_COMMISSION rule reproduces the 10% commission exactly.
// ─────────────────────────────────────────────────────────────────────────────

export const FEE_EVENTS = ['ORDER_COMMISSION', 'FINANCING_SUCCESS', 'SUBSCRIPTION_RENEWAL'] as const
export type FeeEvent = (typeof FEE_EVENTS)[number]

export const FEE_ACTOR_TYPES = ['SELLER', 'FINANCIER', 'PLATFORM'] as const
export type FeeActorType = (typeof FEE_ACTOR_TYPES)[number]

export const FEE_SCOPE_TYPES = ['PLATFORM', 'ORG_TYPE', 'ORG'] as const
export type FeeScopeType = (typeof FEE_SCOPE_TYPES)[number]

export const FEE_DIMENSIONS = ['PERCENT', 'FLAT'] as const
export type FeeDimension = (typeof FEE_DIMENSIONS)[number]

export const FEE_ORG_TYPES = ['COMPANY', 'BANK', 'MFI', 'EWALLET'] as const

export class FeeServiceError extends Error {
  status: number
  code?: string
  constructor(message: string, status = 400, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

type PrismaTx = Parameters<Parameters<typeof db.$transaction>[0]>[0]
type DbLike = PrismaTx | typeof db

// ── rule resolution ─────────────────────────────────────────────────────────

export interface FeeRuleDTO {
  id: string
  event: string
  actorType: string
  scopeType: string
  scopeId: string
  dimension: string
  value: number
  currency: string | null
  precedence: number
  effectiveFrom: string
  effectiveTo: string | null
  version: number
  note: string | null
  isActive: boolean
  updatedAt: string
}

export interface ResolvedFeeRule {
  id: string
  version: number
  dimension: FeeDimension
  value: number
  currency: string | null
  scopeType: FeeScopeType
  scopeId: string
  precedence: number
}

export interface FeeScopeChainStep {
  scopeType: FeeScopeType
  scopeId: string
  ruleId: string | null
  version: number | null
  value: number | null
  hit: boolean
}

export interface FeeResolution {
  rule: ResolvedFeeRule | null
  chain: FeeScopeChainStep[]
  resolvedFrom: 'ORG' | 'ORG_TYPE' | 'PLATFORM' | 'NONE'
}

export interface FeeActorCtx {
  orgId?: string | null
  orgType?: string | null
}

/** Resolve the fee rule for an event through the scope chain at a moment. */
export async function resolveFeeRule(
  event: FeeEvent,
  ctx: FeeActorCtx = {},
  at: Date = new Date()
): Promise<ResolvedFeeRule | null> {
  const steps = await scopeChainRows(event, ctx, at)
  for (const s of steps) {
    if (s.row) {
      return {
        id: s.row.id,
        version: s.row.version,
        dimension: s.row.dimension as FeeDimension,
        value: s.row.value,
        currency: s.row.currency,
        scopeType: s.scopeType,
        scopeId: s.scopeId,
        precedence: s.row.precedence,
      }
    }
  }
  return null
}

/** Full-chain trace for the simulator: every scope's hit/miss, in order. */
export async function resolveFeeRuleChain(
  event: FeeEvent,
  ctx: FeeActorCtx = {},
  at: Date = new Date()
): Promise<FeeResolution> {
  const rows = await scopeChainRows(event, ctx, at)
  const chain: FeeScopeChainStep[] = rows.map((s) => ({
    scopeType: s.scopeType,
    scopeId: s.scopeId,
    ruleId: s.row?.id ?? null,
    version: s.row?.version ?? null,
    value: s.row?.value ?? null,
    hit: Boolean(s.row),
  }))
  for (const s of rows) {
    if (s.row) {
      return {
        rule: {
          id: s.row.id,
          version: s.row.version,
          dimension: s.row.dimension as FeeDimension,
          value: s.row.value,
          currency: s.row.currency,
          scopeType: s.scopeType,
          scopeId: s.scopeId,
          precedence: s.row.precedence,
        },
        chain,
        resolvedFrom: s.scopeType,
      }
    }
  }
  return { rule: null, chain, resolvedFrom: 'NONE' }
}

async function scopeChainRows(event: FeeEvent, ctx: FeeActorCtx, at: Date) {
  const chain: { scopeType: FeeScopeType; scopeId: string }[] = []
  if (ctx.orgId) chain.push({ scopeType: 'ORG', scopeId: ctx.orgId })
  if (ctx.orgType) chain.push({ scopeType: 'ORG_TYPE', scopeId: ctx.orgType })
  chain.push({ scopeType: 'PLATFORM', scopeId: '' })

  const out: { scopeType: FeeScopeType; scopeId: string; row: FeeRuleRow | null }[] = []
  for (const scope of chain) {
    const row = await db.feeRule.findFirst({
      where: {
        event,
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        isActive: true,
        effectiveFrom: { lte: at },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
      },
      orderBy: [{ precedence: 'desc' }, { version: 'desc' }, { updatedAt: 'desc' }],
    })
    out.push({ ...scope, row })
  }
  return out
}

type FeeRuleRow = {
  id: string
  version: number
  dimension: string
  value: number
  currency: string | null
  precedence: number
  scopeType: string
  scopeId: string
}

// ── computation ─────────────────────────────────────────────────────────────

export interface FeeComputation {
  amount: number
  percentApplied: number | null
  dimension: FeeDimension
  value: number
}

/** Compute a fee from a resolved rule. Cent-exact (2dp) rounding. */
export function computeFee(rule: ResolvedFeeRule, baseAmount: number): FeeComputation {
  if (rule.dimension === 'PERCENT') {
    return {
      amount: Math.round(baseAmount * (rule.value / 100) * 100) / 100,
      percentApplied: rule.value,
      dimension: rule.dimension,
      value: rule.value,
    }
  }
  return { amount: Math.round(rule.value * 100) / 100, percentApplied: null, dimension: rule.dimension, value: rule.value }
}

// ── assessment (the immutable ledger write) ──────────────────────────────────

export interface AssessFeeInput {
  event: FeeEvent
  actorType: FeeActorType
  actorOrgId?: string | null
  ctx: FeeActorCtx
  baseAmount: number
  currency: string
  /** FX snapshot: this currency → USD at assessment time. */
  fxRateToUsd?: number
  calcInputs?: Record<string, unknown>
  idempotencyKey: string
  refType?: string | null
  refId?: string | null
}

export interface FeeAssessmentDTO {
  id: string
  idempotencyKey: string
  event: string
  ruleId: string | null
  ruleVersion: number | null
  ruleSnapshot: string | null
  actorType: string
  actorOrgId: string | null
  refType: string | null
  refId: string | null
  baseAmount: number
  currency: string
  fxRateToUsd: number
  calcInputs: string | null
  amount: number
  status: string
  reversalOfId: string | null
  reversalReason: string | null
  assessedAt: string
}

/**
 * Resolve + compute + WRITE one immutable assessment. Idempotent: the same
 * idempotencyKey returns the existing row instead of writing a second one.
 *
 * `explicitRule` lets a caller that already resolved the rate through the
 * engine (e.g. the payout path resolving BEFORE creating rows) pass the rule
 * forward so the assessment snapshots exactly what was applied.
 */
export async function assessFee(
  input: AssessFeeInput,
  tx?: DbLike,
  explicitRule?: ResolvedFeeRule | null
): Promise<FeeAssessmentDTO> {
  const client = tx ?? db
  const existing = await client.feeAssessment.findUnique({ where: { idempotencyKey: input.idempotencyKey } })
  if (existing) return serializeAssessment(existing)

  const rule = explicitRule !== undefined ? explicitRule : await resolveFeeRule(input.event, input.ctx)
  let amount: number
  let snapshot: string | null = null
  let ruleId: string | null = null
  let ruleVersion: number | null = null
  if (rule) {
    const comp = computeFee(rule, input.baseAmount)
    amount = comp.amount
    ruleId = rule.id
    ruleVersion = rule.version
    snapshot = JSON.stringify({
      dimension: rule.dimension,
      value: rule.value,
      currency: rule.currency,
      scopeType: rule.scopeType,
      scopeId: rule.scopeId,
      precedence: rule.precedence,
    })
  } else {
    // No rule resolved — the caller computed the fee through its legacy
    // path and passes it via calcInputs.legacyAmount (zero-change migration).
    const legacy = Number((input.calcInputs as Record<string, unknown> | undefined)?.legacyAmount)
    if (!Number.isFinite(legacy)) {
      throw new FeeServiceError(
        `No fee rule resolved for ${input.event} and no legacyAmount provided`,
        400,
        'FEE_UNRESOLVED'
      )
    }
    amount = Math.round(legacy * 100) / 100
  }

  const row = await client.feeAssessment.create({
    data: {
      idempotencyKey: input.idempotencyKey,
      event: input.event,
      ruleId,
      ruleVersion,
      ruleSnapshot: snapshot,
      actorType: input.actorType,
      actorOrgId: input.actorOrgId ?? null,
      refType: input.refType ?? null,
      refId: input.refId ?? null,
      baseAmount: input.baseAmount,
      currency: input.currency,
      fxRateToUsd: input.fxRateToUsd ?? 1,
      calcInputs: input.calcInputs ? JSON.stringify(input.calcInputs) : null,
      amount,
      status: 'APPLIED',
    },
  })
  return serializeAssessment(row)
}

/**
 * Append a reversal row for an existing assessment. The original row is
 * NEVER touched — net contribution is always Σ(amount) over the rows.
 */
export async function reverseAssessment(
  assessmentId: string,
  reason: string,
  changedById?: string,
  tx?: DbLike
): Promise<FeeAssessmentDTO> {
  const client = tx ?? db
  const original = await client.feeAssessment.findUnique({ where: { id: assessmentId } })
  if (!original) throw new FeeServiceError('Assessment not found', 404, 'ASSESSMENT_NOT_FOUND')
  if (original.status === 'REVERSAL') throw new FeeServiceError('Cannot reverse a reversal row', 400, 'NOT_REVERSIBLE')
  if (!reason.trim()) throw new FeeServiceError('A reversal requires a reason', 400, 'REASON_REQUIRED')

  const existingReversal = await client.feeAssessment.findFirst({ where: { reversalOfId: assessmentId } })
  if (existingReversal) return serializeAssessment(existingReversal)

  const row = await client.feeAssessment.create({
    data: {
      idempotencyKey: `${original.idempotencyKey}:reversal:${Date.now()}`,
      event: original.event,
      ruleId: original.ruleId,
      ruleVersion: original.ruleVersion,
      ruleSnapshot: original.ruleSnapshot,
      actorType: original.actorType,
      actorOrgId: original.actorOrgId,
      refType: original.refType,
      refId: original.refId,
      baseAmount: original.baseAmount,
      currency: original.currency,
      fxRateToUsd: original.fxRateToUsd,
      calcInputs: original.calcInputs,
      amount: -original.amount,
      reversalOfId: original.id,
      reversalReason: reason,
      changedById: changedById ?? null,
      status: 'REVERSAL',
    },
  })
  return serializeAssessment(row)
}

// ── simulator (11.1: "what WOULD be charged" — no writes) ────────────────────

export interface FeeSimulation {
  event: FeeEvent
  baseAmount: number
  currency: string
  resolution: FeeResolution
  computation: FeeComputation | null
  amount: number | null
  notes: string[]
}

export async function simulateFee(
  event: FeeEvent,
  ctx: FeeActorCtx,
  baseAmount: number,
  currency = 'USD'
): Promise<FeeSimulation> {
  const resolution = await resolveFeeRuleChain(event, ctx)
  const notes: string[] = []
  if (!resolution.rule) {
    // Legacy-preview parity (acceptance gate: the simulator must match fees
    // actually applied across ALL flows): for SUBSCRIPTION_RENEWAL the
    // invoice amount IS the revenue — the legacy path lands exactly the base
    // amount on the ledger. Order/financing legacy sources (PlatformSetting
    // / rfq-settings) are caller-side and stay null with the note.
    if (event === 'SUBSCRIPTION_RENEWAL') {
      return {
        event,
        baseAmount,
        currency,
        resolution,
        computation: {
          amount: Math.round(baseAmount * 100) / 100,
          percentApplied: null,
          dimension: 'FLAT',
          value: Math.round(baseAmount * 100) / 100,
        },
        amount: Math.round(baseAmount * 100) / 100,
        notes: ['No rule resolves — the legacy path applies: the invoice amount lands on the ledger as-is.'],
      }
    }
    notes.push('No rule resolves at any scope — the legacy fallback path would apply.')
    return { event, baseAmount, currency, resolution, computation: null, amount: null, notes }
  }
  const computation = computeFee(resolution.rule, baseAmount)
  if (resolution.rule.dimension === 'FLAT') notes.push('FLAT dimension: the base amount does not scale the fee.')
  return {
    event,
    baseAmount,
    currency,
    resolution,
    computation,
    amount: computation.amount,
    notes,
  }
}

// ── ledger queries (foundation for the 11.3 revenue console) ────────────────

export interface LedgerEventSummary {
  event: string
  appliedCount: number
  reversalCount: number
  grossAmount: number
  reversalAmount: number
  netAmount: number
}

/** Net-of-reversals per event, cent-exact. */
export async function ledgerEventSummary(from?: Date, to?: Date): Promise<LedgerEventSummary[]> {
  const where = {
    assessedAt: {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    },
  }
  const rows = await db.feeAssessment.findMany({
    where,
    select: { event: true, amount: true, status: true },
  })
  const map = new Map<string, LedgerEventSummary>()
  for (const r of rows) {
    const s =
      map.get(r.event) ??
      { event: r.event, appliedCount: 0, reversalCount: 0, grossAmount: 0, reversalAmount: 0, netAmount: 0 }
    if (r.status === 'REVERSAL') {
      s.reversalCount++
      s.reversalAmount = Math.round((s.reversalAmount + r.amount) * 100) / 100
    } else {
      s.appliedCount++
      s.grossAmount = Math.round((s.grossAmount + r.amount) * 100) / 100
    }
    s.netAmount = Math.round((s.grossAmount + s.reversalAmount) * 100) / 100
    map.set(r.event, s)
  }
  return [...map.values()].sort((a, b) => a.event.localeCompare(b.event))
}

export async function listAssessments(opts: {
  event?: string
  actorOrgId?: string
  status?: string
  from?: Date
  to?: Date
  limit?: number
}): Promise<FeeAssessmentDTO[]> {
  const rows = await db.feeAssessment.findMany({
    where: {
      ...(opts.event ? { event: opts.event } : {}),
      ...(opts.actorOrgId ? { actorOrgId: opts.actorOrgId } : {}),
      ...(opts.status ? { status: opts.status } : {}),
      assessedAt: {
        ...(opts.from ? { gte: opts.from } : {}),
        ...(opts.to ? { lte: opts.to } : {}),
      },
    },
    orderBy: { assessedAt: 'desc' },
    take: opts.limit ?? 100,
  })
  return rows.map(serializeAssessment)
}

// ── helpers ──────────────────────────────────────────────────────────────────

type AssessmentRow = {
  id: string
  idempotencyKey: string
  event: string
  ruleId: string | null
  ruleVersion: number | null
  ruleSnapshot: string | null
  actorType: string
  actorOrgId: string | null
  refType: string | null
  refId: string | null
  baseAmount: number
  currency: string
  fxRateToUsd: number
  calcInputs: string | null
  amount: number
  status: string
  reversalOfId: string | null
  reversalReason: string | null
  assessedAt: Date
}

export function serializeAssessment(a: AssessmentRow): FeeAssessmentDTO {
  return {
    id: a.id,
    idempotencyKey: a.idempotencyKey,
    event: a.event,
    ruleId: a.ruleId,
    ruleVersion: a.ruleVersion,
    ruleSnapshot: a.ruleSnapshot,
    actorType: a.actorType,
    actorOrgId: a.actorOrgId,
    refType: a.refType,
    refId: a.refId,
    baseAmount: a.baseAmount,
    currency: a.currency,
    fxRateToUsd: a.fxRateToUsd,
    calcInputs: a.calcInputs,
    amount: a.amount,
    status: a.status,
    reversalOfId: a.reversalOfId,
    reversalReason: a.reversalReason,
    assessedAt: a.assessedAt.toISOString(),
  }
}

/**
 * The zero-change migration bridge for ORDER_COMMISSION: engine chain first
 * (ORG → ORG_TYPE → PLATFORM), legacy fallback (PlatformSetting
 * payouts.defaultCommissionPercent) when nothing resolves. Returns the percent
 * the payout math must use.
 */
export async function resolveOrderCommissionPercent(
  ctx: FeeActorCtx
): Promise<{ percent: number; source: 'RULE' | 'LEGACY'; rule: ResolvedFeeRule | null }> {
  const rule = await resolveFeeRule('ORDER_COMMISSION', ctx)
  if (rule && rule.dimension === 'PERCENT') return { percent: rule.value, source: 'RULE', rule }
  // Legacy fallback — the pre-Phase-11 sources of truth
  const row = await db.platformSetting.findUnique({ where: { key: 'payouts' } })
  let pct = 10
  if (row) {
    try {
      const parsed = JSON.parse(row.value) as { defaultCommissionPercent?: number }
      if (Number.isFinite(parsed.defaultCommissionPercent)) pct = Number(parsed.defaultCommissionPercent)
    } catch {
      /* default */
    }
  }
  return { percent: pct, source: 'LEGACY', rule: null }
}
