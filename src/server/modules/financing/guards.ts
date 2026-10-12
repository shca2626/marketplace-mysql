import { db } from '@/lib/db'
import type { FinancierProfile, FinancierService, FinancingRequest, AccreditationRequest, Organization, OrganizationMember } from '@prisma/client'
import { FINANCIER_VISIBLE_STATUSES, ACCREDITATION_VISIBLE_STATUSES, type Actor, type FinancingRequestStatus, type AccreditationRequestStatus } from './types'

/**
 * FINANCING ACCESS CONTROL (guards pattern — mirrors rfq/approvals services).
 * ─────────────────────────────────────────────────────────────────────────
 * Three actor families:
 *   • Financier staff — RBAC-governed institution members: OWNER members
 *     (full institution authority) plus any member holding the operation's
 *     financier.* permission via canonical UserRole assignments. A legacy
 *     ADMIN membership keeps the financier.admin template (safe parity with
 *     the pre-RBAC console access).
 *   • Applicants — the request creator or a member of the applicant org.
 *   • Platform staff — permission-holding platform roles (the gate
 *     operators), NOT the legacy User.role flag.
 */

export class FinancingGuardError extends Error {
  status: number
  constructor(message: string, status = 403) {
    super(message)
    this.status = status
  }
}

export interface FinancierStaffContext {
  member: OrganizationMember
  organization: Organization
  profile: FinancierProfile
}

/**
 * Resolve the user's financier staff context: a membership in an organization
 * that carries a FinancierProfile, where the user is the OWNER or holds
 * `permission` (canonical assignment or the legacy ADMIN bridge). Returns
 * null when the user is not authorized (routes translate to 403).
 */
export async function requireFinancierStaff(
  user: { id: string },
  permission?: string
): Promise<FinancierStaffContext | null> {
  const memberships = await db.organizationMember.findMany({
    where: {
      userId: user.id,
      organization: {
        status: { not: 'SUSPENDED' },
        OR: [{ orgType: { in: ['BANK', 'MFI', 'EWALLET'] } }, { financierProfile: { isNot: null } }],
      },
    },
    include: { organization: { include: { financierProfile: true } } },
    orderBy: { createdAt: 'asc' },
  })
  const { userHasOrgPermission } = await import('@/server/authz/evaluator')
  for (const m of memberships) {
    if (!m.organization.financierProfile) continue
    if (m.role === 'OWNER') {
      return { member: m, organization: m.organization, profile: m.organization.financierProfile }
    }
    if (!permission) continue // no permission given → OWNER-only (callers pass one)
    if (await userHasOrgPermission(user.id, m.organizationId, permission)) {
      return { member: m, organization: m.organization, profile: m.organization.financierProfile }
    }
  }
  return null
}

/** Fetch the staff context or throw a typed 403. */
export async function requireFinancierStaffOrThrow(
  user: { id: string },
  permission?: string
): Promise<FinancierStaffContext> {
  const ctx = await requireFinancierStaff(user, permission)
  if (!ctx) throw new FinancingGuardError('Financier staff access required', 403)
  return ctx
}

/**
 * The service must belong to this financier profile (financier staff may only
 * touch their own catalog).
 */
export function assertServiceOwnership(
  profileId: string,
  service: Pick<FinancierService, 'financierProfileId'>
): void {
  if (service.financierProfileId !== profileId) {
    throw new FinancingGuardError('This service belongs to another financier', 403)
  }
}

/**
 * R-4 visibility for a FINANCING request: it must target a service owned by the
 * profile AND be at/after FORWARDED_TO_FINANCIER on the forward-ordered list.
 * A SUBMITTED/CANCELLED/DRAFT request is platform-private by construction.
 */
export function assertRequestVisibilityForFinancier(
  request: Pick<FinancingRequest, 'status' | 'serviceId'> & {
    service: Pick<FinancierService, 'financierProfileId'>
  },
  profile: Pick<FinancierProfile, 'id'>
): void {
  if (request.service.financierProfileId !== profile.id) {
    throw new FinancingGuardError('This request belongs to another financier', 403)
  }
  if (!FINANCIER_VISIBLE_STATUSES.includes(request.status as FinancingRequestStatus)) {
    throw new FinancingGuardError(
      'This request has not passed the platform verification gate and is not visible to financiers',
      403
    )
  }
}

