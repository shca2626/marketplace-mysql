import { db } from '@/lib/db'
import { recordAudit, recordAuditTx } from '@/server/modules/audit/service'
import { emitNotification, emitNotifications } from '@/server/modules/notifications/service'
import { nextNumber } from '@/server/modules/sequences/service'
import { resolvePanel } from '@/server/modules/settings/service'
import {
  FinancingError,
  CANCELABLE_PRE_FORWARD,
  ACCREDITATION_TERMINAL,
  FINANCIER_VISIBLE_STATUSES,
  assertApplicantActor,
  iso,
  type AccreditationRequestStatus,
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
 * ACCREDITATION REQUEST — the QUALIFICATION & ACCREDITATION MAIN flow (§5.2,
 * DP-26). Companies only, targeting a financier's ACCREDITATION-kind service.
 * Same platform gate as financing (R-4):
 *
 *   DRAFT ─▶ SUBMITTED ─▶ UNDER_PLATFORM_REVIEW ─▶ RETURNED_FOR_COMPLETION ⇄
 *                     │ all required items VERIFIED/WAIVED
 *                     ▼
 *          FORWARDED_TO_FINANCIER ─▶ UNDER_FINANCIER_REVIEW
 *                     │ grant                        │ reject
 *                     ▼                              ▼
 *                ACCREDITED ──(validUntil passes)──▶ EXPIRED   REJECTED
 *                     │ financier/platform revoke (reason REQUIRED)
 *                     ▼
 *                  REVOKED
 *
 * The grant lives ON the request (ACCREDITED + validUntil — single entry).
 * @@unique(serviceId, organizationId) permits exactly one record per pair:
 * renewal = a NEW request, allowed only once the pair is terminal (the old
 * terminal row is superseded — its history survives in AuditLog, DP-15).
 */

// transition table: status → action → next status
const ACCREDITATION_TRANSITIONS: Record<string, Record<string, AccreditationRequestStatus>> = {
  DRAFT: { SUBMIT: 'SUBMITTED', CANCEL: 'CANCELLED' },
  SUBMITTED: { START_REVIEW: 'UNDER_PLATFORM_REVIEW', FORWARD: 'FORWARDED_TO_FINANCIER', CANCEL: 'CANCELLED' },
  UNDER_PLATFORM_REVIEW: { RETURN: 'RETURNED_FOR_COMPLETION', FORWARD: 'FORWARDED_TO_FINANCIER', CANCEL: 'CANCELLED' },
  RETURNED_FOR_COMPLETION: { RESUBMIT: 'UNDER_PLATFORM_REVIEW', CANCEL: 'CANCELLED' },
  FORWARDED_TO_FINANCIER: { FINANCIER_OPEN: 'UNDER_FINANCIER_REVIEW' },
  UNDER_FINANCIER_REVIEW: { GRANT: 'ACCREDITED', REJECT: 'REJECTED' },
  ACCREDITED: { REVOKE: 'REVOKED' },
}

function canTransition(status: string, action: string): AccreditationRequestStatus | null {
  return ACCREDITATION_TRANSITIONS[status]?.[action as keyof (typeof ACCREDITATION_TRANSITIONS)[string]] ?? null
}

// ── DTOs ────────────────────────────────────────────────────────────────────

export interface AccreditationRequestSummaryDTO {
  id: string
  number: string
  status: AccreditationRequestStatus
  organizationId: string
  organizationName: string
  submittedBy: { id: string; name: string; email: string }
  serviceId: string
  serviceName: string
  financierOrgId: string
  financierOrgName: string
  multiGroupId: string | null
  scopeNotes: string | null
  consentAt: string | null
  submittedAt: string | null
  forwardedAt: string | null
  returnedAt: string | null
  returnedReason: string | null
  decidedAt: string | null
  decisionNote: string | null
  accreditedAt: string | null
  validUntil: string | null
  revokedAt: string | null
  revocationReason: string | null
  expiresAt: string | null
  createdAt: string
  isLive: boolean
  /** Queue-only progress column (additive — FIN-7). */
  submissionStats?: { total: number; verified: number; missing: number }
}

export interface AccreditationRequestDetailDTO extends AccreditationRequestSummaryDTO {
  platformReviewedById: string | null
  platformReviewedAt: string | null
  platformNote: string | null
  submissions: RequirementSubmissionDTO[]
  gate: { totalRequired: number; verified: number; waived: number; missing: { submissionId: string; title: string; status: string }[]; canForward: boolean }
}

// ── Serialization ───────────────────────────────────────────────────────────

const accInclude = {
  organization: { select: { name: true } },
  submittedBy: { select: { id: true, name: true, email: true } },
  service: {
    select: {
      id: true,
      name: true,
      serviceKind: true,
      financierProfile: { select: { id: true, organizationId: true, organization: { select: { name: true } } } },
    },
  },
} as const

type AccRaw = Awaited<ReturnType<typeof db.accreditationRequest.findFirstOrThrow>>

function isLive(a: { status: string; validUntil: Date | null }): boolean {
  return a.status === 'ACCREDITED' && a.validUntil != null && a.validUntil.getTime() > Date.now()
}

function serializeAccreditation(
  a: AccRaw & {
    organization: { name: string }
    submittedBy: { id: string; name: string; email: string }
    service: {
      id: string
      name: string
      serviceKind: string
      financierProfile: { id: string; organizationId: string; organization: { name: string } }
    }
  }
): AccreditationRequestDetailDTO {
  return {
    id: a.id,
    number: a.number,
    status: a.status as AccreditationRequestStatus,
    organizationId: a.organizationId,
    organizationName: a.organization.name,
    submittedBy: { id: a.submittedBy.id, name: a.submittedBy.name, email: a.submittedBy.email },
    serviceId: a.service.id,
    serviceName: a.service.name,
    financierOrgId: a.service.financierProfile.organizationId,
    financierOrgName: a.service.financierProfile.organization.name,
    multiGroupId: a.multiGroupId,
    scopeNotes: a.scopeNotes,
    consentAt: iso(a.consentAt),
    submittedAt: iso(a.submittedAt),
    forwardedAt: iso(a.forwardedAt),
    returnedAt: iso(a.returnedAt),
    returnedReason: a.returnedReason,
    decidedAt: iso(a.decidedAt),
    decisionNote: a.decisionNote,
    accreditedAt: iso(a.accreditedAt),
    validUntil: iso(a.validUntil),
    revokedAt: iso(a.revokedAt),
    revocationReason: a.revocationReason,
    expiresAt: iso(a.expiresAt),
    createdAt: a.createdAt.toISOString(),
    isLive: isLive(a),
    platformReviewedById: a.platformReviewedById,
    platformReviewedAt: iso(a.platformReviewedAt),
    platformNote: a.platformNote,
    submissions: [],
    gate: { totalRequired: 0, verified: 0, waived: 0, missing: [], canForward: true },
  }
}

// ── Creation (companies only — DP-26) ─────────────────────────────────────

export interface CreateAccreditationInput {
  serviceId: string
  organizationId: string
  scopeNotes?: string | null
}

export async function createAccreditationRequest(
  userId: string,
  input: CreateAccreditationInput
): Promise<AccreditationRequestSummaryDTO> {
  const service = await db.financierService.findUnique({
    where: { id: input.serviceId },
    include: { financierProfile: { select: { id: true, organizationId: true } } },
  })
  if (!service) throw new FinancingError('Service not found', 404)
  if (service.serviceKind !== 'ACCREDITATION') {
    throw new FinancingError('That service is a financing offer — use the financing flow', 400)
  }
  if (service.status !== 'ACTIVE') throw new FinancingError('That program is not accepting applications', 409)

  // companies only: the submitting user must be a member of the applicant org
  const membership = await db.organizationMember.findFirst({
    where: { userId, organizationId: input.organizationId },
  })
  if (!membership) throw new FinancingError('You are not a member of that organization', 403)
  const org = await db.organization.findUnique({ where: { id: input.organizationId } })
  if (!org) throw new FinancingError('Organization not found', 404)

  // 7.8: @@unique(serviceId, organizationId, activeKey) — at most one LIVE
  // (activeKey=1) request per program/org; terminal rows (activeKey NULL)
  // keep UNLIMITED renewal history. The database derives activeKey from
  // status via triggers, so the marker can never disagree with status.
  const existing = await db.accreditationRequest.findFirst({
    where: { serviceId: input.serviceId, organizationId: input.organizationId, activeKey: 1 },
    orderBy: { createdAt: 'desc' },
  })
  if (existing) {
    // 7.8.4 — expiry before renewal: a lapsed ACCREDITED grant is flipped to
    // EXPIRED inside this same transaction, so an expired grant can never
    // block its own renewal. A grant still within validUntil (or any other
    // live status) blocks a second application by design (documented rule).
    if (existing.status === 'ACCREDITED' && existing.validUntil && existing.validUntil.getTime() <= Date.now()) {
      await db.$transaction(async (tx) => {
        await tx.accreditationRequest.update({
          where: { id: existing.id },
          data: { status: 'EXPIRED' },
        })
        await recordAuditTx(tx, {
          actorId: userId,
          actorType: 'USER',
          action: 'ACCREDITATION_EXPIRED',
          entityType: 'AccreditationRequest',
          entityId: existing.id,
          summary: `${existing.number} grant validity lapsed (${existing.validUntil!.toISOString()}) — renewal unlocked`,
          metadata: { renewalFlip: true },
        })
      })
    } else {
      throw new FinancingError(
        `An accreditation request for this program already exists (${existing.number} — ${existing.status})`,
        409
      )
    }
  }

  // Renewal chain: the latest ACCREDITED (or now-EXPIRED) record this new
  // application supersedes (7.8.5 — supersedesId self-relation; history kept).
  const superseded = await db.accreditationRequest.findFirst({
    where: {
      serviceId: input.serviceId,
      organizationId: input.organizationId,
      status: { in: ['ACCREDITED', 'EXPIRED'] },
    },
    orderBy: { createdAt: 'desc' },
  })

  const number = await nextNumber('ACC')
  const created = await db.$transaction(async (tx) => {
    const row = await tx.accreditationRequest.create({
      data: {
        number,
        organizationId: input.organizationId,
        submittedById: userId,
        serviceId: input.serviceId,
        scopeNotes: input.scopeNotes?.trim() || null,
        status: 'DRAFT',
        supersedesId: superseded?.id ?? null,
      },
      include: accInclude,
    })
    await recordAuditTx(tx, {
      actorId: userId,
      actorType: 'USER',
      action: 'ACCREDITATION_REQUEST_CREATED',
      entityType: 'AccreditationRequest',
      entityId: row.id,
      summary: `${org.name} drafted accreditation ${number} for ${service.name}${superseded ? ` (renewal of ${superseded.number})` : ''}`,
      metadata: { serviceId: input.serviceId, organizationId: input.organizationId, supersedesId: superseded?.id ?? null },
    })
    if (superseded) {
      await recordAuditTx(tx, {
        actorId: userId,
        actorType: 'USER',
        action: 'ACCREDITATION_RENEWED',
        entityType: 'AccreditationRequest',
        entityId: superseded.id,
        summary: `${superseded.number} superseded by renewal application ${number}`,
        metadata: { previousStatus: superseded.status, organizationId: input.organizationId, newRequestId: row.id },
      })
    }
    return row
  })
  return serializeAccreditation(created as never)
}

// ── Submit / resubmit / cancel (applicant org) ─────────────────────────────

export async function submitAccreditationRequest(
  userId: string,
  requestId: string,
  options?: { consent?: boolean; answers?: ChecklistAnswer[] }
): Promise<AccreditationRequestDetailDTO> {
  const request = await db.accreditationRequest.findUnique({
    where: { id: requestId },
    include: {
      ...accInclude,
      service: {
        select: {
          id: true,
          name: true,
          serviceKind: true,
          status: true,
          financierProfile: { select: { id: true, organizationId: true, organization: { select: { name: true } } } },
        },
      },
    },
  })
  if (!request) throw new FinancingError('Accreditation request not found', 404)
  await assertApplicantActor(userId, {
    createdById: request.submittedById,
    organizationId: request.organizationId,
  })
  const next = canTransition(request.status, 'SUBMIT')
  if (!next) throw new FinancingError(`Cannot submit a request that is ${request.status}`, 409)
  if (request.service.status !== 'ACTIVE') {
    throw new FinancingError('That program is not accepting applications', 409)
  }

  const intake = await resolvePanel('financingIntake')
  if (intake.requireConsent && !options?.consent) {
    throw new FinancingError('Data-transfer consent is required before submitting')
  }
  const general = await resolvePanel('financingGeneral')
  if (general.enabled === false) {
    throw new FinancingError('Accreditation applications are currently disabled by the platform', 403)
  }
  const expiryDays = Number(general.requestExpiryDays) || 30

  const now = new Date()
  await db.accreditationRequest.update({
    where: { id: requestId },
    data: {
      status: 'SUBMITTED',
      submittedAt: now,
      consentAt: options?.consent ? now : request.consentAt,
      expiresAt: new Date(now.getTime() + expiryDays * 86_400_000),
    },
  })
  await generateChecklist('ACCREDITATION', requestId, request.serviceId, request.service.financierProfile.organizationId, {
    applicantUserId: request.submittedById,
    organizationId: request.organizationId,
    answers: options?.answers,
  })
  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'ACCREDITATION_REQUEST_SUBMITTED',
    entityType: 'AccreditationRequest',
    entityId: requestId,
    summary: `Accreditation ${request.number} submitted to the platform gate`,
    metadata: { from: request.status, to: 'SUBMITTED' },
  })
  return getAccreditationDetail(userId, requestId)
}

