import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { resolveDispute, DisputeServiceError } from '@/server/modules/rfq/disputes'

// POST /api/admin/disputes/[id]/resolve — admin records the mediation outcome
// (outcome must be one of the platform's allowed dispute outcomes).

const resolveSchema = z.object({
  outcome: z.string().min(1).max(24),
  note: z.string().trim().max(2000).optional().nullable(),
  amount: z.number().min(0).max(10_000_000).optional().nullable(),
})

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin('disputes.resolve')
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'disputes:resolve', { limit: 60, windowMs: 60_000 })
  if (rl) return rl

  try {
    const parsed = resolveSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Pick an outcome for this dispute' }, { status: 400 })
    }
    const { id } = await ctx.params
    const dispute = await resolveDispute(id, { id: user!.id, role: user!.role }, parsed.data)
    return NextResponse.json({ dispute })
  } catch (err) {
    if (err instanceof DisputeServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('dispute resolve error', err)
    return NextResponse.json({ error: 'Failed to resolve dispute' }, { status: 500 })
  }
}
