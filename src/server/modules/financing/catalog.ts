import { db } from '@/lib/db'
import { recordAudit } from '@/server/modules/audit/service'
import { assertServiceOwnership, type FinancierStaffContext } from './guards'
import { composeServiceChecklist } from './conditions'
import { serializeAccountDocument } from './documents'
import { serializeSubmission, SUBMISSION_INCLUDE, type SubmissionDTO } from './submissions'
import { getFinancingRequestDetail, listAdminGateQueue } from './requests'
import { getAccreditationDetail } from './accreditation'  // (userId, requestId, actorRole)
import type {
  Actor,
  BranchCreatePayload,
  BranchUpdatePayload,
  ServiceCreatePayload,
  ServiceUpdatePayload,
} from './types'
import { ACCREDITATION_VISIBLE_STATUSES, FINANCIER_VISIBLE_STATUSES } from './types'

/**
 * FINANCING CATALOG (FIN-4 route-layer companion — NEW file, no existing
 * service module touched).
 * ─────────────────────────────────────────────────────────────────────────
 * The FIN-2/3 services own conditions, documents, submissions, request
 * lifecycles, accreditation and offers. The remaining read/CRUD surface the
 * API routes need (financier services / branches / profile, the public
 * services directory, the financier dashboard, the admin institutions list
 * and the admin dossier assembly) lives here, following the same conventions:
 * typed errors with `status`, guards via ./guards, audit on every write.
 */

export class FinancingCatalogError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

/**
 * Map any financing-module error (all classes share the { status } shape) to
 * an HTTP payload — the FIN-4 counterpart of the per-route
 * `err instanceof XServiceError` checks used by the rfq routes.
 */
export function financingError(err: unknown): { message: string; status: number } | null {
  if (err instanceof Error && typeof (err as { status?: unknown }).status === 'number') {
    return { message: err.message, status: (err as unknown as { status: number }).status }
  }
  return null
}

// ── FinancierService serialization ──────────────────────────────────────────

type ServiceRow = {
  id: string
  serviceKind: string
  category: string
  name: string
  summary: string | null
  description: string | null
  targetSegment: string | null
  status: string
  currency: string
  amountMin: { toNumber(): number } | null
  amountMax: { toNumber(): number } | null
  rateType: string | null
  rateMax: { toNumber(): number } | null
  feeFlat: { toNumber(): number } | null
  tenorMinMonths: number | null
  tenorMaxMonths: number | null
  repaymentFrequency: string | null
  gracePeriodDays: number | null
  shariaCompliant: boolean
  processingDays: number | null
  accreditationValidMonths: number | null
  accreditationFeeAmount: { toNumber(): number } | null
  viewCount: number
  createdAt: Date
  updatedAt: Date
  attributes: { id: string; kind: string; position: number; text: string }[]
  coverage: { id: string; regionName: string }[]
  _count?: { requirements: number; financingRequests: number; accreditationRequests: number }
}

export type FinancierServiceDTO = {
  id: string
  serviceKind: string
  category: string
  name: string
  summary: string | null
  description: string | null
  targetSegment: string | null
  status: string
  currency: string
  amountMin: number | null
  amountMax: number | null
  rateType: string | null
  rateMax: number | null
  feeFlat: number | null
  tenorMinMonths: number | null
  tenorMaxMonths: number | null
  repaymentFrequency: string | null
  gracePeriodDays: number | null
  shariaCompliant: boolean
  processingDays: number | null
  accreditationValidMonths: number | null
  accreditationFeeAmount: number | null
  viewCount: number
  attributes: { id: string; kind: string; position: number; text: string }[]
  coverage: { id: string; regionName: string }[]
  requirementCount: number
  requestCount: number
  createdAt: string
  updatedAt: string
}

function serializeService(s: ServiceRow): FinancierServiceDTO {
  return {
    id: s.id,
    serviceKind: s.serviceKind,
    category: s.category,
    name: s.name,
    summary: s.summary,
    description: s.description,
    targetSegment: s.targetSegment,
    status: s.status,
    currency: s.currency,
    amountMin: s.amountMin === null ? null : Number(s.amountMin),
    amountMax: s.amountMax === null ? null : Number(s.amountMax),
    rateType: s.rateType,
    rateMax: s.rateMax === null ? null : Number(s.rateMax),
    feeFlat: s.feeFlat === null ? null : Number(s.feeFlat),
    tenorMinMonths: s.tenorMinMonths,
    tenorMaxMonths: s.tenorMaxMonths,
    repaymentFrequency: s.repaymentFrequency,
    gracePeriodDays: s.gracePeriodDays,
    shariaCompliant: s.shariaCompliant,
    processingDays: s.processingDays,
    accreditationValidMonths: s.accreditationValidMonths,
    accreditationFeeAmount: s.accreditationFeeAmount === null ? null : Number(s.accreditationFeeAmount),
    viewCount: s.viewCount,
    attributes: [...s.attributes].sort((a, b) => a.position - b.position).map((a) => ({ id: a.id, kind: a.kind, position: a.position, text: a.text })),
    coverage: [...s.coverage].sort((a, b) => a.regionName.localeCompare(b.regionName)).map((c) => ({ id: c.id, regionName: c.regionName })),
    requirementCount: s._count?.requirements ?? 0,
    requestCount: (s._count?.financingRequests ?? 0) + (s._count?.accreditationRequests ?? 0),
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }
}

const SERVICE_INCLUDE = {
  attributes: true,
  coverage: true,
  _count: {
    select: {
      requirements: { where: { isActive: true } },
      financingRequests: true,
      accreditationRequests: true,
    },
  },
} as const