export async function resubmitAccreditationRequest(
  userId: string,
  requestId: string,
  options?: { answers?: ChecklistAnswer[] }
): Promise<AccreditationRequestDetailDTO> {
  const request = await db.accreditationRequest.findUnique({
    where: { id: requestId },
    include: { service: { select: { id: true, financierProfile: { select: { organizationId: true } } } } },
  })
  if (!request) throw new FinancingError('Accreditation request not found', 404)
  await assertApplicantActor(userId, {
    createdById: request.submittedById,
    organizationId: request.organizationId,
  })
  const next = canTransition(request.status, 'RESUBMIT')
  if (!next) throw new FinancingError(`Cannot resubmit a request that is ${request.status}`, 409)

  if (options?.answers?.length) {
    await applyChecklistAnswers('ACCREDITATION', requestId, options.answers, {
      userId: request.submittedById,
      organizationId: request.organizationId,
    })
  }
  await db.accreditationRequest.update({
    where: { id: requestId },
    data: { status: 'UNDER_PLATFORM_REVIEW', returnedAt: null, returnedReason: null },
  })
  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'ACCREDITATION_REQUEST_RESUBMITTED',
    entityType: 'AccreditationRequest',
    entityId: requestId,
    summary: `Accreditation ${request.number} resubmitted after return`,
    metadata: { from: request.status, to: 'UNDER_PLATFORM_REVIEW' },
  })
  return getAccreditationDetail(userId, requestId)
}

