import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import {
  updateServiceRequirement,
  detachServiceRequirement,
} from '@/server/modules/financing/conditions'
import { FinancingError } from '@/server/modules/financing/shared'

const patchSchema = z.object({
  isRequired: z.boolean().optional(),
  displayOrder: z.number().int().min(0).max(999).optional(),
  phase: z.string().trim().max(60).nullable().optional().transform((v) => (v === undefined ? undefined : v && v.trim() ? v.trim() : null)),
  instructions: z.string().trim().max(1000).nullable().optional(),
  autoPassAccredited: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

// PATCH /api/financier/requirements/[id] — update the per-service attachment
// config (ordering/required/instructions/auto-pass).
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financier:requirements', { limit: 60, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const parsed = patchSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid requirement patch', details: parsed.error.flatten() }, { status: 400 })
    }
    const requirement = await updateServiceRequirement(user.id, id, parsed.data)
    return NextResponse.json({ requirement })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier requirement PATCH error', err)
    return NextResponse.json({ error: 'Failed to update the requirement' }, { status: 500 })
  }
}

// DELETE /api/financier/requirements/[id] — detach = SOFT (isActive=false):
// submissions are preserved (hard delete would cascade the checklist history).
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financier:requirements', { limit: 60, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const result = await detachServiceRequirement(user.id, id)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier requirement DELETE error', err)
    return NextResponse.json({ error: 'Failed to detach the requirement' }, { status: 500 })
  }
}
