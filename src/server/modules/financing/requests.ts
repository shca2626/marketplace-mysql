import { db } from '@/lib/db'
import { recordAudit } from '@/server/modules/audit/service'
import { emitNotification, emitNotifications } from '@/server/modules/notifications/service'
import { nextNumber } from '@/server/modules/sequences/service'
import { resolvePanel } from '@/server/modules/settings/service'
import { randomBytes } from 'crypto'
import {
  FinancingError,
  CANCELABLE_PRE_FORWARD,
  FINANCING_PRE_TERMINAL,
  FINANCIER_VISIBLE_STATUSES,
  assertApplicantActor,
  iso,
  type FinancingRequestStatus,
} from './shared'
import {
  generateChecklist,
  applyChecklistAnswers,
  gateStatus,
  assertGateComplete,
  type ChecklistAnswer,
  type RequirementSubmissionDTO,
} from './submissions'

/**
 * FINANCING REQUEST v3 — the financing application machine (§5.1) + THE GATE.
 *
 *   DRAFT ──submit──▶ SUBMITTED ──admin opens──▶ UNDER_PLATFORM_REVIEW
 *                        │  (per-RequirementSubmission verification)   │
 *                        │                          items missing ──▶ RETURNED_FOR_COMPLETION
 *                        │ ALL required items VERIFIED/WAIVED (R-4)   │ (applicant fixes + resubmits)
 *                        ▼
 *   FORWARDED_TO_FINANCIER ──financier opens──▶ UNDER_FINANCIER_REVIEW
 *                        │ offer sent                    decline / no offer + expiresAt
 *                        ▼                                       ▼
 *                      OFFERED ──applicant accepts──▶ ACCEPTED │ DECLINED / EXPIRED
 * Any pre-forward state ──applicant cancels──▶ CANCELLED   (lazy sweep → EXPIRED)
 *
 * THE PLATFORM GATE (R-4 / DP-23) is structural: the forward transition
 * re-checks every REQUIRED submission inside the same transaction, and the
 * financier inbox query only ever lists FORWARDED+ requests. A SUBMITTED
 * request is platform-private by construction.
 */

// transition table: status → action → next status (authorization checked separately)
const FINANCING_TRANSITIONS: Record<string, Record<string, FinancingRequestStatus>> = {
  DRAFT: { SUBMIT: 'SUBMITTED', CANCEL: 'CANCELLED' },
  SUBMITTED: { START_REVIEW: 'UNDER_PLATFORM_REVIEW', FORWARD: 'FORWARDED_TO_FINANCIER', CANCEL: 'CANCELLED' },
  UNDER_PLATFORM_REVIEW: { RETURN: 'RETURNED_FOR_COMPLETION', FORWARD: 'FORWARDED_TO_FINANCIER', CANCEL: 'CANCELLED' },
  RETURNED_FOR_COMPLETION: { RESUBMIT: 'UNDER_PLATFORM_REVIEW', CANCEL: 'CANCELLED' },
  FORWARDED_TO_FINANCIER: { FINANCIER_OPEN: 'UNDER_FINANCIER_REVIEW' },
  UNDER_FINANCIER_REVIEW: { DECLINE: 'DECLINED' },
  OFFERED: { DECLINE: 'DECLINED' },
}

function canTransition(status: string, action: string): FinancingRequestStatus | null {
  return FINANCING_TRANSITIONS[status]?.[action as keyof (typeof FINANCING_TRANSITIONS)[string]] ?? null
}

// ── DTOs ────────────────────────────────────────────────────────────────────

export interface FinancingRequestSummaryDTO {
  id: string
  number: string
  status: FinancingRequestStatus
  organizationId: string | null
  organizationName: string | null
  applicant: { id: string; name: string; email: string }
  serviceId: string
  serviceName: string
  serviceKind: string
  financierOrgId: string
  financierOrgName: string
  targetType: string
  multiGroupId: string | null
  amountRequested: number
  currency: string
  activityName: string | null
  activityCity: string | null
  purpose: string | null
  consentAt: string | null
  submittedAt: string | null
  forwardedAt: string | null
  returnedAt: string | null
  returnedReason: string | null
  expiresAt: string | null
  closedAt: string | null
  createdAt: string
  submissionStats?: { total: number; verified: number; missing: number }
  offerCount?: number
  bestOffer?: { id: string; amount: number; status: string } | null
}

export interface FinancingRequestDetailDTO extends FinancingRequestSummaryDTO {
  platformReviewedById: string | null
  platformReviewedAt: string | null
  platformNote: string | null
  submissions: RequirementSubmissionDTO[]
  gate: { totalRequired: number; verified: number; waived: number; missing: { submissionId: string; title: string; status: string }[]; canForward: boolean }
  offers?: unknown[]
}

// ── Serialization ───────────────────────────────────────────────────────────

