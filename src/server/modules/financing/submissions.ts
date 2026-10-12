import { z } from 'zod'
import { db } from '@/lib/db'
import { recordAudit } from '@/server/modules/audit/service'
import { emitNotification } from '@/server/modules/notifications/service'
import {
  FinancingError,
  GateBlockedError,
  assertApplicantActor,
  type GateMissingItem,
  type SubmissionStatus,
} from './shared'

/**
 * REQUIREMENT SUBMISSION — the gate's verification unit (§3.6, DP-23).
 *
 * One row per (request × service-requirement). Answers are TYPED columns
 * (valueText / valueNumber / valueDate / accountDocumentId — zero JSON, R-1):
 *
 *   PENDING ──applicant supplies (typed by conditionType)──▶ SUBMITTED
 *   SUBMITTED ──platform verifies──▶ VERIFIED    (verifiedAt + verifiedById)
 *   SUBMITTED ──platform rejects──▶ REJECTED    (decisionNote REQUIRED)
 *   REJECTED ──applicant re-supplies──▶ SUBMITTED (verifiedAt cleared)
 *   any open state ──platform waives──▶ WAIVED    (decisionNote REQUIRED)
 *   PROFILE_FIELD ──auto-eval──▶ SUBMITTED (decisionNote 'auto-evaluated')
 *   autoPassAccredited + live accreditation from this financier ──▶ VERIFIED
 *     (verifiedById null = system, DP-26)
 *
 * THE GATE completeness rule (R-4) lives here: a request may move to
 * FORWARDED_TO_FINANCIER only when every REQUIRED submission is VERIFIED or
 * WAIVED-with-note — enforced in the same transaction as the forward.
 */

// ── DTOs ────────────────────────────────────────────────────────────────────

export interface RequirementSubmissionDTO {
  id: string
  serviceRequirementId: string
  financingRequestId: string | null
  accreditationRequestId: string | null
  status: SubmissionStatus
  valueText: string | null
  valueNumber: number | null
  valueDate: string | null
  accountDocumentId: string | null
  submittedAt: string | null
  verifiedAt: string | null
  verifiedById: string | null
  decisionNote: string | null
  requirement: {
    id: string
    isRequired: boolean
    displayOrder: number
    instructions: string | null
    autoPassAccredited: boolean
    template: {
      id: string
      scope: string
      conditionType: string
      code: string | null
      title: string
      description: string | null
      documentType: string | null
      validationMin: number | null
      validationMax: number | null
      options: { id: string; value: string }[]
    }
  }
  createdAt: string
}

const submissionInclude = {
  serviceRequirement: {
    include: {
      conditionTemplate: { include: { options: { orderBy: { position: 'asc' as const } } } },
    },
  },
} as const

type TemplateWithOptions = Awaited<ReturnType<typeof db.conditionTemplate.findFirstOrThrow>> & {
  options: { id: string; value: string; position: number }[]
}
type RequirementWithTemplate = Awaited<ReturnType<typeof db.serviceRequirement.findFirstOrThrow>> & {
  conditionTemplate: TemplateWithOptions
}
export type SubmissionRaw = Awaited<ReturnType<typeof db.requirementSubmission.findFirstOrThrow>> & {
  serviceRequirement: RequirementWithTemplate
}

export function serializeSubmission(s: SubmissionRaw): RequirementSubmissionDTO {
  const r = s.serviceRequirement
  const t = r.conditionTemplate
  return {
    id: s.id,
    serviceRequirementId: s.serviceRequirementId,
    financingRequestId: s.financingRequestId,
    accreditationRequestId: s.accreditationRequestId,
    status: s.status as SubmissionStatus,
    valueText: s.valueText,
    valueNumber: s.valueNumber,
    valueDate: s.valueDate ? s.valueDate.toISOString() : null,
    accountDocumentId: s.accountDocumentId,
    submittedAt: s.submittedAt ? s.submittedAt.toISOString() : null,
    verifiedAt: s.verifiedAt ? s.verifiedAt.toISOString() : null,
    verifiedById: s.verifiedById,
    decisionNote: s.decisionNote,
    requirement: {
      id: r.id,
      isRequired: r.isRequired,
      displayOrder: r.displayOrder,
      instructions: r.instructions,
      autoPassAccredited: r.autoPassAccredited,
      template: {
        id: t.id,
        scope: t.scope,
        conditionType: t.conditionType,
        code: t.code,
        title: t.title,
        description: t.description,
        documentType: t.documentType,
        validationMin: t.validationMin,
        validationMax: t.validationMax,
        options: t.options.map((o) => ({ id: o.id, value: o.value })),
      },
    },
    createdAt: s.createdAt.toISOString(),
  }
}

