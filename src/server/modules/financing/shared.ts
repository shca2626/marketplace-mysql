import { cookies } from 'next/headers'
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

/** Org types that may carry a FinancierProfile (the legal-entity types). */
export const FINANCIER_ORG_TYPES = ['BANK', 'MFI', 'EWALLET'] as const

/** Cookie holding the multi-org staff member's active financier org (FIN-013). */
export const FINANCIER_ORG_COOKIE = 'fin_org'

/** Every org-scope permission a financing institution can operate on (the
 *  financier.* family + the institution-neutral org basics) — the console
 *  baseline: a member needs at least ONE of these to enter the console. */
export const FINANCIER_CONSOLE_PERMISSIONS = [
  'financier.services.manage',
  'financier.services.publish',
  'financier.requests.view',
  'financier.offers.manage',
  'financier.agreements.manage',
  'financier.accreditations.manage',
  'financier.team.manage',
] as const

export interface FinancierContext {
  organizationId: string
  financierProfileId: string
  organizationName: string
  organizationType?: string
}

export interface FinancierContextOrg {
  id: string
  name: string
  orgType: string
}

/**
 * Does this user hold `permission` in financing org `organizationId`?
 *
 * RBAC runtime enforcement (financier completion):
 *   • OWNER members hold the full institution allowlist (every financier.*
 *     permission — never marketplace-selling, never platform permissions).
 *   • Other members resolve canonical org-scope UserRole assignments
 *     (financier.admin / underwriter / reviewer / branch-officer / custom).
 *   • Legacy bridge: a legacy ADMIN membership keeps the financier.admin
 *     template permissions (safe parity with the pre-RBAC console access).
 */
export async function userHasFinancierPermission(
  userId: string,
  organizationId: string,
  permission: string
): Promise<boolean> {
  const { userHasOrgPermission } = await import('@/server/authz/evaluator')
  return userHasOrgPermission(userId, organizationId, permission)
}

/**
 * A user's financier-org memberships where they can act (BANK/MFI/EWALLET —
 * or any org that already carries a profile —, not suspended), oldest first.
 *
 * RBAC runtime enforcement: when `permission` is given, an org is listed only
 * when the user holds that permission there (OWNER, canonical assignment, or
 * the legacy ADMIN bridge). Without a permission, ANY membership in the
 * org counts (the console switcher lists institutions you belong to; access
 * to specific operations is checked per-route).
 */