// ── Financier console: own services ────────────────────────────────────────

/** The financier's own catalog (all statuses — the console shows drafts too). */
export async function listFinancierServices(staff: FinancierStaffContext): Promise<FinancierServiceDTO[]> {
  const rows = await db.financierService.findMany({
    where: { financierProfileId: staff.profile.id },
    include: SERVICE_INCLUDE,
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  })
  return rows.map(serializeService)
}

const ACCREDITATION_CATEGORIES = ['SUPPLIER_QUALIFICATION', 'VENDOR_APPROVAL'] as const

export async function createFinancierService(
  staff: FinancierStaffContext,
  payload: ServiceCreatePayload
): Promise<FinancierServiceDTO> {
  if (payload.serviceKind === 'ACCREDITATION' && !ACCREDITATION_CATEGORIES.includes(payload.category as never)) {
    throw new FinancingCatalogError(
      'Accreditation programs must use the SUPPLIER_QUALIFICATION or VENDOR_APPROVAL category'
    )
  }

  const service = await db.financierService.create({
    data: {
      financierProfileId: staff.profile.id,
      serviceKind: payload.serviceKind,
      category: payload.category,
      name: payload.name,
      summary: payload.summary ?? null,
      description: payload.description ?? null,
      targetSegment: payload.targetSegment ?? null,
      status: payload.status ?? 'DRAFT',
      currency: payload.currency,
      amountMin: payload.amountMin ?? null,
      amountMax: payload.amountMax ?? null,
      rateType: payload.rateType ?? null,
      rateMax: payload.rateMax ?? null,
      feeFlat: payload.feeFlat ?? null,
      tenorMinMonths: payload.tenorMinMonths ?? null,
      tenorMaxMonths: payload.tenorMaxMonths ?? null,
      repaymentFrequency: payload.repaymentFrequency ?? null,
      gracePeriodDays: payload.gracePeriodDays ?? null,
      shariaCompliant: payload.shariaCompliant ?? false,
      processingDays: payload.processingDays ?? null,
      accreditationValidMonths: payload.accreditationValidMonths ?? null,
      accreditationFeeAmount: payload.accreditationFeeAmount ?? null,
      attributes: payload.attributes
        ? { create: payload.attributes.map((a, i) => ({ kind: a.kind, text: a.text, position: i })) }
        : undefined,
      coverage: payload.coverage
        ? { create: payload.coverage.map((regionName) => ({ regionName })) }
        : undefined,
    },
    include: SERVICE_INCLUDE,
  })

  await recordAudit({
    actorId: staff.member.userId,
    actorType: 'USER',
    action: 'FINANCIER_SERVICE_CREATED',
    entityType: 'FinancierService',
    entityId: service.id,
    summary: `${payload.serviceKind} service “${service.name}” created (${payload.status ?? 'DRAFT'})`,
  })
  return serializeService(service)
}

export async function updateFinancierService(
  staff: FinancierStaffContext,
  serviceId: string,
  payload: ServiceUpdatePayload
): Promise<FinancierServiceDTO> {
  const existing = await db.financierService.findUnique({
    where: { id: serviceId },
    select: { id: true, financierProfileId: true, name: true },
  })
  if (!existing) throw new FinancingCatalogError('Service not found', 404)
  assertServiceOwnership(staff.profile.id, existing)

  if (payload.serviceKind === 'ACCREDITATION' && payload.category && !ACCREDITATION_CATEGORIES.includes(payload.category as never)) {
    throw new FinancingCatalogError(
      'Accreditation programs must use the SUPPLIER_QUALIFICATION or VENDOR_APPROVAL category'
    )
  }

  // Attributes and coverage are replaced wholesale when supplied (rows, R-1).
  const updated = await db.$transaction(async (tx) => {
    if (payload.attributes) {
      await tx.financierServiceAttribute.deleteMany({ where: { serviceId } })
      if (payload.attributes.length > 0) {
        await tx.financierServiceAttribute.createMany({
          data: payload.attributes.map((a, i) => ({ serviceId, kind: a.kind, text: a.text, position: i })),
        })
      }
    }
    if (payload.coverage) {
      await tx.financierServiceCoverage.deleteMany({ where: { serviceId } })
      if (payload.coverage.length > 0) {
        await tx.financierServiceCoverage.createMany({
          data: payload.coverage.map((regionName) => ({ serviceId, regionName })),
        })
      }
    }
    return tx.financierService.update({
      where: { id: serviceId },
      data: {
        serviceKind: payload.serviceKind ?? undefined,
        category: payload.category ?? undefined,
        name: payload.name ?? undefined,
        summary: payload.summary ?? undefined,
        description: payload.description ?? undefined,
        targetSegment: payload.targetSegment ?? undefined,
        status: payload.status ?? undefined,
        currency: payload.currency ?? undefined,
        amountMin: payload.amountMin ?? undefined,
        amountMax: payload.amountMax ?? undefined,
        rateType: payload.rateType ?? undefined,
        rateMax: payload.rateMax ?? undefined,
        feeFlat: payload.feeFlat ?? undefined,
        tenorMinMonths: payload.tenorMinMonths ?? undefined,
        tenorMaxMonths: payload.tenorMaxMonths ?? undefined,
        repaymentFrequency: payload.repaymentFrequency ?? undefined,
        gracePeriodDays: payload.gracePeriodDays ?? undefined,
        shariaCompliant: payload.shariaCompliant ?? undefined,
        processingDays: payload.processingDays ?? undefined,
        accreditationValidMonths: payload.accreditationValidMonths ?? undefined,
        accreditationFeeAmount: payload.accreditationFeeAmount ?? undefined,
      },
      include: SERVICE_INCLUDE,
    })
  })

  await recordAudit({
    actorId: staff.member.userId,
    actorType: 'USER',
    action: 'FINANCIER_SERVICE_UPDATED',
    entityType: 'FinancierService',
    entityId: serviceId,
    summary: `Service “${updated.name}” updated${payload.status === 'ARCHIVED' ? ' (ARCHIVED)' : payload.status ? ` (status ${payload.status})` : ''}`,
  })
  return serializeService(updated)
}