const requestInclude = {
  organization: { select: { name: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  service: {
    select: {
      id: true,
      name: true,
      serviceKind: true,
      financierProfile: { select: { id: true, organizationId: true, organization: { select: { name: true } } } }
    },
  },
  _count: { select: { offers: true, submissions: true } },
} as const

type RequestRaw = Awaited<ReturnType<typeof db.financingRequest.findFirstOrThrow>>

function serializeRequest(r: RequestRaw & Parameters<typeof serializeSummaryInner>[0]): FinancingRequestDetailDTO {
  const base = serializeSummaryInner(r)
  return {
    ...base,
    platformReviewedById: r.platformReviewedById,
    platformReviewedAt: iso(r.platformReviewedAt),
    platformNote: r.platformNote,
    submissions: [],
    gate: { totalRequired: 0, verified: 0, waived: 0, missing: [], canForward: true },
  }
}

function serializeSummaryInner(
  r: RequestRaw & {
    organization: { name: string } | null
    createdBy: { id: string; name: string; email: string | null }
    service: {
      id: string
      name: string
      serviceKind: string
      financierProfile: { id: string; organizationId: string; organization: { name: string } }
    }
    _count?: { offers: number; submissions: number }
    offers?: { id: string; amount: number; status: string }[]
  }
): FinancingRequestSummaryDTO {
  return {
    id: r.id,
    number: r.number,
    status: r.status as FinancingRequestStatus,
    organizationId: r.organizationId,
    organizationName: r.organization?.name ?? null,
    applicant: { id: r.createdBy.id, name: r.createdBy.name, email: r.createdBy.email },
    serviceId: r.service.id,
    serviceName: r.service.name,
    serviceKind: r.service.serviceKind,
    financierOrgId: r.service.financierProfile.organizationId,
    financierOrgName: r.service.financierProfile.organization.name,
    targetType: r.targetType,
    multiGroupId: r.multiGroupId,
    amountRequested: r.amountRequested,
    currency: r.currency,
    tenorRequestedMonths: r.tenorRequestedMonths ?? null,
    activityName: r.activityName,
    activityCity: r.activityCity,
    purpose: r.purpose,
    consentAt: iso(r.consentAt),
    submittedAt: iso(r.submittedAt),
    forwardedAt: iso(r.forwardedAt),
    returnedAt: iso(r.returnedAt),
    returnedReason: r.returnedReason,
    expiresAt: iso(r.expiresAt),
    closedAt: iso(r.closedAt),
    createdAt: r.createdAt.toISOString(),
    offerCount: r._count?.offers,
    bestOffer: r.offers && r.offers.length > 0 ? r.offers[0] : null,
  }
}

// ── Creation (single + multi — DP-25) ─────────────────────────────────────

export interface CreateFinancingRequestInput {
  serviceId: string
  organizationId?: string | null
  targetType?: string
  targetId?: string | null
  activityStatus?: string | null
  activityName?: string | null
  activityDescription?: string | null
  activityStartDate?: string | null
  activityCity?: string | null
  activityDistrict?: string | null
  activityAddress?: string | null
  activityLocationType?: string | null
  activityCategory?: string | null
  activityCategoryOther?: string | null
  capitalAmount?: number | null
  ownContributionAmount?: number | null
  monthlyInstallmentCapacity?: number | null
  previousFinancing?: boolean | null
  otherIncomeSources?: string | null
  amountRequested: number
  currency?: string
  purpose?: string | null
  tenorRequestedMonths?: number | null
  guaranteeType?: string | null
  guaranteeTypeOther?: string | null
  guaranteeStatus?: string | null
  guaranteeStatusOther?: string | null
  applicantNotes?: string | null
}

/** Service must be a FINANCING-kind ACTIVE offering; amount within range when set. */
async function assertServiceApplicable(serviceId: string, amount: number): Promise<{
  id: string
  financierProfileId: string
  financierOrgId: string
}> {
  const service = await db.financierService.findUnique({
    where: { id: serviceId },
    include: { financierProfile: { select: { id: true, organizationId: true } } },
  })
  if (!service) throw new FinancingError('Service not found', 404)
  if (service.serviceKind !== 'FINANCING') {
    throw new FinancingError('That service is an accreditation program — use the accreditation flow', 400)
  }
  if (service.status !== 'ACTIVE') throw new FinancingError('That service is not accepting applications', 409)
  if (service.amountMin != null && amount < service.amountMin) {
    throw new FinancingError(`This service finances from ${service.amountMin} ${service.currency}`)
  }
  if (service.amountMax != null && amount > service.amountMax) {
    throw new FinancingError(`This service finances up to ${service.amountMax} ${service.currency}`)
  }
  return {
    id: service.id,
    financierProfileId: service.financierProfile.id,
    financierOrgId: service.financierProfile.organizationId,
  }
}

function parseFields(input: CreateFinancingRequestInput) {
  const parseDate = (v: string | null | undefined): Date | null => {
    if (!v) return null
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return {
    organizationId: input.organizationId ?? null,
    targetType: input.targetType ?? 'WORKING_CAPITAL',
    targetId: input.targetId ?? null,
    activityStatus: input.activityStatus ?? null,
    activityName: input.activityName?.trim() || null,
    activityDescription: input.activityDescription?.trim() || null,
    activityStartDate: parseDate(input.activityStartDate),
    activityCity: input.activityCity?.trim() || null,
    activityDistrict: input.activityDistrict?.trim() || null,
    activityAddress: input.activityAddress?.trim() || null,
    activityLocationType: input.activityLocationType ?? null,
    activityCategory: input.activityCategory ?? null,
    activityCategoryOther: input.activityCategoryOther?.trim() || null,
    capitalAmount: input.capitalAmount ?? null,
    ownContributionAmount: input.ownContributionAmount ?? null,
    monthlyInstallmentCapacity: input.monthlyInstallmentCapacity ?? null,
    previousFinancing: input.previousFinancing ?? null,
    otherIncomeSources: input.otherIncomeSources?.trim() || null,
    amountRequested: input.amountRequested,
    currency: input.currency ?? 'YER',
    purpose: input.purpose?.trim() || null,
    tenorRequestedMonths: input.tenorRequestedMonths ?? null,
    guaranteeType: input.guaranteeType ?? null,
    guaranteeTypeOther: input.guaranteeTypeOther?.trim() || null,
    guaranteeStatus: input.guaranteeStatus ?? null,
    guaranteeStatusOther: input.guaranteeStatusOther?.trim() || null,
    applicantNotes: input.applicantNotes?.trim() || null,
  }
}

/** Create a single (EXCLUSIVE) financing request draft. */
export async function createFinancingRequest(
  userId: string,
  input: CreateFinancingRequestInput
): Promise<FinancingRequestSummaryDTO> {
  if (input.amountRequested <= 0) throw new FinancingError('Requested amount must be positive')
  await assertServiceApplicable(input.serviceId, input.amountRequested)
  if (input.organizationId) {
    const membership = await db.organizationMember.findFirst({
      where: { userId, organizationId: input.organizationId },
    })
    if (!membership) throw new FinancingError('You are not a member of that organization', 403)
  }
  const number = await nextNumber('FIN')
  const fields = parseFields(input)
  const created = await db.financingRequest.create({
    data: { ...fields, number, createdById: userId, status: 'DRAFT', serviceId: input.serviceId },
    include: requestInclude,
  })
  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'FINANCING_REQUEST_CREATED',
    entityType: 'FinancingRequest',
    entityId: created.id,
    summary: `Financing request ${number} drafted for ${created.service.name} (${fields.amountRequested} ${fields.currency})`,
    metadata: { serviceId: input.serviceId, amountRequested: fields.amountRequested },
  })
  return serializeSummaryInner(created as never)
}

/**
 * Multi-financier routing (DP-25): N sibling DRAFT requests sharing a
 * multiGroupId — one per selected financier's matching FINANCING service.
 * Each sibling carries its OWN checklist (per-financier requirements).
 */
export async function createMultiFinancingRequests(
  userId: string,
  input: CreateFinancingRequestInput & { serviceIds: string[] }
): Promise<FinancingRequestSummaryDTO[]> {
  const serviceIds = [...new Set(input.serviceIds)]
  if (serviceIds.length < 2) throw new FinancingError('Multi-financier applications need at least two services')
  if (input.amountRequested <= 0) throw new FinancingError('Requested amount must be positive')
  for (const serviceId of serviceIds) {
    await assertServiceApplicable(serviceId, input.amountRequested)
  }
  if (input.organizationId) {
    const membership = await db.organizationMember.findFirst({
      where: { userId, organizationId: input.organizationId },
    })
    if (!membership) throw new FinancingError('You are not a member of that organization', 403)
  }
  // no duplicate financiers in one group (one checklist per financier)
  const services = await db.financierService.findMany({
    where: { id: { in: serviceIds } },
    include: { financierProfile: true },
  })
  const orgs = new Set(services.map((s) => s.financierProfile.organizationId))
  if (orgs.size !== serviceIds.length) {
    throw new FinancingError('Pick one service per financier — each sibling carries its own checklist')
  }

  const multiGroupId = `MG-${new Date().getFullYear()}-${randomBytes(3).toString('hex').toUpperCase()}`
  const fields = parseFields(input)
  const created: (RequestRaw & Parameters<typeof serializeSummaryInner>[0])[] = []
  for (const serviceId of serviceIds) {
    const number = await nextNumber('FIN')
    created.push(
      await db.financingRequest.create({
        data: {
          ...fields,
          number,
          createdById: userId,
          status: 'DRAFT',
          serviceId,
          multiGroupId,
        },
        include: requestInclude,
      })
    )
  }
  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'FINANCING_REQUEST_CREATED',
    entityType: 'FinancingRequest',
    entityId: created[0].id,
    summary: `Multi-financier application (${created.length} siblings, group ${multiGroupId}) drafted`,
    metadata: { multiGroupId, serviceIds, numbers: created.map((c) => c.number) },
  })
  return created.map((c) => serializeSummaryInner(c as never))
}

