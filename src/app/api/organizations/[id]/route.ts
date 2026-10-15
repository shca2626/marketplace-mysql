import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { getOrganization, updateApprovalThreshold, OrgServiceError } from '@/server/modules/organizations/service'
import { userHasPlatformPermission } from '@/server/modules/rbac/service'
import { assertSameOrigin } from '@/lib/http'

// GET /api/organizations/[id] — detail (members + groups); member or
// platform staff (orgs.view) only.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id } = await ctx.params
    const organization = await getOrganization(id, user!.id, await userHasPlatformPermission(user!.id, 'orgs.view'))
    return NextResponse.json({ organization })
  } catch (err) {
    if (err instanceof OrgServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('organization GET error', err)
    return NextResponse.json({ error: 'Failed to load organization' }, { status: 500 })
  }
}

const thresholdSchema = z.object({
  approvalThreshold: z.number().min(0).max(10_000_000).nullable(),
})

// PATCH /api/organizations/[id] — owner/platform-staff (orgs.update) self-service
// approval policy. Sets (or clears with null) the purchase-approval threshold.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id } = await ctx.params
    const body = await req.json()
    const parsed = thresholdSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const organization = await updateApprovalThreshold(
      id,
      user!.id,
      await userHasPlatformPermission(user!.id, 'orgs.update'),
      parsed.data.approvalThreshold
    )
    return NextResponse.json({ organization })
  } catch (err) {
    if (err instanceof OrgServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('organization PATCH error', err)
    return NextResponse.json({ error: 'Failed to update approval policy' }, { status: 500 })
  }
}
