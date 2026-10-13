import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { financingError, readJson } from '@/lib/financing-api'
import { createAccreditationRequest, listMyAccreditationRequests } from '@/server/modules/financing/accreditation'
import { ACCREDITATION_REQUEST_STATUSES } from '@/server/modules/financing/types'

// /api/financing/accreditation — the organization's accreditation requests
// (DP-26: accreditation is a MAIN service; companies only).
// GET  → my organizations' accreditation requests.
// POST → create a DRAFT accreditation request for an ACCREDITATION-kind service.

export async function GET(req: NextRequest) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const sp = req.nextUrl.searchParams
    const status = sp.get('status') ?? undefined
    if (status && !(ACCREDITATION_REQUEST_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json({ error: 'Unknown accreditation status filter' }, { status: 400 })
    }
    const result = await listMyAccreditationRequests(user.id)
    const filtered = status
      ? result.requests.filter((r) => r.status === status)
      : result.requests
    return NextResponse.json({ requests: filtered, live: result.live })
  } catch (err) {
    return financingError(err, 'load your accreditation requests')
  }
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser()
  if (error) return error

  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const rl = enforceRateLimit(req, 'order', RATE_LIMITS.order, user.id)
  if (rl) return rl

  try {
    const body = await readJson<{ serviceId?: string; organizationId?: string; scopeNotes?: string | null }>(req)
    if (!body?.serviceId || !body?.organizationId) {
      return NextResponse.json({ error: 'serviceId and organizationId are required' }, { status: 400 })
    }
    const request = await createAccreditationRequest(user.id, {
      serviceId: body.serviceId,
      organizationId: body.organizationId,
      scopeNotes: body.scopeNotes ?? null,
    })
    return NextResponse.json({ request }, { status: 201 })
  } catch (err) {
    return financingError(err, 'create the accreditation draft')
  }
}