// ── Typed answers (validated against the condition kind — §3.5/§3.6) ───────

export interface SubmissionAnswer {
  valueText?: string | null
  valueNumber?: number | null
  valueDate?: string | null
  accountDocumentId?: string | null
  confirmed?: boolean
}

export interface AnswerContext {
  /** applicant user id (owner of personal vault docs) */
  userId: string
  /** applicant org id when the request is B2B (org vault docs eligible) */
  organizationId: string | null
}

/** Validate + normalize a typed answer for a condition kind. Returns the column patch. */
async function validateAnswer(
  template: {
    id: string
    conditionType: string
    title: string
    documentType: string | null
    validationMin: number | null
    validationMax: number | null
  },
  answer: SubmissionAnswer,
  ctx: AnswerContext
): Promise<{
  valueText?: string | null
  valueNumber?: number | null
  valueDate?: Date | null
  accountDocumentId?: string | null
}> {
  switch (template.conditionType) {
    case 'PROFILE_FIELD':
      throw new FinancingError('Profile-field conditions are auto-evaluated — fill your profile instead')
    case 'DECLARATION': {
      const confirmed = answer.confirmed ?? Boolean(answer.valueText?.trim())
      if (!confirmed) throw new FinancingError(`“${template.title}” must be confirmed`)
      return { valueText: answer.valueText?.trim() || 'Confirmed.' }
    }
    case 'TEXT': {
      const text = answer.valueText?.trim()
      if (!text) throw new FinancingError(`“${template.title}” needs a written answer`)
      if (text.length > 500) throw new FinancingError('Written answers are limited to 500 characters')
      return { valueText: text }
    }
    case 'NUMBER': {
      if (answer.valueNumber == null || Number.isNaN(Number(answer.valueNumber))) {
        throw new FinancingError(`“${template.title}” needs a numeric answer`)
      }
      const n = Number(answer.valueNumber)
      if (template.validationMin != null && n < template.validationMin) {
        throw new FinancingError(`“${template.title}” must be at least ${template.validationMin}`)
      }
      if (template.validationMax != null && n > template.validationMax) {
        throw new FinancingError(`“${template.title}” must be at most ${template.validationMax}`)
      }
      return { valueNumber: n }
    }
    case 'DATE': {
      if (!answer.valueDate) throw new FinancingError(`“${template.title}” needs a date`)
      const d = new Date(answer.valueDate)
      if (Number.isNaN(d.getTime())) throw new FinancingError('Invalid date')
      return { valueDate: d }
    }
    case 'SELECT': {
      const value = answer.valueText?.trim()
      if (!value) throw new FinancingError(`“${template.title}” needs a choice`)
      const options = await db.conditionOption.findMany({
        where: { conditionTemplateId: template.id },
        select: { value: true },
      })
      return validateSelectValue(template.title, value, options.map((o) => o.value), false)
    }
    case 'MULTI_SELECT': {
      const raw = answer.valueText?.trim()
      if (!raw) throw new FinancingError(`“${template.title}” needs at least one choice`)
      const options = await db.conditionOption.findMany({
        where: { conditionTemplateId: template.id },
        select: { value: true },
      })
      return validateSelectValue(template.title, raw, options.map((o) => o.value), true)
    }
    case 'DOCUMENT': {
      const docId = answer.accountDocumentId
      if (!docId) throw new FinancingError(`“${template.title}” needs a vault document attached`)
      const doc = await db.accountDocument.findUnique({ where: { id: docId } })
      if (!doc || !doc.isActive) throw new FinancingError('Attached document not found', 404)
      // DOCUMENT evidence must be owned by the applicant user or their org (R-2 reuse)
      const ownedByUser = doc.userId === ctx.userId
      const ownedByOrg = ctx.organizationId != null && doc.organizationId === ctx.organizationId
      if (!ownedByUser && !ownedByOrg) {
        throw new FinancingError('That document belongs to another user or organization', 403)
      }
      if (doc.status === 'REJECTED') {
        throw new FinancingError('That document was rejected by the platform — upload a new version')
      }
      if (template.documentType && doc.documentType !== template.documentType) {
        throw new FinancingError(`“${template.title}” requires a ${template.documentType} document`)
      }
      if (doc.expiresAt && doc.expiresAt.getTime() < Date.now()) {
        throw new FinancingError('That document has expired — upload a current version')
      }
      return { accountDocumentId: docId }
    }
    default:
      throw new FinancingError('Unsupported condition type')
  }
}

