import { db } from '@/lib/db'
import { recordAudit } from '@/server/modules/audit/service'
import { emitNotification } from '@/server/modules/notifications/service'
import {
  FinancingError,
  requireFinancierContext,
  assertFinancierStaffOfService,
  iso,
  type FinancierServiceKind,
} from './shared'
import { listServiceRequirements } from './conditions'

/**
 * FINANCIER SERVICES — the offering management (DP-22) + the public directory.
 *
 * Console side (OWNER/ADMIN staff of the financier org — DP-1): CRUD with
 * text-bullet attributes + region coverage; DELETE is a soft ARCHIVE
 * (requests/offers reference services — history is never orphaned).
 * Public side: ACTIVE services only; the requirements preview shows labels
 * for signed-in users (the checklist itself lives on requests, §5.1).
 */

// ── Closed value sets (validated by zod at the routes, asserted here) ───────

export const SERVICE_KINDS: readonly FinancierServiceKind[] = ['FINANCING', 'ACCREDITATION']

export const FINANCING_CATEGORIES = [
  'WORKING_CAPITAL', 'INVOICE_FINANCING', 'PO_FINANCING', 'EQUIPMENT', 'VEHICLE',
  'HOME', 'EDUCATION', 'AGRICULTURE', 'MICROENTERPRISE', 'SME', 'OTHER',
] as const
export const ACCREDITATION_CATEGORIES = ['SUPPLIER_QUALIFICATION', 'VENDOR_APPROVAL'] as const

export const SERVICE_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const
export const RATE_TYPES = ['MURABAHA_ANNUAL', 'FIXED_ANNUAL', 'FLAT_FEE'] as const
export const TARGET_SEGMENTS = ['BUSINESS', 'INDIVIDUAL', 'BOTH'] as const

// ── DTOs ────────────────────────────────────────────────────────────────────

export interface ServiceAttributeDTO {
  id: string
  kind: string
  position: number
  text: string
}

export interface ServiceCoverageDTO {
  id: string
  regionName: string
}

export interface FinancierServiceDTO {
  id: string
  financierProfileId: string
  financierOrgId: string
  financierOrgName: string
  financierOrgStatus: string
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
  createdAt: string
  updatedAt: string
  attributes: ServiceAttributeDTO[]
  coverage: ServiceCoverageDTO[]
  requirementCount?: number
}

// ── Serialization ───────────────────────────────────────────────────────────

const serviceInclude = {
  financierProfile: {
    select: {
      id: true,
      organizationId: true,
      organization: { select: { name: true, status: true } },
    },
  },
  attributes: { orderBy: { position: 'asc' as const } },
  coverage: { orderBy: { regionName: 'asc' as const } },
  _count: { select: { requirements: { where: { isActive: true } } } },
} as const

type ServiceRaw = Awaited<ReturnType<typeof db.financierService.findFirstOrThrow>>

type ServiceRow = ServiceRaw & {
  financierProfile: { id: string; organizationId: string; organization: { name: string; status: string } }
  attributes: { id: string; kind: string; position: number; text: string }[]
  coverage: { id: string; regionName: string }[]
  _count: { requirements: number }
}

function serializeService(s: ServiceRow): FinancierServiceDTO {
  return {
    id: s.id,
    financierProfileId: s.financierProfileId,
    financierOrgId: s.financierProfile.organizationId,
    financierOrgName: s.financierProfile.organization.name,
    financierOrgStatus: s.financierProfile.organization.status,
    serviceKind: s.serviceKind,
    category: s.category,
    name: s.name,
    summary: s.summary,
    description: s.description,
    targetSegment: s.targetSegment,
    status: s.status,
    currency: s.currency,
    amountMin: s.amountMin,
    amountMax: s.amountMax,
    rateType: s.rateType,
    rateMax: s.rateMax,
    feeFlat: s.feeFlat,
    tenorMinMonths: s.tenorMinMonths,
    tenorMaxMonths: s.tenorMaxMonths,
    repaymentFrequency: s.repaymentFrequency,
    gracePeriodDays: s.gracePeriodDays,
    shariaCompliant: s.shariaCompliant,
    processingDays: s.processingDays,
    accreditationValidMonths: s.accreditationValidMonths,
    accreditationFeeAmount: s.accreditationFeeAmount,
    viewCount: s.viewCount,
    createdAt: iso(s.createdAt)!,
    updatedAt: iso(s.updatedAt)!,
    attributes: s.attributes.map((a) => ({ id: a.id, kind: a.kind, position: a.position, text: a.text })),
    coverage: s.coverage.map((c) => ({ id: c.id, regionName: c.regionName })),
    requirementCount: s._count?.requirements,
  }
}

