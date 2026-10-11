import { db } from '@/lib/db'
import { recordAudit } from '@/server/modules/audit/service'
import {
  FEE_EVENTS,
  FEE_ACTOR_TYPES,
  FEE_SCOPE_TYPES,
  FEE_DIMENSIONS,
  FEE_ORG_TYPES,
  FeeServiceError,
  resolveFeeRule,
  type FeeActorCtx,
  type FeeRuleDTO,
  type ResolvedFeeRule,
} from './service'

// ─────────────────────────────────────────────────────────────────────────────
// FEE ENGINE — admin surface (Phase 11.1, task 11-a).
//
// Rule CRUD on top of the engine spine (service.ts — shared, never edited
// here). Rules are configuration, assessments are history:
//   • UPDATE = edit-in-place with version+1 (the @@unique on
//     event+scopeType+scopeId+version absorbs the bump) — existing
//     assessments keep their ruleVersion + ruleSnapshot, so history never
//     rewrites.
//   • DELETE = retire (isActive=false) — rows are never hard-deleted; the
//     ledger's ruleId references must stay resolvable.
//
// `resolveFinancingSuccessPercent` is the zero-change migration bridge for
// the financing SUCCESS fee: ORG rule → ORG_TYPE → PLATFORM → the legacy
// rfq-settings percent passed in by the caller.
// ─────────────────────────────────────────────────────────────────────────────

type FeeRuleRow = {
  id: string
  event: string
  actorType: string
  scopeType: string
  scopeId: string
  dimension: string
  value: number
  currency: string | null
  precedence: number
  effectiveFrom: Date
  effectiveTo: Date | null
  version: number
  note: string | null
  isActive: boolean
  updatedAt: Date
}

function serializeRule(r: FeeRuleRow): FeeRuleDTO {
  return {
    id: r.id,
    event: r.event,
    actorType: r.actorType,
    scopeType: r.scopeType,
    scopeId: r.scopeId,
    dimension: r.dimension,
    value: r.value,
    currency: r.currency,
    precedence: r.precedence,
    effectiveFrom: r.effectiveFrom.toISOString(),
    effectiveTo: r.effectiveTo?.toISOString() ?? null,
    version: r.version,
    note: r.note,
    isActive: r.isActive,
    updatedAt: r.updatedAt.toISOString(),
  }
}

// ── listing ──────────────────────────────────────────────────────────────────

/** All rules for an event (inactive included — retiring is history, not
 *  erasure), newest first. */
export async function listFeeRules(filter?: { event?: string }): Promise<FeeRuleDTO[]> {
  const rows = await db.feeRule.findMany({
    where: {
      ...(filter?.event && (FEE_EVENTS as readonly string[]).includes(filter.event)
        ? { event: filter.event }
        : {}),
    },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
  })
  return rows.map((r) => serializeRule(r as FeeRuleRow))
}

// ── input validation ─────────────────────────────────────────────────────────

export interface FeeRuleInput {
  event: string
  actorType: string
  scopeType: string
  scopeId?: string | null
  dimension: string
  value: number
  currency?: string | null
  precedence?: number
  effectiveFrom?: string | null
  effectiveTo?: string | null
  note?: string | null
}

interface NormalizedRule {
  event: string
  actorType: string
  scopeType: string
  scopeId: string
  dimension: string
  value: number
  currency: string | null
  precedence: number
  effectiveFrom: Date
  effectiveTo: Date | null
  note: string | null
}