// ── Financier console: branches ─────────────────────────────────────────────

type BranchRow = {
  id: string
  name: string
  kind: string
  street: string | null
  city: string | null
  district: string | null
  latitude: { toNumber(): number } | null
  longitude: { toNumber(): number } | null
  phone: string | null
  isActive: boolean
  position: number
  createdAt: Date
}

export type FinancierBranchDTO = {
  id: string
  name: string
  kind: string
  street: string | null
  city: string | null
  district: string | null
  latitude: number | null
  longitude: number | null
  phone: string | null
  isActive: boolean
  position: number
  createdAt: string
}

function serializeBranch(b: BranchRow): FinancierBranchDTO {
  return {
    id: b.id,
    name: b.name,
    kind: b.kind,
    street: b.street,
    city: b.city,
    district: b.district,
    latitude: b.latitude === null ? null : Number(b.latitude),
    longitude: b.longitude === null ? null : Number(b.longitude),
    phone: b.phone,
    isActive: b.isActive,
    position: b.position,
    createdAt: b.createdAt.toISOString(),
  }
}

export async function listBranches(staff: FinancierStaffContext): Promise<FinancierBranchDTO[]> {
  const rows = await db.financierBranch.findMany({
    where: { financierProfileId: staff.profile.id },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  })
  return rows.map(serializeBranch)
}

export async function createBranch(
  staff: FinancierStaffContext,
  payload: BranchCreatePayload
): Promise<FinancierBranchDTO> {
  const branch = await db.financierBranch.create({
    data: {
      financierProfileId: staff.profile.id,
      name: payload.name,
      kind: payload.kind,
      street: payload.street ?? null,
      city: payload.city ?? null,
      district: payload.district ?? null,
      latitude: payload.latitude ?? null,
      longitude: payload.longitude ?? null,
      phone: payload.phone ?? null,
      isActive: payload.isActive ?? true,
      position: payload.position ?? 0,
    },
  })
  await recordAudit({
    actorId: staff.member.userId,
    actorType: 'USER',
    action: 'FINANCIER_BRANCH_CREATED',
    entityType: 'FinancierBranch',
    entityId: branch.id,
    summary: `${payload.kind} “${payload.name}” added`,
  })
  return serializeBranch(branch)
}

async function loadOwnBranch(staff: FinancierStaffContext, branchId: string) {
  const branch = await db.financierBranch.findUnique({ where: { id: branchId } })
  if (!branch) throw new FinancingCatalogError('Branch not found', 404)
  if (branch.financierProfileId !== staff.profile.id) {
    throw new FinancingCatalogError('This branch belongs to another financier', 403)
  }
  return branch
}

export async function updateBranch(
  staff: FinancierStaffContext,
  branchId: string,
  payload: BranchUpdatePayload
): Promise<FinancierBranchDTO> {
  await loadOwnBranch(staff, branchId)
  const updated = await db.financierBranch.update({
    where: { id: branchId },
    data: {
      name: payload.name ?? undefined,
      kind: payload.kind ?? undefined,
      street: payload.street ?? undefined,
      city: payload.city ?? undefined,
      district: payload.district ?? undefined,
      latitude: payload.latitude ?? undefined,
      longitude: payload.longitude ?? undefined,
      phone: payload.phone ?? undefined,
      isActive: payload.isActive ?? undefined,
      position: payload.position ?? undefined,
    },
  })
  await recordAudit({
    actorId: staff.member.userId,
    actorType: 'USER',
    action: 'FINANCIER_BRANCH_UPDATED',
    entityType: 'FinancierBranch',
    entityId: branchId,
    summary: `Branch “${updated.name}” updated`,
  })
  return serializeBranch(updated)
}

/** Deactivate (soft) — branches are config rows, history stays consistent. */
export async function deactivateBranch(staff: FinancierStaffContext, branchId: string): Promise<void> {
  const branch = await loadOwnBranch(staff, branchId)
  await db.financierBranch.update({ where: { id: branch.id }, data: { isActive: false } })
  await recordAudit({
    actorId: staff.member.userId,
    actorType: 'USER',
    action: 'FINANCIER_BRANCH_DEACTIVATED',
    entityType: 'FinancierBranch',
    entityId: branch.id,
    summary: `Branch “${branch.name}” deactivated`,
  })
}

// ── Financier console: profile ──────────────────────────────────────────────

export type FinancierProfileDTO = {
  id: string
  about: string | null
  licenseNumber: string | null
  regulator: string | null
  logoUrl: string | null
  contactEmail: string | null
  contactPhone: string | null
  minTicket: number | null
  maxTicket: number | null
  organization: { id: string; name: string; orgType: string; status: string }
  branchCount: number
  serviceCount: number
}

