import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { financingError } from '@/lib/financing-api'
import { openGate } from '@/server/modules/financing/requests'

// POST /api/admin/financing/requests/[id]/open-gate — SUBMITTED →
// UNDER_PLATFORM_REVIEW (a platform reviewer takes the request).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin('financing.gate.review')
  if (error) return error

  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const rl = enforceRateLimit(req, 'productWrite', RATE_LIMITS.productWrite, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const request = await openGate(user, id)
    return NextResponse.json({ request })
  } catch (err) {
    return financingError(err, 'open the gate review')
  }
}