/** Mirrors the engine spine's vocabulary + scope-target reality checks. */
async function validateRuleInput(input: FeeRuleInput): Promise<NormalizedRule> {
  const event = String(input.event ?? '')
  if (!(FEE_EVENTS as readonly string[]).includes(event)) {
    throw new FeeServiceError(`event must be one of: ${FEE_EVENTS.join(', ')}`, 400, 'BAD_EVENT')
  }
  const actorType = String(input.actorType ?? '')
  if (!(FEE_ACTOR_TYPES as readonly string[]).includes(actorType)) {
    throw new FeeServiceError(`actorType must be one of: ${FEE_ACTOR_TYPES.join(', ')}`, 400, 'BAD_ACTOR_TYPE')
  }
  const scopeType = String(input.scopeType ?? '')
  if (!(FEE_SCOPE_TYPES as readonly string[]).includes(scopeType)) {
    throw new FeeServiceError(`scopeType must be one of: ${FEE_SCOPE_TYPES.join(', ')}`, 400, 'BAD_SCOPE_TYPE')
  }

  // scopeId validation per scope type
  let scopeId = (input.scopeId ?? '')!.toString().trim()
  if (scopeType === 'PLATFORM') {
    scopeId = ''
  } else if (scopeType === 'ORG_TYPE') {
    if (!(FEE_ORG_TYPES as readonly string[]).includes(scopeId)) {
      throw new FeeServiceError(
        `ORG_TYPE scope requires one of ${FEE_ORG_TYPES.join(', ')} as the scope target`,
        400,
        'BAD_SCOPE_TARGET'
      )
    }
  } else {
    if (!scopeId) throw new FeeServiceError('ORG scope requires an organization id', 400, 'BAD_SCOPE_TARGET')
    const org = await db.organization.findUnique({ where: { id: scopeId }, select: { id: true } })
    if (!org) throw new FeeServiceError('The scoped organization does not exist', 404, 'ORG_NOT_FOUND')
  }

  const dimension = String(input.dimension ?? '')
  if (!(FEE_DIMENSIONS as readonly string[]).includes(dimension)) {
    throw new FeeServiceError(`dimension must be one of: ${FEE_DIMENSIONS.join(', ')}`, 400, 'BAD_DIMENSION')
  }
  const value = Number(input.value)
  if (!Number.isFinite(value)) throw new FeeServiceError('value must be a number', 400, 'BAD_VALUE')
  let currency: string | null = null
  if (dimension === 'PERCENT') {
    if (value < 0 || value > 90) throw new FeeServiceError('A percent rule must be between 0 and 90', 400, 'BAD_VALUE')
  } else {
    if (value <= 0) throw new FeeServiceError('A flat fee must be positive', 400, 'BAD_VALUE')
    currency = (input.currency ?? '')!.toString().trim().toUpperCase() || null
    if (!currency) throw new FeeServiceError('A flat rule requires a currency', 400, 'CURRENCY_REQUIRED')
    const known = await db.currency.findUnique({ where: { code: currency }, select: { code: true } })
    if (!known) throw new FeeServiceError(`Unknown currency "${currency}"`, 400, 'CURRENCY_UNKNOWN')
  }

  const precedence = input.precedence === undefined || input.precedence === null ? 0 : Number(input.precedence)
  if (!Number.isInteger(precedence) || precedence < 0) {
    throw new FeeServiceError('precedence must be an integer ≥ 0', 400, 'BAD_PRECEDENCE')
  }

  const now = new Date()
  const effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : now
  if (Number.isNaN(effectiveFrom.getTime())) {
    throw new FeeServiceError('effectiveFrom is not a valid date', 400, 'BAD_EFFECTIVE_FROM')
  }
  const effectiveTo = input.effectiveTo ? new Date(input.effectiveTo) : null
  if (effectiveTo && Number.isNaN(effectiveTo.getTime())) {
    throw new FeeServiceError('effectiveTo is not a valid date', 400, 'BAD_EFFECTIVE_TO')
  }
  if (effectiveTo && effectiveTo.getTime() < effectiveFrom.getTime()) {
    throw new FeeServiceError('effectiveTo cannot be before effectiveFrom', 400, 'BAD_WINDOW')
  }

  return {
    event,
    actorType,
    scopeType,
    scopeId,
    dimension,
    value,
    currency,
    precedence,
    effectiveFrom,
    effectiveTo,
    note: input.note?.toString().trim() || null,
  }
}

/** Next free version slot for a scope key (the @@unique is
 *  event+scopeType+scopeId+version — retired rows keep their slots). */
async function nextVersion(event: string, scopeType: string, scopeId: string): Promise<number> {
  const agg = await db.feeRule.aggregate({
    where: { event, scopeType, scopeId },
    _max: { version: true },
  })
  return (agg._max.version ?? 0) + 1
}

// ── create / update / retire ────────────────────────────────────────────────

export async function createFeeRule(input: FeeRuleInput, actorId: string): Promise<FeeRuleDTO> {
  const n = await validateRuleInput(input)
  const version = await nextVersion(n.event, n.scopeType, n.scopeId)
  const row = await db.feeRule.create({
    data: {
      event: n.event,
      actorType: n.actorType,
      scopeType: n.scopeType,
      scopeId: n.scopeId,
      dimension: n.dimension,
      value: n.value,
      currency: n.currency,
      precedence: n.precedence,
      effectiveFrom: n.effectiveFrom,
      effectiveTo: n.effectiveTo,
      version,
      note: n.note,
      isActive: true,
      changedById: actorId,
    },
  })
  await recordAudit({
    actorId,
    actorType: 'ADMIN',
    action: 'FEE_RULE_CREATED',
    entityType: 'FeeRule',
    entityId: row.id,
    summary: `Fee rule created — ${n.event} @ ${n.scopeType}${n.scopeId ? ':' + n.scopeId : ''} ${n.dimension === 'PERCENT' ? n.value + '%' : n.value + ' ' + (n.currency ?? '')} (v${version})`,
    metadata: {
      event: n.event,
      actorType: n.actorType,
      scopeType: n.scopeType,
      scopeId: n.scopeId,
      dimension: n.dimension,
      value: n.value,
      currency: n.currency,
      precedence: n.precedence,
      version,
    },
  })
  return serializeRule(row as FeeRuleRow)
}