// ── Submit (checklist generation + auto-evals + consent + expiry) ─────────

export async function submitFinancingRequest(
  userId: string,
  requestId: string,
  options?: { consent?: boolean; answers?: ChecklistAnswer[] }
): Promise<FinancingRequestDetailDTO> {
  const request = await db.financingRequest.findUnique({
    where: { id: requestId },
    include: {
      ...requestInclude,
      service: {
        select: {
          id: true,
          name: true,
          serviceKind: true,
          status: true,
          currency: true,
          amountMin: true,
          amountMax: true,
          financierProfile: { select: { id: true, organizationId: true, organization: { select: { name: true } } } },
        },
      },
    },
  })
  if (!request) throw new FinancingError('Request not found', 404)
  await assertApplicantActor(userId, request)
  const next = canTransition(request.status, 'SUBMIT')
  if (!next) throw new FinancingError(`Cannot submit a request that is ${request.status}`, 409)
  if (request.service.serviceKind !== 'FINANCING' || request.service.status !== 'ACTIVE') {
    throw new FinancingError('That service is not accepting applications', 409)
  }
  // Re-validate the ask against the service's range — the wizard may have sat
  // on a DRAFT while the financier re-priced the service (create-time check is
  // not enough).
  if (request.service.amountMin != null && request.amountRequested < request.service.amountMin) {
    throw new FinancingError(`This service finances from ${request.service.amountMin} ${request.service.currency}`)
  }
  if (request.service.amountMax != null && request.amountRequested > request.service.amountMax) {
    throw new FinancingError(`This service finances up to ${request.service.amountMax} ${request.service.currency}`)
  }

  const intake = await resolvePanel('financingIntake')
  if (intake.requireConsent && !options?.consent) {
    throw new FinancingError('Data-transfer consent is required before submitting')
  }
  const general = await resolvePanel('financingGeneral')
  if (general.enabled === false) {
    throw new FinancingError('Financing applications are currently disabled by the platform', 403)
  }
  const expiryDays = Number(general.requestExpiryDays) || 30

  const now = new Date()
  await db.financingRequest.update({
    where: { id: requestId },
    data: {
      status: 'SUBMITTED',
      submittedAt: now,
      consentAt: options?.consent ? now : request.consentAt,
      expiresAt: new Date(now.getTime() + expiryDays * 86_400_000),
    },
  })
  // THE checklist: one submission per active requirement + auto-evals + answers
  await generateChecklist('FINANCING', requestId, request.serviceId, request.service.financierProfile.organizationId, {
    applicantUserId: request.createdById,
    organizationId: request.organizationId,
    answers: options?.answers,
  })

  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'FINANCING_REQUEST_SUBMITTED',
    entityType: 'FinancingRequest',
    entityId: requestId,
    summary: `Request ${request.number} submitted to the platform gate`,
    metadata: { from: request.status, to: 'SUBMITTED', serviceId: request.serviceId },
  })
  return getFinancingRequestDetail(userId, requestId)
}

