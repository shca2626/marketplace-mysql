import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin } from '@/lib/http'
import { retireFeeRule, updateFeeRule } from '@/server/modules/fees/admin'
import { FeeServiceError, type FeeRuleDTO } from '@/server/modules/fees/service'

// PUT /api/admin/fees/rules/[id] — edit a rule (VERSION BUMP: edit-in-place
// with version+1 against the scope key; existing assessments keep their
// ruleVersion + ruleSnapshot — history is never rewritten). Absent fields
// keep their current value; an explicit null clears nullable fields.
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireAdmin('payouts.manage')
  if (error) return error
  try {
    const { id } = await ctx.params
    const body = (await req.json()) as Record<string, unknown>
    const input: Parameters<typeof updateFeeRule>[1] = {}
    if (body.event !== undefined) input.event = String(body.event)
    if (body.actorType !== undefined) input.actorType = String(body.actorType)
    if (body.scopeType !== undefined) input.scopeType = String(body.scopeType)
    if (body.scopeId !== undefined) input.scopeId = body.scopeId == null ? '' : String(body.scopeId)
    if (body.dimension !== undefined) input.dimension = String(body.dimension)
    if (body.value !== undefined) input.value = Number(body.value)
    if (body.currency !== undefined) input.currency = body.currency == null ? null : String(body.currency)
    if (body.precedence !== undefined) input.precedence = Number(body.precedence)
    if (body.effectiveFrom !== undefined) input.effectiveFrom = body.effectiveFrom == null ? null : String(body.effectiveFrom)
    if (body.effectiveTo !== undefined) input.effectiveTo = body.effectiveTo == null ? null : String(body.effectiveTo)
    if (body.note !== undefined) input.note = body.note == null ? null : String(body.note)
    if (body.isActive !== undefined) input.isActive = Boolean(body.isActive)

    const rule: FeeRuleDTO = await updateFeeRule(id, input, user!.id)
    return NextResponse.json({ rule })
  } catch (err) {
    if (err instanceof FeeServiceError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    }
    console.error('fee rule update error', err)
    return NextResponse.json({ error: 'Failed to update fee rule' }, { status: 500 })
  }
}

// DELETE /api/admin/fees/rules/[id] — RETIRE (isActive=false), never a hard
// delete: FeeAssessment.ruleId must stay resolvable and assessments keep
// their snapshots. A retired rule can be reactivated via PUT {isActive:true}.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireAdmin('payouts.manage')
  if (error) return error
  try {
    const { id } = await ctx.params
    const rule = await retireFeeRule(id, user!.id)
    return NextResponse.json({ rule })
  } catch (err) {
    if (err instanceof FeeServiceError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    }
    console.error('fee rule retire error', err)
    return NextResponse.json({ error: 'Failed to retire fee rule' }, { status: 500 })
  }
}
