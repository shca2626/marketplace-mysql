import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { requireFinancierContext, FinancingError } from '@/server/modules/financing/shared'
import { confirmDisbursement } from '@/server/modules/financing/disbursements'

// POST /api/financier/disbursements/[id]/confirm — confirm the queued
// disbursement. Rail + reference are MANDATORY (zod-enforced). Currency
// mismatch captures the ExchangeRate FX snapshot (400 when no rate pinned).
const schema = z.object({
  rail: z.enum(['BANK', 'CASH', 'WALLET', 'OTHER']),
  reference: z.string().trim().min(1).max(120),
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
    await requireFinancierContext(user.id)
    const { id } = await ctx.params
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Rail and a non-empty reference are required to confirm', details: parsed.error.flatten() }, { status: 400 })
    }
    const disbursement = await confirmDisbursement(user.id, id, parsed.data)
    return NextResponse.json({ disbursement })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier disbursement confirm error', err)
    return NextResponse.json({ error: 'Failed to confirm the disbursement' }, { status: 500 })
  }
}
