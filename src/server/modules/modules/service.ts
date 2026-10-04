import { db } from '@/lib/db'
import { recordAudit, recordAuditTx } from '@/server/modules/audit/service'

// ─────────────────────────────────────────────────────────────────────────────
// MODULE ACTIVATION SERVICE — Phase 5.3 (mergedplan.md §6)
//
// One question drives everything here: "is module X enabled for THIS actor?"
// The answer resolves through a scope chain, most specific wins:
//
//     ORG activation  >  ORG_TYPE activation  >  PLATFORM activation  >  default
//
// A missing row at any level falls through to the next. Core modules
// (`ModuleDefinition.core`) can never be resolved off — the API refuses to
// write such an activation and the resolver clamps them back on.
//
// This is the substrate the mergedplan describes for future subscription
// tiers: a tier = a bundle of module activations + limits.
// ─────────────────────────────────────────────────────────────────────────────

export const MODULE_SCOPE_TYPES = ['PLATFORM', 'ORG_TYPE', 'ORG'] as const
export type ModuleScopeType = (typeof MODULE_SCOPE_TYPES)[number]

/** Org types that can be flipped as a scope (Phase 4 org-type CRUD keys). */
export const MODULE_ORG_TYPES = ['COMPANY', 'BANK', 'MFI', 'EWALLET'] as const

export interface ModuleAdminView {
  id: string
  key: string
  name: string
  description: string | null
  domain: string
  core: boolean
  defaultOn: boolean
  sortOrder: number
  activations: {
    id: string
    scopeType: string
    scopeId: string
    enabled: boolean
    note: string | null
    updatedAt: string
    changedBy: string | null
  }[]
}

export interface ModuleActivationInput {
  moduleKey: string
  scopeType: ModuleScopeType
  scopeId: string
  enabled: boolean
  note?: string
}

export class ModuleServiceError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

// ── resolution ──────────────────────────────────────────────────────────────

const RESOLVE_TTL_MS = 30_000

interface ResolvedModuleState {
  modules: Record<string, { core: boolean; defaultOn: boolean }>
  /** scopeType|scopeId → moduleKey → enabled (only rows that exist) */
  overrides: Record<string, Record<string, boolean>>
}

async function loadModuleState(): Promise<ResolvedModuleState> {
  const [definitions, activations] = await Promise.all([
    db.moduleDefinition.findMany({ where: { isActive: true } }),
    db.moduleActivation.findMany(),
  ])
  const modules: ResolvedModuleState['modules'] = {}
  for (const d of definitions) modules[d.key] = { core: d.core, defaultOn: d.defaultOn }
  const overrides: ResolvedModuleState['overrides'] = {}
  for (const a of activations) {
    const scopeKey = `${a.scopeType}|${a.scopeId}`
    ;(overrides[scopeKey] ??= {})[a.moduleKey] = a.enabled
  }
  return { modules, overrides }
}

function scopeKeyOf(scopeType: string, scopeId: string): string {
  return `${scopeType}|${scopeId}`
}

/**
 * Resolve every active module for a context. Falls through ORG → ORG_TYPE →
 * PLATFORM → definition default; `core` modules are always enabled.
 */
export async function resolveModuleState(
  ctx: { orgId?: string | null; orgType?: string | null } = {}
): Promise<Record<string, boolean>> {
  const state = await loadModuleStateCached()
  const chain = [scopeKeyOf('PLATFORM', '')]
  if (ctx.orgType) chain.unshift(scopeKeyOf('ORG_TYPE', ctx.orgType))
  if (ctx.orgId) chain.unshift(scopeKeyOf('ORG', ctx.orgId))

  const result: Record<string, boolean> = {}
  for (const [key, def] of Object.entries(state.modules)) {
    if (def.core) {
      result[key] = true
      continue
    }
    let enabled: boolean | undefined
    for (const scopeKey of chain) {
      const hit = state.overrides[scopeKey]?.[key]
      if (hit !== undefined) {
        enabled = hit
        break
      }
    }
    result[key] = enabled ?? def.defaultOn
  }
  return result
}

/** Point check: is this module enabled for the context?
 *  Phase 6 (6.3): UNKNOWN module keys fail CLOSED — a typo in a route's
 *  requireModule() call must never grant access. The config error is logged
 *  so the mistake surfaces in operations. */
export async function isModuleEnabled(
  moduleKey: string,
  ctx: { orgId?: string | null; orgType?: string | null } = {}
): Promise<boolean> {
  const gate = await moduleGateState(moduleKey, ctx)
  return gate.enabled
}

