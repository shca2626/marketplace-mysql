import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { adminMarkFee } from '@/server/modules/financing/agreements'
import { FinancingError } from '@/server/modules/financing/shared'

// POST /api/admin/financing/fees/[id]/mark-paid — INVOICED → PAID (the
// external collection landed; mirrors the Payout mark-paid console).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'admin:fee', { limit: 60, windowMs: 60_000 }, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const fee = await adminMarkFee(user.id, id, 'MARK_PAID')
    return NextResponse.json({ fee })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin fee paid error', err)
    return NextResponse.json({ error: 'Failed to mark the fee paid' }, { status: 500 })
  }
}
