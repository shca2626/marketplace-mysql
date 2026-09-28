import { db } from '@/lib/db'

/**
 * FINANCING — shared primitives for the financier module services.
 *
 * Shared by: conditions / documents / submissions / requests / accreditation /
 * offers / agreements (FIN-2/3). Everything here follows the RFQ gold standard
 * (service-level org guards — DP-1: financier staff = OrganizationMember with
 * OWNER|ADMIN role, NO new global role; the platform gate is structural — R-4).
 *
 * Status machines (FINANCIER_SCHEMA v5 §5) live in requests.ts (financing) and
 * accreditation.ts; the GATE completeness rule lives in submissions.ts.
 */

// ── Errors ──────────────────────────────────────────────────────────────────

export class FinancingError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

/** The platform gate refused to forward — carries the blocking checklist items (422). */
export class GateBlockedError extends FinancingError {
  missing: GateMissingItem[]
  constructor(message: string, missing: GateMissingItem[]) {
    super(message, 422)
    this.missing = missing
  }
}

export interface GateMissingItem {
  submissionId: string
  requirementId: string
  title: string
  status: string
  isRequired: boolean
}

// ── Status unions (String columns + TS unions + zod — no DB enums) ──────────

export type FinancierServiceKind = 'FINANCING' | 'ACCREDITATION'
export type ServiceStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED'
export type ConditionScope = 'GENERAL' | 'FINANCIER'
export type ConditionType =
  | 'DOCUMENT' | 'PROFILE_FIELD' | 'DECLARATION' | 'TEXT'
  | 'NUMBER' | 'DATE' | 'SELECT' | 'MULTI_SELECT'
export type SubmissionStatus = 'PENDING' | 'SUBMITTED' | 'VERIFIED' | 'REJECTED' | 'WAIVED'
export type DocumentStatus = 'PENDING' | 'VERIFIED' | 'REJECTED'
export type FinancingRequestStatus =
  | 'DRAFT' | 'SUBMITTED' | 'UNDER_PLATFORM_REVIEW' | 'RETURNED_FOR_COMPLETION'
  | 'FORWARDED_TO_FINANCIER' | 'UNDER_FINANCIER_REVIEW' | 'OFFERED' | 'ACCEPTED'
  | 'DECLINED' | 'EXPIRED' | 'CANCELLED'
export type AccreditationRequestStatus =
  | 'DRAFT' | 'SUBMITTED' | 'UNDER_PLATFORM_REVIEW' | 'RETURNED_FOR_COMPLETION'
  | 'FORWARDED_TO_FINANCIER' | 'UNDER_FINANCIER_REVIEW' | 'ACCREDITED' | 'REJECTED'
  | 'EXPIRED' | 'REVOKED' | 'CANCELLED'
export type OfferStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'WITHDRAWN'
export type FundingStatus = 'PENDING' | 'REPORTED_FUNDED' | 'REPORTED_SETTLED'
export type AgreementStatus = 'ACTIVE' | 'COMPLETED' | 'DEFAULTED' | 'CANCELLED'

/** Financier-inbox visibility set (R-4 structural exclusion — query-level). */
export const FINANCIER_VISIBLE_STATUSES = [
  'FORWARDED_TO_FINANCIER', 'UNDER_FINANCIER_REVIEW', 'OFFERED', 'ACCEPTED', 'DECLINED',
] as const

/** Pre-terminal states the lazy expiry sweep closes. */
export const FINANCING_PRE_TERMINAL = [
  'SUBMITTED', 'UNDER_PLATFORM_REVIEW', 'RETURNED_FOR_COMPLETION',
  'FORWARDED_TO_FINANCIER', 'UNDER_FINANCIER_REVIEW', 'OFFERED',
] as const

/** Applicant-cancelable states (task FIN-3 ruling: pre-forward only). */
export const CANCELABLE_PRE_FORWARD = [
  'DRAFT', 'SUBMITTED', 'UNDER_PLATFORM_REVIEW', 'RETURNED_FOR_COMPLETION',
] as const

/** Accreditation renewal is a NEW request — allowed only once the pair is terminal. */
export const ACCREDITATION_TERMINAL = ['ACCREDITED', 'REJECTED', 'EXPIRED', 'REVOKED', 'CANCELLED'] as const

