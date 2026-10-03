// ═══════════════════════════════════════════════════════════════════════════
// RFQ SETTINGS SERVICE — scoped storage, resolution, change history, rollback.
// ─────────────────────────────────────────────────────────────────────────────
// Storage: one RfqSetting row per (panel key × scope). Resolution merges the
// scope chain defaults → PLATFORM → ORG_TYPE → ORG/CATEGORY/REGION (most
// specific wins, per field: a scope that stores a field overrides it for the
// whole panel — panels are saved atomically, so a scope row carries the full
// document the admin edited there).
//
// Every save diffs field-by-field against the previous resolved document and
// appends SettingChange rows (who/when/old/new). Rollback restores the old
// value and is itself logged. Audit entries mirror every mutation.
// ═══════════════════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { cached, invalidateTags } from '@/lib/cache'
import { recordAudit } from '@/server/modules/audit/service'
import {
  RFQ_SETTINGS_SECTIONS,
  RFQ_SETTING_PANELS,
  panelDefaults,
  panelSchema,
  mergePanelValue,
  diffPanelValue,
  type PanelValue,
  type ScopeType,
} from '@/lib/rfq-settings/registry'

const CACHE_TAG = 'rfq-settings'

export class SettingsServiceError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

export interface ScopeRef {
  scopeType: ScopeType
  scopeId: string
}

export interface ScopeMeta {
  scopeType: ScopeType
  scopeId: string
  label: string // human name for the scope (org name, category name, …)
}

// ── Scope validation ────────────────────────────────────────────────────────

const ORG_TYPE_VALUES = ['COMPANY', 'BANK', 'MFI', 'EWALLET'] as const
const ORG_TYPE_LABELS: Record<string, string> = {
  COMPANY: 'Companies',
  BANK: 'Banks',
  MFI: 'Micro-finance institutions',
  EWALLET: 'E-wallets',
}

export async function validateScope(scopeType: unknown, scopeId: unknown): Promise<ScopeRef> {
  if (scopeType === 'PLATFORM' || scopeType === undefined || scopeType === null) {
    return { scopeType: 'PLATFORM', scopeId: '' }
  }
  if (typeof scopeType !== 'string' || !['ORG_TYPE', 'ORG', 'CATEGORY', 'REGION'].includes(scopeType)) {
    throw new SettingsServiceError('Invalid scope type')
  }
  const id = typeof scopeId === 'string' ? scopeId.trim() : ''
  if (!id) throw new SettingsServiceError('This scope requires a target (organization, category or region)')
  switch (scopeType) {
    case 'ORG_TYPE': {
      if (!ORG_TYPE_VALUES.includes(id as (typeof ORG_TYPE_VALUES)[number])) {
        throw new SettingsServiceError('Unknown organization type')
      }
      return { scopeType, scopeId: id }
    }
    case 'ORG': {
      const org = await db.organization.findUnique({ where: { id }, select: { id: true } })
      if (!org) throw new SettingsServiceError('Organization not found', 404)
      return { scopeType, scopeId: id }
    }
    case 'CATEGORY': {
      const cat = await db.category.findUnique({ where: { id }, select: { id: true } })
      if (!cat) throw new SettingsServiceError('Category not found', 404)
      return { scopeType, scopeId: id }
    }
    case 'REGION': {
      return { scopeType, scopeId: id.toUpperCase().slice(0, 64) }
    }
  }
}

function scopeKey(s: ScopeRef): string {
  return `${s.scopeType}:${s.scopeId}`
}

// ── Resolution ──────────────────────────────────────────────────────────────

/** The scope chain for a context, broadest → most specific. */
function scopeChain(ctx: SettingsContext): ScopeRef[] {
  const chain: ScopeRef[] = [{ scopeType: 'PLATFORM', scopeId: '' }]
  if (ctx.orgType) chain.push({ scopeType: 'ORG_TYPE', scopeId: ctx.orgType })
  if (ctx.orgId) chain.push({ scopeType: 'ORG', scopeId: ctx.orgId })
  if (ctx.categoryId) chain.push({ scopeType: 'CATEGORY', scopeId: ctx.categoryId })
  if (ctx.region) chain.push({ scopeType: 'REGION', scopeId: ctx.region })
  return chain
}

export interface SettingsContext {
  orgId?: string | null
  orgType?: string | null
  categoryId?: string | null
  region?: string | null
}

interface RawRow { key: string; scopeType: string; scopeId: string; value: string }

