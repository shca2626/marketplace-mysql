import { db } from '@/lib/db'
import { recordAudit } from '@/server/modules/audit/service'
import { resolvePanel } from '@/server/modules/settings/service'
import { userHasPlatformPermission } from '@/server/modules/rbac/service'
import {
  FinancingError,
  PROFILE_FIELD_KEYS,
  DOCUMENT_TYPES,
  assertFinancierStaffOfService,
  requireFinancierContext,
  type ConditionScope,
  type ConditionType,
} from './shared'

/**
 * REQUIREMENTS ENGINE — ConditionTemplate library + per-service attachments
 * (FINANCIER_SCHEMA v5 §3.5, R-5 / DP-24).
 *
 * Two flavors, both first-class:
 *   GENERAL   — platform-curated shared library (admin-only management).
 *   FINANCIER — private to one financier org (created by its OWNER/ADMIN staff
 *               via OrganizationMember — DP-1, no new global role).
 * Both attach to a service via ServiceRequirement rows with per-attachment
 * config (isRequired / displayOrder / instructions / autoPassAccredited),
 * capped by financingRequirements.maxRequirementsPerService.
 *
 * ConditionTemplate.code is globally unique (service-layer guard — belt and
 * braces against the MySQL-null-dupes nuance; the guard stays).
 */

// ── DTOs ────────────────────────────────────────────────────────────────────

export interface ConditionOptionDTO {
  id: string
  value: string
  position: number
}

export interface ConditionTemplateDTO {
  id: string
  scope: ConditionScope
  organizationId: string | null
  organizationName: string | null
  conditionType: ConditionType
  code: string | null
  title: string
  description: string | null
  profileFieldKey: string | null
  documentType: string | null
  validationMin: number | null
  validationMax: number | null
  validityMonths: number | null
  isRepeatable: boolean
  isActive: boolean
  attachmentCount: number
  options: ConditionOptionDTO[]
  createdAt: string
}

export interface ServiceRequirementDTO {
  id: string
  serviceId: string
  conditionTemplateId: string
  isRequired: boolean
  displayOrder: number
  instructions: string | null
  autoPassAccredited: boolean
  isActive: boolean
  template: ConditionTemplateDTO
}

// ── Serialization ───────────────────────────────────────────────────────────

type TemplateRaw = Awaited<ReturnType<typeof db.conditionTemplate.findFirstOrThrow>>

function serializeTemplate(
  t: TemplateRaw & {
    organization?: { name: string } | null
    options?: { id: string; value: string; position: number }[]
    _count?: { serviceRequirements: number }
  }
): ConditionTemplateDTO {
  return {
    id: t.id,
    scope: t.scope as ConditionScope,
    organizationId: t.organizationId,
    organizationName: t.organization?.name ?? null,
    conditionType: t.conditionType as ConditionType,
    code: t.code,
    title: t.title,
    description: t.description,
    profileFieldKey: t.profileFieldKey,
    documentType: t.documentType,
    validationMin: t.validationMin,
    validationMax: t.validationMax,
    validityMonths: t.validityMonths,
    isRepeatable: t.isRepeatable,
    isActive: t.isActive,
    attachmentCount: t._count?.serviceRequirements ?? 0,
    options: (t.options ?? []).map((o) => ({
      id: o.id,
      value: o.value,
      position: o.position,
    })),
    createdAt: t.createdAt.toISOString(),
  }
}

const templateInclude = {
  organization: { select: { name: true } },
  options: { orderBy: { position: 'asc' as const } },
  _count: { select: { serviceRequirements: true } },
} as const

// ── Template validation ─────────────────────────────────────────────────────

export interface ConditionTemplateInput {
  scope?: ConditionScope
  organizationId?: string | null
  conditionType: ConditionType
  code?: string | null
  title: string
  description?: string | null
  profileFieldKey?: string | null
  documentType?: string | null
  validationMin?: number | null
  validationMax?: number | null
  validityMonths?: number | null
  isRepeatable?: boolean
  options?: string[]
}

