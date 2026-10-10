import { NextResponse } from 'next/server'
import { authorize, type AuthorizeOptions, type AuthorizeResult } from './evaluator'
import { resolveAuthzContext, ACTIVE_ORG_COOKIE, type AuthzContext } from './context'

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE-FACING AUTHZ GUARDS (Phase 1).
//
// Drop-in replacement for ad-hoc role checks in API routes:
//
//   const authz = await guard({ permission: 'org.offers.manage', requireOrg: true })
//   if (!authz.ok) return authz.errorResponse
//   ... authz.ctx ...
//
// Every deny returns JSON { error, code } + an X-Authz-Deny header carrying the
// typed reason — testable without parsing prose.
// ─────────────────────────────────────────────────────────────────────────────

export type GuardResult =
  | { ok: true; ctx: AuthzContext; errorResponse: null }
  | { ok: false; ctx: null; errorResponse: NextResponse }

export async function guard(opts: AuthorizeOptions = {}): Promise<GuardResult> {
  const result: AuthorizeResult = await authorize(opts)
  if (result.ok) return { ok: true, ctx: result.ctx, errorResponse: null }
  const { reason, message, status } = result.deny
  return {
    ok: false,
    ctx: null,
    errorResponse: NextResponse.json(
      { error: message, code: reason },
      { status, headers: { 'X-Authz-Deny': reason } }
    ),
  }
}

/** Convenience: require only authentication (personal context). */
export async function requirePersonal(): Promise<GuardResult> {
  return guard({})
}

/** Convenience: platform-scope permission gate. */
export async function requirePlatform(permission?: string): Promise<GuardResult> {
  return guard({ platform: true, permission })
}

export { resolveAuthzContext, ACTIVE_ORG_COOKIE }
export type { AuthzContext }
export { authorize, isModuleEnabled, userHasOrgPermission } from './evaluator'
export { deny, DENY_REASONS } from './deny'
export type { DenyReason, DenyDetail } from './deny'