export async function getFinancierProfile(staff: FinancierStaffContext): Promise<FinancierProfileDTO> {
  const [branches, services] = await Promise.all([
    db.financierBranch.count({ where: { financierProfileId: staff.profile.id, isActive: true } }),
    db.financierService.count({ where: { financierProfileId: staff.profile.id } }),
  ])
  return {
    id: staff.profile.id,
    about: staff.profile.about,
    licenseNumber: staff.profile.licenseNumber,
    regulator: staff.profile.regulator,
    logoUrl: staff.profile.logoUrl,
    contactEmail: staff.profile.contactEmail,
    contactPhone: staff.profile.contactPhone,
    minTicket: staff.profile.minTicket === null ? null : Number(staff.profile.minTicket),
    maxTicket: staff.profile.maxTicket === null ? null : Number(staff.profile.maxTicket),
    organization: {
      id: staff.organization.id,
      name: staff.organization.name,
      orgType: staff.organization.orgType,
      status: staff.organization.status,
    },
    branchCount: branches,
    serviceCount: services,
  }
}

export interface ProfileUpdatePayload {
  about?: string | null
  licenseNumber?: string | null
  regulator?: string | null
  logoUrl?: string | null
  contactEmail?: string | null
  contactPhone?: string | null
  minTicket?: number | null
  maxTicket?: number | null
}

export async function updateFinancierProfile(
  staff: FinancierStaffContext,
  payload: ProfileUpdatePayload
): Promise<FinancierProfileDTO> {
  if (
    payload.minTicket != null &&
    payload.maxTicket != null &&
    payload.minTicket > payload.maxTicket
  ) {
    throw new FinancingCatalogError('minTicket cannot exceed maxTicket')
  }
  await db.financierProfile.update({
    where: { id: staff.profile.id },
    data: {
      about: payload.about ?? undefined,
      licenseNumber: payload.licenseNumber ?? undefined,
      regulator: payload.regulator ?? undefined,
      logoUrl: payload.logoUrl ?? undefined,
      contactEmail: payload.contactEmail ?? undefined,
      contactPhone: payload.contactPhone ?? undefined,
      minTicket: payload.minTicket ?? undefined,
      maxTicket: payload.maxTicket ?? undefined,
    },
  })
  await recordAudit({
    actorId: staff.member.userId,
    actorType: 'USER',
    action: 'FINANCIER_PROFILE_UPDATED',
    entityType: 'FinancierProfile',
    entityId: staff.profile.id,
    summary: `Financier profile of “${staff.organization.name}” updated`,
  })
  // Re-read for consistent serialization
  const fresh = await requireFreshProfile(staff.profile.id)
  return getFinancierProfile({ member: staff.member, organization: fresh.organization, profile: fresh })
}

async function requireFreshProfile(profileId: string) {
  const profile = await db.financierProfile.findUnique({
    where: { id: profileId },
    include: { organization: true },
  })
  if (!profile) throw new FinancingCatalogError('Financier profile not found', 404)
  return profile
}

// ── Public services directory ───────────────────────────────────────────────

export const SERVICES_PAGE_SIZE = 24

export type PublicServiceCardDTO = {
  id: string
  serviceKind: string
  category: string
  name: string
  summary: string | null
  targetSegment: string | null
  currency: string
  amountMin: number | null
  amountMax: number | null
  rateType: string | null
  rateMax: number | null
  feeFlat: number | null
  tenorMinMonths: number | null
  tenorMaxMonths: number | null
  shariaCompliant: boolean
  processingDays: number | null
  accreditationValidMonths: number | null
  accreditationFeeAmount: number | null
  features: string[]
  eligibility: string[]
  coverageCount: number
  coverageSample: string[]
  financier: { name: string; logoUrl: string | null; regulator: string | null }
}

export interface PublicListServicesArgs {
  kind?: string | null
  category?: string | null
  search?: string | null
  page?: number
}