/** Applicant edits + resubmits after RETURNED_FOR_COMPLETION → back to review. */
export async function resubmitFinancingRequest(
  userId: string,
  requestId: string,
  options?: { answers?: ChecklistAnswer[] }
): Promise<FinancingRequestDetailDTO> {
  const request = await db.financingRequest.findUnique({
    where: { id: requestId },
    include: {
      service: { select: { id: true, financierProfile: { select: { organizationId: true } } } },
    },
  })
  if (!request) throw new FinancingError('Request not found', 404)
  await assertApplicantActor(userId, request)
  const next = canTransition(request.status, 'RESUBMIT')
  if (!next) throw new FinancingError(`Cannot resubmit a request that is ${request.status}`, 409)

  if (options?.answers?.length) {
    await applyChecklistAnswers('FINANCING', requestId, options.answers, {
      userId: request.createdById,
      organizationId: request.organizationId,
    })
  }
  await db.financingRequest.update({
    where: { id: requestId },
    data: { status: 'UNDER_PLATFORM_REVIEW', returnedAt: null, returnedReason: null },
  })
  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'FINANCING_REQUEST_RESUBMITTED',
    entityType: 'FinancingRequest',
    entityId: requestId,
    summary: `Request ${request.number} resubmitted after return — verified items preserved`,
    metadata: { from: request.status, to: 'UNDER_PLATFORM_REVIEW' },
  })
  return getFinancingRequestDetail(userId, requestId)
}

/** Applicant cancels — pre-forward only (task FIN-3 ruling; see worklog). */
export async function cancelFinancingRequest(
  userId: string,
  requestId: string
): Promise<FinancingRequestSummaryDTO> {
  const request = await db.financingRequest.findUnique({ where: { id: requestId }, include: requestInclude })
  if (!request) throw new FinancingError('Request not found', 404)
  await assertApplicantActor(userId, request)
  if (!(CANCELABLE_PRE_FORWARD as readonly string[]).includes(request.status)) {
    throw new FinancingError(
      request.forwardedAt
        ? 'This request was already forwarded to the financier — decline the offers or let it expire instead'
        : `Cannot cancel a request that is ${request.status}`,
      409
    )
  }
  const now = new Date()
  const updated = await db.financingRequest.update({
    where: { id: requestId },
    data: { status: 'CANCELLED', closedAt: now },
    include: requestInclude,
  })
  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'FINANCING_REQUEST_CANCELLED',
    entityType: 'FinancingRequest',
    entityId: requestId,
    summary: `Request ${request.number} cancelled by the applicant`,
    metadata: { from: request.status, to: 'CANCELLED' },
  })
  return serializeSummaryInner(updated as never)
}

// ── THE PLATFORM GATE (R-4 / DP-23) — admin actions ────────────────────────

