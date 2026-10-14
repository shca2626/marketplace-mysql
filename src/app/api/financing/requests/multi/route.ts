import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { financingError, readJson } from '@/lib/financing-api'
import { createMultiFinancingRequests, type CreateFinancingRequestInput } from '@/server/modules/financing/requests'

// POST /api/financing/requests/multi — DP-25: create N sibling DRAFT requests
// sharing a multiGroupId (one service per financier), for side-by-side compare.
export async function POST(req: NextRequest) {
  const { user, error } = await requireUser()
  if (error) return error

  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const rl = enforceRateLimit(req, 'order', RATE_LIMITS.order, user.id)
  if (rl) return rl

  try {
    const body = (await readJson(req)) as Omit<CreateFinancingRequestInput, 'serviceId'> & { serviceIds: string[] }
    const result = await createMultiFinancingRequests(user.id, body)
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    return financingError(err, 'create the multi-financier drafts')
  }
}
