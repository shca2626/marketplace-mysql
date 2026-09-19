import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { getOrganization, OrgServiceError } from '@/server/modules/organizations/service'

// GET /api/organizations/[id] — detail (members + groups); member or admin only
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id } = await ctx.params
    const organization = await getOrganization(id, user!.id, user!.role === 'ADMIN')
    return NextResponse.json({ organization })
  } catch (err) {
    if (err instanceof OrgServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('organization GET error', err)
    return NextResponse.json({ error: 'Failed to load organization' }, { status: 500 })
  }
}
