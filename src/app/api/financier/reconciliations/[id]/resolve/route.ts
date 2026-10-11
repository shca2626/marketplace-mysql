import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { requireFinancierContext, FinancingError } from '@/server/modules/financing/shared'
import { resolveDiscrepancy } from '@/server/modules/financing/installments'

// POST /api/financier/reconciliations/[id]/resolve — resolve an OPEN
// discrepancy with an evidence note.
const schema = z.object({
  resolutionNote: z.string().trim().min(3).max(500),
})

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financier:recon', { limit: 60, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl
  try {
    await requireFinancierContext(user.id)
    const { id } = await ctx.params
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'A resolution note is required', details: parsed.error.flatten() }, { status: 400 })
    }
    const reconciliation = await resolveDiscrepancy(user.id, id, parsed.data)
    return NextResponse.json({ reconciliation })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier reconciliation resolve error', err)
    return NextResponse.json({ error: 'Failed to resolve the discrepancy' }, { status: 500 })
  }
}
