import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { db } from '@/lib/db'
import { returnRequest } from '@/server/modules/financing/requests'
import { returnAccreditationRequest } from '@/server/modules/financing/accreditation'
import { FinancingError } from '@/server/modules/financing/shared'

// POST /api/admin/financing/requests/[id]/return — return an incomplete or
// incorrect request to the applicant with an aggregate reason (per-item
// notes live on the checklist). Works for financing AND accreditation
// requests (auto-detected — cuid ids never collide).
const schema = z.object({ reason: z.string().trim().min(3).max(500) })

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'admin:gate-action', { limit: 60, windowMs: 60_000 }, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'A return reason is required' }, { status: 400 })
    }
    const fin = await db.financingRequest.findUnique({ where: { id }, select: { id: true } })
    if (fin) {
      const request = await returnRequest(user.id, id, parsed.data.reason)
      return NextResponse.json({ requestType: 'FINANCING', request })
    }
    const acc = await db.accreditationRequest.findUnique({ where: { id }, select: { id: true } })
    if (acc) {
      const request = await returnAccreditationRequest(user.id, id, parsed.data.reason)
      return NextResponse.json({ requestType: 'ACCREDITATION', request })
    }
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin return error', err)
    return NextResponse.json({ error: 'Failed to return the request' }, { status: 500 })
  }
}
