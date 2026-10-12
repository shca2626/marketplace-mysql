import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { requireFinancierContext, FinancingError } from '@/server/modules/financing/shared'
import { listDisbursements, queueDisbursement } from '@/server/modules/financing/disbursements'

// GET /api/financier/disbursements — the org's disbursement queue with
// agreement context (§10.5).
export async function GET() {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const ctx = await requireFinancierContext(user.id, 'financier.agreements.manage')
    const disbursements = await listDisbursements(ctx.organizationId)
    return NextResponse.json({ disbursements })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier disbursements GET error', err)
    return NextResponse.json({ error: 'Failed to load the disbursements' }, { status: 500 })
  }
}

const queueSchema = z.object({
  agreementId: z.string().min(1),
  amount: z.number().positive().max(1_000_000_000).optional(),
  currency: z.string().length(3).optional(),
  note: z.string().trim().max(500).nullable().optional(),
})

// POST /api/financier/disbursements — queue a disbursement for an ACTIVE /
// PENDING agreement (defaults: offer amount + offer currency).
export async function POST(req: NextRequest) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financier:disbursement', { limit: 40, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl
  try {
    await requireFinancierContext(user.id, 'financier.agreements.manage')
    const parsed = queueSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid disbursement payload', details: parsed.error.flatten() }, { status: 400 })
    }
    const disbursement = await queueDisbursement(user.id, parsed.data.agreementId, parsed.data)
    return NextResponse.json({ disbursement }, { status: 201 })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier disbursement POST error', err)
    return NextResponse.json({ error: 'Failed to queue the disbursement' }, { status: 500 })
  }
}
