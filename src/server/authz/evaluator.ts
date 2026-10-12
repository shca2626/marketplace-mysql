import { db } from '@/lib/db'
import { ALL_ORG_PERMISSIONS, ALL_PLATFORM_PERMISSIONS, orgTypeAllowlist } from '@/lib/rbac-catalog'
import { deny, type DenyDetail } from './deny'
import { resolveAuthzContext, type AuthzContext } from './context'

// ─────────────────────────────────────────────────────────────────────────────
// DENY-BY-DEFAULT AUTHORIZATION EVALUATOR (Phase 1).
//
// One place answers "may this actor do this action on this resource in this
// context". Callers pass conditions; anything missing → typed deny. The
// evaluator composes:
//   • authentication + account status
//   • active context validity (org selector vs live membership)
//   • organization status/verification gates
//   • required permission for action+resource in the SAME context
//   • orgType allowlists (a financier org cannot gain selling permissions…)
//   • store scope (store-scoped roles never reach other stores)
//   • module entitlement gates
//   • separation of duties (no self-approval)
// Permission data is read live on every check — revocations are effective
// immediately with no cache invalidation window.
// ─────────────────────────────────────────────────────────────────────────────

export interface AuthorizeOptions {
  /** Required permission key (org scope when orgContext, platform scope for platform actions). */
  permission?: string
  /** Any-of permission keys — the action passes when the actor holds at least one. */
  anyOf?: string[]
  /** Force evaluation against the platform context instead of the active org. */
  platform?: boolean
  /** Require an active organization context (any type). */
  requireOrg?: boolean
  /** Require the active org be one of these orgTypes. */
  orgTypes?: string[]
  /** Require the active organization to be verified. */
  requireVerifiedOrg?: boolean
  /** Store scope selector (validated against the active org when present). */
  storeId?: string | null
  /** Resource-owner guard: returns false when the resource belongs to another tenant. */
  ownsResource?: () => Promise<boolean> | boolean
  /** Module gate: every listed module key must be enabled for the context. */
  modules?: string[]
  /** Separation of duties: action must not target the actor themself. */
  notSelf?: { id: string; what: string }
}

export type AuthorizeResult =
  | { ok: true; ctx: AuthzContext }
  | { ok: false; deny: DenyDetail }

export async function authorize(opts: AuthorizeOptions = {}): Promise<AuthorizeResult> {
  const ctx = await resolveAuthzContext()
  if (ctx.error) return { ok: false, deny: ctx.error }

  // ── permission validity ──────────────────────────────────────────────────
  const wanted = [opts.permission, ...(opts.anyOf ?? [])].filter(Boolean) as string[]
  for (const key of wanted) {
    const known =
      ALL_PLATFORM_PERMISSIONS.includes(key) || ALL_ORG_PERMISSIONS.includes(key)
    if (!known) return { ok: false, deny: deny('UNKNOWN_PERMISSION', `Unknown permission "${key}".`, 500) }
  }

  // ── platform-scope actions ───────────────────────────────────────────────
  if (opts.platform) {
    if (!ctx.isPlatformStaff) {
      return { ok: false, deny: deny('MISSING_PERMISSION', 'Platform staff access required.', 403) }
    }
    if (!ctx.isPlatformSuperAdmin) {
      // super-admins hold everything; staff need the explicit grant. Platform
      // permissions resolve from platform-scope assignments regardless of the
      // active org cookie (the two scopes never merge).
      const holds = wanted.length === 0 || wanted.some((k) => ctx.platformPermissions.has(k))
      if (!holds) {
        return { ok: false, deny: deny('MISSING_PERMISSION', `This action requires the "${wanted.join('" or "')}" permission.`, 403) }
      }
    }
    for (const key of wanted) {
      if (!ALL_PLATFORM_PERMISSIONS.includes(key)) {
        return { ok: false, deny: deny('PERMISSION_NOT_FOR_ORG_TYPE', `"${key}" is not a platform permission.`, 403) }
      }
    }
    return afterCommonGuards(ctx, opts)
  }

  // ── organization context ────────────────────────────────────────────────
  if (opts.requireOrg || opts.permission?.startsWith('org.') || opts.permission?.startsWith('financier.') || (opts.anyOf ?? []).some((k) => k.startsWith('org.') || k.startsWith('financier.'))) {
    const org = ctx.activeOrg
    if (!org) {
      return { ok: false, deny: deny('INVALID_CONTEXT', 'Switch to an organization context first.', 403) }
    }
    if (org.status === 'SUSPENDED' || org.status === 'REJECTED') {
      return { ok: false, deny: deny('ORG_SUSPENDED', `Organization "${org.name}" is ${org.status.toLowerCase()} — actions are frozen.`, 403) }
    }
    if (opts.orgTypes && !opts.orgTypes.includes(org.orgType)) {
      return { ok: false, deny: deny('PERMISSION_NOT_FOR_ORG_TYPE', `This action is not available for ${org.orgType} organizations.`, 403) }
    }
    if (opts.requireVerifiedOrg && !org.verifiedAt) {
      return { ok: false, deny: deny('ORG_NOT_VERIFIED', `Organization "${org.name}" must be verified first.`, 403) }
    }
    if (opts.permission || (opts.anyOf && opts.anyOf.length > 0)) {
      const candidates = [opts.permission, ...(opts.anyOf ?? [])].filter(Boolean) as string[]
      const allow = orgTypeAllowlist(org.orgType)
      const permitted = candidates.filter((k) => allow.includes(k))
      if (permitted.length === 0) {
        return { ok: false, deny: deny('PERMISSION_NOT_FOR_ORG_TYPE', `Permission "${candidates.join('" or "')}" is not available to ${org.orgType} organizations.`, 403) }
      }
      if (!permitted.some((k) => ctx.permissions.has(k))) {
        return { ok: false, deny: deny('MISSING_PERMISSION', `This action requires the "${permitted.join('" or "')}" permission in ${org.name}.`, 403) }
      }
    }
    // ── store scope ────────────────────────────────────────────────────────
    if (opts.storeId) {
      const store = await db.store.findFirst({
        where: { id: opts.storeId, organizationId: org.id, isArchived: false },
        select: { id: true },
      })
      if (!store) {
        return { ok: false, deny: deny('STORE_OUT_OF_SCOPE', 'Store not found in this organization.', 404) }
      }
      // store-scoped role assignments must match the store being acted on
      const scopedCount = await db.userRole.count({
        where: { userId: ctx.user.id, organizationId: org.id, storeId: { not: '' } },
      })
      if (scopedCount > 0) {
        const inScope = await db.userRole.count({
          where: { userId: ctx.user.id, organizationId: org.id, storeId: opts.storeId },
        })
        const orgWide = await db.userRole.count({
          where: { userId: ctx.user.id, organizationId: org.id, storeId: '' },
        })
        if (inScope === 0 && orgWide === 0 && org.membershipRole !== 'OWNER') {
          return { ok: false, deny: deny('STORE_OUT_OF_SCOPE', 'Your roles do not cover this store.', 403) }
        }
      }
    }
    return afterCommonGuards(ctx, opts)
  }

  // ── personal-context actions (authentication only by default) ────────────
  return afterCommonGuards(ctx, opts)
}

