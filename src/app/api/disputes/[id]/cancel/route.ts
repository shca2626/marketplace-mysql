import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { cancelDispute, DisputeServiceError } from '@/server/modules/rfq/disputes'

// POST /api/disputes/[id]/cancel — the buyer withdraws their own dispute
// (only when the platform's buyerCancelOwn setting allows it).

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'disputes:cancel', { limit: 20, windowMs: 60_000 })
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const dispute = await cancelDispute(id, { id: user!.id, role: user!.role })
    return NextResponse.json({ dispute })
  } catch (err) {
    if (err instanceof DisputeServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('dispute cancel error', err)
    return NextResponse.json({ error: 'Failed to withdraw dispute' }, { status: 500 })
  }
}
