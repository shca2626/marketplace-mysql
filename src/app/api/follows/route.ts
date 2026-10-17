import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { FollowError, followOrg, listFollowing } from '@/server/modules/follows/service'

// GET /api/follows — the buyer-side Following console: every company this user
// follows, with public storefront stats for each.
export async function GET() {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const following = await listFollowing(user.id)
    return NextResponse.json({ following })
  } catch (err) {
    if (err instanceof FollowError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    console.error('follows GET error', err)
    return NextResponse.json({ error: 'Failed to load following list' }, { status: 500 })
  }
}

// POST /api/follows — follow a company. { orgId }
export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const rl = enforceRateLimit(req, 'follow', RATE_LIMITS.follow, user.id)
    if (rl) return rl

    const body = (await req.json()) as { orgId?: string }
    const result = await followOrg(user.id, body.orgId ?? '')
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    if (err instanceof FollowError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    console.error('follows POST error', err)
    return NextResponse.json({ error: 'Failed to follow that company' }, { status: 500 })
  }
}
