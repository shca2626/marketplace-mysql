import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { decideAccreditation } from '@/server/modules/financing/accreditation'
import { FinancingError } from '@/server/modules/financing/shared'

// POST /api/financier/accreditations/[id]/open — FORWARDED_TO_FINANCIER →
// UNDER_FINANCIER_REVIEW (the accreditation twin of requests/[id]/open).
// Latent FIN-5 gap surfaced by FIN-7 QA: the grant transition requires
// UNDER_FINANCIER_REVIEW, but no route existed to start the review.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financier:open', { limit: 60, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const request = await decideAccreditation(user.id, id, { action: 'REVIEW_START' })
    return NextResponse.json({ request })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier accreditation open error', err)
    return NextResponse.json({ error: 'Failed to open the accreditation' }, { status: 500 })
  }
}
