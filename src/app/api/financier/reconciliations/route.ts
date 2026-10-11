import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { requireFinancierContext, FinancingError } from '@/server/modules/financing/shared'
import { listReconciliations, reconcileDay } from '@/server/modules/financing/installments'

// GET /api/financier/reconciliations?status=OPEN|RESOLVED — the org's
// rail-vs-ledger discrepancy queue.
export async function GET(req: NextRequest) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const ctx = await requireFinancierContext(user.id)
    const status = req.nextUrl.searchParams.get('status') ?? undefined
    const reconciliations = await listReconciliations(ctx.organizationId, {
      ...(status ? { status } : {}),
    })
    return NextResponse.json({ reconciliations })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier reconciliations GET error', err)
    return NextResponse.json({ error: 'Failed to load the reconciliations' }, { status: 500 })
  }
}

const runSchema = z.object({
  agreementId: z.string().min(1),
  batchDate: z.string(),
  railExpected: z.number().min(0).max(1_000_000_000),
})

// POST /api/financier/reconciliations — run the daily batch for one
// agreement: ledger (effective payments of the UTC day) vs rail expected.
export async function POST(req: NextRequest) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financier:recon', { limit: 60, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl
  try {
    await requireFinancierContext(user.id)
    const parsed = runSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid batch payload', details: parsed.error.flatten() }, { status: 400 })
    }
    const reconciliation = await reconcileDay(user.id, parsed.data)
    return NextResponse.json({ reconciliation }, { status: 201 })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier reconciliation POST error', err)
    return NextResponse.json({ error: 'Failed to run the reconciliation batch' }, { status: 500 })
  }
}