function validateSelectValue(
  title: string,
  raw: string,
  optionValues: string[],
  multi: boolean
): { valueText: string } {
  if (optionValues.length === 0) return { valueText: raw }
  if (multi) {
    const picked = raw.split(',').map((s) => s.trim()).filter(Boolean)
    const invalid = picked.filter((p) => !optionValues.includes(p))
    if (invalid.length) {
      throw new FinancingError(`“${title}”: ${invalid.join(', ')} ${invalid.length > 1 ? 'are not valid choices' : 'is not a valid choice'}`)
    }
    if (picked.length === 0) throw new FinancingError(`“${title}” needs at least one choice`)
    return { valueText: picked.join(', ') }
  }
  if (!optionValues.includes(raw)) throw new FinancingError(`“${title}”: “${raw}” is not a valid choice`)
  return { valueText: raw }
}

// ── Auto-evaluations ────────────────────────────────────────────────────────

/**
 * PROFILE_FIELD auto-eval (closed set): if the profile field is present, the
 * item is marked SUBMITTED with decisionNote 'auto-evaluated' — the platform
 * admin still verifies it (automation pre-fills, never skips review).
 */
export async function evaluateProfileField(
  submissionId: string
): Promise<'SUBMITTED' | 'PENDING' | 'VERIFIED' | 'WAIVED'> {
  const sub = await db.requirementSubmission.findUnique({
    where: { id: submissionId },
    include: {
      serviceRequirement: { include: { conditionTemplate: true } },
      financingRequest: { select: { id: true, organizationId: true, createdById: true } },
      accreditationRequest: { select: { id: true, organizationId: true, submittedById: true } },
    },
  })
  if (!sub) return 'PENDING'
  const t = sub.serviceRequirement.conditionTemplate
  if (t.conditionType !== 'PROFILE_FIELD' || !t.profileFieldKey) return 'PENDING'
  if (sub.status === 'VERIFIED' || sub.status === 'WAIVED') return sub.status as 'VERIFIED' | 'WAIVED'

  const organizationId =
    sub.financingRequest?.organizationId ?? sub.accreditationRequest?.organizationId ?? null

  let present = false
  if (t.profileFieldKey.startsWith('user.')) {
    const user = await db.user.findUnique({
      where: { id: sub.financingRequest?.createdById ?? sub.accreditationRequest?.submittedById ?? '' },
      select: { phone: true, identityNumber: true, dateOfBirth: true },
    })
    if (user) {
      present =
        t.profileFieldKey === 'user.phone'
          ? Boolean(user.phone?.trim())
          : t.profileFieldKey === 'user.identityNumber'
            ? Boolean(user.identityNumber?.trim())
            : user.dateOfBirth != null
    }
  } else if (organizationId) {
    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { taxId: true, registrationNumber: true, industry: true },
    })
    if (org) {
      present =
        t.profileFieldKey === 'org.taxId'
          ? Boolean(org.taxId?.trim())
          : t.profileFieldKey === 'org.registrationNumber'
            ? Boolean(org.registrationNumber?.trim())
            : Boolean(org.industry?.trim())
    }
  }

  if (!present) return 'PENDING'
  await db.requirementSubmission.update({
    where: { id: submissionId },
    data: { status: 'SUBMITTED', submittedAt: new Date(), decisionNote: 'auto-evaluated' },
  })
  return 'SUBMITTED'
}

