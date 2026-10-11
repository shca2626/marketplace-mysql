import { NextResponse } from 'next/server'
import { getSessionUser, currentSessionMfaSatisfiedAt } from '@/lib/auth'
import { userHasAnyPlatformPermission, userHasPlatformPermission } from '@/server/modules/rbac/service'
import { MFA_STEPUP_WINDOW_MS, isMfaEnrolled } from '@/server/modules/mfa/service'

/**
 * Route-level authorization helpers.
 * Returns the session user, or a ready-to-return error response.
 */

export interface GuardUser {
  id: string
  role: string
  name: string
  email: string
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
