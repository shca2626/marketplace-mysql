import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { adminMarkFee } from '@/server/modules/financing/agreements'
import { FinancingError } from '@/server/modules/financing/shared'

// POST /api/admin/financing/fees/[id]/mark-invoiced — ACCRUED → INVOICED
// (the fee was invoiced to the financier externally — D-002).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin('financing.fees.manage')
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'admin:fee', { limit: 60, windowMs: 60_000 }, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const fee = await adminMarkFee(user.id, id, 'MARK_INVOICED')
    return NextResponse.json({ fee })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin fee invoiced error', err)
    return NextResponse.json({ error: 'Failed to mark the fee invoiced' }, { status: 500 })
  }
}
