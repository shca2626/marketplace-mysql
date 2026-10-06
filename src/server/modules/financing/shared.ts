import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { isModuleEnabled } from '@/server/modules/modules/service'

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

export interface FinancierContext {
  organizationId: string
  financierProfileId: string
  organizationName: string
  organizationType?: string
  /** Phase 5 — org lifecycle state (PENDING_VERIFICATION | ACTIVE | …). The
   *  console renders an activation-status screen instead of the full tooling
   *  while the institution is not yet verified. */
  organizationStatus?: string
}

export interface FinancierContextOrg {
  id: string
  name: string
  orgType: string
  status?: string
}

/**
 * A user's financier-org memberships: OWNER/ADMIN members of BANK/MFI/EWALLET
 * (or any org that already carries a profile), not suspended — PLUS Phase 5
 * role-based staff: members holding an org-scoped financier.* role reach the
 * console with exactly the permissions their role grants. Oldest first.
 */
async function listFinancierMemberships(userId: string): Promise<FinancierContextOrg[]> {
  // UserRole.organizationId is a loose FK — resolve live orgs in a second pass.
  const [memberships, roleAssignments] = await Promise.all([
    db.organizationMember.findMany({
      where: {
        userId,
        role: { in: ['OWNER', 'ADMIN'] },
        organization: {
          status: { not: 'SUSPENDED' },
          OR: [{ orgType: { in: [...FINANCIER_ORG_TYPES] } }, { financierProfile: { isNot: null } }],
        },
      },
      select: { organization: { select: { id: true, name: true, orgType: true, status: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    db.userRole.findMany({
      where: {
        userId,
        role: { key: { startsWith: 'financier.' } },
        organizationId: { not: '' },
      },
      select: { organizationId: true, assignedAt: true },
      orderBy: { assignedAt: 'asc' },
    }),
  ])
  const roleOrgIds = [...new Set(roleAssignments.map((a) => a.organizationId))]
  const roleOrgs = roleOrgIds.length
    ? await db.organization.findMany({
        where: { id: { in: roleOrgIds }, status: { not: 'SUSPENDED' } },
        select: { id: true, name: true, orgType: true, status: true },
      })
    : []
  const seen = new Set<string>()
  const orgs: FinancierContextOrg[] = []
  for (const o of [...memberships.map((m) => m.organization), ...roleOrgs]) {
    if (!seen.has(o.id)) {
      seen.add(o.id)
      orgs.push(o)
    }
  }
  return orgs
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
 * The financier org a user acts for: an Organization where the user is an
 * OWNER or ADMIN member. A missing FinancierProfile is auto-provisioned
 * (empty facts, unverified) instead of blocking access — FIN-001. Multi-org
 * staff get the org they last picked via the console switcher (cookie),
 * else their first membership. Returns null for non-staff.
 */
export async function getFinancierContext(userId: string): Promise<FinancierContext | null> {
  const orgs = await listFinancierMemberships(userId)
  if (orgs.length === 0) return null
  const preferred = await readPreferredFinancierOrgId()
  const chosen = orgs.find((o) => o.id === preferred) ?? orgs[0]
  const financierProfileId = await ensureFinancierProfile(chosen.id)
  return {
    organizationId: chosen.id,
    financierProfileId,
    organizationName: chosen.name,
    organizationType: chosen.orgType,
    organizationStatus: chosen.status,
  }
}

/** Resolve + require the caller's financier org (403 when not financier staff).
 *  Phase 5 — also enforces the `financier-console` module for the org's
 *  context (ORG > ORG_TYPE > PLATFORM): a flipped-off console disappears
 *  from every /api/financier/* route, not just the nav. */
export async function requireFinancierContext(userId: string): Promise<FinancierContext> {
  const ctx = await getFinancierContext(userId)
  if (!ctx) throw new FinancingError('Financier staff access required', 403)
  const enabled = await isModuleEnabled('financier-console', {
    orgId: ctx.organizationId,
    orgType: ctx.organizationType,
  })
  if (!enabled) {
    throw new FinancingError(
      'The financier console is currently disabled for your institution. Contact the Vendora team if you believe this is a mistake.',
      403
    )
  }
  return ctx
}

/**
 * Every financier org the user could act for + which one is active — powers
 * the console's institution switcher (FIN-013) and the header menu entry.
 */
export async function listFinancierContextOrgs(
  userId: string
): Promise<{ organizations: FinancierContextOrg[]; activeOrganizationId: string | null }> {
  const orgs = await listFinancierMemberships(userId)
  if (orgs.length === 0) return { organizations: [], activeOrganizationId: null }
  const preferred = await readPreferredFinancierOrgId()
  const active = orgs.find((o) => o.id === preferred) ?? orgs[0]
  await ensureFinancierProfile(active.id)
  return { organizations: orgs, activeOrganizationId: active.id }
}

/**
 * Assert the user is OWNER/ADMIN of the organization owning the given service
 * (or profile). Loads the service with its financier profile for the caller.
 *
 * TENANT-AUDIT F-03/F-05: applies the M2 ACTIVE predicate (user + organization
 * both ACTIVE) so a suspended institution's staff cannot act on services via
 * direct ids, and a PENDING_VERIFICATION institution cannot mutate its
 * (pre-approval) console data — reads for the activation tracker run through
 * /api/financier/context which intentionally keeps PENDING orgs listed.
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
      user: { status: 'ACTIVE' },
      organization: { status: 'ACTIVE' },
    },
  })
  if (!membership) {
    throw new FinancingError(
      'Financier staff access required for this service — your institution must be active',
      403
    )
  }
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
