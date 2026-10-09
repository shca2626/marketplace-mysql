import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { createSupplierRfq } from '@/server/modules/rfq/supplier-financing'
import { RfqServiceError } from '@/server/modules/rfq/service'
import { assertSameOrigin } from '@/lib/http'

const lineSchema = z.object({
  productId: z.string().optional().nullable(),
  productName: z.string().optional().nullable(),
  variantId: z.string().optional().nullable(),
  quantity: z.number().int().min(1).max(1_000_000),
  targetPrice: z.number().min(0).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
})

const createSchema = z.object({
  title: z.string().trim().max(200).optional().nullable(),
  description: z.string().trim().max(8000).optional().nullable(),
  lines: z.array(lineSchema).min(1).max(50),
  expiresInDays: z.number().int().min(1).max(90).optional().nullable(),
  organizationId: z.string().max(191).optional().nullable(),
})

// POST /api/financing/requests/[id]/supplier-rfq — applicant creates the
// explicitly-linked supplier RFQ (routed only to the financier's accredited
// suppliers; consent captured for this version).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id } = await ctx.params
    const parsed = createSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    const result = await createSupplierRfq(user!.id, { financingRequestId: id, ...parsed.data })
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    if (err instanceof RfqServiceError) {
      return NextResponse.json({ error: err.message, code: 'DENIED' }, { status: err.status })
    }
    console.error('supplier-rfq POST error', err)
    return NextResponse.json({ error: 'Failed to create supplier RFQ' }, { status: 500 })
  }
}