// ── Closed value sets (zod-validated at the routes, asserted here) ──────────

export const PROFILE_FIELD_KEYS = [
  'user.phone', 'user.identityNumber', 'user.dateOfBirth',
  'org.taxId', 'org.registrationNumber', 'org.industry',
] as const

export const DOCUMENT_TYPES = [
  'NATIONAL_ID', 'PASSPORT', 'RESIDENCE_PERMIT', 'COMMERCIAL_REG', 'TAX_CARD',
  'BUSINESS_LICENSE', 'BANK_STATEMENT', 'FINANCIAL_STATEMENT', 'PROOF_OF_ADDRESS',
  'GUARANTEE_DOC', 'FEASIBILITY_STUDY', 'INVOICE', 'PURCHASE_ORDER', 'PROJECT_FILE', 'OTHER',
] as const

// ── Financier staff context (DP-1: org membership, no global role) ──────────

export interface FinancierContext {
  organizationId: string
  financierProfileId: string
  organizationName: string
}

/**
 * The financier org a user acts for: an Organization with a FinancierProfile
 * where the user is an OWNER or ADMIN member. Returns null for non-staff.
 */
export async function getFinancierContext(userId: string): Promise<FinancierContext | null> {
  const membership = await db.organizationMember.findFirst({
    where: {
      userId,
      role: { in: ['OWNER', 'ADMIN'] },
      organization: { financierProfile: { isNot: null }, status: { not: 'SUSPENDED' } },
    },
    include: {
      organization: { select: { id: true, name: true, financierProfile: { select: { id: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  })
  if (!membership) return null
  return {
    organizationId: membership.organization.id,
    financierProfileId: membership.organization.financierProfile!.id,
    organizationName: membership.organization.name,
  }
}

/** Resolve + require the caller's financier org (403 when not financier staff). */
export async function requireFinancierContext(userId: string): Promise<FinancierContext> {
  const ctx = await getFinancierContext(userId)
  if (!ctx) throw new FinancingError('Financier staff access required', 403)
  return ctx
}

/**
 * Assert the user is OWNER/ADMIN of the organization owning the given service
 * (or profile). Loads the service with its financier profile for the caller.
 */
export async function assertFinancierStaffOfService(
  userId: string,
  serviceId: string
): Promise<{
  organizationId: string
  service: {
    id: string
    name: string
    serviceKind: string
    status: string
    financierProfileId: string
  }
}> {
  const service = await db.financierService.findUnique({
    where: { id: serviceId },
    include: { financierProfile: { select: { id: true, organizationId: true } } },
  })
  if (!service) throw new FinancingError('Service not found', 404)
  const membership = await db.organizationMember.findFirst({
    where: {
      userId,
      organizationId: service.financierProfile.organizationId,
      role: { in: ['OWNER', 'ADMIN'] },
    },
  })
  if (!membership) throw new FinancingError('Financier staff access required for this service', 403)
  return {
    organizationId: service.financierProfile.organizationId,
    service: {
      id: service.id,
      name: service.name,
      serviceKind: service.serviceKind,
      status: service.status,
      financierProfileId: service.financierProfileId,
    },
  }
}

// ── Applicant guards (createdBy user or member of the applicant org) ────────

/** Is the user the requesting applicant (creator or member of the applicant org)? */
export async function isApplicantActor(
  userId: string,
  request: { createdById: string; organizationId: string | null }
): Promise<boolean> {
  if (request.createdById === userId) return true
  if (!request.organizationId) return false
  const membership = await db.organizationMember.findFirst({
    where: { userId, organizationId: request.organizationId },
  })
  return !!membership
}

export async function assertApplicantActor(
  userId: string,
  request: { createdById: string; organizationId: string | null }
): Promise<void> {
  if (!(await isApplicantActor(userId, request))) {
    throw new FinancingError('Access denied', 403)
  }
}

/** Require the user is a member of the org (any role) — org-scoped create guard. */
export async function assertOrgMember(userId: string, organizationId: string): Promise<void> {
  const membership = await db.organizationMember.findFirst({
    where: { userId, organizationId },
  })
  if (!membership) throw new FinancingError('You are not a member of that organization', 403)
}

// ── Shared serialization helpers ────────────────────────────────────────────

export function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null
}