export async function cancelAccreditationRequest(
  userId: string,
  requestId: string
): Promise<AccreditationRequestSummaryDTO> {
  const request = await db.accreditationRequest.findUnique({ where: { id: requestId }, include: accInclude })
  if (!request) throw new FinancingError('Accreditation request not found', 404)
  await assertApplicantActor(userId, {
    createdById: request.submittedById,
    organizationId: request.organizationId,
  })
  if (!(CANCELABLE_PRE_FORWARD as readonly string[]).includes(request.status)) {
    throw new FinancingError(`Cannot cancel a request that is ${request.status}`, 409)
  }
  const updated = await db.accreditationRequest.update({
    where: { id: requestId },
    data: { status: 'CANCELLED' },
    include: accInclude,
  })
  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'ACCREDITATION_REQUEST_CANCELLED',
    entityType: 'AccreditationRequest',
    entityId: requestId,
    summary: `Accreditation ${request.number} cancelled by the applicant org`,
    metadata: { from: request.status, to: 'CANCELLED' },
  })
  return serializeAccreditation(updated as never)
}

// ── THE PLATFORM GATE (same rules as financing — R-4) ───────────────────────

async function loadForAdmin(requestId: string) {
  const request = await db.accreditationRequest.findUnique({
    where: { id: requestId },
    include: {
      ...accInclude,
      service: { select: { id: true, name: true, financierProfile: { select: { organizationId: true, organization: { select: { name: true } } } } } },
    },
  })
  if (!request) throw new FinancingError('Accreditation request not found', 404)
  return request
}