/** Does the applicant org hold a live accreditation (ACCREDITED + validUntil>now) from this financier? */
export async function hasLiveAccreditation(
  organizationId: string | null,
  financierOrganizationId: string
): Promise<boolean> {
  if (!organizationId) return false
  const live = await db.accreditationRequest.findFirst({
    where: {
      organizationId,
      status: 'ACCREDITED',
      validUntil: { gt: new Date() },
      service: { financierProfile: { organizationId: financierOrganizationId } },
    },
    select: { id: true },
  })
  return !!live
}

/**
 * autoPassAccredited (DP-26): when the applicant org holds a live accreditation
 * on a service of the SAME financier, the system auto-VERIFIES this item
 * (verifiedById null = system, note 'auto-passed via live accreditation').
 */
export async function evaluateAutoPass(
  submissionId: string,
  financierOrganizationId: string
): Promise<boolean> {
  const sub = await db.requirementSubmission.findUnique({
    where: { id: submissionId },
    include: {
      serviceRequirement: true,
      financingRequest: { select: { organizationId: true } },
      accreditationRequest: { select: { organizationId: true } },
    },
  })
  if (!sub || !sub.serviceRequirement.autoPassAccredited) return false
  if (sub.status === 'VERIFIED' || sub.status === 'WAIVED') return false
  const organizationId = sub.financingRequest?.organizationId ?? sub.accreditationRequest?.organizationId ?? null
  if (!(await hasLiveAccreditation(organizationId, financierOrganizationId))) return false
  await db.requirementSubmission.update({
    where: { id: submissionId },
    data: {
      status: 'VERIFIED',
      verifiedAt: new Date(),
      verifiedById: null, // system
      decisionNote: 'auto-passed via live accreditation',
    },
  })
  return true
}

// ── Applicant answer (PENDING/REJECTED → SUBMITTED) ───────────────────────

export async function answerSubmission(
  userId: string,
  submissionId: string,
  answer: SubmissionAnswer
): Promise<RequirementSubmissionDTO> {
  const sub = await db.requirementSubmission.findUnique({
    where: { id: submissionId },
    include: {
      ...submissionInclude,
      financingRequest: { select: { id: true, status: true, createdById: true, organizationId: true } },
      accreditationRequest: { select: { id: true, status: true, organizationId: true, submittedById: true } },
    },
  })
  if (!sub) throw new FinancingError('Checklist item not found', 404)

  const parent = sub.financingRequest ?? sub.accreditationRequest!
  const applicant = sub.financingRequest
    ? { createdById: sub.financingRequest.createdById, organizationId: sub.financingRequest.organizationId }
    : {
        createdById: sub.accreditationRequest!.submittedById,
        organizationId: sub.accreditationRequest!.organizationId,
      }
  await assertApplicantActor(userId, applicant as never)

  // Applicant edits happen in DRAFT (wizard) or after a RETURN (fix + resubmit)
  if (!['DRAFT', 'RETURNED_FOR_COMPLETION'].includes(parent.status)) {
    throw new FinancingError(`This request is ${parent.status} — answers are locked`, 409)
  }
  if (sub.status === 'VERIFIED' || sub.status === 'WAIVED') {
    throw new FinancingError('This item is already verified — it is preserved', 409)
  }

  const t = sub.serviceRequirement.conditionTemplate
  const patch = await validateAnswer(
    {
      id: t.id,
      conditionType: t.conditionType,
      title: t.title,
      documentType: t.documentType,
      validationMin: t.validationMin,
      validationMax: t.validationMax,
    },
    answer,
    { userId, organizationId: applicant.organizationId }
  )
  const updated = await db.requirementSubmission.update({
    where: { id: submissionId },
    data: {
      ...patch,
      status: 'SUBMITTED',
      submittedAt: new Date(),
      verifiedAt: null,
      verifiedById: null,
      decisionNote: null,
    },
    include: submissionInclude,
  })
  await recordAudit({
    actorId: userId,
    actorType: 'USER',
    action: 'REQUIREMENT_SUBMITTED',
    entityType: 'RequirementSubmission',
    entityId: submissionId,
    summary: `Checklist item “${t.title}” answered (${t.conditionType})`,
    metadata: { conditionType: t.conditionType },
  })
  return serializeSubmission(updated as never)
}

