import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { createRfq, listMyRfqs, RfqServiceError } from '@/server/modules/rfq/service'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'

const lineSchema = z
  .object({
    productId: z.string().optional().nullable(),
    productName: z.string().trim().max(200).optional().nullable(),
    sku: z.string().trim().max(80).optional().nullable(),
    variantId: z.string().optional().nullable(),
    quantity: z.number().int().min(1, 'Quantity must be at least 1').max(1_000_000),
    targetPrice: z.number().min(0).max(1_000_000).optional().nullable(),
    notes: z.string().trim().max(2000).optional().nullable(),
  })
  .refine((l) => l.productId || l.productName?.trim(), {
    message: 'Each line needs a product or a description',
  })

const createRfqSchema = z.object({
  title: z.string().trim().max(160).optional().nullable(),
  description: z.string().trim().max(5000).optional().nullable(),
  organizationId: z.string().optional().nullable(),
  expiresInDays: z.number().int().min(1).max(365).optional().nullable(),
  lines: z.array(lineSchema).min(1, 'Add at least one item').max(50),
})

// GET /api/rfqs — my requests for quote (optionally filtered by active org)
export async function GET(req: NextRequest) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { searchParams } = new URL(req.url)
    const organizationId = searchParams.get('organizationId')
    const rfqs = await listMyRfqs(user!.id, organizationId)
    return NextResponse.json({ rfqs })
  } catch (err) {
    console.error('rfqs GET error', err)
    return NextResponse.json({ error: 'Failed to load RFQs' }, { status: 500 })
  }
}

// POST /api/rfqs — create a new RFQ draft
export async function POST(req: NextRequest) {
  // CSRF + creation throttle (RFQs can fan out notifications to vendors)
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireUser()
  if (error) return error

  const rl = enforceRateLimit(req, 'rfq:create', { limit: 20, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl

  try {
    const body = await req.json()
    const parsed = createRfqSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    const rfq = await createRfq(user!.id, parsed.data)
    return NextResponse.json({ rfq }, { status: 201 })
  } catch (err) {
    if (err instanceof RfqServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('rfqs POST error', err)
    return NextResponse.json({ error: 'Failed to create RFQ' }, { status: 500 })
  }
}