/** One-shot gate resolution for guards: distinguishes MODULE_UNKNOWN
 *  (fail-closed config error) from MODULE_DISABLED (deliberate flip). */
export async function moduleGateState(
  moduleKey: string,
  ctx: { orgId?: string | null; orgType?: string | null } = {}
): Promise<{ enabled: boolean; unknown: boolean }> {
  const state = await loadModuleStateCached()
  if (!(moduleKey in state.modules)) {
    console.error(`[modules] CONFIG ERROR: unknown module key "${moduleKey}" — failing closed (route refused)`)
    return { enabled: false, unknown: true }
  }
  const resolved = await resolveModuleState(ctx)
  return { enabled: resolved[moduleKey] ?? false, unknown: false }
}

/**
 * Phase 5 gate — the module state a USER resolves through. Market participants
 * (buyers, sellers, financier staff) operate inside their org chains: a user
 * who belongs to orgs resolves through the UNION of those chains (each chain
 * already resolves org → orgType → platform → default, so a platform-wide flip
 * keeps working while an org/org-type flip steers only that org's people);
 * org-less users resolve the bare platform chain. This is the semantic that
 * makes a module vanish from a user's NAV *and* their APIs when an admin
 * flips it off for their org type.
 */
export async function userModuleState(userId: string): Promise<Record<string, boolean>> {
  const memberships = await db.organizationMember.findMany({
    where: { userId },
    select: { organizationId: true, organization: { select: { orgType: true } } },
    take: 10,
  })
  if (memberships.length === 0) return resolveModuleState({})
  const merged: Record<string, boolean> = {}
  for (const m of memberships) {
    const state = await resolveModuleState({ orgId: m.organizationId, orgType: m.organization.orgType })
    for (const [key, on] of Object.entries(state)) merged[key] = merged[key] || on
  }
  return merged
}

/** Point check for a user (union of their org chains — see userModuleState).
 *  Phase 6 (6.3): unknown keys fail closed, same as isModuleEnabled. */
export async function isModuleEnabledForUser(moduleKey: string, userId: string): Promise<boolean> {
  const state = await loadModuleStateCached()
  if (!(moduleKey in state.modules)) {
    console.error(`[modules] CONFIG ERROR: unknown module key "${moduleKey}" — failing closed (route refused)`)
    return false
  }
  const userState = await userModuleState(userId)
  return userState[moduleKey] ?? false
}

const globalForModules = globalThis as unknown as {
  __vendoraModuleStateCache?: { value: ResolvedModuleState; expiresAt: number }
}

async function loadModuleStateCached(): Promise<ResolvedModuleState> {
  const now = Date.now()
  const cache = globalForModules.__vendoraModuleStateCache
  if (cache && cache.expiresAt > now) return cache.value
  const value = await loadModuleState()
  globalForModules.__vendoraModuleStateCache = { value, expiresAt: now + RESOLVE_TTL_MS }
  return value
}

/** Invalidate the resolver cache (called after every write). */
export function invalidateModuleCache(): void {
  globalForModules.__vendoraModuleStateCache = null
}

// ── admin surface ───────────────────────────────────────────────────────────

function validateScope(scopeType: string, scopeId: string): void {
  if (!MODULE_SCOPE_TYPES.includes(scopeType as ModuleScopeType)) {
    throw new ModuleServiceError(`Unknown scope type "${scopeType}".`)
  }
  if (scopeType === 'PLATFORM' && scopeId !== '') {
    throw new ModuleServiceError('PLATFORM scope takes no scope id.')
  }
  if (scopeType === 'ORG_TYPE') {
    if (!MODULE_ORG_TYPES.includes(scopeId as (typeof MODULE_ORG_TYPES)[number])) {
      throw new ModuleServiceError(`Unknown organization type "${scopeId}".`)
    }
  }
  if (scopeType === 'ORG' && !scopeId) {
    throw new ModuleServiceError('ORG scope needs the organization id.')
  }
}

