import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { requireFinancierContext, FinancingError } from '@/server/modules/financing/shared'
import { computeRiskAssessment, getRiskAssessment } from '@/server/modules/financing/risk'

// GET /api/financier/risk-assessments?requestId=... — the latest stored
// assessment for a financier-visible request (404 when none computed yet).
export async function GET(req: NextRequest) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    await requireFinancierContext(user.id)
    const requestId = req.nextUrl.searchParams.get('requestId')
    if (!requestId) return NextResponse.json({ error: 'requestId is required' }, { status: 400 })
    const assessment = await getRiskAssessment(user.id, requestId)
    return NextResponse.json({ assessment })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier risk-assessment GET error', err)
    return NextResponse.json({ error: 'Failed to load the risk assessment' }, { status: 500 })
  }
}

const postSchema = z.object({ requestId: z.string().min(1) })

// POST /api/financier/risk-assessments {requestId} — (re)compute the
// six-factor score for a forwarded request. Decision-support by default:
// AUTO_* verdicts only when the financier enabled auto-decision in the config.
export async function POST(req: NextRequest) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financier:risk-assess', { limit: 60, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl

  try {
    await requireFinancierContext(user.id)
    const parsed = postSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'requestId is required' }, { status: 400 })
    }
    const assessment = await computeRiskAssessment(user.id, parsed.data.requestId)
    return NextResponse.json({ assessment })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier risk-assessment POST error', err)
    return NextResponse.json({ error: 'Failed to compute the risk assessment' }, { status: 500 })
  }
}