// ── Platform verdicts (the gate works item-by-item) ────────────────────────

async function loadSubmissionForAdmin(submissionId: string) {
  const sub = await db.requirementSubmission.findUnique({
    where: { id: submissionId },
    include: {
      ...submissionInclude,
      financingRequest: { select: { id: true, number: true, status: true, createdById: true, organizationId: true } },
      accreditationRequest: { select: { id: true, number: true, status: true, organizationId: true } },
    },
  })
  if (!sub) throw new FinancingError('Checklist item not found', 404)
  const parent = sub.financingRequest ?? sub.accreditationRequest!
  if (!['SUBMITTED', 'UNDER_PLATFORM_REVIEW'].includes(parent.status)) {
    throw new FinancingError(`The parent request is ${parent.status} — verdicts are closed`, 409)
  }
  return { sub, parent }
}

async function notifyApplicant(
  parent:
    | { id: string; number: string; createdById: string; organizationId: string | null }
    | { id: string; number: string; organizationId: string },
  type: 'REQUIREMENT_VERIFIED' | 'REQUIREMENT_REJECTED',
  title: string,
  body: string
): Promise<void> {
  const recipients = new Set<string>()
  if ('createdById' in parent) {
    recipients.add(parent.createdById)
    if (parent.organizationId) {
      const members = await db.organizationMember.findMany({
        where: { organizationId: parent.organizationId, role: { in: ['OWNER', 'ADMIN'] } },
        select: { userId: true },
      })
      members.forEach((m) => recipients.add(m.userId))
    }
  } else {
    const members = await db.organizationMember.findMany({
      where: { organizationId: parent.organizationId },
      select: { userId: true },
    })
    members.forEach((m) => recipients.add(m.userId))
  }
  for (const userId of recipients) {
    await emitNotification({ userId, type, title, body, linkView: 'financing', linkId: parent.id })
  }
}

export async function verifySubmission(
  adminId: string,
  submissionId: string,
  note?: string
): Promise<RequirementSubmissionDTO> {
  const { sub } = await loadSubmissionForAdmin(submissionId)
  if (sub.status !== 'SUBMITTED') {
    throw new FinancingError(`Item is ${sub.status.toLowerCase()} — only submitted answers can be verified`, 409)
  }
  const updated = await db.requirementSubmission.update({
    where: { id: submissionId },
    data: {
      status: 'VERIFIED',
      verifiedAt: new Date(),
      verifiedById: adminId,
      decisionNote: note?.trim() || null,
    },
    include: submissionInclude,
  })
  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: 'REQUIREMENT_VERIFIED',
    entityType: 'RequirementSubmission',
    entityId: submissionId,
    summary: `“${sub.serviceRequirement.conditionTemplate.title}” verified`,
    metadata: { note: note ?? null },
  })
  await notifyApplicant(
    (sub.financingRequest ?? sub.accreditationRequest!) as never,
    'REQUIREMENT_VERIFIED',
    'Checklist item verified',
    `“${sub.serviceRequirement.conditionTemplate.title}” passed platform verification.`
  )
  return serializeSubmission(updated as never)
}

export async function rejectSubmission(
  adminId: string,
  submissionId: string,
  note: string
): Promise<RequirementSubmissionDTO> {
  const clean = note.trim()
  if (!clean) throw new FinancingError('A rejection note is required')
  const { sub } = await loadSubmissionForAdmin(submissionId)
  if (sub.status !== 'SUBMITTED') {
    throw new FinancingError(`Item is ${sub.status.toLowerCase()} — only submitted answers can be rejected`, 409)
  }
  const updated = await db.requirementSubmission.update({
    where: { id: submissionId },
    data: {
      status: 'REJECTED',
      verifiedAt: new Date(),
      verifiedById: adminId,
      decisionNote: clean,
    },
    include: submissionInclude,
  })
  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: 'REQUIREMENT_REJECTED',
    entityType: 'RequirementSubmission',
    entityId: submissionId,
    summary: `“${sub.serviceRequirement.conditionTemplate.title}” rejected`,
    metadata: { note: clean },
  })
  await notifyApplicant(
    (sub.financingRequest ?? sub.accreditationRequest!) as never,
    'REQUIREMENT_REJECTED',
    'Checklist item rejected',
    `“${sub.serviceRequirement.conditionTemplate.title}” was rejected: ${clean}`
  )
  return serializeSubmission(updated as never)
}

