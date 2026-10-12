import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { financingError, readJson } from '@/lib/financing-api'
import { returnRequest } from '@/server/modules/financing/accreditation'

// POST /api/admin/financing/accreditation/[id]/return — return the
// accreditation request to the applicant (body: { reason }).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin('financing.gate.review')
  if (error) return error

  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const rl = enforceRateLimit(req, 'productWrite', RATE_LIMITS.productWrite, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const request = await returnRequest(user, id, await readJson(req))
    return NextResponse.json({ request })
  } catch (err) {
    return financingError(err, 'return the accreditation request')
  }
}
