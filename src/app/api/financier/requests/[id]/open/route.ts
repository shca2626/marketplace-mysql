import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { financierOpenReview } from '@/server/modules/financing/requests'
import { FinancingError } from '@/server/modules/financing/shared'

// POST /api/financier/requests/[id]/open — FORWARDED_TO_FINANCIER →
// UNDER_FINANCIER_REVIEW (marks the request as picked up by the financier).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financier:open', { limit: 60, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const request = await financierOpenReview(user.id, id)
    return NextResponse.json({ request })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier open error', err)
    return NextResponse.json({ error: 'Failed to open the request' }, { status: 500 })
  }
}