async function afterCommonGuards(ctx: AuthzContext, opts: AuthorizeOptions): Promise<AuthorizeResult> {
  if (opts.ownsResource) {
    const owned = await opts.ownsResource()
    if (!owned) {
      return { ok: false, deny: deny('TENANT_MISMATCH', 'This resource belongs to another account or organization.', 404) }
    }
  }
  if (opts.notSelf && opts.notSelf.id === ctx.user.id) {
    return { ok: false, deny: deny('SELF_ACTION_FORBIDDEN', `You cannot ${opts.notSelf.what} yourself.`, 403) }
  }
  if (opts.modules && opts.modules.length > 0) {
    for (const key of opts.modules) {
      if (!(await isModuleEnabled(key, ctx))) {
        return { ok: false, deny: deny('MODULE_DISABLED', `The "${key}" module is disabled for this context.`, 403) }
      }
    }
  }
  return { ok: true, ctx }
}

// ── Module entitlement gate ──────────────────────────────────────────────────
// The modules service is the SINGLE source of truth for module state (scope
// chain ORG > ORG_TYPE > PLATFORM > default, subscription ceiling, 30s cache,
// unknown keys fail CLOSED). The evaluator used to carry a divergent copy that
// defaulted unknown keys OPEN — that hazard is gone: this is now a delegate.
export async function isModuleEnabled(
  moduleKey: string,
  ctx?: AuthzContext
): Promise<boolean> {
  const { isModuleEnabled: serviceGate } = await import('@/server/modules/modules/service')
  return serviceGate(moduleKey, {
    orgId: ctx?.activeOrg?.id ?? null,
    orgType: ctx?.activeOrg?.orgType ?? null,
  })
}

// ── Direct permission helpers (services used outside a request scope) ───────

/** Live org-permission check — used by domain services and background jobs.
 *
 * ORG-TYPE-AWARE: OWNERs hold the full allowlist for their org type; non-owner
 * members resolve canonical UserRole assignments plus the org-type-aware
 * legacy membership bridge (a legacy ADMIN of a financing institution maps to
 * the financier.admin template, NOT to the COMPANY admin template). */
export async function userHasOrgPermission(
  userId: string,
  organizationId: string,
  permission: string
): Promise<boolean> {
  const membership = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    include: { organization: { select: { orgType: true } } },
  })
  if (!membership) return false
  const allow = orgTypeAllowlist(membership.organization.orgType)
  if (!allow.includes(permission)) return false
  if (membership.role === 'OWNER') return true
  const count = await db.userRole.count({
    where: { userId, organizationId, role: { permissions: { some: { permissionKey: permission } } } },
  })
  if (count > 0) return true
  // legacy bridge (org-type-aware — see context.ts legacyRoleGrants)
  const legacy = legacyGrantFor(membership.organization.orgType, membership.role)
  return legacy.includes(permission)
}

function legacyGrantFor(orgType: string, role: string): string[] {
  if (orgType === 'BANK' || orgType === 'MFI' || orgType === 'EWALLET') {
    if (role === 'ADMIN') {
      return [
        'org.profile.view',
        'org.profile.update',
        'org.members.invite',
        'org.members.manage',
        'financier.services.manage',
        'financier.services.publish',
        'financier.requests.view',
        'financier.offers.manage',
        'financier.agreements.manage',
        'financier.accreditations.manage',
        'financier.team.manage',
      ]
    }
    return []
  }
  switch (role) {
    case 'ADMIN':
      return ['org.profile.view', 'org.profile.update', 'org.members.invite', 'org.orders.view', 'org.rfq.view', 'org.rfq.create', 'org.approvals.manage', 'org.pricelists.view', 'org.finance.view', 'org.finance.apply']
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
