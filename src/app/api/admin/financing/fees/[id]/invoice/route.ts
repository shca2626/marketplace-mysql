import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { financingError } from '@/lib/financing-api'
import { markFeeInvoiced } from '@/server/modules/financing/offers'

// POST /api/admin/financing/fees/[id]/invoice — ACCRUED → INVOICED
// (the fee is invoiced externally; the platform never collects money).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin('financing.fees.manage')
  if (error) return error

  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const rl = enforceRateLimit(req, 'productWrite', RATE_LIMITS.productWrite, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const agreement = await markFeeInvoiced(user, id)
    return NextResponse.json({ agreement })
  } catch (err) {
    return financingError(err, 'mark the fee invoiced')
  }
}