export async function startAccreditationReview(adminId: string, requestId: string): Promise<AccreditationRequestDetailDTO> {
  const request = await loadForAdmin(requestId)
  const next = canTransition(request.status, 'START_REVIEW')
  if (!next) throw new FinancingError(`Cannot start review on a request that is ${request.status}`, 409)
  const now = new Date()
  await db.accreditationRequest.update({
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
    entityType: 'AccreditationRequest',
    entityId: requestId,
    summary: `Platform review started on ${request.number}`,
    metadata: { from: request.status, to: next },
  })
  return adminGetAccreditation(requestId)
}

export async function returnAccreditationRequest(
  adminId: string,
  requestId: string,
  reason: string
): Promise<AccreditationRequestDetailDTO> {
  const clean = reason.trim()
  if (!clean) throw new FinancingError('A return reason is required')
  const request = await loadForAdmin(requestId)
  const next = canTransition(request.status, 'RETURN')
  if (!next) throw new FinancingError(`Cannot return a request that is ${request.status}`, 409)
  const now = new Date()
  await db.accreditationRequest.update({
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
    entityType: 'AccreditationRequest',
    entityId: requestId,
    summary: `Accreditation ${request.number} returned for completion: ${clean}`,
    metadata: { reason: clean },
  })
  await notifyOrgMembers(request.organizationId, 'PLATFORM_RETURNED_REQUEST', `Accreditation ${request.number} needs completion`, `The platform returned your accreditation request: ${clean}. Fix the flagged items and resubmit.`, requestId)
  return adminGetAccreditation(requestId)
}

