import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { ALL_ORG_PERMISSIONS, orgTypeAllowlist } from '@/lib/rbac-catalog'
import { deny, type DenyDetail } from './deny'

// ─────────────────────────────────────────────────────────────────────────────
// TRUSTED ACTIVE-CONTEXT RESOLVER (Phase 1).
//
// The ONLY way server code learns "which organization / store is the user
// acting for". The cookie value is a SELECTOR, never proof: membership,
// organization status and store ownership are all re-verified server-side on
// every resolution. Client-supplied ids in request bodies are likewise only
// selectors — resource ownership checks happen in the evaluator/services.
//
// Context model:
//   personal  — user acts for themselves (personal profile, personal cart…)
//   org       — user acts inside an active organization (validated member)
//   platform  — legacy User.role=ADMIN or platform-scope role assignments
// ─────────────────────────────────────────────────────────────────────────────

export const ACTIVE_ORG_COOKIE = 'vendora_active_org'

export interface AuthzOrgSummary {
  id: string
  name: string
  slug: string
  orgType: string
  status: string
  verifiedAt: Date | null
  membershipRole: string
}

export interface AuthzContext {
  user: {
    id: string
    name: string
    email: string
    role: string
    status: string
    sessionVersion: number
  }
  /** All organizations the user is a member of (any role). */
  orgs: AuthzOrgSummary[]
  /** The validated active organization (null = personal context). */
  activeOrg: AuthzOrgSummary | null
  /** True when the user holds platform-staff roles or is legacy ADMIN. */
  isPlatformStaff: boolean
  /** True only for legacy User.role === 'ADMIN' (implicit super-admin). */
  isPlatformSuperAdmin: boolean
  /** Effective permissions of the ACTIVE context (org scope when activeOrg set; platform scope never mixed in). */
  permissions: Set<string>
  /** Deny detail when the context itself failed to resolve (suspended, bad cookie). */
  error: DenyDetail | null
}

/** Resolves the trusted active context for the current request. */
export async function resolveAuthzContext(): Promise<AuthzContext> {
  const user = await getSessionUser()
  if (!user) {
    return emptyContext(deny('UNAUTHENTICATED', 'Please sign in first.', 401))
  }
  if (user.status === 'SUSPENDED') {
    return emptyContext(deny('ACCOUNT_SUSPENDED', 'This account is suspended.', 403))
  }

  const memberships = await db.organizationMember.findMany({
    where: { userId: user.id },
    include: { organization: true },
    orderBy: { createdAt: 'asc' },
  })
  const orgs: AuthzOrgSummary[] = memberships.map((m) => ({
    id: m.organization.id,
    name: m.organization.name,
    slug: m.organization.slug,
    orgType: m.organization.orgType,
    status: m.organization.status,
    verifiedAt: m.organization.verifiedAt,
    membershipRole: m.role,
  }))

  // Active-org selector (cookie) — validated against live membership.
  const cookieStore = await cookies()
  const selector = cookieStore.get(ACTIVE_ORG_COOKIE)?.value ?? ''
  const activeMembership = selector ? memberships.find((m) => m.organizationId === selector) : null
  if (selector && !activeMembership) {
    // Stale / spoofed selector — fall back to personal, never trust it.
    return buildContext(user, orgs, null)
  }
  const activeOrg = activeMembership
    ? {
        id: activeMembership.organization.id,
        name: activeMembership.organization.name,
        slug: activeMembership.organization.slug,
        orgType: activeMembership.organization.orgType,
        status: activeMembership.organization.status,
        verifiedAt: activeMembership.organization.verifiedAt,
        membershipRole: activeMembership.role,
      }
    : null

  return buildContext(user, orgs, activeOrg)
}

async function buildContext(
  user: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>,
  orgs: AuthzOrgSummary[],
  activeOrg: AuthzOrgSummary | null
): Promise<AuthzContext> {
  const isPlatformSuperAdmin = user.role === 'ADMIN'

  // Platform staff detection + platform permissions (personal context only —
  // platform permissions NEVER leak into an org context).
  const platformAssignments = await db.userRole.findMany({
    where: { userId: user.id, organizationId: '' },
    include: { role: { include: { permissions: { select: { permissionKey: true } } } } },
    take: 50,
  })
  const isPlatformStaff = isPlatformSuperAdmin || platformAssignments.length > 0

  const permissions = new Set<string>()
  if (!activeOrg) {
    // Personal context: platform permissions only (org permissions need an org context).
    if (isPlatformSuperAdmin) {
      // legacy super-admin bypass — full platform grant, represented by wildcard
      permissions.add('*')
    } else {
      for (const a of platformAssignments) for (const p of a.role.permissions) permissions.add(p.permissionKey)
    }
  } else {
    // Org context: resolve org-scope grants (canonical + legacy mapping).
    const [assignments, legacyGrants] = await Promise.all([
      db.userRole.findMany({
        where: { userId: user.id, organizationId: activeOrg.id },
        include: { role: { include: { permissions: { select: { permissionKey: true } } } } },
        take: 100,
      }),
      legacyRoleGrants(user.id, activeOrg.id, activeOrg.membershipRole),
    ])
    if (activeOrg.membershipRole === 'OWNER') {
      const allow = orgTypeAllowlist(activeOrg.orgType)
      for (const p of allow) permissions.add(p)
    } else {
      for (const a of assignments) for (const p of a.role.permissions) permissions.add(p.permissionKey)
      for (const p of legacyGrants) permissions.add(p)
    }
  }

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      sessionVersion: user.sessionVersion,
    },
    orgs,
    activeOrg,
    isPlatformStaff,
    isPlatformSuperAdmin,
    permissions,
    error: null,
  }
}

/**
 * Legacy OrganizationMember.role → org permission grants (migration bridge).
 * Preserves workflow behavior (approval routing etc.) until every member
 * holds canonical UserRole assignments; removed only after static + runtime
 * analysis proves it unused.
 */
async function legacyRoleGrants(_userId: string, _orgId: string, membershipRole: string): Promise<string[]> {
  switch (membershipRole) {
    case 'ADMIN':
      // org.admin template (minus selling keys the legacy console didn't gate)
      return [
        'org.profile.view',
        'org.profile.update',
        'org.members.invite',
        'org.orders.view',
        'org.rfq.view',
        'org.rfq.create',
        'org.approvals.manage',
        'org.pricelists.view',
        'org.finance.view',
        'org.finance.apply',
      ]
    case 'BUYER':
      return ['org.profile.view', 'org.orders.view', 'org.rfq.view', 'org.rfq.create', 'org.pricelists.view', 'org.finance.view', 'org.finance.apply']
    case 'APPROVER':
      return ['org.profile.view', 'org.approvals.manage', 'org.orders.view', 'org.rfq.view']
    case 'VIEWER':
      return ['org.profile.view', 'org.orders.view', 'org.rfq.view']
    default:
      return []
  }
}

function emptyContext(error: DenyDetail): AuthzContext {
  return {
    user: { id: '', name: '', email: '', role: '', status: '', sessionVersion: 0 },
    orgs: [],
    activeOrg: null,
    isPlatformStaff: false,
    isPlatformSuperAdmin: false,
    permissions: new Set(),
    error,
  }
}

/** All org-scope permissions (used by tests and the role editor UI). */
export const ALL_ORG_SCOPE_PERMISSIONS = ALL_ORG_PERMISSIONS
