import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import {
  createOffer,
  serializeOffersForFinancier,
} from '@/server/modules/financing/offers'
import { FinancingError } from '@/server/modules/financing/shared'

// GET /api/financier/offers?requestId=... — all offers on a forwarded request
// (including DRAFTs — financier view).
export async function GET(req: NextRequest) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const requestId = req.nextUrl.searchParams.get('requestId')
    if (!requestId) return NextResponse.json({ error: 'requestId is required' }, { status: 400 })
    // the serializer's guard chain: financier staff of the request's org
    const { financierGetRequest } = await import('@/server/modules/financing/requests')
    await financierGetRequest(user.id, requestId)
    const offers = await serializeOffersForFinancier(requestId)
    return NextResponse.json({ offers })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier offers GET error', err)
    return NextResponse.json({ error: 'Failed to load the offers' }, { status: 500 })
  }
}

const installmentSchema = z.object({
  installmentNo: z.number().int().min(1).max(600),
  dueDate: z.string(),
  amount: z.number().positive().max(1_000_000_000),
})

const createSchema = z.object({
  requestId: z.string(),
  amount: z.number().positive().max(1_000_000_000),
  tenorMonths: z.number().int().min(1).max(120),
  rateType: z.enum(['MURABAHA_ANNUAL', 'FIXED_ANNUAL', 'FLAT_FEE']).nullable().optional(),
  ratePercent: z.number().min(0).max(100).nullable().optional(),
  feeFlat: z.number().min(0).nullable().optional(),
  collateralRequired: z.string().max(24).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  validUntil: z.string().nullable().optional(),
  installments: z.array(installmentSchema).max(120).optional(),
  send: z.boolean().optional(),
})

// POST /api/financier/offers — create an offer (+installments) and optionally
// send it in one call (DRAFT → SENT; request → OFFERED).
export async function POST(req: NextRequest) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financier:offer', { limit: 40, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl

  try {
    const parsed = createSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid offer payload', details: parsed.error.flatten() }, { status: 400 })
    }
    const offer = await createOffer(user.id, parsed.data)
    return NextResponse.json({ offer }, { status: 201 })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier offer POST error', err)
    return NextResponse.json({ error: 'Failed to create the offer' }, { status: 500 })
  }
}