// ── Input shape + validation ────────────────────────────────────────────────

export interface ServiceInput {
  serviceKind: string
  category: string
  name: string
  summary?: string | null
  description?: string | null
  targetSegment?: string | null
  status?: string
  currency?: string
  amountMin?: number | null
  amountMax?: number | null
  rateType?: string | null
  rateMax?: number | null
  feeFlat?: number | null
  tenorMinMonths?: number | null
  tenorMaxMonths?: number | null
  repaymentFrequency?: string | null
  gracePeriodDays?: number | null
  shariaCompliant?: boolean
  processingDays?: number | null
  accreditationValidMonths?: number | null
  accreditationFeeAmount?: number | null
}

function validateServiceInput(input: Partial<ServiceInput>, full: boolean): void {
  if (full || input.serviceKind !== undefined) {
    if (!(SERVICE_KINDS as readonly string[]).includes(input.serviceKind ?? '')) {
      throw new FinancingError('serviceKind must be FINANCING or ACCREDITATION')
    }
  }
  if (input.category !== undefined) {
    const kind = input.serviceKind ?? 'FINANCING'
    const allowed =
      kind === 'ACCREDITATION'
        ? (ACCREDITATION_CATEGORIES as readonly string[])
        : (FINANCING_CATEGORIES as readonly string[])
    if (!allowed.includes(input.category)) {
      throw new FinancingError(`category must be one of ${allowed.join(', ')}`)
    }
  }
  if (full && (!input.name || input.name.trim().length < 3)) {
    throw new FinancingError('Service name must be at least 3 characters')
  }
  if (input.name !== undefined && input.name !== null && input.name.trim().length < 3) {
    throw new FinancingError('Service name must be at least 3 characters')
  }
  if (input.status !== undefined && !(SERVICE_STATUSES as readonly string[]).includes(input.status)) {
    throw new FinancingError('status must be DRAFT, ACTIVE or ARCHIVED')
  }
  if (input.rateType !== undefined && input.rateType !== null && !(RATE_TYPES as readonly string[]).includes(input.rateType)) {
    throw new FinancingError('rateType must be MURABAHA_ANNUAL, FIXED_ANNUAL or FLAT_FEE')
  }
  if (input.targetSegment !== undefined && input.targetSegment !== null && !(TARGET_SEGMENTS as readonly string[]).includes(input.targetSegment)) {
    throw new FinancingError('targetSegment must be BUSINESS, INDIVIDUAL or BOTH')
  }
  if (input.amountMin != null && input.amountMin < 0) throw new FinancingError('amountMin cannot be negative')
  if (input.amountMax != null && input.amountMax < 0) throw new FinancingError('amountMax cannot be negative')
  if (input.amountMin != null && input.amountMax != null && input.amountMin > input.amountMax) {
    throw new FinancingError('amountMin cannot exceed amountMax')
  }
  if (input.tenorMinMonths != null && input.tenorMinMonths < 1) throw new FinancingError('tenorMinMonths must be at least 1')
  if (input.tenorMaxMonths != null && input.tenorMaxMonths < 1) throw new FinancingError('tenorMaxMonths must be at least 1')
  if (input.tenorMinMonths != null && input.tenorMaxMonths != null && input.tenorMinMonths > input.tenorMaxMonths) {
    throw new FinancingError('tenorMinMonths cannot exceed tenorMaxMonths')
  }
  if (input.rateMax != null && (input.rateMax < 0 || input.rateMax > 100)) {
    throw new FinancingError('rateMax must be between 0 and 100')
  }
  if (input.feeFlat != null && input.feeFlat < 0) throw new FinancingError('feeFlat cannot be negative')
  if (input.accreditationValidMonths != null && input.accreditationValidMonths < 1) {
    throw new FinancingError('accreditationValidMonths must be at least 1')
  }
  if (input.accreditationFeeAmount != null && input.accreditationFeeAmount < 0) {
    throw new FinancingError('accreditationFeeAmount cannot be negative')
  }
}