export async function forwardAccreditationRequest(
  adminId: string,
  requestId: string
): Promise<AccreditationRequestDetailDTO> {
  const request = await loadForAdmin(requestId)
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
    await assertGateComplete('ACCREDITATION', requestId, tx)
    await tx.accreditationRequest.update({
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
    entityType: 'AccreditationRequest',
    entityId: requestId,
    summary: `Gate passed — ${request.number} forwarded to ${request.service.financierProfile.organization.name}`,
    metadata: { financierOrgId: request.service.financierProfile.organizationId },
  })
  await notifyOrgMembers(
    request.organizationId,
    'PLATFORM_FORWARDED_REQUEST',
    `Accreditation ${request.number} passed verification`,
    `Your application for ${request.service.name} was forwarded to ${request.service.financierProfile.organization.name}.`,
    requestId
  )
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
      type: 'ACCREDITATION_RECEIVED' as const,
      title: `New accreditation request ${request.number}`,
      body: `${request.organization.name} applied to ${request.service.name} — platform-verified and awaiting your decision.`,
      linkView: 'financier' as const,
      linkId: requestId,
    }))
  )
  return adminGetAccreditation(requestId)
}

/** autoForwardWhenAllVerified twin for accreditation (after a verdict). */
export async function maybeAutoForwardAccreditation(adminId: string, requestId: string): Promise<boolean> {
  const request = await db.accreditationRequest.findUnique({ where: { id: requestId } })
  if (!request) return false
  if (!['SUBMITTED', 'UNDER_PLATFORM_REVIEW'].includes(request.status)) return false
  const general = await resolvePanel('financingGeneral')
  if (!general.autoForwardWhenAllVerified) return false
  const status = await gateStatus('ACCREDITATION', requestId)
  if (!status.canForward) return false
  await forwardAccreditationRequest(adminId, requestId)
  return true
}

// ── Views ───────────────────────────────────────────────────────────────────

async function notifyOrgMembers(
  organizationId: string,
  type: 'PLATFORM_RETURNED_REQUEST' | 'PLATFORM_FORWARDED_REQUEST' | 'ACCREDITATION_GRANTED' | 'ACCREDITATION_REJECTED' | 'ACCREDITATION_REVOKED',
  title: string,
  body: string,
  linkId: string
): Promise<void> {
  const members = await db.organizationMember.findMany({
    where: { organizationId },
    select: { userId: true },
  })
  for (const m of members) {
    await emitNotification({ userId: m.userId, type, title, body, linkView: 'financing', linkId })
  }
}

async function attachChecklist(detail: AccreditationRequestDetailDTO, requestId: string): Promise<void> {
  const subs = await db.requirementSubmission.findMany({
    where: { accreditationRequestId: requestId },
    include: {
      serviceRequirement: {
        include: { conditionTemplate: { include: { options: { orderBy: { position: 'asc' as const } } } } },
      },
    },
    orderBy: [{ serviceRequirement: { displayOrder: 'asc' } }, { createdAt: 'asc' }],
  })
  const { serializeSubmission } = await import('./submissions')
  detail.submissions = subs.map((s) => serializeSubmission(s as never))
  const status = await gateStatus('ACCREDITATION', requestId)
  detail.gate = {
    totalRequired: status.totalRequired,
    verified: status.verified,
    waived: status.waived,
    missing: status.missing.map((m) => ({ submissionId: m.submissionId, title: m.title, status: m.status })),
    canForward: status.canForward,
  }
}

