import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin } from '@/lib/http'
import { FeeServiceError, FEE_EVENTS, listAssessments, simulateFee } from '@/server/modules/fees/service'

// POST /api/admin/fees/simulate — "what WOULD be charged": resolve the rule
// chain (ORG → ORG_TYPE → PLATFORM) for an event + actor context + base
// amount, WITHOUT writing anything. Also returns recentMatches — the last 5
// applied FeeAssessment rows for the same event+org — so the admin can
// eyeball simulator-vs-ledger parity (the acceptance gate: the simulator
// must match fees actually applied).
export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { error } = await requireAdmin('payouts.view')
  if (error) return error
  try {
    const body = (await req.json()) as Record<string, unknown>
    const event = String(body.event ?? '')
    if (!(FEE_EVENTS as readonly string[]).includes(event)) {
      throw new FeeServiceError(`event must be one of: ${FEE_EVENTS.join(', ')}`, 400, 'BAD_EVENT')
    }
    const baseAmount = Number(body.baseAmount)
    if (!Number.isFinite(baseAmount) || baseAmount <= 0) {
      throw new FeeServiceError('baseAmount must be a positive number', 400, 'BAD_BASE_AMOUNT')
    }
    const orgId = body.orgId == null || body.orgId === '' ? null : String(body.orgId)
    const orgType = body.orgType == null || body.orgType === '' ? null : String(body.orgType)
    const currency = body.currency == null || body.currency === '' ? 'USD' : String(body.currency).toUpperCase()

    const simulation = await simulateFee(event as (typeof FEE_EVENTS)[number], { orgId, orgType }, baseAmount, currency)

    // What was ACTUALLY charged for this event + org (if an org was given) —
    // the parity evidence next to the simulated number.
    const recentMatches = orgId
      ? await listAssessments({ event, actorOrgId: orgId, limit: 5 })
      : []

    return NextResponse.json({ simulation, recentMatches })
  } catch (err) {
    if (err instanceof FeeServiceError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    }
    console.error('fee simulate error', err)
    return NextResponse.json({ error: 'Failed to simulate fee' }, { status: 500 })
  }
}