// ── Console CRUD (financier staff — DP-1) ──────────────────────────────────

export async function listOwnServices(userId: string): Promise<FinancierServiceDTO[]> {
  const ctx = await requireFinancierContext(userId)
  const services = await db.financierService.findMany({
    where: { financierProfile: { organizationId: ctx.organizationId } },
    include: serviceInclude,
    orderBy: [{ serviceKind: 'asc' }, { createdAt: 'desc' }],
  })
  return services.map((svc) => serializeService(svc as never))
}

export async function getOwnService(userId: string, serviceId: string): Promise<{
  service: FinancierServiceDTO
  requirements: Awaited<ReturnType<typeof listServiceRequirements>>
}> {
  await assertFinancierStaffOfService(userId, serviceId)
  const service = await db.financierService.findUniqueOrThrow({
    where: { id: serviceId },
    include: serviceInclude,
  })
  return { service: serializeService(service as never), requirements: await listServiceRequirements(serviceId) }
}

export async function createService(userId: string, input: ServiceInput): Promise<FinancierServiceDTO> {
  const ctx = await requireFinancierContext(userId)
  validateServiceInput(input, true)
  const created = await db.financierService.create({
    data: {
      financierProfileId: ctx.financierProfileId,
      serviceKind: input.serviceKind,
      category: input.category,
      name: input.name.trim(),
      summary: input.summary?.trim() || null,
      description: input.description?.trim() || null,
      targetSegment: input.targetSegment ?? null,
      status: input.status ?? 'DRAFT',
      currency: input.currency?.trim().toUpperCase() || 'YER',
      amountMin: input.amountMin ?? null,
      amountMax: input.amountMax ?? null,
      rateType: input.rateType ?? null,
      rateMax: input.rateMax ?? null,
      feeFlat: input.feeFlat ?? null,
      tenorMinMonths: input.tenorMinMonths ?? null,
      tenorMaxMonths: input.tenorMaxMonths ?? null,
      repaymentFrequency: input.repaymentFrequency ?? null,
      gracePeriodDays: input.gracePeriodDays ?? null,
      shariaCompliant: input.shariaCompliant ?? false,
      processingDays: input.processingDays ?? null,
      accreditationValidMonths: input.accreditationValidMonths ?? null,
      accreditationFeeAmount: input.accreditationFeeAmount ?? null,
    },
    include: serviceInclude,
  })
  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'SERVICE_CREATED',
    entityType: 'FinancierService',
    entityId: created.id,
    summary: `Service “${created.name}” (${created.serviceKind}/${created.category}) created`,
    metadata: { financierOrgId: ctx.organizationId, serviceKind: created.serviceKind },
  })
  return serializeService(created as never)
}

