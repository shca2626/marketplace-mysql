import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { financingError } from '@/lib/financing-api'
import { cancel } from '@/server/modules/financing/accreditation'

// POST /api/financing/accreditation/[id]/cancel — applicant withdraws.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error

  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const rl = enforceRateLimit(req, 'order', RATE_LIMITS.order, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const request = await cancel(user, id)
    return NextResponse.json({ request })
  } catch (err) {
    return financingError(err, 'cancel the accreditation request')
  }
}