export async function updateFeeRule(
  id: string,
  input: Partial<FeeRuleInput> & { isActive?: boolean },
  actorId: string
): Promise<FeeRuleDTO> {
  const existing = await db.feeRule.findUnique({ where: { id } })
  if (!existing) throw new FeeServiceError('Fee rule not found', 404, 'RULE_NOT_FOUND')

  // Partial-update merge: `undefined` keeps the current value; an explicit
  // `null` CLEARS a nullable field (effectiveTo/note/currency → open-ended /
  // none) — the distinction matters for full-form UI saves.
  const merged: FeeRuleInput = {
    event: input.event ?? existing.event,
    actorType: input.actorType ?? existing.actorType,
    scopeType: input.scopeType ?? existing.scopeType,
    scopeId: input.scopeId ?? existing.scopeId,
    dimension: input.dimension ?? existing.dimension,
    value: input.value ?? existing.value,
    currency: input.currency ?? existing.currency,
    precedence: input.precedence ?? existing.precedence,
    effectiveFrom: input.effectiveFrom ?? existing.effectiveFrom.toISOString(),
    effectiveTo:
      input.effectiveTo === undefined
        ? existing.effectiveTo
          ? existing.effectiveTo.toISOString()
          : null
        : input.effectiveTo,
    note: input.note ?? existing.note,
  }
  const n = await validateRuleInput(merged)

  // Version bump against the TARGET scope key (an edit may re-scope a rule):
  // always the next free slot of that key. Edit-in-place — the same row
  // advances its version; assessments keep their ruleVersion + ruleSnapshot,
  // so history is never rewritten.
  const version = await nextVersion(n.event, n.scopeType, n.scopeId)

  const row = await db.feeRule.update({
    where: { id },
    data: {
      event: n.event,
      actorType: n.actorType,
      scopeType: n.scopeType,
      scopeId: n.scopeId,
      dimension: n.dimension,
      value: n.value,
      currency: n.currency,
      precedence: n.precedence,
      effectiveFrom: n.effectiveFrom,
      effectiveTo: n.effectiveTo,
      version,
      note: n.note,
      ...(input.isActive !== undefined ? { isActive: Boolean(input.isActive) } : {}),
      changedById: actorId,
    },
  })
  await recordAudit({
    actorId,
    actorType: 'ADMIN',
    action: 'FEE_RULE_UPDATED',
    entityType: 'FeeRule',
    entityId: id,
    summary: `Fee rule updated — ${n.event} @ ${n.scopeType}${n.scopeId ? ':' + n.scopeId : ''} ${n.dimension === 'PERCENT' ? n.value + '%' : n.value + ' ' + (n.currency ?? '')} (v${existing.version} → v${version})`,
    metadata: {
      event: n.event,
      scopeType: n.scopeType,
      scopeId: n.scopeId,
      dimension: n.dimension,
      value: n.value,
      version,
      previousVersion: existing.version,
      isActive: input.isActive !== undefined ? Boolean(input.isActive) : existing.isActive,
    },
  })
  return serializeRule(row as FeeRuleRow)
}

/** Retire = isActive=false, never a hard delete — FeeAssessment.ruleId must
 *  stay resolvable and retired rules keep their version slots. Assessments
 *  keep their snapshots either way. */
export async function retireFeeRule(id: string, actorId: string): Promise<FeeRuleDTO> {
  const existing = await db.feeRule.findUnique({ where: { id } })
  if (!existing) throw new FeeServiceError('Fee rule not found', 404, 'RULE_NOT_FOUND')
  if (!existing.isActive) return serializeRule(existing as FeeRuleRow) // idempotent
  const row = await db.feeRule.update({
    where: { id },
    data: { isActive: false, changedById: actorId },
  })
  await recordAudit({
    actorId,
    actorType: 'ADMIN',
    action: 'FEE_RULE_RETIRED',
    entityType: 'FeeRule',
    entityId: id,
    summary: `Fee rule retired — ${existing.event} @ ${existing.scopeType}${existing.scopeId ? ':' + existing.scopeId : ''} v${existing.version}. Existing assessments keep their snapshots.`,
    metadata: { event: existing.event, scopeType: existing.scopeType, scopeId: existing.scopeId, version: existing.version },
  })
  return serializeRule(row as FeeRuleRow)
}

// ── financing SUCCESS-fee bridge (zero-change migration) ─────────────────────

/**
 * The FINANCING_SUCCESS counterpart of resolveOrderCommissionPercent:
 * ORG rule (the financier's org) → ORG_TYPE rule → PLATFORM rule → the
 * legacy rfq-settings percent passed in. Day one no rules exist, so the
 * fallback reproduces the current behavior exactly.
 */
export async function resolveFinancingSuccessPercent(
  ctx: FeeActorCtx,
  fallbackPercent: number
): Promise<{ percent: number; source: 'RULE' | 'LEGACY'; rule: ResolvedFeeRule | null }> {
  const rule = await resolveFeeRule('FINANCING_SUCCESS', ctx)
  if (rule && rule.dimension === 'PERCENT') return { percent: rule.value, source: 'RULE', rule }
  const pct = Number(fallbackPercent)
  return { percent: Number.isFinite(pct) ? pct : 0, source: 'LEGACY', rule: null }
}