export async function waiveSubmission(
  adminId: string,
  submissionId: string,
  note: string
): Promise<RequirementSubmissionDTO> {
  const clean = note.trim()
  if (!clean) throw new FinancingError('A waiver note is required')
  const { sub } = await loadSubmissionForAdmin(submissionId)
  if (sub.status === 'VERIFIED' || sub.status === 'WAIVED') {
    throw new FinancingError(`Item is already ${sub.status.toLowerCase()}`, 409)
  }
  const updated = await db.requirementSubmission.update({
    where: { id: submissionId },
    data: {
      status: 'WAIVED',
      verifiedAt: new Date(),
      verifiedById: adminId,
      decisionNote: clean,
    },
    include: submissionInclude,
  })
  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: 'REQUIREMENT_WAIVED',
    entityType: 'RequirementSubmission',
    entityId: submissionId,
    summary: `“${sub.serviceRequirement.conditionTemplate.title}” waived`,
    metadata: { note: clean },
  })
  return serializeSubmission(updated as never)
}

// ── THE GATE completeness check (R-4 — used by forward + gate status) ─────

/** Prisma client or interactive-transaction client (FIN-3: tx-scoped gate checks). */
export type DbClient = typeof db | Parameters<Parameters<typeof db.$transaction>[0]>[0]

/**
 * Returns the REQUIRED submissions that still block the forward: anything not
 * VERIFIED and not WAIVED-with-note. Waived-without-note counts as missing
 * (the note is the applicant-visible reason — DP-15).
 *
 * Accepts an optional transaction client so forwardRequest can re-read the
 * checklist INSIDE its transaction (§3.6 rule — the enforcing check runs on
 * the same connection that commits the transition).
 */
export async function findGateMissing(
  parentType: 'FINANCING' | 'ACCREDITATION',
  parentId: string,
  client: DbClient = db
): Promise<GateMissingItem[]> {
  const subs = await (client.requirementSubmission.findMany as typeof db.requirementSubmission.findMany)({
    where: {
      ...(parentType === 'FINANCING'
        ? { financingRequestId: parentId }
        : { accreditationRequestId: parentId }),
      serviceRequirement: { isRequired: true },
    },
    include: { serviceRequirement: { include: { conditionTemplate: { select: { title: true } } } } },
  })
  return subs
    .filter((s) => !(s.status === 'VERIFIED' || (s.status === 'WAIVED' && s.decisionNote?.trim())))
    .map((s) => ({
      submissionId: s.id,
      requirementId: s.serviceRequirementId,
      title: s.serviceRequirement.conditionTemplate.title,
      status: s.status,
      isRequired: true,
    }))
}

/**
 * Gate status summary for detail views: counts + the blocking items.
 * Read-only — the enforcing check runs INSIDE the forward transaction.
 */
export async function gateStatus(
  parentType: 'FINANCING' | 'ACCREDITATION',
  parentId: string
): Promise<{
  totalRequired: number
  verified: number
  waived: number
  missing: GateMissingItem[]
  canForward: boolean
}> {
  const subs = await db.requirementSubmission.findMany({
    where: {
      ...(parentType === 'FINANCING'
        ? { financingRequestId: parentId }
        : { accreditationRequestId: parentId }),
      serviceRequirement: { isRequired: true },
    },
    select: { status: true, decisionNote: true, id: true, serviceRequirementId: true, serviceRequirement: { select: { conditionTemplate: { select: { title: true } } } } },
  })
  const missing = subs
    .filter((s) => !(s.status === 'VERIFIED' || (s.status === 'WAIVED' && s.decisionNote?.trim())))
    .map((s) => ({
      submissionId: s.id,
      requirementId: s.serviceRequirementId,
      title: s.serviceRequirement.conditionTemplate.title,
      status: s.status,
      isRequired: true,
    }))
  return {
    totalRequired: subs.length,
    verified: subs.filter((s) => s.status === 'VERIFIED').length,
    waived: subs.filter((s) => s.status === 'WAIVED').length,
    missing,
    canForward: missing.length === 0,
  }
}

