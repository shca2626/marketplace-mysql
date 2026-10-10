import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { resolveAuthzContext } from '@/server/authz/context'
import { createQuote, RfqServiceError } from '@/server/modules/rfq/service'
import { assertSameOrigin } from '@/lib/http'

const quoteSchema = z.object({
  lines: z
    .array(
      z.object({
        rfqLineId: z.string().optional().nullable(),
        productId: z.string().min(1),
        quantity: z.number().int().min(1).max(1_000_000),
        unitPrice: z.number().min(0).max(10_000_000),
      })
    )
    .min(1, 'A quote needs at least one line')
    .max(50),
  validUntil: z.string().datetime().optional().nullable(),
  paymentTerms: z.string().trim().max(24).optional().nullable(),
  notes: z.string().trim().max(5000).optional().nullable(),
  discountTotal: z.number().min(0).max(10_000_000).optional(),
  shippingTotal: z.number().min(0).max(1_000_000).optional(),
  taxTotal: z.number().min(0).max(1_000_000).optional(),
})

// POST /api/rfqs/[id]/quotes — issue a quote against an RFQ.
// ADMIN can quote anything (platform-facilitated); COMPANY members quote from
// their active organization context (validated server-side — the cookie is a
// selector, membership is re-checked on every request). Individuals and
// financier institutions cannot quote.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireUser()
  if (error) return error
  try {
    const authz = await resolveAuthzContext()
    if (authz.error) {
      return NextResponse.json({ error: authz.error.message, code: authz.error.reason }, { status: authz.error.status })
    }
    // Only the trusted active-org context counts — a body-supplied
    // organizationId is never an authorization proof.
    const actorOrg = authz.activeOrg ? { id: authz.activeOrg.id, orgType: authz.activeOrg.orgType } : null

    const { id } = await ctx.params
    const body = await req.json()
    const parsed = quoteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    const quote = await createQuote(id, user!, parsed.data, actorOrg)
    return NextResponse.json({ quote }, { status: 201 })
  } catch (err) {
    if (err instanceof RfqServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('quotes POST error', err)
    return NextResponse.json({ error: 'Failed to create quote' }, { status: 500 })
  }
}
