import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { financingError } from '@/lib/financing-api'
import { financierOpen } from '@/server/modules/financing/accreditation'

// POST /api/financier/accreditation/[id]/open — FORWARDED_TO_FINANCIER →
// UNDER_FINANCIER_REVIEW on an accreditation request.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error

  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const rl = enforceRateLimit(req, 'productWrite', RATE_LIMITS.productWrite, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const request = await financierOpen(user, id)
    return NextResponse.json({ request })
  } catch (err) {
    return financingError(err, 'open the accreditation request')
  }
}
