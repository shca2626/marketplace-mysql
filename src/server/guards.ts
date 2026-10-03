import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { userHasAnyPlatformPermission, userHasPlatformPermission } from '@/server/modules/rbac/service'
import { isModuleEnabled, isModuleEnabledForUser } from '@/server/modules/modules/service'

/**
 * Route-level authorization helpers.
 * Returns the session user, or a ready-to-return error response.
 */

export interface GuardUser {
  id: string
  role: string
  name: string
  email: string | null // Phase 3: phone-first accounts may have no email
}

export async function requireUser(): Promise<
  { user: GuardUser; error: null } | { user: null; error: NextResponse }
> {
  const user = await getSessionUser()
  if (!user) {
    return { user: null, error: NextResponse.json({ error: 'Please sign in first' }, { status: 401 }) }
  }
  return { user: { id: user.id, role: user.role, name: user.name, email: user.email }, error: null }
}

/**
 * Admin gate. Two modes:
 *  • requireAdmin()          — strict: only legacy User.role === 'ADMIN'.
 *  • requireAdmin(permKey)   — RBAC-aware: legacy admins still bypass (they
 *    are implicit super-admins), while platform staff pass when any of their
 *    platform-scope roles grants the permission. This is the migration path
 *    for every admin route: add the permission key, nothing else changes.
 */
export async function requireAdmin(permission?: string): Promise<
  { user: GuardUser; error: null } | { user: null; error: NextResponse }
> {
  const result = await requireUser()
  if (result.error) return result
  const user = result.user!
  if (user.role === 'ADMIN') return result

  if (!permission) {
    return { user: null, error: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) }
  }
  const allowed = await userHasPlatformPermission(user.id, permission)
  if (!allowed) {
    return {
      user: null,
      error: NextResponse.json(
        { error: `Access denied — this action requires the "${permission}" permission. Ask a platform administrator to grant it.` },
        { status: 403 }
      ),
    }
  }
  return result
}

/**
 * RBACSEC-1: admin gate accepting any of several permission keys — used by
 * the Roles & Access routes where the granular role-module CRUD keys
 * (rbac.roles.create/update/delete, rbac.manage) are interchangeable.
 * Legacy User.role === 'ADMIN' always bypasses.
 */
export async function requireAdminAny(
  permissions: string[]
): Promise<{ user: GuardUser; error: null } | { user: null; error: NextResponse }> {
  const result = await requireUser()
  if (result.error) return result
  const user = result.user!
  if (user.role === 'ADMIN') return result

  if (permissions.length === 0) {
    return { user: null, error: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) }
  }
  const allowed = await userHasAnyPlatformPermission(user.id, permissions)
  if (!allowed) {
    return {
      user: null,
      error: NextResponse.json(
        {
          error: `Access denied — this action requires one of: ${permissions.join(', ')}. Ask a platform administrator to grant it.`,
        },
        { status: 403 }
      ),
    }
  }
  return result
}

/**
 * Phase 5 — module gate. Blocks the route when the module is deactivated for
 * the requesting context. Org-scoped calls pass the caller's orgId/orgType
 * (e.g. financier-console); personal-scope calls resolve the user's chains.
 *
 *   const { user, error } = await requireModule('rfq')
 *   const { user, error } = await requireModule('financier-console', { orgId, orgType })
 *
 * Personal-scope modules resolve through the USER's own org chains (union
 * over their memberships; org-less users get the platform chain) — so an
 * admin flipping a module off for an org type gates those users' APIs too.
 */
export async function requireModule(
  moduleKey: string,
  ctx: { orgId?: string | null; orgType?: string | null } = {}
): Promise<{ user: GuardUser; error: null } | { user: null; error: NextResponse }> {
  const result = await requireUser()
  if (result.error) return result
  const user = result.user!
  // Legacy admins and platform staff bypass module gates — module flips steer
  // the market (storefront, buyers, sellers, financiers), not the operators.
  if (user.role === 'ADMIN') return result
  // Org-scoped call (e.g. financier-console): resolve that explicit chain.
  // Personal-scope modules (rfq, financing-hub, b2b-orgs, storefront
  // features) resolve through the USER's org chains — an org-type flip must
  // gate a member's APIs too (Phase 5 gate: off means gone from nav AND API).
  const enabled =
    ctx.orgId || ctx.orgType
      ? await isModuleEnabled(moduleKey, ctx)
      : await isModuleEnabledForUser(moduleKey, user.id)
  if (!enabled) {
    return {
      user: null,
      error: NextResponse.json(
        {
          error: `This capability is currently disabled${ctx.orgType ? ` for ${ctx.orgType} organizations` : ''}. Contact the platform team if you believe this is a mistake.`,
          code: 'MODULE_DISABLED',
          module: moduleKey,
        },
        { status: 403 }
      ),
    }
  }
  return result
}
