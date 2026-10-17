import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { FollowError, unfollowOrg } from '@/server/modules/follows/service'

// DELETE /api/follows/[orgId] — unfollow a company.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { orgId } = await params
    const result = await unfollowOrg(user.id, orgId)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof FollowError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    console.error('follows DELETE error', err)
    return NextResponse.json({ error: 'Failed to unfollow that company' }, { status: 500 })
  }
}