async function loadAllRows(): Promise<RawRow[]> {
  return cached(
    'rfq-settings:rows:v1',
    async () => {
      const rows = await db.rfqSetting.findMany({
        select: { key: true, scopeType: true, scopeId: true, value: true },
      })
      return rows
    },
    { ttlMs: 120_000, tags: [CACHE_TAG] }
  )
}

/**
 * Resolve a panel's effective document for a context:
 * defaults ← PLATFORM row ← ORG_TYPE row ← ORG row ← CATEGORY row ← REGION row.
 */
export async function resolvePanel(key: string, ctx: SettingsContext = {}): Promise<PanelValue> {
  const rows = await loadAllRows()
  const byScope = new Map(rows.filter((r) => r.key === key).map((r) => [scopeKey(r), r]))
  let merged = panelDefaults(key)
  for (const ref of scopeChain(ctx)) {
    const row = byScope.get(scopeKey(ref))
    if (row) {
      try {
        merged = mergePanelValue(key, { ...(merged as Record<string, unknown>), ...JSON.parse(row.value) })
      } catch {
        // corrupted row — skip this scope, keep the broader value
      }
    }
  }
  return merged
}

/** Resolve a single field's value (typed helper for call sites). */
export async function resolveField<T>(key: string, field: string, ctx: SettingsContext = {}): Promise<T> {
  const panel = await resolvePanel(key, ctx)
  return panel[field] as T
}

/** Resolve every panel (admin overview + runtime warm caches). */
export async function resolveAllPanels(ctx: SettingsContext = {}): Promise<Record<string, PanelValue>> {
  const out: Record<string, PanelValue> = {}
  for (const key of Object.keys(RFQ_SETTING_PANELS)) {
    out[key] = await resolvePanel(key, ctx)
  }
  return out
}

// ── Admin payload ───────────────────────────────────────────────────────────

export interface OverrideRow {
  key: string
  panelTitle: string
  sectionTitle: string
  scopeType: ScopeType
  scopeId: string
  scopeLabel: string
  updatedAt: string
}

async function scopeLabelFor(scopeType: string, scopeId: string): Promise<string> {
  switch (scopeType) {
    case 'PLATFORM': return 'Platform Default'
    case 'ORG_TYPE': return ORG_TYPE_LABELS[scopeId] ?? scopeId
    case 'ORG': {
      const org = await db.organization.findUnique({ where: { id: scopeId }, select: { name: true } })
      return org?.name ?? `Org ${scopeId.slice(-6)}`
    }
    case 'CATEGORY': {
      const cat = await db.category.findUnique({ where: { id: scopeId }, select: { name: true } })
      return cat?.name ?? `Category ${scopeId.slice(-6)}`
    }
    case 'REGION': return `Region ${scopeId}`
    default: return scopeId
  }
}