/** Public directory: ACTIVE services of ACTIVE financier orgs, 24 per page. */
export async function publicListServices(
  args: PublicListServicesArgs
): Promise<{ services: PublicServiceCardDTO[]; total: number; page: number; pageCount: number }> {
  const page = Math.max(1, Math.floor(args.page ?? 1))
  const search = args.search?.trim()

  const where = {
    status: 'ACTIVE',
    financierProfile: { organization: { status: 'ACTIVE' } },
    ...(args.kind ? { serviceKind: args.kind } : {}),
    ...(args.category ? { category: args.category } : {}),
    ...(search
      ? { OR: [{ name: { contains: search } }, { summary: { contains: search } }, { description: { contains: search } }] }
      : {}),
  }

  const [rows, total] = await Promise.all([
    db.financierService.findMany({
      where,
      include: {
        attributes: true,
        coverage: true,
        financierProfile: { select: { logoUrl: true, regulator: true, organization: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: SERVICES_PAGE_SIZE,
      skip: (page - 1) * SERVICES_PAGE_SIZE,
    }),
    db.financierService.count({ where }),
  ])

  const services: PublicServiceCardDTO[] = rows.map((s) => ({
    id: s.id,
    serviceKind: s.serviceKind,
    category: s.category,
    name: s.name,
    summary: s.summary,
    targetSegment: s.targetSegment,
    currency: s.currency,
    amountMin: s.amountMin === null ? null : Number(s.amountMin),
    amountMax: s.amountMax === null ? null : Number(s.amountMax),
    rateType: s.rateType,
    rateMax: s.rateMax === null ? null : Number(s.rateMax),
    feeFlat: s.feeFlat === null ? null : Number(s.feeFlat),
    tenorMinMonths: s.tenorMinMonths,
    tenorMaxMonths: s.tenorMaxMonths,
    shariaCompliant: s.shariaCompliant,
    processingDays: s.processingDays,
    accreditationValidMonths: s.accreditationValidMonths,
    accreditationFeeAmount: s.accreditationFeeAmount === null ? null : Number(s.accreditationFeeAmount),
    features: s.attributes.filter((a) => a.kind === 'FEATURE').sort((a, b) => a.position - b.position).map((a) => a.text),
    eligibility: s.attributes.filter((a) => a.kind === 'ELIGIBILITY_CONDITION').sort((a, b) => a.position - b.position).map((a) => a.text),
    coverageCount: s.coverage.length,
    coverageSample: s.coverage.slice(0, 5).map((c) => c.regionName),
    financier: {
      name: s.financierProfile.organization.name,
      logoUrl: s.financierProfile.logoUrl,
      regulator: s.financierProfile.regulator,
    },
  }))

  return { services, total, page, pageCount: Math.max(1, Math.ceil(total / SERVICES_PAGE_SIZE)) }
}

export type PublicRequirementLabelDTO = {
  id: string
  conditionType: string
  title: string
  description: string | null
  isRequired: boolean
  instructions: string | null
  documentType: string | null
  profileFieldKey: string | null
  validationMin: number | null
  validationMax: number | null
  validityMonths: number | null
  isRepeatable: boolean
  autoPassAccredited: boolean
  displayOrder: number
  options: { id: string; value: string; position: number }[]
}


/** Compact template label for the public requirement list. */
function serializeTemplate(t: {
  id: string
  scope: string
  conditionType: string
  code: string | null
  title: string
  description: string | null
  documentType: string | null
  validationMin: number | null
  validationMax: number | null
  isRepeatable: boolean
  options?: { id: string; value: string; position: number }[]
}) {
  return {
    id: t.id,
    scope: t.scope,
    conditionType: t.conditionType,
    code: t.code,
    title: t.title,
    description: t.description,
    documentType: t.documentType,
    validationMin: t.validationMin,
    validationMax: t.validationMax,
    isRepeatable: t.isRepeatable,
    options: (t.options ?? []).map((o) => o.value),
  }
}

/** Compose a service checklist as LABELS ONLY — the wizard's public view. */
function toPublicRequirement(r: {
  id: string
  isRequired: boolean
  displayOrder: number
  instructions: string | null
  autoPassAccredited: boolean
  template: {
    conditionType: string
    title: string
    description: string | null
    documentType: string | null
    profileFieldKey: string | null
    validationMin: number | null
    validationMax: number | null
    validityMonths: number | null
    isRepeatable: boolean
    options: { value: string; position: number }[]
  }
}): PublicRequirementLabelDTO {
  return {
    id: r.id,
    conditionType: r.conditionTemplate.conditionType,
    title: r.conditionTemplate.title,
    description: r.conditionTemplate.description,
    isRequired: r.isRequired,
    instructions: r.instructions,
    documentType: r.conditionTemplate.documentType,
    profileFieldKey: r.conditionTemplate.profileFieldKey,
    validationMin: r.conditionTemplate.validationMin,
    validationMax: r.conditionTemplate.validationMax,
    validityMonths: r.conditionTemplate.validityMonths,
    isRepeatable: r.conditionTemplate.isRepeatable,
    autoPassAccredited: r.autoPassAccredited,
    displayOrder: r.displayOrder,
    options: [...r.template.options].sort((a, b) => a.position - b.position).map((o) => ({ value: o.value, position: o.position })),
  }
}

export async function publicGetService(id: string): Promise<
  PublicServiceCardDTO & {
    description: string | null
    coverage: string[]
    requirements: PublicRequirementLabelDTO[]
  }
> {
  const s = await db.financierService.findUnique({
    where: { id },
    include: {
      attributes: true,
      coverage: true,
      financierProfile: { select: { logoUrl: true, regulator: true, organization: { select: { name: true, status: true } } } },
    },
  })
  if (!s) throw new FinancingCatalogError('Service not found', 404)
  if (s.status !== 'ACTIVE' || s.financierProfile.organization.status !== 'ACTIVE') {
    throw new FinancingCatalogError('Service not found', 404)
  }

  const checklist = await composeServiceChecklist(id)

  return {
    id: s.id,
    serviceKind: s.serviceKind,
    category: s.category,
    name: s.name,
    summary: s.summary,
    targetSegment: s.targetSegment,
    currency: s.currency,
    amountMin: s.amountMin === null ? null : Number(s.amountMin),
    amountMax: s.amountMax === null ? null : Number(s.amountMax),
    rateType: s.rateType,
    rateMax: s.rateMax === null ? null : Number(s.rateMax),
    feeFlat: s.feeFlat === null ? null : Number(s.feeFlat),
    tenorMinMonths: s.tenorMinMonths,
    tenorMaxMonths: s.tenorMaxMonths,
    shariaCompliant: s.shariaCompliant,
    processingDays: s.processingDays,
    accreditationValidMonths: s.accreditationValidMonths,
    accreditationFeeAmount: s.accreditationFeeAmount === null ? null : Number(s.accreditationFeeAmount),
    features: s.attributes.filter((a) => a.kind === 'FEATURE').sort((a, b) => a.position - b.position).map((a) => a.text),
    eligibility: s.attributes.filter((a) => a.kind === 'ELIGIBILITY_CONDITION').sort((a, b) => a.position - b.position).map((a) => a.text),
    coverageCount: s.coverage.length,
    coverageSample: s.coverage.slice(0, 5).map((c) => c.regionName),
    financier: {
      name: s.financierProfile.organization.name,
      logoUrl: s.financierProfile.logoUrl,
      regulator: s.financierProfile.regulator,
    },
    description: s.description,
    coverage: s.coverage.map((c) => c.regionName).sort((a, b) => a.localeCompare(b)),
    requirements: checklist.map(toPublicRequirement),
  }
}

// ── Financier inbox: accreditation requests ─────────────────────────────────

const ACCREDITATION_INBOX_STATUSES = [
  'FORWARDED_TO_FINANCIER',
  'UNDER_FINANCIER_REVIEW',
  'ACCREDITED',
  'REJECTED',
  'EXPIRED',
  'REVOKED',
] as const

export type FinancierAccreditationDTO = {
  id: string
  number: string
  status: string
  serviceId: string
  serviceName: string
  organizationId: string
  organizationName: string | null
  submittedBy: { id: string; name: string; email: string } | null
  scopeNotes: string | null
  submittedAt: string | null
  forwardedAt: string | null
  decidedAt: string | null
  decisionNote: string | null
  accreditedAt: string | null
  validUntil: string | null
  revokedAt: string | null
  revocationReason: string | null
  createdAt: string
  submissionCounts: Record<string, number>
}

export async function listFinancierAccreditations(
  staff: FinancierStaffContext
): Promise<FinancierAccreditationDTO[]> {
  const rows = await db.accreditationRequest.findMany({
    where: {
      service: { financierProfileId: staff.profile.id },
      status: { in: [...ACCREDITATION_INBOX_STATUSES] },
    },
    include: {
      service: { select: { id: true, name: true } },
      organization: { select: { name: true } },
      submittedBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { forwardedAt: 'desc' },
    take: 200,
  })

  const grouped = rows.length
    ? await db.requirementSubmission.groupBy({
        by: ['accreditationRequestId', 'status'],
        where: { accreditationRequestId: { in: rows.map((r) => r.id) } },
        _count: { _all: true },
      })
    : []
  const counts = new Map<string, Record<string, number>>()
  for (const g of grouped) {
    if (!g.accreditationRequestId) continue
    const entry = counts.get(g.accreditationRequestId) ?? {}
    entry[g.status] = (entry[g.status] ?? 0) + g._count._all
    counts.set(g.accreditationRequestId, entry)
  }

  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    status: r.status,
    serviceId: r.serviceId,
    serviceName: r.service.name,
    organizationId: r.organizationId,
    organizationName: r.organization?.name ?? null,
    submittedBy: r.submittedBy,
    scopeNotes: r.scopeNotes,
    submittedAt: r.submittedAt?.toISOString() ?? null,
    forwardedAt: r.forwardedAt?.toISOString() ?? null,
    decidedAt: r.decidedAt?.toISOString() ?? null,
    decisionNote: r.decisionNote,
    accreditedAt: r.accreditedAt?.toISOString() ?? null,
    validUntil: r.validUntil?.toISOString() ?? null,
    revokedAt: r.revokedAt?.toISOString() ?? null,
    revocationReason: r.revocationReason,
    createdAt: r.createdAt.toISOString(),
    submissionCounts: counts.get(r.id) ?? {},
  }))
}

/** Financier dossier of a forwarded accreditation (R-4 visibility enforced). */
export async function getFinancierAccreditationDetail(
  staff: FinancierStaffContext,
  requestId: string
): Promise<FinancierAccreditationDTO & { submissions: SubmissionDTO[] }> {
  const request = await db.accreditationRequest.findUnique({
    where: { id: requestId },
    include: {
      service: { select: { id: true, name: true, financierProfileId: true } },
      organization: { select: { id: true, name: true, taxId: true, registrationNumber: true, industry: true } },
      submittedBy: { select: { id: true, name: true, email: true, phone: true } },
      submissions: { include: SUBMISSION_INCLUDE },
    },
  })
  if (!request) throw new FinancingCatalogError('Accreditation request not found', 404)
  if (request.service.financierProfileId !== staff.profile.id) {
    throw new FinancingCatalogError('This accreditation belongs to another financier', 403)
  }
  if (!ACCREDITATION_INBOX_STATUSES.includes(request.status as never)) {
    throw new FinancingCatalogError(
      'This accreditation has not passed the platform verification gate and is not visible to financiers',
      403
    )
  }

  const submissions = request.submissions
    .map((s) => serializeSubmission(s))
    .sort((a, b) => a.displayOrder - b.displayOrder)

  return {
    id: request.id,
    number: request.number,
    status: request.status,
    serviceId: request.serviceId,
    serviceName: request.service.name,
    organizationId: request.organizationId,
    organizationName: request.organization?.name ?? null,
    submittedBy: request.submittedBy,
    scopeNotes: request.scopeNotes,
    submittedAt: request.submittedAt?.toISOString() ?? null,
    forwardedAt: request.forwardedAt?.toISOString() ?? null,
    decidedAt: request.decidedAt?.toISOString() ?? null,
    decisionNote: request.decisionNote,
    accreditedAt: request.accreditedAt?.toISOString() ?? null,
    validUntil: request.validUntil?.toISOString() ?? null,
    revokedAt: request.revokedAt?.toISOString() ?? null,
    revocationReason: request.revocationReason,
    createdAt: request.createdAt.toISOString(),
    submissionCounts: submissions.reduce<Record<string, number>>((acc, s) => {
      acc[s.status] = (acc[s.status] ?? 0) + 1
      return acc
    }, {}),
    submissions,
  }
}

// ── Financier dashboard ──────────────────────────────────────────────────────

export async function financierDashboard(staff: FinancierStaffContext): Promise<{
  requests: Record<string, number>
  openRequests: number
  accreditations: Record<string, number>
  liveAccreditations: number
  offersPending: number
  agreements: Record<string, number>
  recentRequests: { id: string; number: string; status: string; serviceName: string; organizationName: string | null; amountRequested: number; currency: string; forwardedAt: string | null }[]
  recentAccreditations: { id: string; number: string; status: string; serviceName: string; organizationName: string | null; forwardedAt: string | null }[]
}> {
  const now = new Date()
  const [
    requestsByStatus,
    accByStatus,
    liveAcc,
    offersPending,
    agreementsByStatus,
    recentRequests,
    recentAccreditations,
  ] = await Promise.all([
    db.financingRequest.groupBy({
      by: ['status'],
      where: {
        service: { financierProfileId: staff.profile.id },
        // R-4: the dashboard never reveals pre-gate requests either —
        // the counts mirror what the inbox query can actually show.
        status: { in: [...FINANCIER_VISIBLE_STATUSES] },
      },
      _count: { _all: true },
    }),
    db.accreditationRequest.groupBy({
      by: ['status'],
      where: {
        service: { financierProfileId: staff.profile.id },
        status: { in: [...ACCREDITATION_VISIBLE_STATUSES] },
      },
      _count: { _all: true },
    }),
    db.accreditationRequest.count({
      where: {
        service: { financierProfileId: staff.profile.id },
        status: 'ACCREDITED',
        OR: [{ validUntil: null }, { validUntil: { gt: now } }],
      },
    }),
    db.financingOffer.count({
      where: {
        status: 'SENT',
        request: { service: { financierProfileId: staff.profile.id } },
      },
    }),
    db.financingAgreement.groupBy({
      by: ['status'],
      where: { offer: { request: { service: { financierProfileId: staff.profile.id } } } },
      _count: { _all: true },
    }),
    db.financingRequest.findMany({
      where: {
        service: { financierProfileId: staff.profile.id },
        status: { in: ['FORWARDED_TO_FINANCIER', 'UNDER_FINANCIER_REVIEW', 'OFFERED', 'ACCEPTED'] },
      },
      include: { service: { select: { name: true } }, organization: { select: { name: true } } },
      orderBy: { forwardedAt: 'desc' },
      take: 5,
    }),
    db.accreditationRequest.findMany({
      where: {
        service: { financierProfileId: staff.profile.id },
        status: { in: [...ACCREDITATION_INBOX_STATUSES] },
      },
      include: { service: { select: { name: true } }, organization: { select: { name: true } } },
      orderBy: { forwardedAt: 'desc' },
      take: 5,
    }),
  ])

  const requests: Record<string, number> = {}
  for (const g of requestsByStatus) requests[g.status] = g._count._all
  const accreditations: Record<string, number> = {}
  for (const g of accByStatus) accreditations[g.status] = g._count._all
  const agreements: Record<string, number> = {}
  for (const g of agreementsByStatus) agreements[g.status] = g._count._all

  return {
    requests,
    openRequests:
      (requests.FORWARDED_TO_FINANCIER ?? 0) + (requests.UNDER_FINANCIER_REVIEW ?? 0) + (requests.OFFERED ?? 0),
    accreditations,
    liveAccreditations: liveAcc,
    offersPending,
    agreements,
    recentRequests: recentRequests.map((r) => ({
      id: r.id,
      number: r.number,
      status: r.status,
      serviceName: r.service.name,
      organizationName: r.organization?.name ?? null,
      amountRequested: Number(r.amountRequested),
      currency: r.currency,
      forwardedAt: r.forwardedAt?.toISOString() ?? null,
    })),
    recentAccreditations: recentAccreditations.map((r) => ({
      id: r.id,
      number: r.number,
      status: r.status,
      serviceName: r.service.name,
      organizationName: r.organization?.name ?? null,
      forwardedAt: r.forwardedAt?.toISOString() ?? null,
    })),
  }
}

// ── Admin: institutions ─────────────────────────────────────────────────────

const OPEN_REQUEST_STATUSES = [
  'SUBMITTED',
  'UNDER_PLATFORM_REVIEW',
  'RETURNED_FOR_COMPLETION',
  'FORWARDED_TO_FINANCIER',
  'UNDER_FINANCIER_REVIEW',
  'OFFERED',
] as const

const OPEN_ACCREDITATION_STATUSES = [
  'SUBMITTED',
  'UNDER_PLATFORM_REVIEW',
  'RETURNED_FOR_COMPLETION',
  'FORWARDED_TO_FINANCIER',
  'UNDER_FINANCIER_REVIEW',
  'ACCREDITED',
] as const

export type AdminInstitutionDTO = {
  organizationId: string
  name: string
  orgType: string
  status: string
  verifiedAt: string | null
  profile: {
    id: string
    licenseNumber: string | null
    regulator: string | null
    contactEmail: string | null
    contactPhone: string | null
  }
  memberCount: number
  serviceCount: number
  activeServiceCount: number
  openRequestCount: number
  openAccreditationCount: number
  liveAccreditationCount: number
}

export async function adminListInstitutions(): Promise<AdminInstitutionDTO[]> {
  const orgs = await db.organization.findMany({
    where: { financierProfile: { isNot: null } },
    include: {
      financierProfile: true,
      _count: { select: { members: true } },
    },
    orderBy: { name: 'asc' },
  })

  const profileIds = orgs.map((o) => o.financierProfile!.id)
  if (profileIds.length === 0) return []

  const [services, openFin, openAcc, liveAcc] = await Promise.all([
    db.financierService.findMany({
      where: { financierProfileId: { in: profileIds } },
      select: { id: true, financierProfileId: true, status: true },
    }),
    db.financingRequest.groupBy({
      by: ['serviceId'],
      where: {
        service: { financierProfileId: { in: profileIds } },
        status: { in: [...OPEN_REQUEST_STATUSES] },
      },
      _count: { _all: true },
    }),
    db.accreditationRequest.groupBy({
      by: ['serviceId'],
      where: {
        service: { financierProfileId: { in: profileIds } },
        status: { in: [...OPEN_ACCREDITATION_STATUSES] },
      },
      _count: { _all: true },
    }),
    db.accreditationRequest.groupBy({
      by: ['serviceId'],
      where: {
        service: { financierProfileId: { in: profileIds } },
        status: 'ACCREDITED',
        OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }],
      },
      _count: { _all: true },
    }),
  ])

  const serviceToProfile = new Map(services.map((s) => [s.id, s.financierProfileId]))
  const sumByProfile = (groups: { serviceId: string; _count: { _all: number } }[]) => {
    const m = new Map<string, number>()
    for (const g of groups) {
      const p = serviceToProfile.get(g.serviceId)
      if (!p) continue
      m.set(p, (m.get(p) ?? 0) + g._count._all)
    }
    return m
  }
  const openFinByProfile = sumByProfile(openFin)
  const openAccByProfile = sumByProfile(openAcc)
  const liveAccByProfile = sumByProfile(liveAcc)

  return orgs.map((o) => {
    const p = o.financierProfile!
    const own = services.filter((s) => s.financierProfileId === p.id)
    return {
      organizationId: o.id,
      name: o.name,
      orgType: o.orgType,
      status: o.status,
      verifiedAt: o.verifiedAt?.toISOString() ?? null,
      profile: {
        id: p.id,
        licenseNumber: p.licenseNumber,
        regulator: p.regulator,
        contactEmail: p.contactEmail,
        contactPhone: p.contactPhone,
      },
      memberCount: o._count.members,
      serviceCount: own.length,
      activeServiceCount: own.filter((s) => s.status === 'ACTIVE').length,
      openRequestCount: openFinByProfile.get(p.id) ?? 0,
      openAccreditationCount: openAccByProfile.get(p.id) ?? 0,
      liveAccreditationCount: liveAccByProfile.get(p.id) ?? 0,
    }
  })
}