/** Admin listing: the module catalog with every activation row attached. */
export async function listModulesForAdmin(): Promise<ModuleAdminView[]> {
  const [definitions, activations] = await Promise.all([
    db.moduleDefinition.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    db.moduleActivation.findMany({ orderBy: { updatedAt: 'desc' } }),
  ])
  const byModule = new Map<string, ModuleAdminView['activations']>()
  for (const a of activations) {
    const list = byModule.get(a.moduleKey) ?? []
    list.push({
      id: a.id,
      scopeType: a.scopeType,
      scopeId: a.scopeId,
      enabled: a.enabled,
      note: a.note,
      updatedAt: a.updatedAt.toISOString(),
      changedBy: a.changedById,
    })
    byModule.set(a.moduleKey, list)
  }
  return definitions.map((d) => ({
    id: d.id,
    key: d.key,
    name: d.name,
    description: d.description,
    domain: d.domain,
    core: d.core,
    defaultOn: d.defaultOn,
    sortOrder: d.sortOrder,
    activations: byModule.get(d.key) ?? [],
  }))
}

/**
 * Set (or clear, when `remove`) an activation override. Core modules refuse
 * deactivation — the retail marketplace itself never goes dark.
 */
export async function setModuleActivation(
  actorId: string,
  input: ModuleActivationInput & { remove?: boolean }
): Promise<ModuleAdminView> {
  validateScope(input.scopeType, input.scopeId)

  const definition = await db.moduleDefinition.findUnique({ where: { key: input.moduleKey } })
  if (!definition) throw new ModuleServiceError(`Unknown module "${input.moduleKey}".`, 404)
  if (definition.core && !input.enabled && !input.remove) {
    throw new ModuleServiceError(`"${definition.name}" is a core module and cannot be deactivated.`, 409)
  }

  // 6.11: activation change + audit row commit atomically.
  const action = input.remove ? 'MODULE_ACTIVATION_REMOVED' : input.enabled ? 'MODULE_ENABLED' : 'MODULE_DISABLED'
  await db.$transaction(async (tx) => {
    if (input.remove) {
      await tx.moduleActivation.deleteMany({
        where: { moduleKey: input.moduleKey, scopeType: input.scopeType, scopeId: input.scopeId },
      })
    } else {
      await tx.moduleActivation.upsert({
        where: {
          moduleKey_scopeType_scopeId: {
            moduleKey: input.moduleKey,
            scopeType: input.scopeType,
            scopeId: input.scopeId,
          },
        },
        create: {
          moduleKey: input.moduleKey,
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          enabled: input.enabled,
          note: input.note,
          changedById: actorId,
        },
        update: { enabled: input.enabled, note: input.note, changedById: actorId },
      })
    }
    await recordAuditTx(tx, {
      actorId,
      actorType: 'ADMIN',
      action,
      entityType: 'ModuleDefinition',
      entityId: input.moduleKey,
      summary: `${definition.name} ${input.remove ? 'override removed' : input.enabled ? 'enabled' : 'disabled'} at ${input.scopeType}${input.scopeId ? `:${input.scopeId}` : ''}`,
      metadata: { ...input },
    })
  })

  invalidateModuleCache()

  const view = (await listModulesForAdmin()).find((m) => m.key === input.moduleKey)
  if (!view) throw new ModuleServiceError('Module vanished after write.', 500)
  return view
}

/**
 * The effective-matrix preview: for every org type (and the orgs that carry
 * overrides), what does the resolver currently answer? Drives the admin
 * matrix "effective" column without client-side reimplementation.
 */
export async function effectiveMatrix(): Promise<{
  orgTypes: Record<string, Record<string, boolean>>
  orgs: { id: string; name: string; orgType: string; state: Record<string, boolean> }[]
}> {
  // NOTE: the org query needs `orgOverrides` — the org-override scopeIds must
  // be fetched BEFORE the organization query is built (a single Promise.all
  // here reads the destructured binding before initialization → TDZ error).
  const [, orgTypeRows, orgOverrides] = await Promise.all([
    resolveModuleState({}),
    Promise.all(MODULE_ORG_TYPES.map(async (t) => [t, await resolveModuleState({ orgType: t })] as const)),
    db.moduleActivation.findMany({ where: { scopeType: 'ORG' }, select: { scopeId: true }, distinct: ['scopeId'] }),
  ])
  const orgs = orgOverrides.length
    ? await db.organization.findMany({
        where: { id: { in: orgOverrides.map((o) => o.scopeId) } },
        select: { id: true, name: true, orgType: true },
      })
    : []
  const orgTypeState: Record<string, Record<string, boolean>> = {}
  for (const [t, state] of orgTypeRows) orgTypeState[t] = state
  const orgStates = await Promise.all(
    orgs.map(async (o) => ({
      id: o.id,
      name: o.name,
      orgType: o.orgType,
      state: await resolveModuleState({ orgId: o.id, orgType: o.orgType }),
    }))
  )
  return { orgTypes: orgTypeState, orgs: orgStates }
}