/** Type-specific field rules (§3.5) — throws on malformed combos. */
function assertTemplateShape(input: ConditionTemplateInput): void {
  const { conditionType } = input
  if (conditionType === 'PROFILE_FIELD') {
    if (!input.profileFieldKey || !PROFILE_FIELD_KEYS.includes(input.profileFieldKey as never)) {
      throw new FinancingError('PROFILE_FIELD conditions need a valid profileFieldKey (closed set)')
    }
  }
  if (conditionType === 'DOCUMENT') {
    if (!input.documentType || !DOCUMENT_TYPES.includes(input.documentType as never)) {
      throw new FinancingError('DOCUMENT conditions need a valid documentType')
    }
  }
  if (conditionType === 'SELECT' || conditionType === 'MULTI_SELECT') {
    if (!input.options || input.options.length < 2) {
      throw new FinancingError('SELECT/MULTI_SELECT conditions need at least two options')
    }
  }
  if (conditionType !== 'SELECT' && conditionType !== 'MULTI_SELECT' && input.options?.length) {
    throw new FinancingError('Only SELECT/MULTI_SELECT conditions carry options')
  }
  if (conditionType === 'NUMBER' && input.validationMin != null && input.validationMax != null) {
    if (Number(input.validationMin) > Number(input.validationMax)) {
      throw new FinancingError('validationMin cannot exceed validationMax')
    }
  }
}

/** code is globally unique when set (service-layer guard). */
async function assertCodeUnique(code: string | null | undefined, ignoreId?: string): Promise<void> {
  if (!code?.trim()) return
  const clash = await db.conditionTemplate.findFirst({
    where: { code: code.trim(), ...(ignoreId ? { id: { not: ignoreId } } : {}) },
    select: { id: true, title: true },
  })
  if (clash) throw new FinancingError(`Condition code “${code.trim()}” is already used by “${clash.title}”`, 409)
}

// ── Queries ─────────────────────────────────────────────────────────────────

/**
 * The composer's visible library (R-5): GENERAL active templates + the caller's
 * own org's FINANCIER templates (active and inactive — staff manage their own).
 * Financier scope is resolved from OrganizationMember (DP-1).
 */
export async function listVisibleConditionTemplates(
  userId: string,
  _actorRole: string,
  filter?: { search?: string; conditionType?: string; includeInactive?: boolean }
): Promise<ConditionTemplateDTO[]> {
  const search = filter?.search?.trim()
  const textWhere = search
    ? {
        OR: [
          { title: { contains: search } },
          { code: { contains: search } },
          { description: { contains: search } },
        ],
      }
    : {}
  const typeWhere = filter?.conditionType ? { conditionType: filter.conditionType } : {}

  // TENANT-AUDIT F-01: the legacy User.role === 'ADMIN' branch is replaced by
  // an explicit RBAC capability — holders of the shared-library curation
  // permission see the full GENERAL library (active + inactive).
  const isLibraryManager = await userHasPlatformPermission(userId, 'financing.requirements.manage')
  let where: Record<string, unknown>
  if (isLibraryManager) {
    // Platform library manager sees the full GENERAL library
    where = {
      scope: 'GENERAL',
      ...(filter?.includeInactive ? {} : { isActive: true }),
      ...typeWhere,
      ...textWhere,
    }
  } else {
    // Unified with getFinancierContext (FIN-003): resolve the caller's
    // financier org the same way the console does — profile auto-provision
    // included — instead of a raw first-membership lookup that 403-ed
    // multi-org users whose first org predates its profile.
    const ctx = await requireFinancierContext(userId)
    // GENERAL active + own FINANCIER (any active state — staff manage their own)
    where = {
      ...typeWhere,
      ...textWhere,
      OR: [
        { scope: 'GENERAL', isActive: true },
        { scope: 'FINANCIER', organizationId: ctx.organizationId },
      ],
    }
  }

  const rows = await db.conditionTemplate.findMany({
    where,
    include: templateInclude,
    orderBy: [{ scope: 'asc' }, { title: 'asc' }],
    take: 300,
  })
  return rows.map((r) => serializeTemplate(r as never))
}