export async function getAdminPayload(scope: ScopeRef) {
  const [rows, overrideRows, orgs, categories] = await Promise.all([
    loadAllRows(),
    db.rfqSetting.findMany({
      where: { scopeType: { not: 'PLATFORM' } },
      select: { key: true, scopeType: true, scopeId: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    }),
    db.organization.findMany({
      select: { id: true, name: true, orgType: true, industry: true },
      orderBy: { name: 'asc' },
    }),
    db.category.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])

  // Effective values for the requested scope (chain ends at the scope itself)
  const values: Record<string, PanelValue> = {}
  for (const key of Object.keys(RFQ_SETTING_PANELS)) {
    let merged = panelDefaults(key)
    // resolve against platform first, then walk scopes that are at-or-broader than target
    const chain = scopeChain(scopeTargetContext(scope))
    const byScope = new Map(rows.filter((r) => r.key === key).map((r) => [scopeKey(r), r]))
    for (const ref of chain) {
      const row = byScope.get(scopeKey(ref))
      if (row) {
        try {
          merged = mergePanelValue(key, { ...(merged as Record<string, unknown>), ...JSON.parse(row.value) })
        } catch { /* skip corrupted */ }
      }
    }
    values[key] = merged
  }

  const overrides: OverrideRow[] = []
  for (const row of overrideRows) {
    const panel = RFQ_SETTING_PANELS[row.key]
    if (!panel) continue
    const section = RFQ_SETTINGS_SECTIONS.find((s) => s.panels.some((p) => p.key === row.key))
    overrides.push({
      key: row.key,
      panelTitle: panel.title,
      sectionTitle: section?.title ?? '',
      scopeType: row.scopeType as ScopeType,
      scopeId: row.scopeId,
      scopeLabel: await scopeLabelFor(row.scopeType, row.scopeId),
      updatedAt: row.updatedAt.toISOString(),
    })
  }

  return {
    values,
    overrides,
    orgs: orgs.map((o) => ({ id: o.id, name: o.name, orgType: o.orgType, industry: o.industry })),
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    orgTypes: ORG_TYPE_VALUES.map((v) => ({ value: v, label: ORG_TYPE_LABELS[v] })),
  }
}

function scopeTargetContext(scope: ScopeRef): SettingsContext {
  switch (scope.scopeType) {
    case 'PLATFORM': return {}
    case 'ORG_TYPE': return { orgType: scope.scopeId }
    case 'ORG': return { orgId: scope.scopeId }
    case 'CATEGORY': return { categoryId: scope.scopeId }
    case 'REGION': return { region: scope.scopeId }
  }
}

// ── Save (validate + diff + history + audit) ───────────────────────────────

export interface SavePanelInput {
  key: string
  scope: ScopeRef
  value: unknown
  userId: string
}

export async function savePanel(input: SavePanelInput): Promise<PanelValue> {
  const { key, scope, userId } = input
  const panel = RFQ_SETTING_PANELS[key]
  if (!panel) throw new SettingsServiceError('Unknown settings panel', 404)

  const parsed = panelSchema(key).safeParse(input.value)
  if (!parsed.success) {
    throw new SettingsServiceError(
      `Invalid values: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`
    )
  }
  const next = parsed.data as PanelValue

  const existing = await db.rfqSetting.findUnique({
    where: { key_scopeType_scopeId: { key, scopeType: scope.scopeType, scopeId: scope.scopeId } },
  })
  const before = existing
    ? mergePanelValue(key, safeJson(existing.value))
    : panelDefaults(key)

  const changes = diffPanelValue(key, before, next)
  if (changes.length === 0) return before // no-op save

  await db.$transaction(async (tx) => {
    await tx.rfqSetting.upsert({
      where: { key_scopeType_scopeId: { key, scopeType: scope.scopeType, scopeId: scope.scopeId } },
      update: { value: JSON.stringify(next), updatedById: userId },
      create: { key, scopeType: scope.scopeType, scopeId: scope.scopeId, value: JSON.stringify(next), updatedById: userId },
    })
    await tx.settingChange.createMany({
      data: changes.map((c) => ({
        settingKey: key,
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        field: c.field,
        oldValue: c.oldValue,
        newValue: c.newValue,
        userId,
      })),
    })
  })

  invalidateTags(CACHE_TAG)
  await recordAudit({
    actorId: userId,
    actorType: 'ADMIN',
    action: 'SETTINGS_UPDATED',
    entityType: 'RfqSetting',
    entityId: `${key}:${scope.scopeType}:${scope.scopeId}`,
    summary: `${panel.title} updated at ${await scopeLabelFor(scope.scopeType, scope.scopeId)} — ${changes.length} field${changes.length === 1 ? '' : 's'} changed`,
    metadata: { fields: changes.map((c) => c.field) },
  })
  return next
}

// ── Delete override ────────────────────────────────────────────────────────

export async function deleteOverride(key: string, scope: ScopeRef, userId: string): Promise<void> {
  const panel = RFQ_SETTING_PANELS[key]
  if (!panel) throw new SettingsServiceError('Unknown settings panel', 404)
  if (scope.scopeType === 'PLATFORM') throw new SettingsServiceError('Platform defaults cannot be deleted — edit them instead')

  const existing = await db.rfqSetting.findUnique({
    where: { key_scopeType_scopeId: { key, scopeType: scope.scopeType, scopeId: scope.scopeId } },
  })
  if (!existing) return

  await db.rfqSetting.delete({ where: { id: existing.id } })
  invalidateTags(CACHE_TAG)
  await recordAudit({
    actorId: userId,
    actorType: 'ADMIN',
    action: 'SETTINGS_OVERRIDE_DELETED',
    entityType: 'RfqSetting',
    entityId: `${key}:${scope.scopeType}:${scope.scopeId}`,
    summary: `Override removed — ${panel.title} at ${await scopeLabelFor(scope.scopeType, scope.scopeId)} falls back to the broader scope`,
  })
}

// ── History + rollback ──────────────────────────────────────────────────────

export interface HistoryRow {
  id: string
  settingKey: string
  panelTitle: string
  scopeType: string
  scopeId: string
  scopeLabel: string
  field: string
  fieldLabel: string
  oldValue: string | null
  newValue: string | null
  rollbackOfId: string | null
  userName: string
  userEmail: string | null
  createdAt: string
}

export async function listHistory(opts: { key?: string; scope?: ScopeRef; limit?: number }): Promise<HistoryRow[]> {
  const where: Record<string, unknown> = {}
  if (opts.key) where.settingKey = opts.key
  if (opts.scope) {
    where.scopeType = opts.scope.scopeType
    where.scopeId = opts.scope.scopeId
  }
  const rows = await db.settingChange.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: Math.min(opts.limit ?? 50, 200),
    include: { user: { select: { name: true, email: true } } },
  })

  const labelCache = new Map<string, string>()
  const labelFor = async (scopeType: string, scopeId: string) => {
    const k = `${scopeType}:${scopeId}`
    if (!labelCache.has(k)) labelCache.set(k, await scopeLabelFor(scopeType, scopeId))
    return labelCache.get(k)!
  }

  const out: HistoryRow[] = []
  for (const r of rows) {
    const panel = RFQ_SETTING_PANELS[r.settingKey]
    const fieldDef = panel ? panel.groups.flatMap((g) => g.fields).find((f) => f.key === r.field) : undefined
    out.push({
      id: r.id,
      settingKey: r.settingKey,
      panelTitle: panel?.title ?? r.settingKey,
      scopeType: r.scopeType,
      scopeId: r.scopeId,
      scopeLabel: await labelFor(r.scopeType, r.scopeId),
      field: r.field,
      fieldLabel: fieldDef?.label ?? r.field,
      oldValue: r.oldValue,
      newValue: r.newValue,
      rollbackOfId: r.rollbackOfId,
      userName: r.user.name,
      userEmail: r.user.email,
      createdAt: r.createdAt.toISOString(),
    })
  }
  return out
}