/** Admin opens a SUBMITTED request → UNDER_PLATFORM_REVIEW (stamps reviewer). */
export async function startPlatformReview(
  adminId: string,
  requestId: string
): Promise<FinancingRequestDetailDTO> {
  const request = await db.financingRequest.findUnique({ where: { id: requestId } })
  if (!request) throw new FinancingError('Request not found', 404)
  const next = canTransition(request.status, 'START_REVIEW')
  if (!next) throw new FinancingError(`Cannot start review on a request that is ${request.status}`, 409)
  const now = new Date()
  await db.financingRequest.update({
    where: { id: requestId },
    data: {
      status: next,
      platformReviewedById: request.platformReviewedById ?? adminId,
      platformReviewedAt: request.platformReviewedAt ?? now,
    },
  })
  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: 'PLATFORM_REVIEW_STARTED',
    entityType: 'FinancingRequest',
    entityId: requestId,
    summary: `Platform review started on ${request.number}`,
    metadata: { from: request.status, to: next },
  })
  return adminGetFinancingRequest(requestId)
}

/** Admin returns an incomplete/incorrect request with an aggregate reason. */
export async function returnRequest(
  adminId: string,
  requestId: string,
  reason: string
): Promise<FinancingRequestDetailDTO> {
  const clean = reason.trim()
  if (!clean) throw new FinancingError('A return reason is required')
  const request = await db.financingRequest.findUnique({ where: { id: requestId } })
  if (!request) throw new FinancingError('Request not found', 404)
  const next = canTransition(request.status, 'RETURN')
  if (!next) throw new FinancingError(`Cannot return a request that is ${request.status}`, 409)
  const now = new Date()
  await db.financingRequest.update({
    where: { id: requestId },
    data: {
      status: next,
      returnedAt: now,
      returnedReason: clean,
      platformReviewedById: request.platformReviewedById ?? adminId,
      platformReviewedAt: request.platformReviewedAt ?? now,
    },
  })
  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: 'REQUEST_RETURNED',
    entityType: 'FinancingRequest',
    entityId: requestId,
    summary: `Request ${request.number} returned for completion: ${clean}`,
    metadata: { reason: clean },
  })
  await emitNotification({
    userId: request.createdById,
    type: 'PLATFORM_RETURNED_REQUEST',
    title: `Request ${request.number} needs completion`,
    body: `The platform returned your request: ${clean}. Fix the flagged checklist items and resubmit.`,
    linkView: 'financing',
    linkId: requestId,
  })
  return adminGetFinancingRequest(requestId)
}

/**
 * THE GATE — forward to the financier. Transactional guard (R-4/DP-23):
 * EVERY required submission must be VERIFIED or WAIVED-with-note inside the
 * same transaction; any PENDING/SUBMITTED/REJECTED item blocks with a 422
 * listing the missing items. Sets forwardedAt + notifies financier staff.
 */
export async function forwardRequest(
  adminId: string,
  requestId: string
): Promise<FinancingRequestDetailDTO> {
  const request = await db.financingRequest.findUnique({
    where: { id: requestId },
    include: {
      service: {
        select: {
          name: true,
          financierProfile: { select: { organizationId: true, organization: { select: { name: true } } } },
        },
      },
    },
  })
  if (!request) throw new FinancingError('Request not found', 404)
  const next = canTransition(request.status, 'FORWARD')
  if (!next) {
    throw new FinancingError(
      request.status === 'SUBMITTED'
        ? 'Open the request in review first'
        : `Cannot forward a request that is ${request.status}`,
      409
    )
  }

  const now = new Date()
  await db.$transaction(async (tx) => {
    // THE GUARD — assertGateComplete re-reads the checklist INSIDE the
    // transaction (§3.6 rule) and throws GateBlockedError (422 w/ missing items).
    await assertGateComplete('FINANCING', requestId, tx)
    await tx.financingRequest.update({
      where: { id: requestId },
      data: {
        status: next,
        forwardedAt: now,
        platformReviewedById: request.platformReviewedById ?? adminId,
        platformReviewedAt: request.platformReviewedAt ?? now,
      },
    })
  })

  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: 'REQUEST_FORWARDED',
    entityType: 'FinancingRequest',
    entityId: requestId,
    summary: `Gate passed — ${request.number} forwarded to ${request.service.financierProfile.organization.name}`,
    metadata: { financierOrgId: request.service.financierProfile.organizationId },
  })

  // Notify the applicant + every OWNER/ADMIN member of the financier org
  await emitNotification({
    userId: request.createdById,
    type: 'PLATFORM_FORWARDED_REQUEST',
    title: `Request ${request.number} passed verification`,
    body: `Your application for ${request.service.name} was forwarded to ${request.service.financierProfile.organization.name}.`,
    linkView: 'financing',
    linkId: requestId,
  })
  const staff = await db.organizationMember.findMany({
    where: {
      organizationId: request.service.financierProfile.organizationId,
      role: { in: ['OWNER', 'ADMIN'] },
    },
    select: { userId: true },
  })
  await emitNotifications(
    staff.map((s) => ({
      userId: s.userId,
      type: 'FINANCING_REQUEST_RECEIVED' as const,
      title: `New financing request ${request.number}`,
      body: `${request.service.financierProfile.organization.name}: a verified application for ${request.service.name} awaits your review.`,
      linkView: 'financier' as const,
      linkId: requestId,
    }))
  )
  return adminGetFinancingRequest(requestId)
}

