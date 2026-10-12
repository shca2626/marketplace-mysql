import { NextResponse } from 'next/server'
import { getSessionUser, currentSessionMfaSatisfiedAt } from '@/lib/auth'
import { authorize, type AuthorizeOptions } from '@/server/authz/evaluator'
import { MFA_STEPUP_WINDOW_MS, isMfaEnrolled, mfaRequiredForUser } from '@/server/modules/mfa/service'

/**
 * Route-level authorization helpers.
 *
 * EVERY decision flows through the deny-by-default evaluator
 * (src/server/authz/evaluator.ts) — these are thin adapters that translate
 * evaluator results into route-shaped responses. The guards themselves carry
 * NO independent decision logic, so context validity, org-type allowlists,
 * store scope, module gates and revocation freshness are enforced in exactly
 * one place.
 *
 * Migration note (RBAC completion): the legacy `User.role === 'ADMIN'`
 * early-return that used to live in requireAdmin/requireAdminAny is GONE.
 * Platform super-admins now pass through the evaluator, which derives that
 * authority from the canonical protected `platform.super-admin` assignment
 * (seeded onto every legacy admin — parity was verified in the live DB before
 * this switch). A bare `requireAdmin()` without a permission key is a
 * programmer error and THROWS.
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

/** Translate an evaluator deny into a ready-to-return NextResponse. */
function denyResponse(deny: { reason: string; message: string; status: number }): NextResponse {
  return NextResponse.json({ error: deny.message, code: deny.reason }, { status: deny.status })
}

/**
 * Platform admin gate — RBAC only. A permission key is REQUIRED; calling
 * without one throws (it can never silently mean "any admin").
 */
export async function requireAdmin(permission: string): Promise<
  { user: GuardUser; error: null } | { user: null; error: NextResponse }
> {
  if (!permission || typeof permission !== 'string') {
    throw new Error(
      '[guards] requireAdmin(permission) — a permission key is REQUIRED (the legacy ADMIN role bypass is removed)'
    )
  }
  const res = await authorize({ platform: true, permission })
  if (!res.ok) return { user: null, error: denyResponse(res.deny) }
  return {
    user: { id: res.ctx.user.id, role: res.ctx.user.role, name: res.ctx.user.name, email: res.ctx.user.email },
    error: null,
  }
}

/**
 * Admin gate accepting any of several permission keys — used by the Roles &
 * Access routes where the granular role-module CRUD keys are interchangeable.
 */
export async function requireAdminAny(
  permissions: string[]
): Promise<{ user: GuardUser; error: null } | { user: null; error: NextResponse }> {
  if (!Array.isArray(permissions) || permissions.length === 0) {
    throw new Error('[guards] requireAdminAny([...]) — at least one permission key is REQUIRED')
  }
  const res = await authorize({ platform: true, anyOf: permissions })
  if (!res.ok) return { user: null, error: denyResponse(res.deny) }
  return {
    user: { id: res.ctx.user.id, role: res.ctx.user.role, name: res.ctx.user.name, email: res.ctx.user.email },
    error: null,
  }
}

/**
 * Org-context gate — the org-side twin of requireAdmin. Delegates to the
 * evaluator: requires an ACTIVE organization context (validated against live
 * membership, never a client-supplied id), enforces org status/type
 * allowlists and the permission in that org. Optional evaluator options
 * (orgTypes, requireVerifiedOrg, storeId, modules, ownsResource, notSelf)
 * pass straight through.
 */
export async function requireOrgPermission(
  permission: string,
  opts: Omit<AuthorizeOptions, 'permission' | 'platform' | 'anyOf'> = {}
): Promise<
  { user: GuardUser; error: null } | { user: null; error: NextResponse }
> {
  if (!permission || typeof permission !== 'string') {
    throw new Error('[guards] requireOrgPermission(permission) — a permission key is REQUIRED')
  }
  const res = await authorize({ permission, ...opts })
  if (!res.ok) return { user: null, error: denyResponse(res.deny) }
  return {
    user: { id: res.ctx.user.id, role: res.ctx.user.role, name: res.ctx.user.name, email: res.ctx.user.email },
    error: null,
  }
}

/**
 * Module gate (Phase 5 / 6.3 hardening). Blocks the route when the module is
 * deactivated for the requesting context. Org-scoped calls pass the caller's
 * orgId/orgType; personal-scope calls resolve the union of the user's org
 * chains (so a flip for an org type steers that org's people only).
 *
 *  • UNKNOWN module keys fail closed with 403 MODULE_UNKNOWN + a config-error
 *    log — a typo can never grant access.
 *  • No ADMIN bypass: module gates apply to every account.
 */
export async function requireModule(
  moduleKey: string,
  ctx: { orgId?: string | null; orgType?: string | null } = {}
): Promise<{ user: GuardUser; error: null } | { user: null; error: NextResponse }> {
  const result = await requireUser()
  if (result.error) return result
  const user = result.user!

  const gate =
    ctx.orgId || ctx.orgType
      ? await moduleGateStateImported(moduleKey, ctx)
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

async function moduleGateStateImported(
  moduleKey: string,
  ctx: { orgId?: string | null; orgType?: string | null }
): Promise<{ enabled: boolean; unknown: boolean }> {
  const { moduleGateState } = await import('@/server/modules/modules/service')
  return moduleGateState(moduleKey, ctx)
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
 * Only enforced for accounts whose effective role assignments make MFA
 * mandatory (mfaRequiredForUser derives from live assignments — adding a
 * privileged role turns the requirement on automatically).
 *
 *   const su = await requireStepUpMfa()
 *   if (su.error) return su.error
 */
export async function requireStepUpMfa(): Promise<
  { ok: true; error: null } | { ok: false; error: NextResponse }
> {
  const result = await requireUser()
  if (result.error) return { ok: false, error: result.error }
  const user = result.user!

  let required = false
  try {
    required = await mfaRequiredForUser(user.id)
  } catch (err) {
    console.error('[guards] mfaRequiredForUser resolution failed — failing closed for step-up', err)
    return {
      ok: false,
      error: NextResponse.json({ error: 'Unable to verify the security policy for this action.' }, { status: 403 }),
    }
  }
  if (!required) return { ok: true, error: null }

  const enrolled = await isMfaEnrolled(user.id)
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
  const satisfiedAt = await currentSessionMfaSatisfiedAt()
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