async function listFinancierMemberships(
  userId: string,
  permission?: string
): Promise<FinancierContextOrg[]> {
  const memberships = await db.organizationMember.findMany({
    where: {
      userId,
      organization: {
        status: { not: 'SUSPENDED' },
        OR: [{ orgType: { in: [...FINANCIER_ORG_TYPES] } }, { financierProfile: { isNot: null } }],
      },
    },
    select: {
      role: true,
      organization: { select: { id: true, name: true, orgType: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
  if (!permission) return memberships.map((m) => m.organization)
  const out: FinancierContextOrg[] = []
  for (const m of memberships) {
    if (m.role === 'OWNER' || (await userHasFinancierPermission(userId, m.organization.id, permission))) {
      out.push(m.organization)
    }
  }
  return out
}

/**
 * The active-org cookie set by POST /api/financier/context. Read defensively:
 * outside a request scope (scripts, tests) there is no cookie store — fall
 * back to the first membership (previous behavior).
 */
async function readPreferredFinancierOrgId(): Promise<string | null> {
  try {
    const store = await cookies()
    return store.get(FINANCIER_ORG_COOKIE)?.value ?? null
  } catch {
    return null
  }
}

/**
 * Auto-provision fallback (FIN-001): a BANK/MFI/EWALLET org reaches the
 * console before anyone created its FinancierProfile — create it with empty
 * facts (verified stays false until the admin verifies the org) instead of
 * 403-ing a newly provisioned institution into a dead console.
 */
async function ensureFinancierProfile(organizationId: string): Promise<string> {
  const existing = await db.financierProfile.findUnique({
    where: { organizationId },
    select: { id: true },
  })
  if (existing) return existing.id
  try {
    const created = await db.financierProfile.create({
      data: { organizationId },
      select: { id: true },
    })
    return created.id
  } catch {
    // unique(organizationId) race — another concurrent request provisioned it
    const raced = await db.financierProfile.findUnique({
      where: { organizationId },
      select: { id: true },
    })
    if (raced) return raced.id
    throw new FinancingError('Could not provision the financier profile', 500)
  }
}

/**
 * The financier org a user acts for. RBAC runtime enforcement: when a
 * `permission` is given, only institutions where the user holds that
 * permission (OWNER, canonical assignment, or legacy ADMIN bridge) are
 * candidates — the resolved context is guaranteed authorized for it.
 * With no permission, the caller only needs SOME financier console
 * capability (at least one FINANCIER_CONSOLE_PERMISSIONS) — operations
 * inside the console are gated per-route.
 *
 * A missing FinancierProfile is auto-provisioned (empty facts, unverified)
 * instead of blocking access — FIN-001. Multi-org staff get the org they
 * last picked via the console switcher (cookie), else their first eligible
 * membership. Returns null for non-staff.
 */
export async function getFinancierContext(
  userId: string,
  permission?: string
): Promise<FinancierContext | null> {
  if (!permission) {
    // console baseline: ANY financier capability OR legacy ADMIN membership
    const anyOrg = await listFinancierMemberships(userId)
    const eligible: FinancierContextOrg[] = []
    for (const org of anyOrg) {
      const member = await db.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: org.id, userId } },
        select: { role: true },
      })
      if (member && (member.role === 'OWNER' || member.role === 'ADMIN')) {
        eligible.push(org)
        continue
      }
      for (const perm of FINANCIER_CONSOLE_PERMISSIONS) {
        if (await userHasFinancierPermission(userId, org.id, perm)) {
          eligible.push(org)
          break
        }
      }
    }
    if (eligible.length === 0) return null
    const preferred = await readPreferredFinancierOrgId()
    const chosen = eligible.find((o) => o.id === preferred) ?? eligible[0]
    const financierProfileId = await ensureFinancierProfile(chosen.id)
    return {
      organizationId: chosen.id,
      financierProfileId,
      organizationName: chosen.name,
      organizationType: chosen.orgType,
    }
  }
  const orgs = await listFinancierMemberships(userId, permission)
  if (orgs.length === 0) return null
  const preferred = await readPreferredFinancierOrgId()
  const chosen = orgs.find((o) => o.id === preferred) ?? orgs[0]
  const financierProfileId = await ensureFinancierProfile(chosen.id)
  return {
    organizationId: chosen.id,
    financierProfileId,
    organizationName: chosen.name,
    organizationType: chosen.orgType,
  }
}

/** Resolve + require the caller's financier org (403 when not financier staff
 *  or the caller lacks `permission` in every institution they belong to). */
export async function requireFinancierContext(
  userId: string,
  permission?: string
): Promise<FinancierContext> {
  const ctx = await getFinancierContext(userId, permission)
  if (!ctx) {
    throw new FinancingError(
      permission
        ? 'Financier staff access required — your roles do not include this capability'
        : 'Financier staff access required',
      403
    )
  }
  return ctx
}

/**
 * Every financier org the user could act for + which one is active — powers
 * the console's institution switcher (FIN-013) and the header menu entry.
 * RBAC: mirrors the console baseline (OWNER / legacy ADMIN / any financier.*
 * permission holder) — plain members without capabilities are not listed.
 */
export async function listFinancierContextOrgs(
  userId: string
): Promise<{ organizations: FinancierContextOrg[]; activeOrganizationId: string | null }> {
  const all = await listFinancierMemberships(userId)
  const organizations: FinancierContextOrg[] = []
  for (const org of all) {
    const member = await db.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: org.id, userId } },
      select: { role: true },
    })
    if (member && (member.role === 'OWNER' || member.role === 'ADMIN')) {
      organizations.push(org)
      continue
    }
    for (const perm of FINANCIER_CONSOLE_PERMISSIONS) {
      if (await userHasFinancierPermission(userId, org.id, perm)) {
        organizations.push(org)
        break
      }
    }
  }
  if (organizations.length === 0) return { organizations: [], activeOrganizationId: null }
  const preferred = await readPreferredFinancierOrgId()
  const active = organizations.find((o) => o.id === preferred) ?? organizations[0]
  await ensureFinancierProfile(active.id)
  return { organizations, activeOrganizationId: active.id }
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

/**
 * F-04 parity: ACCEPTING a financing offer binds the whole organization
 * (agreement mint + SUCCESS fee accrual). Only the requester themself
 * (personal requests) or an ACTIVE member of the requesting organization
 * holding the `org.finance.apply` permission may accept — owners qualify
 * automatically through the owner permission set; VIEWERs and members
 * without the permission are refused.
 */
export async function assertApplicantOfferAcceptor(
  userId: string,
  request: { createdById: string; organizationId: string | null }
): Promise<void> {
  if (request.createdById === userId) return
  if (!request.organizationId) throw new FinancingError('Access denied', 403)
  const member = await db.organizationMember.findFirst({
    where: { userId, organizationId: request.organizationId },
    include: { organization: { select: { status: true } } },
  })
  if (!member || member.organization.status !== 'ACTIVE') {
    throw new FinancingError('Access denied', 403)
  }
  const { userHasOrgPermission } = await import('@/server/authz/evaluator')
  if (!(await userHasOrgPermission(userId, request.organizationId, 'org.finance.apply'))) {
    throw new FinancingError(
      'Only organization members with financing permission can accept an offer for the organization',
      403
    )
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