export async function updateService(
  userId: string,
  serviceId: string,
  patch: Partial<ServiceInput>
): Promise<FinancierServiceDTO> {
  await assertFinancierStaffOfService(userId, serviceId)
  validateServiceInput(patch, false)
  const existing = await db.financierService.findUniqueOrThrow({ where: { id: serviceId } })
  if (existing.status === 'ARCHIVED' && patch.status !== 'ACTIVE' && Object.keys(patch).some((k) => k !== 'status')) {
    throw new FinancingError('This service is archived — reactivate it before editing', 409)
  }
  const updated = await db.financierService.update({
    where: { id: serviceId },
    data: {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.summary !== undefined ? { summary: patch.summary?.trim() || null } : {}),
      ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
      ...(patch.targetSegment !== undefined ? { targetSegment: patch.targetSegment ?? null } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.currency !== undefined ? { currency: patch.currency.trim().toUpperCase() } : {}),
      ...(patch.amountMin !== undefined ? { amountMin: patch.amountMin ?? null } : {}),
      ...(patch.amountMax !== undefined ? { amountMax: patch.amountMax ?? null } : {}),
      ...(patch.rateType !== undefined ? { rateType: patch.rateType ?? null } : {}),
      ...(patch.rateMax !== undefined ? { rateMax: patch.rateMax ?? null } : {}),
      ...(patch.feeFlat !== undefined ? { feeFlat: patch.feeFlat ?? null } : {}),
      ...(patch.tenorMinMonths !== undefined ? { tenorMinMonths: patch.tenorMinMonths ?? null } : {}),
      ...(patch.tenorMaxMonths !== undefined ? { tenorMaxMonths: patch.tenorMaxMonths ?? null } : {}),
      ...(patch.repaymentFrequency !== undefined ? { repaymentFrequency: patch.repaymentFrequency ?? null } : {}),
      ...(patch.gracePeriodDays !== undefined ? { gracePeriodDays: patch.gracePeriodDays ?? null } : {}),
      ...(patch.shariaCompliant !== undefined ? { shariaCompliant: patch.shariaCompliant } : {}),
      ...(patch.processingDays !== undefined ? { processingDays: patch.processingDays ?? null } : {}),
      ...(patch.accreditationValidMonths !== undefined ? { accreditationValidMonths: patch.accreditationValidMonths ?? null } : {}),
      ...(patch.accreditationFeeAmount !== undefined ? { accreditationFeeAmount: patch.accreditationFeeAmount ?? null } : {}),
      ...(patch.serviceKind !== undefined || patch.category !== undefined
        ? {
            serviceKind: patch.serviceKind ?? existing.serviceKind,
            category: patch.category ?? existing.category,
          }
        : {}),
    },
    include: serviceInclude,
  })
  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'SERVICE_UPDATED',
    entityType: 'FinancierService',
    entityId: serviceId,
    summary: `Service “${updated.name}” updated (${Object.keys(patch).join(', ') || 'no fields'})`,
    metadata: { fields: Object.keys(patch) },
  })
  return serializeService(updated as never)
}

/** Soft archive — requests/offers keep their references (history intact). */
export async function archiveService(userId: string, serviceId: string): Promise<FinancierServiceDTO> {
  await assertFinancierStaffOfService(userId, serviceId)
  const updated = await db.financierService.update({
    where: { id: serviceId },
    data: { status: 'ARCHIVED' },
    include: serviceInclude,
  })
  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'SERVICE_ARCHIVED',
    entityType: 'FinancierService',
    entityId: serviceId,
    summary: `Service “${updated.name}” archived`,
    metadata: { serviceId },
  })
  return serializeService(updated as never)
}

// ── Attributes + coverage management ────────────────────────────────────────

/** Replace the text bullets of one kind (FEATURE | ELIGIBILITY_CONDITION). */
export async function setServiceAttributes(
  userId: string,
  serviceId: string,
  kind: 'FEATURE' | 'ELIGIBILITY_CONDITION',
  texts: string[]
): Promise<FinancierServiceDTO> {
  await assertFinancierStaffOfService(userId, serviceId)
  const clean = texts
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 30)
    .map((text) => text.slice(0, 300))
  const updated = await db.$transaction(async (tx) => {
    await tx.financierServiceAttribute.deleteMany({ where: { serviceId, kind } })
    if (clean.length) {
      await tx.financierServiceAttribute.createMany({
        data: clean.map((text, i) => ({ serviceId, kind, position: i, text })),
      })
    }
    return tx.financierService.findUniqueOrThrow({ where: { id: serviceId }, include: serviceInclude })
  })
  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'SERVICE_UPDATED',
    entityType: 'FinancierService',
    entityId: serviceId,
    summary: `${kind === 'FEATURE' ? 'Features' : 'Eligibility conditions'} replaced (${clean.length} bullets)`,
    metadata: { kind, count: clean.length },
  })
  return serializeService(updated as never)
}

export function normalizeRegion(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

/** Replace the coverage regions (normalized, deduped — DP-16 free strings). */
export async function setServiceCoverage(
  userId: string,
  serviceId: string,
  regionNames: string[]
): Promise<FinancierServiceDTO> {
  await assertFinancierStaffOfService(userId, serviceId)
  const seen = new Set<string>()
  const clean: string[] = []
  for (const raw of regionNames) {
    const norm = normalizeRegion(raw)
    if (!norm) continue
    const key = norm.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    clean.push(norm.slice(0, 120))
  }
  if (clean.length > 60) throw new FinancingError('At most 60 coverage regions per service')
  const updated = await db.$transaction(async (tx) => {
    await tx.financierServiceCoverage.deleteMany({ where: { serviceId } })
    if (clean.length) {
      await tx.financierServiceCoverage.createMany({
        data: clean.map((regionName) => ({ serviceId, regionName })),
      })
    }
    return tx.financierService.findUniqueOrThrow({ where: { id: serviceId }, include: serviceInclude })
  })
  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'SERVICE_UPDATED',
    entityType: 'FinancierService',
    entityId: serviceId,
    summary: `Coverage replaced (${clean.length} regions)`,
    metadata: { regions: clean },
  })
  return serializeService(updated as never)
}

