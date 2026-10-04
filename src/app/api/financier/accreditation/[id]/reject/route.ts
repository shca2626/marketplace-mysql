import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { financingError, readJson } from '@/lib/financing-api'
import { reject } from '@/server/modules/financing/accreditation'

// POST /api/financier/accreditation/[id]/reject — refuse the accreditation
// (body: { note } — a rejection note is required).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error

  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const rl = enforceRateLimit(req, 'productWrite', RATE_LIMITS.productWrite, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const request = await reject(user, id, await readJson(req))
    return NextResponse.json({ request })
  } catch (err) {
    return financingError(err, 'reject the accreditation')
  }
}