/** Transactional version of the gate check — throws GateBlockedError on missing items. */
export async function assertGateComplete(
  parentType: 'FINANCING' | 'ACCREDITATION',
  parentId: string,
  client: DbClient = db
): Promise<void> {
  const missing = await findGateMissing(parentType, parentId, client)
  if (missing.length > 0) {
    throw new GateBlockedError(
      `Cannot forward — ${missing.length} required ${missing.length === 1 ? 'item is' : 'items are'} still incomplete. Incomplete or incorrect requests are never sent to the financier.`,
      missing
    )
  }
}

// ── Checklist generation (submit) + answer application (resubmit) ─────────

/**
 * Generate the per-request checklist: one RequirementSubmission row for every
 * ACTIVE ServiceRequirement of the service (§5.1 — the checklist is always
 * well-defined because requests are service-scoped). Runs PROFILE_FIELD
 * auto-eval + autoPassAccredited, then applies any wizard answers.
 */
export async function generateChecklist(
  parentType: 'FINANCING' | 'ACCREDITATION',
  parentId: string,
  serviceId: string,
  financierOrganizationId: string,
  options: {
    applicantUserId: string
    organizationId: string | null
    answers?: ChecklistAnswer[]
  }
): Promise<RequirementSubmissionDTO[]> {
  const requirements = await db.serviceRequirement.findMany({
    where: { serviceId, isActive: true },
    include: { conditionTemplate: { include: { options: { orderBy: { position: 'asc' as const } } } } },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  })

  const parent = parentType === 'FINANCING' ? { financingRequestId: parentId } : { accreditationRequestId: parentId }
  const created: SubmissionRaw[] = []
  for (const requirement of requirements) {
    created.push(
      await db.requirementSubmission.create({
        data: {
          ...parent,
          serviceRequirementId: requirement.id,
          status: 'PENDING',
        },
        include: submissionInclude,
      })
    )
  }

  // auto-evals (idempotent per row)
  for (const row of created) {
    await evaluateProfileField(row.id)
    await evaluateAutoPass(row.id, financierOrganizationId)
  }

  if (options.answers?.length) {
    await applyAnswers(created, options.answers, {
      userId: options.applicantUserId,
      organizationId: options.organizationId,
    })
  }

  const refreshed = await db.requirementSubmission.findMany({
    where: parentType === 'FINANCING' ? { financingRequestId: parentId } : { accreditationRequestId: parentId },
    include: submissionInclude,
    orderBy: [{ serviceRequirement: { displayOrder: 'asc' } }, { createdAt: 'asc' }],
  })
  return refreshed.map((s) => serializeSubmission(s as never))
}

export interface ChecklistAnswer {
  requirementId?: string
  conditionTemplateId?: string
  valueText?: string | null
  valueNumber?: number | null
  valueDate?: string | null
  accountDocumentId?: string | null
  confirmed?: boolean
}

/** Apply answers to freshly created (or existing, non-final) submissions. */
async function applyAnswers(
  submissions: SubmissionRaw[],
  answers: ChecklistAnswer[],
  ctx: AnswerContext
): Promise<void> {
  for (const answer of answers) {
    const row = submissions.find(
      (s) =>
        (answer.requirementId && s.serviceRequirementId === answer.requirementId) ||
        (answer.conditionTemplateId && s.serviceRequirement.conditionTemplateId === answer.conditionTemplateId)
    )
    if (!row) continue // unknown requirement — silently ignored (wizard drift)
    if (row.status === 'VERIFIED' || row.status === 'WAIVED') continue // preserved (FIN-3 DoD)
    const t = row.serviceRequirement.conditionTemplate
    if (t.conditionType === 'PROFILE_FIELD') continue // auto-evaluated only
    const patch = await validateAnswer(
      {
        id: t.id,
        conditionType: t.conditionType,
        title: t.title,
        documentType: t.documentType,
        validationMin: t.validationMin,
        validationMax: t.validationMax,
      },
      answer,
      ctx
    )
    await db.requirementSubmission.update({
      where: { id: row.id },
      data: {
        ...patch,
        status: 'SUBMITTED',
        submittedAt: new Date(),
        verifiedAt: null,
        verifiedById: null,
        decisionNote: null,
      },
    })
  }
}