// TENANT-AUDIT F-09: this getter is internal-only (instantiate/render paths
// below) — deliberately NOT exported so no route can list/fetch templates
// without the scope guards on the exported CRUD surface.
async function getConditionTemplate(templateId: string): Promise<ConditionTemplateDTO> {
  const row = await db.conditionTemplate.findUnique({
    where: { id: templateId },
    include: templateInclude,
  })
  if (!row) throw new FinancingError('Condition template not found', 404)
  return serializeTemplate(row as never)
}

// ── Template CRUD (scope-guarded) ───────────────────────────────────────────

export async function createConditionTemplate(
  actor: { id: string; role: string },
  input: ConditionTemplateInput
): Promise<ConditionTemplateDTO> {
  assertTemplateShape(input)
  await assertCodeUnique(input.code)

  let scope: ConditionScope
  let organizationId: string | null = null
  if (!input.scope || input.scope === 'GENERAL') {
    // GENERAL = the platform-curated library — admin-only (R-5 / DP-24)
    if (!(await userHasPlatformPermission(actor.id, 'financing.requirements.manage'))) throw new FinancingError('Only platform staff with the "financing.requirements.manage" permission manage the GENERAL library', 403)
    scope = 'GENERAL'
  } else {
    // FINANCIER = private to the caller's financier org (org-scoped, DP-1)
    const requirements = await resolvePanel('financingRequirements')
    if (!requirements.allowFinancierCustomConditions) {
      throw new FinancingError('Financier-specific conditions are disabled by the platform', 403)
    }
    const ctx = await requireFinancierContext(actor.id)
    scope = 'FINANCIER'
    organizationId = ctx.organizationId
  }

  const created = await db.conditionTemplate.create({
    data: {
      scope,
      organizationId,
      conditionType: input.conditionType,
      code: input.code?.trim() || null,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      profileFieldKey: input.conditionType === 'PROFILE_FIELD' ? input.profileFieldKey! : null,
      documentType: input.conditionType === 'DOCUMENT' ? input.documentType! : null,
      validationMin: input.conditionType === 'NUMBER' ? (input.validationMin ?? null) : null,
      validationMax: input.conditionType === 'NUMBER' ? (input.validationMax ?? null) : null,
      validityMonths: input.validityMonths ?? null,
      isRepeatable: input.conditionType === 'DOCUMENT' ? (input.isRepeatable ?? false) : false,
      createdById: actor.id,
      options: input.options?.length
        ? { create: input.options.map((value, position) => ({ value: value.trim(), position })) }
        : undefined,
    },
    include: templateInclude,
  })

  await recordAudit({
    actorId: actor.id,
    actorType: 'ADMIN', // TENANT-AUDIT RISK-6: template CRUD is RBAC-gated — label the fact, not the legacy User.role badge
    action: 'CONDITION_TEMPLATE_CREATED',
    entityType: 'ConditionTemplate',
    entityId: created.id,
    summary: `${scope} condition “${created.title}” (${created.conditionType}) created`,
    metadata: { scope, organizationId, conditionType: created.conditionType },
  })
  return serializeTemplate(created as never)
}

