import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { requireFinancierContext, FinancingError } from '@/server/modules/financing/shared'
import { listPayments, recordPayment } from '@/server/modules/financing/installments'

// GET /api/financier/payments?agreementId=... — the recorded installment
// payments for one agreement (allocation summary + reversal links).
export async function GET(req: NextRequest) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const ctx = await requireFinancierContext(user.id)
    const agreementId = req.nextUrl.searchParams.get('agreementId') ?? undefined
    if (!agreementId) {
      return NextResponse.json({ error: 'agreementId is required' }, { status: 400 })
    }
    const payments = await listPayments(user.id, { agreementId, financierOrgId: ctx.organizationId })
    return NextResponse.json({ payments })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier payments GET error', err)
    return NextResponse.json({ error: 'Failed to load the payments' }, { status: 500 })
  }
}

const recordSchema = z.object({
  agreementId: z.string().min(1),
  receivedAt: z.string(),
  channel: z.enum(['BANK_TRANSFER', 'CASH', 'AGENT', 'RAIL_EXPORT', 'OTHER']),
  reference: z.string().trim().max(120).nullable().optional(),
  amount: z.number().positive().max(1_000_000_000),
  currency: z.string().length(3).optional(),
  fxRateToAgreement: z.number().positive().nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
})

// POST /api/financier/payments — record a received installment payment
// (status RECEIVED; currency defaults to the offer currency; a differing
// currency REQUIRES fxRateToAgreement).
export async function POST(req: NextRequest) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financier:payment', { limit: 80, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl
  try {
    await requireFinancierContext(user.id)
    const parsed = recordSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payment payload', details: parsed.error.flatten() }, { status: 400 })
    }
    const { agreementId, ...input } = parsed.data
    const payment = await recordPayment(user.id, agreementId, input)
    return NextResponse.json({ payment }, { status: 201 })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier payment POST error', err)
    return NextResponse.json({ error: 'Failed to record the payment' }, { status: 500 })
  }
}
