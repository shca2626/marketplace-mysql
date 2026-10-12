import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { financingError } from '@/lib/financing-api'
import { forwardRequest } from '@/server/modules/financing/accreditation'

// POST /api/admin/financing/accreditation/[id]/forward — THE GATE (R-4) for
// accreditation requests: forward only when fully verified (in-tx re-check).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin('financing.gate.review')
  if (error) return error

  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const rl = enforceRateLimit(req, 'productWrite', RATE_LIMITS.productWrite, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const request = await forwardRequest(user, id)
    return NextResponse.json({ request })
  } catch (err) {
    return financingError(err, 'forward the accreditation request')
  }
}