export async function updateConditionTemplate(
  actor: { id: string; role: string },
  templateId: string,
  input: Partial<ConditionTemplateInput> & { isActive?: boolean }
): Promise<ConditionTemplateDTO> {
  const existing = await db.conditionTemplate.findUnique({
    where: { id: templateId },
    include: { _count: { select: { serviceRequirements: true } } },
  })
  if (!existing) throw new FinancingError('Condition template not found', 404)
  await assertTemplateAccess(actor, existing.scope, existing.organizationId)

  // The 8 kinds shape the answer columns — never retype an attached condition
  const nextType = (input.conditionType ?? existing.conditionType) as ConditionType
  if (input.conditionType && input.conditionType !== existing.conditionType) {
    if (existing._count.serviceRequirements > 0) {
      throw new FinancingError('This condition is attached to services — its type cannot change', 409)
    }
  }
  if (input.code !== undefined) await assertCodeUnique(input.code, templateId)

  assertTemplateShape({
    conditionType: nextType,
    title: input.title ?? existing.title,
    profileFieldKey: input.profileFieldKey ?? existing.profileFieldKey,
    documentType: input.documentType ?? existing.documentType,
    validationMin: input.validationMin ?? existing.validationMin,
    validationMax: input.validationMax ?? existing.validationMax,
    options: input.options,
  })

  const data: Record<string, unknown> = {
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
    ...(input.code !== undefined ? { code: input.code?.trim() || null } : {}),
    ...(input.conditionType !== undefined ? { conditionType: nextType } : {}),
    ...(input.profileFieldKey !== undefined
      ? { profileFieldKey: nextType === 'PROFILE_FIELD' ? input.profileFieldKey : null }
      : {}),
    ...(input.documentType !== undefined
      ? { documentType: nextType === 'DOCUMENT' ? input.documentType : null }
      : {}),
    ...(input.validationMin !== undefined ? { validationMin: input.validationMin ?? null } : {}),
    ...(input.validationMax !== undefined ? { validationMax: input.validationMax ?? null } : {}),
    ...(input.validityMonths !== undefined ? { validityMonths: input.validityMonths ?? null } : {}),
    ...(input.isRepeatable !== undefined ? { isRepeatable: input.isRepeatable } : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    ...(input.options
      ? {
          options: {
            deleteMany: {},
            create: input.options.map((value, position) => ({ value: value.trim(), position })),
          },
        }
      : {}),
  }
  const updated = await db.conditionTemplate.update({
    where: { id: templateId },
    data,
    include: templateInclude,
  })

  await recordAudit({
    actorId: actor.id,
    actorType: 'ADMIN', // TENANT-AUDIT RISK-6: template CRUD is RBAC-gated — label the fact, not the legacy User.role badge
    action: 'CONDITION_TEMPLATE_UPDATED',
    entityType: 'ConditionTemplate',
    entityId: templateId,
    summary: `Condition “${updated.title}” updated`,
    metadata: { scope: updated.scope },
  })
  return serializeTemplate(updated as never)
}

/** Activate / deactivate (submissions preserved — R-2 single entry keeps history). */
export async function setConditionTemplateActive(
  actor: { id: string; role: string },
  templateId: string,
  isActive: boolean
): Promise<ConditionTemplateDTO> {
  const existing = await db.conditionTemplate.findUnique({ where: { id: templateId } })
  if (!existing) throw new FinancingError('Condition template not found', 404)
  await assertTemplateAccess(actor, existing.scope, existing.organizationId)
  const updated = await db.conditionTemplate.update({
    where: { id: templateId },
    data: { isActive },
    include: templateInclude,
  })
  await recordAudit({
    actorId: actor.id,
    actorType: 'ADMIN', // TENANT-AUDIT RISK-6: template CRUD is RBAC-gated — label the fact, not the legacy User.role badge
    action: 'CONDITION_TEMPLATE_UPDATED',
    entityType: 'ConditionTemplate',
    entityId: templateId,
    summary: `Condition “${existing.title}” ${isActive ? 'activated' : 'deactivated'}`,
    metadata: { isActive },
  })
  return serializeTemplate(updated as never)
}

/** Scope guard: GENERAL → platform admin; FINANCIER → OWNER/ADMIN of the owning org.
 * (Phase 10 fix: this was a latent TS1308 — `await` in a non-async function —
 * that made the module uncompilable by SWC and silently skipped the FINANCIER
 * membership check at the two un-awaited call sites below.) */
async function assertTemplateAccess(
  actor: { id: string; role: string },
  scope: string,
  organizationId: string | null
): Promise<void> {
  if (scope === 'GENERAL') {
    if (!(await userHasPlatformPermission(actor.id, 'financing.requirements.manage'))) {
      throw new FinancingError('Only platform admins manage the GENERAL library', 403)
    }
    return
  }
  if (!organizationId) throw new FinancingError('Malformed financier condition', 500)
  // TENANT-AUDIT F-03: M2 ACTIVE predicate — suspended institutions cannot
  // mutate their condition templates via direct ids.
  const m = await db.organizationMember.findFirst({
    where: {
      userId: actor.id,
      organizationId,
      role: { in: ['OWNER', 'ADMIN'] },
      user: { status: 'ACTIVE' },
      organization: { status: 'ACTIVE' },
    },
  })
  if (!m) throw new FinancingError('Access denied', 403)
}

// ── ConditionOption child management (R-1: options are rows, never JSON) ────

export async function addConditionOption(
  actor: { id: string; role: string },
  templateId: string,
  value: string
): Promise<ConditionTemplateDTO> {
  const existing = await db.conditionTemplate.findUnique({ where: { id: templateId } })
  if (!existing) throw new FinancingError('Condition template not found', 404)
  if (!['SELECT', 'MULTI_SELECT'].includes(existing.conditionType)) {
    throw new FinancingError('Only SELECT/MULTI_SELECT conditions carry options')
  }
  await assertTemplateAccess(actor, existing.scope, existing.organizationId)
  const clean = value.trim()
  if (!clean) throw new FinancingError('Option value cannot be empty')
  const clash = await db.conditionOption.findFirst({ where: { conditionTemplateId: templateId, value: clean } })
  if (clash) throw new FinancingError('That option already exists on this condition', 409)
  const max = await db.conditionOption.findFirst({
    where: { conditionTemplateId: templateId },
    orderBy: { position: 'desc' },
    select: { position: true },
  })
  await db.conditionOption.create({
    data: { conditionTemplateId: templateId, value: clean, position: (max?.position ?? -1) + 1 },
  })
  return getConditionTemplate(templateId)
}

export async function removeConditionOption(
  actor: { id: string; role: string },
  templateId: string,
  optionId: string
): Promise<ConditionTemplateDTO> {
  const existing = await db.conditionTemplate.findUnique({ where: { id: templateId } })
  if (!existing) throw new FinancingError('Condition template not found', 404)
  await assertTemplateAccess(actor, existing.scope, existing.organizationId)
  await db.conditionOption.deleteMany({ where: { id: optionId, conditionTemplateId: templateId } })
  return getConditionTemplate(templateId)
}

// ── ServiceRequirement attach / update / detach ────────────────────────────

export interface AttachRequirementInput {
  serviceId: string
  conditionTemplateId: string
  isRequired?: boolean
  displayOrder?: number
  instructions?: string | null
  autoPassAccredited?: boolean
}

export async function attachServiceRequirement(
  userId: string,
  input: AttachRequirementInput
): Promise<ServiceRequirementDTO> {
  const { organizationId } = await assertFinancierStaffOfService(userId, input.serviceId)

  const template = await db.conditionTemplate.findUnique({ where: { id: input.conditionTemplateId } })
  if (!template) throw new FinancingError('Condition template not found', 404)
  if (template.scope === 'FINANCIER' && template.organizationId !== organizationId) {
    throw new FinancingError('That condition belongs to another financier', 403)
  }
  if (!template.isActive) throw new FinancingError('Inactive conditions cannot be attached', 409)

  const requirements = await resolvePanel('financingRequirements')
  const cap = Number(requirements.maxRequirementsPerService) || 40
  const activeCount = await db.serviceRequirement.count({
    where: { serviceId: input.serviceId, isActive: true },
  })
  if (activeCount >= cap) {
    throw new FinancingError(
      `This service already has ${activeCount} active requirements (platform cap: ${cap})`,
      409
    )
  }

  const existing = await db.serviceRequirement.findUnique({
    where: { serviceId_conditionTemplateId: { serviceId: input.serviceId, conditionTemplateId: input.conditionTemplateId } },
  })
  if (existing?.isActive) throw new FinancingError('That condition is already attached', 409)

  const requirement = existing
    ? await db.serviceRequirement.update({
        where: { id: existing.id },
        data: {
          isRequired: input.isRequired ?? true,
          displayOrder: input.displayOrder ?? existing.displayOrder,
          instructions: input.instructions?.trim() || null,
          autoPassAccredited: input.autoPassAccredited ?? false,
          isActive: true,
        },
        include: { conditionTemplate: { include: templateInclude } },
      })
    : await db.serviceRequirement.create({
        data: {
          serviceId: input.serviceId,
          conditionTemplateId: input.conditionTemplateId,
          isRequired: input.isRequired ?? true,
          displayOrder: input.displayOrder ?? activeCount,
          instructions: input.instructions?.trim() || null,
          autoPassAccredited: input.autoPassAccredited ?? false,
        },
        include: { conditionTemplate: { include: templateInclude } },
      })

  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'SERVICE_REQUIREMENT_ATTACHED',
    entityType: 'ServiceRequirement',
    entityId: requirement.id,
    summary: `Condition “${template.title}” attached (${requirement.isRequired ? 'required' : 'optional'})`,
    metadata: { serviceId: input.serviceId, conditionTemplateId: template.id, scope: template.scope },
  })
  return serializeRequirement(requirement as never)
}

