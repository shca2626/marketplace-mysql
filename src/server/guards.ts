import { NextResponse } from 'next/server'
import { getSessionContext, getSessionUser } from '@/lib/auth'
import { userHasAnyPlatformPermission, userHasPlatformPermission } from '@/server/modules/rbac/service'
import { moduleGateState } from '@/server/modules/modules/service'
import { isMfaEnrolled, MFA_STEPUP_WINDOW_MS } from '@/server/modules/mfa/service'

/**
 * Route-level authorization helpers.
 * Returns the session user, or a ready-to-return error response.
 *
 * PHASE 6 (lastplan v5 6.1/6.2) — the legacy `User.role === 'ADMIN'` bypass is
 * GONE from every guard. Authorization derives from RBAC assignments only:
 * the platform owner operates through the protected `platform.super-admin`
 * role (seeded onto legacy admin accounts by scripts/seed-rbac.ts, step 3).
 * A bare `requireAdmin()` call is a programmer error and THROWS.
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
 * Admin gate — RBAC only (6.2). Requires an EXPLICIT permission key; calling
 * without one is a programmer error and throws (it can never silently mean
 * "any admin", because "admin" is no longer a role fact).
 */
export async function requireAdmin(permission: string): Promise<
  { user: GuardUser; error: null } | { user: null; error: NextResponse }
> {
  if (!permission || typeof permission !== 'string') {
    throw new Error(
      '[guards] requireAdmin(permission) — a permission key is REQUIRED (Phase 6: the ADMIN role bypass is removed)'
    )
  }
  const result = await requireUser()
  if (result.error) return result
  const user = result.user!

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
 * Admin gate accepting any of several permission keys — used by the Roles &
 * Access routes where the granular role-module CRUD keys are interchangeable.
 * RBAC only (6.2).
 */
export async function requireAdminAny(
  permissions: string[]
): Promise<{ user: GuardUser; error: null } | { user: null; error: NextResponse }> {
  if (!Array.isArray(permissions) || permissions.length === 0) {
    throw new Error('[guards] requireAdminAny([...]) — at least one permission key is REQUIRED (Phase 6)')
  }
  const result = await requireUser()
  if (result.error) return result
  const user = result.user!

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
 * Phase 5 — module gate (6.3 hardening). Blocks the route when the module is
 * deactivated for the requesting context. Org-scoped calls pass the caller's
 * orgId/orgType (e.g. financier-console); personal-scope calls resolve the
 * user's chains.
 *
 * Phase 6 (6.3):
 *  • UNKNOWN module keys fail closed with 403 MODULE_UNKNOWN + a config-error
 *    log — a typo can never grant access.
 *  • No ADMIN bypass: module gates apply to every account (6.2).
 */
export async function requireModule(
  moduleKey: string,
  ctx: { orgId?: string | null; orgType?: string | null } = {}
): Promise<{ user: GuardUser; error: null } | { user: null; error: NextResponse }> {
  const result = await requireUser()
  if (result.error) return result
  const user = result.user!

  const gate = ctx.orgId || ctx.orgType
    ? await moduleGateState(moduleKey, ctx)
    : await userModuleGate(moduleKey, user.id)

  if (gate.unknown) {
    return {
      user: null,
      error: NextResponse.json(
        {
          error: `This capability is misconfigured (unknown module "${moduleKey}") and has been refused. The platform team has been notified.`,
          code: 'MODULE_UNKNOWN',
          module: moduleKey,
        },
        { status: 403 }
      ),
    }
  }
  if (!gate.enabled) {
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

async function userModuleGate(
  moduleKey: string,
  userId: string
): Promise<{ enabled: boolean; unknown: boolean }> {
  const { userModuleState } = await import('@/server/modules/modules/service')
  const state = await userModuleState(userId)
  const known = moduleKey in state
  if (!known) {
    console.error(`[modules] CONFIG ERROR: unknown module key "${moduleKey}" — failing closed (route refused)`)
    return { enabled: false, unknown: true }
  }
  return { enabled: state[moduleKey], unknown: false }
}

/**
 * Step-up MFA for sensitive actions (6.7.5): role grants/changes, payout
 * generation/approval/mark-paid, KYC/document verification, module & policy
 * changes, credential administration. Requires a verified-MFA event on the
 * CURRENT session within the freshness window (default 5 minutes).
 *
 *   const su = await requireStepUpMfa()
 *   if (su.error) return su.error
 */
export async function requireStepUpMfa(): Promise<
  { ok: true; error: null } | { ok: false; error: NextResponse }
> {
  const ctx = await getSessionContext()
  if (!ctx?.user) {
    return { ok: false, error: NextResponse.json({ error: 'Please sign in first' }, { status: 401 }) }
  }
  const enrolled = await isMfaEnrolled(ctx.user.id)
  if (!enrolled) {
    return {
      ok: false,
      error: NextResponse.json(
        {
          error:
            'This action requires multi-factor authentication. Enroll an authenticator app in Settings → Security first.',
          code: 'MFA_ENROLLMENT_REQUIRED',
        },
        { status: 403 }
      ),
    }
  }
  const satisfiedAt = ctx.session?.mfaSatisfiedAt ?? null
  if (!satisfiedAt || Date.now() - satisfiedAt.getTime() > MFA_STEPUP_WINDOW_MS) {
    return {
      ok: false,
      error: NextResponse.json(
        {
          error: 'For this action, please re-confirm your identity (multi-factor check).',
          code: 'MFA_STEP_UP_REQUIRED',
        },
        { status: 403 }
      ),
    }
  }
  return { ok: true, error: null }
}
