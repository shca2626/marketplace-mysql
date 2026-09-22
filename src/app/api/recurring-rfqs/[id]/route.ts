import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { pauseSchedule, resumeSchedule, deleteSchedule, RecurringServiceError } from '@/server/modules/rfq/recurring'

// PATCH /api/recurring-rfqs/[id] — pause / resume a schedule
// DELETE /api/recurring-rfqs/[id] — remove it permanently

const patchSchema = z.object({ action: z.enum(['pause', 'resume']) })

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'recurring:patch', { limit: 30, windowMs: 60_000 })
  if (rl) return rl

  try {
    const parsed = patchSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Choose pause or resume' }, { status: 400 })
    }
    const { id } = await ctx.params
    const actor = { id: user!.id, role: user!.role }
    const schedule =
      parsed.data.action === 'pause' ? await pauseSchedule(id, actor) : await resumeSchedule(id, actor)
    return NextResponse.json({ schedule })
  } catch (err) {
    if (err instanceof RecurringServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('recurring PATCH error', err)
    return NextResponse.json({ error: 'Failed to update schedule' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'recurring:delete', { limit: 30, windowMs: 60_000 })
  if (rl) return rl

  try {
    const { id } = await ctx.params
    await deleteSchedule(id, { id: user!.id, role: user!.role })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof RecurringServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('recurring DELETE error', err)
    return NextResponse.json({ error: 'Failed to delete schedule' }, { status: 500 })
  }
}