export async function updateServiceRequirement(
  userId: string,
  requirementId: string,
  input: {
    isRequired?: boolean
    displayOrder?: number
    instructions?: string | null
    autoPassAccredited?: boolean
    isActive?: boolean
  }
): Promise<ServiceRequirementDTO> {
  const existing = await db.serviceRequirement.findUnique({
    where: { id: requirementId },
    include: { service: { include: { financierProfile: true } } },
  })
  if (!existing) throw new FinancingError('Requirement not found', 404)
  await assertFinancierStaffOfService(userId, existing.serviceId)

  const updated = await db.serviceRequirement.update({
    where: { id: requirementId },
    data: {
      ...(input.isRequired !== undefined ? { isRequired: input.isRequired } : {}),
      ...(input.displayOrder !== undefined ? { displayOrder: input.displayOrder } : {}),
      ...(input.instructions !== undefined ? { instructions: input.instructions?.trim() || null } : {}),
      ...(input.autoPassAccredited !== undefined ? { autoPassAccredited: input.autoPassAccredited } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
    include: { conditionTemplate: { include: templateInclude } },
  })

  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'SERVICE_REQUIREMENT_UPDATED',
    entityType: 'ServiceRequirement',
    entityId: requirementId,
    summary: `Requirement “${updated.conditionTemplate.title}” updated`,
    metadata: { serviceId: existing.serviceId, ...input },
  })
  return serializeRequirement(updated as never)
}

