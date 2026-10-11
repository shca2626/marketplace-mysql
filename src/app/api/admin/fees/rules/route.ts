import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin } from '@/lib/http'
import { createFeeRule, listFeeRules } from '@/server/modules/fees/admin'
import { FeeServiceError } from '@/server/modules/fees/service'

// GET /api/admin/fees/rules — every fee rule for an event (inactive included —
// retiring is history, not erasure), newest first. ?event= filters.
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin('payouts.view')
  if (error) return error
  try {
    const event = new URL(req.url).searchParams.get('event') ?? undefined
    const rules = await listFeeRules(event ? { event } : undefined)
    return NextResponse.json({ rules })
  } catch (err) {
    if (err instanceof FeeServiceError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('fee rules GET error', err)
    return NextResponse.json({ error: 'Failed to load fee rules' }, { status: 500 })
  }
}

// POST /api/admin/fees/rules — create a rule. Validation mirrors the engine
// spine's vocabulary (FEE_EVENTS / actor types / scope types / dimensions);
// FLAT rules require a known currency, PERCENT is 0..90.
export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireAdmin('payouts.manage')
  if (error) return error
  try {
    const body = (await req.json()) as Record<string, unknown>
    const rule = await createFeeRule(
      {
        event: String(body.event ?? ''),
        actorType: String(body.actorType ?? ''),
        scopeType: String(body.scopeType ?? ''),
        scopeId: body.scopeId == null ? '' : String(body.scopeId),
        dimension: String(body.dimension ?? ''),
        value: Number(body.value),
        currency: body.currency == null ? null : String(body.currency),
        precedence: body.precedence === undefined || body.precedence === null ? 0 : Number(body.precedence),
        effectiveFrom: body.effectiveFrom == null ? null : String(body.effectiveFrom),
        effectiveTo: body.effectiveTo == null ? null : String(body.effectiveTo),
        note: body.note == null ? null : String(body.note),
      },
      user!.id
    )
    return NextResponse.json({ rule }, { status: 201 })
  } catch (err) {
    if (err instanceof FeeServiceError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    }
    console.error('fee rule create error', err)
    return NextResponse.json({ error: 'Failed to create fee rule' }, { status: 500 })
  }
}