/** Restore the previous value of one logged change; the rollback is itself logged. */
export async function rollbackChange(changeId: string, userId: string): Promise<HistoryRow> {
  const change = await db.settingChange.findUnique({ where: { id: changeId } })
  if (!change) throw new SettingsServiceError('Change not found', 404)

  const panel = RFQ_SETTING_PANELS[change.settingKey]
  if (!panel) throw new SettingsServiceError('Unknown settings panel', 404)

  const scope: ScopeRef = { scopeType: change.scopeType as ScopeType, scopeId: change.scopeId }
  const existing = await db.rfqSetting.findUnique({
    where: { key_scopeType_scopeId: { key: change.settingKey, scopeType: scope.scopeType, scopeId: scope.scopeId } },
  })
  const current = existing ? mergePanelValue(change.settingKey, safeJson(existing.value)) : panelDefaults(change.settingKey)

  const restored: PanelValue = { ...current }
  if (change.oldValue === null) {
    // "did not exist" → restore the registry default
    restored[change.field] = structuredClone(panelDefaults(change.settingKey)[change.field])
  } else {
    const old = parseScalar(change.oldValue)
    if (old === undefined) throw new SettingsServiceError('This change can no longer be rolled back — the stored value is unreadable')
    restored[change.field] = old
  }

  const parsed = panelSchema(change.settingKey).safeParse(restored)
  if (!parsed.success) {
    throw new SettingsServiceError('This change can no longer be rolled back — the stored value predates the current schema')
  }

  await db.$transaction(async (tx) => {
    await tx.rfqSetting.upsert({
      where: { key_scopeType_scopeId: { key: change.settingKey, scopeType: scope.scopeType, scopeId: scope.scopeId } },
      update: { value: JSON.stringify(parsed.data), updatedById: userId },
      create: {
        key: change.settingKey, scopeType: scope.scopeType, scopeId: scope.scopeId,
        value: JSON.stringify(parsed.data), updatedById: userId,
      },
    })
    await tx.settingChange.create({
      data: {
        settingKey: change.settingKey,
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        field: change.field,
        oldValue: change.newValue,
        newValue: change.oldValue,
        userId,
        rollbackOfId: change.id,
      },
    })
  })

  invalidateTags(CACHE_TAG)
  await recordAudit({
    actorId: userId,
    actorType: 'ADMIN',
    action: 'SETTINGS_ROLLBACK',
    entityType: 'RfqSetting',
    entityId: `${change.settingKey}:${scope.scopeType}:${scope.scopeId}`,
    summary: `Rolled back “${panel.title} → ${change.field}” to its previous value`,
  })

  const rows = await listHistory({ key: change.settingKey, scope, limit: 1 })
  return rows[0]
}

// ── helpers ────────────────────────────────────────────────────────────────

function safeJson(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw)
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** Parse a stored scalar/array value ("14", "true", "[48,12]"); undefined when unreadable. */
function parseScalar(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return raw.length > 0 ? raw : undefined
  }
}
