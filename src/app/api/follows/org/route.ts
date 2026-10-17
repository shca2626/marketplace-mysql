import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { assertOrgViewer, FollowError, listFollowers } from '@/server/modules/follows/service'

// GET /api/follows/org?organizationId= — the company-side Audience tab:
// follower list + growth stats. Membership-verified server-side (any member can
// view the audience; it is read-only intel, not a privileged action).
export async function GET(req: NextRequest) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const organizationId = req.nextUrl.searchParams.get('organizationId') || ''
    await assertOrgViewer(user.id, organizationId)
    const audience = await listFollowers(organizationId)
    return NextResponse.json({ audience })
  } catch (err) {
    if (err instanceof FollowError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    console.error('follows/org GET error', err)
    return NextResponse.json({ error: 'Failed to load the audience' }, { status: 500 })
  }
}