// ── Admin: gate helpers ─────────────────────────────────────────────────────

/** Which request family does this id belong to? (the gate console is polymorphic) */
export async function resolveAdminRequestType(
  id: string
): Promise<'FINANCING' | 'ACCREDITATION' | null> {
  const fin = await db.financingRequest.findUnique({ where: { id }, select: { id: true } })
  if (fin) return 'FINANCING'
  const acc = await db.accreditationRequest.findUnique({ where: { id }, select: { id: true } })
  if (acc) return 'ACCREDITATION'
  return null
}

const VAULT_INCLUDE = {
  user: { select: { id: true, name: true } },
  media: true,
  organization: { select: { id: true, name: true } },
  reviewedBy: { select: { id: true, name: true } },
} as const

/**
 * The admin dossier: the request detail (already carries submissions with
 * templates + offers + agreement) plus the applicant's vault documents and
 * the additive User profile snapshot the gate console renders.
 */
export async function adminRequestDossier(admin: Actor, id: string): Promise<Record<string, unknown>> {
  const type = await resolveAdminRequestType(id)
  if (!type) throw new FinancingCatalogError('Request not found', 404)

  if (type === 'FINANCING') {
    const detail = await getFinancingRequestDetail(admin.id, id, 'ADMIN')
    const docs = await db.accountDocument.findMany({
      where: {
        isActive: true,
        OR: [
          { userId: detail.applicant.id },
          ...(detail.organizationId ? [{ organizationId: detail.organizationId }] : []),
        ],
      },
      include: VAULT_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    const user = await db.user.findUnique({
      where: { id: detail.applicant.id },
      select: {
        id: true, name: true, email: true, phone: true, whatsappNumber: true, dateOfBirth: true,
        gender: true, maritalStatus: true, nationality: true, identityType: true, identityNumber: true,
        residenceStreet: true, residenceCity: true, residenceDistrict: true, residenceType: true,
      },
    })
    const organization = detail.organizationId
      ? await db.organization.findUnique({
          where: { id: detail.organizationId },
          select: { id: true, name: true, taxId: true, registrationNumber: true, industry: true, website: true, status: true },
        })
      : null
    return {
      requestType: 'FINANCING',
      request: detail,
      documents: docs.map((d) => serializeAccountDocument(d)),
      applicant: { user, organization },
    }
  }

  const detail = await getAccreditationDetail(admin.id, id, 'ADMIN')
  const docs = await db.accountDocument.findMany({
    where: {
      isActive: true,
      OR: [
        { userId: detail.submittedBy.id },
        { organizationId: detail.organizationId },
      ],
    },
    include: VAULT_INCLUDE,
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  const user = await db.user.findUnique({
    where: { id: detail.submittedBy.id },
    select: {
      id: true, name: true, email: true, phone: true, whatsappNumber: true, dateOfBirth: true,
      gender: true, maritalStatus: true, nationality: true, identityType: true, identityNumber: true,
      residenceStreet: true, residenceCity: true, residenceDistrict: true, residenceType: true,
    },
  })
  const organization = await db.organization.findUnique({
    where: { id: detail.organizationId },
    select: { id: true, name: true, taxId: true, registrationNumber: true, industry: true, website: true, status: true },
  })
  return {
    requestType: 'ACCREDITATION',
    request: detail,
    documents: docs.map((d) => serializeAccountDocument(d)),
    applicant: { user, organization },
  }
}