/**
 * autoForwardWhenAllVerified (financingGeneral): after a verdict, forward
 * immediately when nothing is missing. An admin verdict still happened on
 * every item — only the forward click is skipped (DP-23: automation may
 * pre-fill verdicts, never skip review).
 */
export async function maybeAutoForward(
  adminId: string,
  requestId: string
): Promise<boolean> {
  const request = await db.financingRequest.findUnique({ where: { id: requestId } })
  if (!request) return false
  if (!['SUBMITTED', 'UNDER_PLATFORM_REVIEW'].includes(request.status)) return false
  const general = await resolvePanel('financingGeneral')
  if (!general.autoForwardWhenAllVerified) return false
  const status = await gateStatus('FINANCING', requestId)
  if (!status.canForward) return false
  await forwardRequest(adminId, requestId)
  return true
}

// ── Applicant views ─────────────────────────────────────────────────────────

export async function listMyFinancingRequests(
  userId: string
): Promise<{ requests: FinancingRequestSummaryDTO[]; groups: { multiGroupId: string; requests: FinancingRequestSummaryDTO[] }[] }> {
  await sweepFinancing()
  const orgs = await db.organizationMember.findMany({
    where: { userId },
    select: { organizationId: true },
  })
  const requests = await db.financingRequest.findMany({
    where: {
      OR: [
        { createdById: userId },
        ...(orgs.length ? [{ organizationId: { in: orgs.map((o) => o.organizationId) } }] : []),
      ],
    },
    include: {
      ...requestInclude,
      offers: { where: { status: 'SENT' }, orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, amount: true, status: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  const dtos = requests.map((r) => serializeSummaryInner(r as never))
  // multiGroup comparison view: latest SENT offer per sibling (DP-25)
  const groups = Object.values(
    requests
      .filter((r) => r.multiGroupId)
      .reduce<Record<string, FinancingRequestSummaryDTO[]>>((acc, r) => {
        acc[r.multiGroupId!] = [...(acc[r.multiGroupId!] ?? []), serializeSummaryInner(r as never)]
        return acc
      }, {})
  ).map((groupRequests) => ({
    multiGroupId: groupRequests[0].multiGroupId!,
    requests: groupRequests,
  }))
  return { requests: dtos, groups }
}

export async function getFinancingRequestDetail(
  userId: string,
  requestId: string,
  actorRole = 'USER'
): Promise<FinancingRequestDetailDTO> {
  await sweepFinancing()
  const request = await db.financingRequest.findUnique({
    where: { id: requestId },
    include: {
      ...requestInclude,
      createdBy: { select: { id: true, name: true, email: true } },
    },
  })
  if (!request) throw new FinancingError('Request not found', 404)
  const isAdmin = actorRole === 'ADMIN'
  if (!isAdmin) await assertApplicantActor(userId, request)

  const detail = serializeRequest(request as never)
  const subs = await db.requirementSubmission.findMany({
    where: { financingRequestId: requestId },
    include: {
      serviceRequirement: {
        include: { conditionTemplate: { include: { options: { orderBy: { position: 'asc' as const } } } } },
      },
    },
    orderBy: [{ serviceRequirement: { displayOrder: 'asc' } }, { createdAt: 'asc' }],
  })
  const { serializeSubmission } = await import('./submissions')
  detail.submissions = subs.map((s) => serializeSubmission(s as never))
  const status = await gateStatus('FINANCING', requestId)
  detail.gate = {
    totalRequired: status.totalRequired,
    verified: status.verified,
    waived: status.waived,
    missing: status.missing.map((m) => ({ submissionId: m.submissionId, title: m.title, status: m.status })),
    canForward: status.canForward,
  }
  // Offers only exist post-forward; the applicant never sees DRAFT offers
  const { serializeOffersForApplicant } = await import('./offers')
  detail.offers = await serializeOffersForApplicant(requestId)
  return detail
}

// ── Admin gate queue + dossier ──────────────────────────────────────────────

export interface GateQueueResult {
  requests: FinancingRequestSummaryDTO[]
  total: number
  page: number
  limit: number
}

export async function adminGateQueue(filter?: {
  status?: string
  search?: string
  page?: number
  limit?: number
}): Promise<GateQueueResult> {
  await sweepFinancing()
  const statuses = filter?.status
    ? [filter.status]
    : ['SUBMITTED', 'UNDER_PLATFORM_REVIEW', 'RETURNED_FOR_COMPLETION']
  const search = filter?.search?.trim()
  const limit = Math.min(Math.max(Number(filter?.limit) || 20, 1), 100)
  const page = Math.max(Number(filter?.page) || 1, 1)
  const where = {
    status: { in: statuses },
    ...(search
      ? {
          OR: [
            { number: { contains: search } },
            { activityName: { contains: search } },
            { createdBy: { name: { contains: search } } },
            { createdBy: { email: { contains: search } } },
            { organization: { name: { contains: search } } },
          ],
        }
      : {}),
  }
  const [rows, total] = await Promise.all([
    db.financingRequest.findMany({
      where,
      include: requestInclude,
      orderBy: { submittedAt: 'asc' },
      take: limit,
      skip: (page - 1) * limit,
    }),
    db.financingRequest.count({ where }),
  ])
  // Checklist progress per row (W-GATE-QUEUE "items" column — FIN-7): one
  // extra query for the page's ids; REQUIRED items only (gate semantics).
  const ids = rows.map((r) => r.id)
  const subs = ids.length
    ? await db.requirementSubmission.findMany({
        where: { financingRequestId: { in: ids } },
        select: {
          financingRequestId: true,
          status: true,
          serviceRequirement: { select: { isRequired: true } },
        },
      })
    : []
  const statsByReq = new Map<string, { total: number; verified: number; missing: number }>()
  for (const s of subs) {
    if (!s.serviceRequirement.isRequired || !s.financingRequestId) continue
    const st = statsByReq.get(s.financingRequestId) ?? { total: 0, verified: 0, missing: 0 }
    st.total += 1
    if (s.status === 'VERIFIED' || s.status === 'WAIVED') st.verified += 1
    else st.missing += 1
    statsByReq.set(s.financingRequestId, st)
  }
  return {
    requests: rows.map((r) => ({
      ...serializeSummaryInner(r as never),
      submissionStats: statsByReq.get(r.id) ?? { total: 0, verified: 0, missing: 0 },
    })),
    total,
    page,
    limit,
  }
}

export async function adminGetFinancingRequest(requestId: string): Promise<FinancingRequestDetailDTO> {
  const request = await db.financingRequest.findUnique({
    where: { id: requestId },
    include: requestInclude,
  })
  if (!request) throw new FinancingError('Request not found', 404)
  const detail = serializeRequest(request as never)
  const subs = await db.requirementSubmission.findMany({
    where: { financingRequestId: requestId },
    include: {
      serviceRequirement: {
        include: { conditionTemplate: { include: { options: { orderBy: { position: 'asc' as const } } } } },
      },
      accountDocument: true,
    },
    orderBy: [{ serviceRequirement: { displayOrder: 'asc' } }, { createdAt: 'asc' }],
  })
  const { serializeSubmission } = await import('./submissions')
  detail.submissions = subs.map((s) => ({
    ...serializeSubmission(s as never),
  }))
  const status = await gateStatus('FINANCING', requestId)
  detail.gate = {
    totalRequired: status.totalRequired,
    verified: status.verified,
    waived: status.waived,
    missing: status.missing.map((m) => ({ submissionId: m.submissionId, title: m.title, status: m.status })),
    canForward: status.canForward,
  }
  return detail
}

// ── Financier console (structural inbox exclusion — R-4) ───────────────────

/**
 * THE financier inbox: ONLY requests that passed the gate. Query-level
 * exclusion (R-4/DP-23) — a financier literally cannot list a request the
 * platform has not forwarded.
 */
export async function financierInbox(
  financierOrgId: string,
  filter?: { status?: string; page?: number; limit?: number }
): Promise<GateQueueResult> {
  await sweepFinancing()
  const limit = Math.min(Math.max(Number(filter?.limit) || 20, 1), 100)
  const page = Math.max(Number(filter?.page) || 1, 1)
  const where = {
    service: { financierProfile: { organizationId: financierOrgId } },
    // R-4 structural exclusion: only gate-passed requests ever appear —
    // visible statuses OR a forwardedAt stamp (pre-forward requests never
    // carry one, and a forwarded request never returns to a pre-forward state).
    OR: [
      { status: { in: [...FINANCIER_VISIBLE_STATUSES] } },
      { forwardedAt: { not: null } },
    ],
    ...(filter?.status ? { status: filter.status } : {}),
  }
  const [rows, total] = await Promise.all([
    db.financingRequest.findMany({
      where,
      include: {
        ...requestInclude,
        offers: { where: { status: 'SENT' }, orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, amount: true, status: true } },
      },
      orderBy: { forwardedAt: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
    }),
    db.financingRequest.count({ where }),
  ])
  return { requests: rows.map((r) => serializeSummaryInner(r as never)), total, page, limit }
}

/** Financier-side visibility check (detail views + offer guards). */
export async function assertFinancierCanSee(
  userId: string,
  request: { id: string; status: string; forwardedAt: Date | null; service: { financierProfile: { organizationId: string } } }
): Promise<void> {
  const visible =
    (FINANCIER_VISIBLE_STATUSES as readonly string[]).includes(request.status) || request.forwardedAt != null
  if (!visible) throw new FinancingError('Request not found', 404)
  const membership = await db.organizationMember.findFirst({
    where: {
      userId,
      organizationId: request.service.financierProfile.organizationId,
      role: { in: ['OWNER', 'ADMIN'] },
    },
  })
  if (!membership) throw new FinancingError('Financier staff access required', 403)
}

export async function financierGetRequest(userId: string, requestId: string): Promise<FinancingRequestDetailDTO> {
  const request = await db.financingRequest.findUnique({
    where: { id: requestId },
    include: {
      ...requestInclude,
      service: {
        select: {
          id: true,
          name: true,
          serviceKind: true,
          financierProfile: { select: { id: true, organizationId: true, organization: { select: { name: true } } } },
        },
      },
    },
  })
  if (!request) throw new FinancingError('Request not found', 404)
  await assertFinancierCanSee(userId, request)
  const detail = serializeRequest(request as never)
  const subs = await db.requirementSubmission.findMany({
    where: { financingRequestId: requestId },
    include: {
      serviceRequirement: {
        include: { conditionTemplate: { include: { options: { orderBy: { position: 'asc' as const } } } } },
      },
    },
    orderBy: [{ serviceRequirement: { displayOrder: 'asc' } }, { createdAt: 'asc' }],
  })
  const { serializeSubmission } = await import('./submissions')
  detail.submissions = subs.map((s) => serializeSubmission(s as never))
  const status = await gateStatus('FINANCING', requestId)
  detail.gate = {
    totalRequired: status.totalRequired,
    verified: status.verified,
    waived: status.waived,
    missing: status.missing.map((m) => ({ submissionId: m.submissionId, title: m.title, status: m.status })),
    canForward: status.canForward,
  }
  const { serializeOffersForFinancier } = await import('./offers')
  detail.offers = await serializeOffersForFinancier(requestId)
  return detail
}

/** Financier opens a forwarded request → UNDER_FINANCIER_REVIEW. */
export async function financierOpenReview(userId: string, requestId: string): Promise<FinancingRequestDetailDTO> {
  const request = await db.financingRequest.findUnique({
    where: { id: requestId },
    include: { service: { select: { financierProfile: { select: { organizationId: true } } } } },
  })
  if (!request) throw new FinancingError('Request not found', 404)
  await assertFinancierCanSee(userId, request)
  const next = canTransition(request.status, 'FINANCIER_OPEN')
  if (!next) throw new FinancingError(`Cannot open a request that is ${request.status}`, 409)
  await db.financingRequest.update({ where: { id: requestId }, data: { status: next } })
  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'FINANCING_STATUS_CHANGED',
    entityType: 'FinancingRequest',
    entityId: requestId,
    summary: `${request.number}: financier review started`,
    metadata: { from: request.status, to: next },
  })
  return financierGetRequest(userId, requestId)
}

/** Financier declines a request with a note (notes via AuditLog — DP-15). */
export async function financierDeclineRequest(
  userId: string,
  requestId: string,
  note: string
): Promise<FinancingRequestSummaryDTO> {
  const clean = note.trim()
  if (!clean) throw new FinancingError('A decline note is required')
  const request = await db.financingRequest.findUnique({
    where: { id: requestId },
    include: {
      ...requestInclude,
      service: { select: { financierProfile: { select: { organizationId: true, organization: { select: { name: true } } } } } },
    },
  })
  if (!request) throw new FinancingError('Request not found', 404)
  await assertFinancierCanSee(userId, request)
  const next = canTransition(request.status, 'DECLINE')
  if (!next) throw new FinancingError(`Cannot decline a request that is ${request.status}`, 409)
  const now = new Date()
  const updated = await db.financingRequest.update({
    where: { id: requestId },
    data: { status: next, closedAt: now },
    include: requestInclude,
  })
  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'FINANCING_STATUS_CHANGED',
    entityType: 'FinancingRequest',
    entityId: requestId,
    summary: `${request.number} declined by the financier: ${clean}`,
    metadata: { note: clean },
  })
  await emitNotification({
    userId: request.createdById,
    type: 'FINANCING_STATUS_CHANGED',
    title: `Request ${request.number} was declined`,
    body: `${request.service.financierProfile.organization.name} declined your application: ${clean}`,
    linkView: 'financing',
    linkId: requestId,
  })
  return serializeSummaryInner(updated as never)
}

