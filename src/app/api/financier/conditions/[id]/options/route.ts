import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { addConditionOption, removeConditionOption } from '@/server/modules/financing/conditions'
import { FinancingError } from '@/server/modules/financing/shared'

// POST /api/financier/conditions/[id]/options — add a SELECT/MULTI_SELECT
// option (rows, never JSON — R-1).
const schema = z.object({ value: z.string().trim().min(1).max(120) })

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financier:conditions', { limit: 60, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'An option value is required' }, { status: 400 })
    }
    const template = await addConditionOption({ id: user.id, role: user.role }, id, parsed.data.value)
    return NextResponse.json({ template }, { status: 201 })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('condition option POST error', err)
    return NextResponse.json({ error: 'Failed to add the option' }, { status: 500 })
  }
}

// DELETE /api/financier/conditions/[id]/options?optionId=... — remove one
// option row (answers already submitted keep their valueText — history).
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financier:conditions', { limit: 60, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const optionId = req.nextUrl.searchParams.get('optionId')
    if (!optionId) return NextResponse.json({ error: 'optionId is required' }, { status: 400 })
    const template = await removeConditionOption({ id: user.id, role: user.role }, id, optionId)
    return NextResponse.json({ template })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('condition option DELETE error', err)
    return NextResponse.json({ error: 'Failed to remove the option' }, { status: 500 })
  }
}
