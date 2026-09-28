import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import {
  createAccreditationRequest,
  listMyAccreditationRequests,
  submitAccreditationRequest,
} from '@/server/modules/financing/accreditation'
import { FinancingError } from '@/server/modules/financing/shared'

// POST /api/accreditation/requests — company applies to an ACCREDITATION-kind
// service (companies only — DP-26). Optional submit:true submits immediately.
const createSchema = z.object({
  serviceId: z.string(),
  organizationId: z.string(),
  scopeNotes: z.string().max(500).nullable().optional(),
  submit: z.boolean().optional(),
  consent: z.boolean().optional(),
})

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'accreditation:create', { limit: 20, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl

  try {
    const parsed = createSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid accreditation payload', details: parsed.error.flatten() }, { status: 400 })
    }
    const { submit: doSubmit, consent, ...input } = parsed.data
    const created = await createAccreditationRequest(user.id, input)
    if (doSubmit) {
      const submitted = await submitAccreditationRequest(user.id, created.id, { consent })
      return NextResponse.json({ request: created, submitted }, { status: 201 })
    }
    return NextResponse.json({ request: created }, { status: 201 })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('accreditation create error', err)
    return NextResponse.json({ error: 'Failed to create the accreditation request' }, { status: 500 })
  }
}

// GET /api/accreditation/requests — my org's accreditation requests + the
// live subset (RFQ participation unlock, §9.10).
export async function GET() {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const result = await listMyAccreditationRequests(user.id)
    return NextResponse.json(result)
  } catch (err) {
    console.error('accreditation list error', err)
    return NextResponse.json({ error: 'Failed to load your accreditations' }, { status: 500 })
  }
}