// ── Lazy expiry sweep (mirrors disputes.ts sweepDisputes) ───────────────────

let sweepsInFlight = false

/**
 * Fire-and-forget financing sweeps from read paths — single-flight guarded.
 * Expires requests past expiresAt (pre-terminal states) and offers past
 * validUntil (idempotent conditional updateMany — concurrent sweeps never
 * notify twice).
 */
export async function sweepFinancing(): Promise<void> {
  if (sweepsInFlight) return
  sweepsInFlight = true
  try {
    const now = new Date()

    // Offers past their validity window → EXPIRED (conditional update)
    await db.financingOffer.updateMany({
      where: { status: 'SENT', validUntil: { lt: now } },
      data: { status: 'EXPIRED' },
    })

    // Requests past expiresAt → EXPIRED (conditional update, no notify loop)
    await db.financingRequest.updateMany({
      where: { status: { in: [...FINANCING_PRE_TERMINAL] }, expiresAt: { lt: now } },
      data: { status: 'EXPIRED', closedAt: now },
    })
  } catch {
    // best-effort — reads must never fail because a sweep hiccupped
  } finally {
    sweepsInFlight = false
  }
}

/** Nudge both financing sweeps (requests + accreditations) from read paths. */
export async function nudgeFinancingSweeps(): Promise<void> {
  try {
    const { sweepAccreditations } = await import('./accreditation')
    await Promise.allSettled([sweepFinancing(), sweepAccreditations()])
  } catch {
    // best-effort
  }
}