/** Same R-4 visibility rule for accreditation requests. */
export function assertAccreditationVisibilityForFinancier(
  request: Pick<AccreditationRequest, 'status' | 'serviceId'> & {
    service: Pick<FinancierService, 'financierProfileId'>
  },
  profile: Pick<FinancierProfile, 'id'>
): void {
  if (request.service.financierProfileId !== profile.id) {
    throw new FinancingGuardError('This accreditation belongs to another financier', 403)
  }
  if (!ACCREDITATION_VISIBLE_STATUSES.includes(request.status as AccreditationRequestStatus)) {
    throw new FinancingGuardError(
      'This accreditation has not passed the platform verification gate and is not visible to financiers',
      403
    )
  }
}

/** Is the user a member (any role) of the organization? */
export async function isOrgMember(userId: string, organizationId: string | null | undefined): Promise<boolean> {
  if (!organizationId) return false
  const m = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    select: { id: true },
  })
  return !!m
}

/**
 * Applicant access to a financing request: the creator or any member of the
 * applicant org (the org submits collectively).
 */
export async function assertApplicantAccess(
  user: { id: string },
  request: Pick<FinancingRequest, 'createdById' | 'organizationId'>
): Promise<void> {
  if (request.createdById === user.id) return
  if (await isOrgMember(user.id, request.organizationId)) return
  throw new FinancingGuardError('You do not have access to this request', 403)
}

/** Applicant access to an accreditation request. */
export async function assertAccreditationApplicantAccess(
  user: { id: string },
  request: Pick<AccreditationRequest, 'submittedById' | 'organizationId'>
): Promise<void> {
  if (request.submittedById === user.id) return
  if (await isOrgMember(user.id, request.organizationId)) return
  throw new FinancingGuardError('You do not have access to this accreditation', 403)
}

/** Platform staff check (the gate operators) — permission-based, not the
 *  legacy User.role flag. `permission` defaults to financing.gate.view. */
export async function assertAdmin(user: Actor, permission = 'financing.gate.view'): Promise<void> {
  const { userHasPlatformPermission } = await import('@/server/modules/rbac/service')
  if (!(await userHasPlatformPermission(user.id, permission))) {
    throw new FinancingGuardError('Platform staff access required', 403)
  }
}

/**
 * Financier staff recipients for notifications: the OWNER, every member
 * holding the relevant `permission`, and every legacy ADMIN member (they had
 * console access pre-RBAC — notifications are never narrowed silently).
 */
export async function financierStaffUserIds(
  organizationId: string,
  permission = 'financier.requests.view'
): Promise<string[]> {
  const members = await db.organizationMember.findMany({
    where: { organizationId },
    select: { userId: true, role: true },
  })
  const { userHasOrgPermission } = await import('@/server/authz/evaluator')
  const out = new Set<string>()
  for (const m of members) {
    if (m.role === 'OWNER' || m.role === 'ADMIN') {
      out.add(m.userId)
      continue
    }
    if (await userHasOrgPermission(m.userId, organizationId, permission)) {
      out.add(m.userId)
    }
  }
  return [...out]
}

/** Org OWNER/ADMIN recipients (accreditation decisions reach the company). */
export async function orgManagerUserIds(organizationId: string, excludeUserId?: string): Promise<string[]> {
  const members = await db.organizationMember.findMany({
    where: { organizationId, role: { in: ['OWNER', 'ADMIN'] } },
    select: { userId: true },
  })
  return members.map((m) => m.userId).filter((id) => id !== excludeUserId)
}

/** The user's organizations (any membership role). */
export async function userOrganizationIds(userId: string): Promise<string[]> {
  const memberships = await db.organizationMember.findMany({
    where: { userId },
    select: { organizationId: true },
  })
  return memberships.map((m) => m.organizationId)
}