export async function listMyAccreditationRequests(
  userId: string
): Promise<{ requests: AccreditationRequestSummaryDTO[]; live: AccreditationRequestSummaryDTO[] }> {
  await sweepAccreditations()
  const orgs = await db.organizationMember.findMany({ where: { userId }, select: { organizationId: true } })
  if (!orgs.length) return { requests: [], live: [] }
  const requests = await db.accreditationRequest.findMany({
    where: { organizationId: { in: orgs.map((o) => o.organizationId) } },
    include: accInclude,
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  const dtos = requests.map((r) => serializeAccreditation(r as never))
  return { requests: dtos, live: dtos.filter((d) => d.isLive) }
}

/** Live accreditations of the user's orgs (RFQ-unlock check, §9.10). */
export async function listLiveAccreditations(userId: string): Promise<AccreditationRequestSummaryDTO[]> {
  const orgs = await db.organizationMember.findMany({ where: { userId }, select: { organizationId: true } })
  if (!orgs.length) return []
  const live = await db.accreditationRequest.findMany({
    where: {
      organizationId: { in: orgs.map((o) => o.organizationId) },
      status: 'ACCREDITED',
      validUntil: { gt: new Date() },
    },
    include: accInclude,
    orderBy: { validUntil: 'asc' },
  })
  return live.map((r) => serializeAccreditation(r as never))
}

export async function getAccreditationDetail(
  userId: string,
  requestId: string,
  actorRole = 'USER'
): Promise<AccreditationRequestDetailDTO> {
  const request = await db.accreditationRequest.findUnique({ where: { id: requestId }, include: accInclude })
  if (!request) throw new FinancingError('Accreditation request not found', 404)
  if (actorRole !== 'ADMIN') {
    await assertApplicantActor(userId, {
      createdById: request.submittedById,
      organizationId: request.organizationId,
    })
  }
  const detail = serializeAccreditation(request as never)
  await attachChecklist(detail, requestId)
  return detail
}

export async function adminGetAccreditation(requestId: string): Promise<AccreditationRequestDetailDTO> {
  const request = await db.accreditationRequest.findUnique({ where: { id: requestId }, include: accInclude })
  if (!request) throw new FinancingError('Accreditation request not found', 404)
  const detail = serializeAccreditation(request as never)
  await attachChecklist(detail, requestId)
  return detail
}

export interface AccQueueResult {
  requests: AccreditationRequestSummaryDTO[]
  total: number
  page: number
  limit: number
}

/** Gate queue for accreditation requests (admin financing queue, type=ACCREDITATION). */
export async function adminAccreditationQueue(filter?: {
  status?: string
  search?: string
  page?: number
  limit?: number
}): Promise<AccQueueResult> {
  await sweepAccreditations()
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
            { organization: { name: { contains: search } } },
            { submittedBy: { name: { contains: search } } },
            { submittedBy: { email: { contains: search } } },
          ],
        }
      : {}),
  }
  const [rows, total] = await Promise.all([
    db.accreditationRequest.findMany({
      where,
      include: accInclude,
      orderBy: { submittedAt: 'asc' },
      take: limit,
      skip: (page - 1) * limit,
    }),
    db.accreditationRequest.count({ where }),
  ])
  // Checklist progress per row (W-GATE-QUEUE "items" column — FIN-7).
  const ids = rows.map((r) => r.id)
  const subs = ids.length
    ? await db.requirementSubmission.findMany({
        where: { accreditationRequestId: { in: ids } },
        select: {
          accreditationRequestId: true,
          status: true,
          serviceRequirement: { select: { isRequired: true } },
        },
      })
    : []
  const statsByReq = new Map<string, { total: number; verified: number; missing: number }>()
  for (const s of subs) {
    if (!s.serviceRequirement.isRequired || !s.accreditationRequestId) continue
    const st = statsByReq.get(s.accreditationRequestId) ?? { total: 0, verified: 0, missing: 0 }
    st.total += 1
    if (s.status === 'VERIFIED' || s.status === 'WAIVED') st.verified += 1
    else st.missing += 1
    statsByReq.set(s.accreditationRequestId, st)
  }
  return {
    requests: rows.map((r) => ({
      ...serializeAccreditation(r as never),
      submissionStats: statsByReq.get(r.id) ?? { total: 0, verified: 0, missing: 0 },
    })),
    total,
    page,
    limit,
  }
}

// ── Financier console ────────────────────────────────────────────────────────

