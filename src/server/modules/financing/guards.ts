import { db } from '@/lib/db'
import type { FinancierProfile, FinancierService, FinancingRequest, AccreditationRequest, Organization, OrganizationMember } from '@prisma/client'
import { FINANCIER_VISIBLE_STATUSES, ACCREDITATION_VISIBLE_STATUSES, type Actor, type FinancingRequestStatus, type AccreditationRequestStatus } from './types'

/**
 * FINANCING ACCESS CONTROL (guards pattern — mirrors rfq/approvals services).
 * ─────────────────────────────────────────────────────────────────────────
 * Three actor families:
 *   • Financier staff — OWNER/ADMIN members of an org that HAS a
 *     FinancierProfile (DP-1: membership roles, no new global role).
 *   • Applicants — the request creator or a member of the applicant org.
 *   • Platform admins — User.role === 'ADMIN' (the gate operators).
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
 * Resolve the user's financier staff context: an OWNER/ADMIN membership in an
 * organization that carries a FinancierProfile. Returns null when the user is
 * not financier staff (routes translate to 403).
 */
export async function requireFinancierStaff(user: { id: string }): Promise<FinancierStaffContext | null> {
  const memberships = await db.organizationMember.findMany({
    where: { userId: user.id, role: { in: ['OWNER', 'ADMIN'] } },
    include: { organization: { include: { financierProfile: true } } },
    orderBy: { createdAt: 'asc' },
  })
  for (const m of memberships) {
    if (m.organization.financierProfile) {
      return { member: m, organization: m.organization, profile: m.organization.financierProfile }
    }
  }
  return null
}

/** Fetch the staff context or throw a typed 403. */
export async function requireFinancierStaffOrThrow(user: { id: string }): Promise<FinancierStaffContext> {
  const ctx = await requireFinancierStaff(user)
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

/** Platform admin check (the gate operators). */
export function assertAdmin(user: Actor): void {
  if (user.role !== 'ADMIN') {
    throw new FinancingGuardError('Platform admin access required', 403)
  }
}

/**
 * Financier staff recipients for notifications: every OWNER/ADMIN member of the
 * financier organization (the org is notified collectively).
 */
export async function financierStaffUserIds(organizationId: string): Promise<string[]> {
  const members = await db.organizationMember.findMany({
    where: { organizationId, role: { in: ['OWNER', 'ADMIN'] } },
    select: { userId: true },
  })
  return members.map((m) => m.userId)
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
