import { NextResponse } from 'next/server'
import { resolveAuthzContext } from '@/server/authz/context'
import { orgTypeAllowlist } from '@/lib/rbac-catalog'

export const dynamic = 'force-dynamic'

/**
 * GET /api/context — the trusted active-context snapshot for the SPA.
 * Returns the user, their organizations, the validated active organization
 * (server-checked membership — the cookie is only a selector), effective
 * permissions of the active context and the orgType allowlist surface.
 */
export async function GET() {
  const ctx = await resolveAuthzContext()
  if (ctx.error) {
    return NextResponse.json(
      { error: ctx.error.message, code: ctx.error.reason },
      { status: ctx.error.status, headers: { 'X-Authz-Deny': ctx.error.reason } }
    )
  }
  return NextResponse.json({
    user: ctx.user,
    orgs: ctx.orgs.map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      orgType: o.orgType,
      status: o.status,
      membershipRole: o.membershipRole,
      verified: !!o.verifiedAt,
    })),
    activeOrg: ctx.activeOrg
      ? {
          id: ctx.activeOrg.id,
          name: ctx.activeOrg.name,
          slug: ctx.activeOrg.slug,
          orgType: ctx.activeOrg.orgType,
          status: ctx.activeOrg.status,
          membershipRole: ctx.activeOrg.membershipRole,
          verified: !!ctx.activeOrg.verifiedAt,
        }
      : null,
    isPlatformStaff: ctx.isPlatformStaff,
    isPlatformSuperAdmin: ctx.isPlatformSuperAdmin,
    permissions: [...ctx.permissions],
    orgTypeAllowlist: ctx.activeOrg ? orgTypeAllowlist(ctx.activeOrg.orgType) : [],
  })
}