/** Accreditation inbox — ONLY forwarded+ requests (R-4 structural exclusion). */
export async function financierAccreditationInbox(
  financierOrgId: string,
  filter?: { status?: string; page?: number; limit?: number }
): Promise<AccQueueResult> {
  await sweepAccreditations()
  const limit = Math.min(Math.max(Number(filter?.limit) || 20, 1), 100)
  const page = Math.max(Number(filter?.page) || 1, 1)
  const where = {
    service: { financierProfile: { organizationId: financierOrgId } },
    OR: [
      { status: { in: [...(FINANCIER_VISIBLE_STATUSES as readonly string[]), 'ACCREDITED', 'REJECTED', 'REVOKED'] } },
      { forwardedAt: { not: null } },
    ],
    ...(filter?.status ? { status: filter.status } : {}),
  }
  const [rows, total] = await Promise.all([
    db.accreditationRequest.findMany({
      where,
      include: accInclude,
      orderBy: { forwardedAt: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
    }),
    db.accreditationRequest.count({ where }),
  ])
  return { requests: rows.map((r) => serializeAccreditation(r as never)), total, page, limit }
}

async function assertFinancierAccreditationAccess(
  userId: string,
  request: { status: string; forwardedAt: Date | null; service: { financierProfile: { organizationId: string } } }
): Promise<void> {
  const visible =
    (
      [...(FINANCIER_VISIBLE_STATUSES as readonly string[]), 'ACCREDITED', 'REJECTED', 'REVOKED'] as string[]
    ).includes(request.status) || request.forwardedAt != null
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

export async function financierGetAccreditation(userId: string, requestId: string): Promise<AccreditationRequestDetailDTO> {
  const request = await db.accreditationRequest.findUnique({ where: { id: requestId }, include: accInclude })
  if (!request) throw new FinancingError('Accreditation request not found', 404)
  await assertFinancierAccreditationAccess(userId, request)
  const detail = serializeAccreditation(request as never)
  await attachChecklist(detail, requestId)
  return detail
}

// ── Financier decisions (grant / reject / revoke — DP-26) ─────────────────

export interface AccreditationDecision {
  action: 'REVIEW_START' | 'GRANT' | 'REJECT' | 'REVOKE'
  note?: string
  validMonths?: number
}

export async function decideAccreditation(
  userId: string,
  requestId: string,
  decision: AccreditationDecision
): Promise<AccreditationRequestDetailDTO> {
  const request = await db.accreditationRequest.findUnique({
    where: { id: requestId },
    include: {
      ...accInclude,
      service: {
        select: {
          id: true,
          name: true,
          serviceKind: true,
          accreditationValidMonths: true,
          financierProfile: { select: { organizationId: true, organization: { select: { name: true } } } },
        },
      },
    },
  })
  if (!request) throw new FinancingError('Accreditation request not found', 404)
  await assertFinancierAccreditationAccess(userId, request)
  const actorMembership = await db.organizationMember.findFirst({
    where: {
      userId,
      organizationId: request.service.financierProfile.organizationId,
      role: { in: ['OWNER', 'ADMIN'] },
    },
  })
  const isFinancierStaff = !!actorMembership

  if (decision.action === 'REVIEW_START') {
    const next = canTransition(request.status, 'FINANCIER_OPEN')
    if (!next) throw new FinancingError(`Cannot open a request that is ${request.status}`, 409)
    await db.accreditationRequest.update({ where: { id: requestId }, data: { status: next } })
    await recordAudit({
      actorId: userId,
      actorType: 'USER',
      action: 'FINANCING_STATUS_CHANGED',
      entityType: 'AccreditationRequest',
      entityId: requestId,
      summary: `${request.number}: financier review started`,
      metadata: { from: request.status, to: next },
    })
    return financierGetAccreditation(userId, requestId)
  }

  if (decision.action === 'GRANT') {
    const next = canTransition(request.status, 'GRANT')
    if (!next) throw new FinancingError(`Cannot grant accreditation on a request that is ${request.status}`, 409)
    // validUntil: explicit override → service default → settings default
    const settings = await resolvePanel('financingAccreditation')
    const months =
      decision.validMonths && decision.validMonths > 0
        ? decision.validMonths
        : request.service.accreditationValidMonths && request.service.accreditationValidMonths > 0
          ? request.service.accreditationValidMonths
          : Number(settings.defaultValidMonths) || 12
    const now = new Date()
    await db.accreditationRequest.update({
      where: { id: requestId },
      data: {
        status: 'ACCREDITED',
        decidedById: userId,
        decidedAt: now,
        decisionNote: decision.note?.trim() || null,
        accreditedAt: now,
        validUntil: new Date(now.getTime() + months * 30 * 86_400_000),
      },
    })
    await recordAudit({
      actorId: userId,
      actorType: 'USER',
      action: 'ACCREDITATION_GRANTED',
      entityType: 'AccreditationRequest',
      entityId: requestId,
      summary: `${request.organization.name} accredited by ${request.service.financierProfile.organization.name} (valid ${months} months)`,
      metadata: { validMonths: months, note: decision.note ?? null },
    })
    await notifyOrgMembers(
      request.organizationId,
      'ACCREDITATION_GRANTED',
      `Accreditation granted — ${request.service.name}`,
      `${request.service.financierProfile.organization.name} accredited ${request.organization.name} for ${months} months. Live accreditation unlocks RFQ participation with this financier.`,
      requestId
    )
    return financierGetAccreditation(userId, requestId)
  }

  if (decision.action === 'REJECT') {
    const clean = (decision.note ?? '').trim()
    if (!clean) throw new FinancingError('A rejection note is required')
    const next = canTransition(request.status, 'REJECT')
    if (!next) throw new FinancingError(`Cannot reject a request that is ${request.status}`, 409)
    const now = new Date()
    await db.accreditationRequest.update({
      where: { id: requestId },
      data: { status: 'REJECTED', decidedById: userId, decidedAt: now, decisionNote: clean },
    })
    await recordAudit({
      actorId: userId,
      actorType: 'USER',
      action: 'ACCREDITATION_REJECTED',
      entityType: 'AccreditationRequest',
      entityId: requestId,
      summary: `${request.number} rejected: ${clean}`,
      metadata: { note: clean },
    })
    await notifyOrgMembers(
      request.organizationId,
      'ACCREDITATION_REJECTED',
      `Accreditation ${request.number} was rejected`,
      `${request.service.financierProfile.organization.name} rejected your application: ${clean}`,
      requestId
    )
    return financierGetAccreditation(userId, requestId)
  }

  // REVOKE — by the financier OR the platform admin (reason required)
  const clean = (decision.note ?? '').trim()
  if (!clean) throw new FinancingError('A revocation reason is required')
  if (request.status !== 'ACCREDITED') {
    throw new FinancingError('Only an accredited request can be revoked', 409)
  }
  // Admin revoke path: user might not be financier staff but must be platform admin
  if (!isFinancierStaff) {
    const admin = await db.user.findUnique({ where: { id: userId }, select: { role: true } })
    if (!admin || admin.role !== 'ADMIN') throw new FinancingError('Access denied', 403)
  }
  const now = new Date()
  await db.accreditationRequest.update({
    where: { id: requestId },
    data: { status: 'REVOKED', revokedById: userId, revokedAt: now, revocationReason: clean },
  })
  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'ACCREDITATION_REVOKED',
    entityType: 'AccreditationRequest',
    entityId: requestId,
    summary: `${request.number} revoked: ${clean}`,
    metadata: { reason: clean },
  })
  await notifyOrgMembers(
    request.organizationId,
    'ACCREDITATION_REVOKED',
    `Accreditation ${request.number} revoked`,
    `Your accreditation by ${request.service.financierProfile.organization.name} was revoked: ${clean}`,
    requestId
  )
  return financierGetAccreditation(userId, requestId)
}

