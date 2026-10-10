import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { leaveOrganization, OrgRbacError } from '@/server/modules/org-rbac/service'
import { assertSameOrigin } from '@/lib/http'

// POST /api/organizations/[id]/leave — self-service leave (last-owner protected)
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id } = await ctx.params
    await leaveOrganization(user!.id, id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof OrgRbacError) {
      return NextResponse.json({ error: err.message, code: 'DENIED' }, { status: err.status })
    }
    console.error('org leave error', err)
    return NextResponse.json({ error: 'Failed to leave organization' }, { status: 500 })
  }
}