/** Re-apply answers on resubmit (REJECTED items re-supplied → SUBMITTED). */
export async function applyChecklistAnswers(
  parentType: 'FINANCING' | 'ACCREDITATION',
  parentId: string,
  answers: ChecklistAnswer[],
  ctx: AnswerContext
): Promise<void> {
  const rows = await db.requirementSubmission.findMany({
    where: parentType === 'FINANCING' ? { financingRequestId: parentId } : { accreditationRequestId: parentId },
    include: submissionInclude,
  })
  await applyAnswers(rows as never, answers, ctx)
}

export { GateBlockedError }

// ── Cross-module exports (catalog / gate console) ────────────────────────────

/** The submission include carrying the requirement + its condition template
 *  (options ordered) — the shape serializeSubmission expects. */
export const SUBMISSION_INCLUDE = submissionInclude

/** Alias used by the catalog module's DTOs. */
export type SubmissionDTO = RequirementSubmissionDTO

/**
 * R-4 gate blockers — REQUIRED items not yet VERIFIED/WAIVED on a request.
 * Accepts a transaction client so the gate console can compose it inside
 * larger read transactions.
 */
export async function listGateBlockers(
  client: Pick<typeof db, 'requirementSubmission'>,
  parentType: 'FINANCING_REQUEST' | 'ACCREDITATION_REQUEST',
  requestId: string
) {
  const where =
    parentType === 'FINANCING_REQUEST'
      ? { financingRequestId: requestId }
      : { accreditationRequestId: requestId }
  const rows = await client.requirementSubmission.findMany({
    where: { ...where, status: { notIn: ['VERIFIED', 'WAIVED'] } },
    include: { serviceRequirement: { select: { isRequired: true, displayOrder: true } } },
  })
  return rows
    .filter((r) => r.serviceRequirement.isRequired)
    .sort((a, b) => a.serviceRequirement.displayOrder - b.serviceRequirement.displayOrder)
}

// ── Admin gate console adapters (name-drift repair) ───────────────────────────

/** Verdict payload for the gate console's per-item decision endpoint. */
export const adminVerdictSchema = z
  .object({
    verdict: z.enum(['verify', 'reject', 'waive']),
    note: z.string().trim().max(2000).optional().nullable(),
  })
  .refine((d) => d.verdict === 'verify' || (d.note ?? '').trim().length > 0, {
    message: 'A note is required to reject or waive an item',
  })

export type SubmissionAnswerPayload = SubmissionAnswer

/** The gate console's per-item verdict dispatcher. */
export async function adminVerdict(input: {
  admin: { id: string; role: string }
  submissionId: string
  payload: { verdict: 'verify' | 'reject' | 'waive'; note?: string | null }
}) {
  const { admin, submissionId, payload } = input
  if (payload.verdict === 'verify') {
    return verifySubmission(admin.id, submissionId, payload.note?.trim() || undefined)
  }
  if (payload.verdict === 'reject') {
    return rejectSubmission(admin.id, submissionId, payload.note ?? '')
  }
  return waiveSubmission(admin.id, submissionId, payload.note ?? '')
}

/** Gate readiness probe (verify-financing script shape). */
export async function gateReady(
  client: Pick<typeof db, 'requirementSubmission'>,
  parentType: 'FINANCING_REQUEST' | 'ACCREDITATION_REQUEST',
  requestId: string
): Promise<{ ready: boolean; missing: { submissionId: string }[] }> {
  const blockers = await listGateBlockers(client, parentType, requestId)
  return { ready: blockers.length === 0, missing: blockers.map((b) => ({ submissionId: b.id })) }
}