// ── Lazy sweep (grants past validUntil + requests past expiresAt) ─────────

let accSweepsInFlight = false

export async function sweepAccreditations(): Promise<void> {
  if (accSweepsInFlight) return
  accSweepsInFlight = true
  try {
    const now = new Date()
    // Live grants whose validity lapsed → EXPIRED (idempotent)
    await db.accreditationRequest.updateMany({
      where: { status: 'ACCREDITED', validUntil: { lt: now } },
      data: { status: 'EXPIRED' },
    })
    // Pre-decision requests past expiresAt → EXPIRED
    await db.accreditationRequest.updateMany({
      where: {
        status: { in: ['SUBMITTED', 'UNDER_PLATFORM_REVIEW', 'RETURNED_FOR_COMPLETION', 'FORWARDED_TO_FINANCIER', 'UNDER_FINANCIER_REVIEW'] },
        expiresAt: { lt: now },
      },
      data: { status: 'EXPIRED' },
    })
    // ACCREDITATION_EXPIRING reminders — grants entering their final 7 days
    // (FINANCIER_PLAN §7). Idempotent per (request × member): the sweep runs
    // on every read path, so a notification row already present means the
    // reminder already went out (no schema change needed for the flag).
    const expiring = await db.accreditationRequest.findMany({
      where: {
        status: 'ACCREDITED',
        validUntil: { gt: now, lt: new Date(now.getTime() + 7 * 86_400_000) },
      },
      select: { id: true, number: true, validUntil: true, organizationId: true, service: { select: { name: true } } },
      take: 50,
    })
    for (const acc of expiring) {
      const members = await db.organizationMember.findMany({
        where: { organizationId: acc.organizationId },
        select: { userId: true },
        take: 100,
      })
      for (const member of members) {
        const already = await db.notification.findFirst({
          where: { userId: member.userId, type: 'ACCREDITATION_EXPIRING', linkId: acc.id },
          select: { id: true },
        })
        if (already) continue
        const days = Math.max(Math.ceil((acc.validUntil!.getTime() - now.getTime()) / 86_400_000), 0)
        await emitNotification({
          userId: member.userId,
          type: 'ACCREDITATION_EXPIRING',
          title: `Accreditation ${acc.number} expires in ${days} day${days === 1 ? '' : 's'}`,
          body: `Your accreditation for ${acc.service.name} is about to lapse. Renew before it expires to keep RFQ participation and auto-pass benefits.`,
          linkView: 'financing',
          linkId: acc.id,
        })
      }
    }
  } catch {
    // best-effort
  } finally {
    accSweepsInFlight = false
  }
}
