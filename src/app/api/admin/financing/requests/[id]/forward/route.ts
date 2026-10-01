import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { db } from '@/lib/db'
import { forwardRequest } from '@/server/modules/financing/requests'
import { forwardAccreditationRequest } from '@/server/modules/financing/accreditation'
import { FinancingError, GateBlockedError } from '@/server/modules/financing/shared'

// POST /api/admin/financing/requests/[id]/forward — THE GATE. Forwards ONLY
// when every REQUIRED submission is VERIFIED or WAIVED-with-note (checked
// inside the same transaction). Otherwise 422 with the blocking items.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin('financing.gate.review')
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'admin:gate-action', { limit: 60, windowMs: 60_000 }, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const fin = await db.financingRequest.findUnique({ where: { id }, select: { id: true } })
    if (fin) {
      const request = await forwardRequest(user.id, id)
      return NextResponse.json({ requestType: 'FINANCING', request })
    }
    const acc = await db.accreditationRequest.findUnique({ where: { id }, select: { id: true } })
    if (acc) {
      const request = await forwardAccreditationRequest(user.id, id)
      return NextResponse.json({ requestType: 'ACCREDITATION', request })
    }
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  } catch (err) {
    if (err instanceof GateBlockedError) {
      // The gate refused: 422 + exactly what is still incomplete.
      return NextResponse.json(
        { error: err.message, missing: err.missing },
        { status: 422 }
      )
    }
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin forward error', err)
    return NextResponse.json({ error: 'Failed to forward the request' }, { status: 500 })
  }
}