// ── Public directory (applicant browsing — ACTIVE only) ────────────────────

export async function listPublicServices(filter?: {
  kind?: string
  category?: string
  city?: string
  search?: string
  page?: number
  limit?: number
}): Promise<{ services: FinancierServiceDTO[]; total: number; page: number; limit: number }> {
  const limit = Math.min(Math.max(Number(filter?.limit) || 20, 1), 60)
  const page = Math.max(Number(filter?.page) || 1, 1)
  const search = filter?.search?.trim()
  const where = {
    status: 'ACTIVE',
    financierProfile: { organization: { status: 'ACTIVE' } },
    ...(filter?.kind ? { serviceKind: filter.kind } : {}),
    ...(filter?.category ? { category: filter.category } : {}),
    ...(filter?.city?.trim() ? { coverage: { some: { regionName: normalizeRegion(filter.city) } } } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { summary: { contains: search } },
            { description: { contains: search } },
            { financierProfile: { organization: { name: { contains: search } } } },
          ],
        }
      : {}),
  }
  const [rows, total] = await Promise.all([
    db.financierService.findMany({
      where,
      include: serviceInclude,
      orderBy: [{ viewCount: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      skip: (page - 1) * limit,
    }),
    db.financierService.count({ where }),
  ])
  return { services: rows.map(serializeService), total, page, limit }
}

export interface PublicServiceDetailDTO extends FinancierServiceDTO {
  requirementsPreview: {
    id: string
    isRequired: boolean
    title: string
    conditionType: string
    instructions: string | null
  }[]
}

/**
 * Public detail. The composed requirements are shown as LABELS ONLY and only
 * to signed-in users (competitive intel protection + applicant UX — the real
 * checklist lives on the request once submitted, §5.1).
 */
export async function getPublicServiceDetail(
  serviceId: string,
  viewer?: { userId: string } | null
): Promise<PublicServiceDetailDTO> {
  const service = await db.financierService.findUnique({
    where: { id: serviceId },
    include: serviceInclude,
  })
  if (!service) throw new FinancingError('Service not found', 404)
  if (service.status !== 'ACTIVE' || service.financierProfile.organization.status === 'SUSPENDED') {
    // Archived/suspended services stay reachable for reference but are flagged
    throw new FinancingError('This service is not accepting applications', 409)
  }
  await db.financierService.update({
    where: { id: serviceId },
    data: { viewCount: { increment: 1 } },
  })
  const requirements = viewer
    ? (await listServiceRequirements(serviceId)).map((r) => ({
        id: r.id,
        isRequired: r.isRequired,
        title: r.template.title,
        conditionType: r.template.conditionType,
        instructions: r.instructions,
      }))
    : []
  return { ...serializeService(service as never), requirementsPreview: requirements }
}

// ── Admin institutions console ──────────────────────────────────────────────

export interface FinancierInstitutionDTO {
  organizationId: string
  name: string
  slug: string
  orgType: string
  status: string
  verifiedAt: string | null
  profile: {
    id: string
    licenseNumber: string | null
    regulator: string | null
    contactEmail: string | null
    contactPhone: string | null
    minTicket: number | null
    maxTicket: number | null
    branchCount: number
  }
  stats: {
    services: number
    activeServices: number
    requestsForwarded: number
    liveAccreditations: number
    feesAccrued: number
    feesPaid: number
  }
  createdAt: string
}

export async function adminListInstitutions(filter?: {
  search?: string
  status?: string
}): Promise<FinancierInstitutionDTO[]> {
  const search = filter?.search?.trim()
  const orgs = await db.organization.findMany({
    where: {
      financierProfile: { isNot: null },
      ...(filter?.status ? { status: filter.status } : {}),
      ...(search ? { name: { contains: search } } : {}),
    },
    include: {
      financierProfile: {
        include: { _count: { select: { branches: true, services: true } } },
      },
    },
    orderBy: { createdAt: 'asc' },
    take: 100,
  })
  const result: FinancierInstitutionDTO[] = []
  for (const org of orgs) {
    const profile = org.financierProfile
    if (!profile) continue
    const [activeServices, forwarded, liveAccreds, feeAgg] = await Promise.all([
      db.financierService.count({ where: { financierProfileId: profile.id, status: 'ACTIVE' } }),
      db.financingRequest.count({
        where: { service: { financierProfileId: profile.id }, forwardedAt: { not: null } },
      }),
      db.accreditationRequest.count({
        where: { service: { financierProfileId: profile.id }, status: 'ACCREDITED', validUntil: { gt: new Date() } },
      }),
      db.financingFee.aggregate({
        where: { agreement: { offer: { request: { service: { financierProfileId: profile.id } } } } },
        _sum: { amount: true },
      }),
    ])
    const paidAgg = await db.financingFee.aggregate({
      where: {
        status: 'PAID',
        agreement: { offer: { request: { service: { financierProfileId: profile.id } } } },
      },
      _sum: { amount: true },
    })
    result.push({
      organizationId: org.id,
      name: org.name,
      slug: org.slug,
      orgType: org.orgType,
      status: org.status,
      verifiedAt: iso(org.verifiedAt),
      profile: {
        id: profile.id,
        licenseNumber: profile.licenseNumber,
        regulator: profile.regulator,
        contactEmail: profile.contactEmail,
        contactPhone: profile.contactPhone,
        minTicket: profile.minTicket,
        maxTicket: profile.maxTicket,
        branchCount: (profile._count as unknown as { branches: number })?.branches ?? 0,
      },
      stats: {
        services: (profile._count as unknown as { services: number })?.services ?? 0,
        activeServices,
        requestsForwarded: forwarded,
        liveAccreditations: liveAccreds,
        feesAccrued: feeAgg._sum.amount ?? 0,
        feesPaid: paidAgg._sum.amount ?? 0,
      },
      createdAt: org.createdAt.toISOString(),
    })
  }
  return result
}

/** Verify / suspend / reactivate a financier institution (org status + audit + notify staff). */
export async function adminSetInstitutionStatus(
  adminId: string,
  organizationId: string,
  action: 'VERIFY' | 'SUSPEND' | 'REACTIVATE'
): Promise<{ organizationId: string; status: string }> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    include: { financierProfile: { select: { id: true } } },
  })
  if (!org) throw new FinancingError('Organization not found', 404)
  if (!org.financierProfile) throw new FinancingError('That organization is not a financier institution', 400)

  const now = new Date()
  let status: string
  if (action === 'VERIFY') {
    status = 'ACTIVE'
  } else if (action === 'SUSPEND') {
    status = 'SUSPENDED'
  } else {
    status = 'ACTIVE'
  }
  const updated = await db.organization.update({
    where: { id: organizationId },
    data: {
      status,
      ...(action === 'VERIFY' && !org.verifiedAt ? { verifiedAt: now } : {}),
    },
  })
  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action:
      action === 'VERIFY'
        ? 'INSTITUTION_VERIFIED'
        : action === 'SUSPEND'
          ? 'INSTITUTION_SUSPENDED'
          : 'INSTITUTION_REACTIVATED',
    entityType: 'Organization',
    entityId: organizationId,
    summary: `Financier institution ${org.name} → ${status}`,
    metadata: { action, previousStatus: org.status },
  })
  const staff = await db.organizationMember.findMany({
    where: { organizationId, role: { in: ['OWNER', 'ADMIN'] } },
    select: { userId: true },
  })
  for (const s of staff) {
    await emitNotification({
      userId: s.userId,
      type: 'FINANCING_STATUS_CHANGED',
      title:
        action === 'VERIFY'
          ? `${org.name} verified`
          : action === 'SUSPEND'
            ? `${org.name} suspended`
            : `${org.name} reactivated`,
      body:
        action === 'VERIFY'
          ? 'The platform verified your institution. Your services can now be published and receive applications.'
          : action === 'SUSPEND'
            ? 'The platform suspended your institution. New applications are blocked until reactivation.'
            : 'The platform reactivated your institution.',
      linkView: 'financier',
      linkId: organizationId,
    })
  }
  return { organizationId: updated.id, status: updated.status }
}
