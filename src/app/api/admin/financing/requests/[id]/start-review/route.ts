import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { db } from '@/lib/db'
import { startPlatformReview } from '@/server/modules/financing/requests'
import { startAccreditationReview } from '@/server/modules/financing/accreditation'
import { FinancingError } from '@/server/modules/financing/shared'

// POST /api/admin/financing/requests/[id]/start-review — an admin formally
// opens a SUBMITTED request for platform review (SUBMITTED →
// UNDER_PLATFORM_REVIEW, stamps the reviewer). Return stays gated on the
// state machine afterwards. Works for financing AND accreditation
// requests (auto-detected — cuid ids never collide).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'admin:gate-action', { limit: 60, windowMs: 60_000 }, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const fin = await db.financingRequest.findUnique({ where: { id }, select: { id: true } })
    if (fin) {
      const request = await startPlatformReview(user.id, id)
      return NextResponse.json({ requestType: 'FINANCING', request })
    }
    const acc = await db.accreditationRequest.findUnique({ where: { id }, select: { id: true } })
    if (acc) {
      const request = await startAccreditationReview(user.id, id)
      return NextResponse.json({ requestType: 'ACCREDITATION', request })
    }
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin start-review error', err)
    return NextResponse.json({ error: 'Failed to start the review' }, { status: 500 })
  }
}