/**
 * Detach = soft-deactivate. Submissions are preserved (the schema cascades a
 * hard delete into RequirementSubmission — history must survive, R-2/DP-15).
 */
export async function detachServiceRequirement(
  userId: string,
  requirementId: string
): Promise<{ ok: true }> {
  const existing = await db.serviceRequirement.findUnique({
    where: { id: requirementId },
    include: { conditionTemplate: true },
  })
  if (!existing) throw new FinancingError('Requirement not found', 404)
  await assertFinancierStaffOfService(userId, existing.serviceId)
  await db.serviceRequirement.update({ where: { id: requirementId }, data: { isActive: false } })
  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'SERVICE_REQUIREMENT_DETACHED',
    entityType: 'ServiceRequirement',
    entityId: requirementId,
    summary: `Condition “${existing.conditionTemplate.title}” detached (submissions preserved)`,
    metadata: { serviceId: existing.serviceId },
  })
  return { ok: true }
}

// ── Requirement serialization ────────────────────────────────────────────────

type RequirementRaw = Awaited<ReturnType<typeof db.serviceRequirement.findFirstOrThrow>>

function serializeRequirement(
  r: RequirementRaw & { conditionTemplate: TemplateRaw & Parameters<typeof serializeTemplate>[0] }
): ServiceRequirementDTO {
  return {
    id: r.id,
    serviceId: r.serviceId,
    conditionTemplateId: r.conditionTemplateId,
    isRequired: r.isRequired,
    displayOrder: r.displayOrder,
    instructions: r.instructions,
    autoPassAccredited: r.autoPassAccredited,
    isActive: r.isActive,
    template: serializeTemplate(r.conditionTemplate),
  }
}

/** Ordered active requirements of a service (checklist preview for applicants). */
export async function listServiceRequirements(serviceId: string): Promise<ServiceRequirementDTO[]> {
  const rows = await db.serviceRequirement.findMany({
    where: { serviceId, isActive: true },
    include: { conditionTemplate: { include: templateInclude } },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  })
  return rows.map((r) => serializeRequirement(r as never))
}
