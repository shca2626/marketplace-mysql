import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { requireFinancierContext, FinancingError } from '@/server/modules/financing/shared'
import { cancelDisbursement } from '@/server/modules/financing/disbursements'

// POST /api/financier/disbursements/[id]/cancel — cancel a QUEUED
// disbursement (with a reason note).
const schema = z.object({
  note: z.string().trim().max(500).nullable().optional(),
})

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financier:disbursement', { limit: 40, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl
  try {
    await requireFinancierContext(user.id, 'financier.agreements.manage')
    const { id } = await ctx.params
    const parsed = schema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid cancel payload', details: parsed.error.flatten() }, { status: 400 })
    }
    const disbursement = await cancelDisbursement(user.id, id, parsed.data.note)
    return NextResponse.json({ disbursement })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier disbursement cancel error', err)
    return NextResponse.json({ error: 'Failed to cancel the disbursement' }, { status: 500 })
  }
}
