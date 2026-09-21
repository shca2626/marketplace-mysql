import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { convertQuoteToOrder, RfqServiceError } from '@/server/modules/rfq/service'

const convertSchema = z.object({
  poNumber: z.string().trim().max(40).optional().nullable(),
  fullName: z.string().trim().max(120).optional().nullable(),
  address: z.string().trim().max(255).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  country: z.string().trim().max(120).optional().nullable(),
  zip: z.string().trim().max(32).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
})

// POST /api/quotes/[id]/convert — turn an ACCEPTED quote into a real order
// (B2B invoiced order: PROCESSING + payment terms, stock decremented, quote
// CONVERTED, RFQ ORDERED).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id } = await ctx.params
    let input: z.infer<typeof convertSchema> = {}
    try {
      input = convertSchema.parse(await req.json())
    } catch {
      input = {}
    }
    const result = await convertQuoteToOrder(id, user!, input)
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    if (err instanceof RfqServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('quote convert error', err)
    return NextResponse.json({ error: 'Failed to convert quote to order' }, { status: 500 })
  }
}
