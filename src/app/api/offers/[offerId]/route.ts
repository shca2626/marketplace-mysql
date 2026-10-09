import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveAuthzContext } from '@/server/authz/context'
import { updateOffer, CatalogServiceError } from '@/server/modules/catalog/service'
import { assertSameOrigin } from '@/lib/http'

const updateSchema = z.object({
  organizationId: z.string().min(1),
  price: z.number().positive().max(10_000_000).optional(),
  compareAtPrice: z.number().positive().max(10_000_000).optional().nullable(),
  stock: z.number().int().min(0).max(1_000_000).optional(),
  moq: z.number().int().min(1).max(100_000).optional().nullable(),
  sku: z.string().trim().max(80).optional().nullable(),
  freeShipping: z.boolean().optional(),
  shippingFee: z.number().min(0).max(100_000).optional().nullable(),
  processingDays: z.number().int().min(0).max(365).optional().nullable(),
  leadTimeNote: z.string().trim().max(300).optional().nullable(),
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED']).optional(),
  storeId: z.string().max(191).optional().nullable(),
})

export async function PATCH(req: NextRequest, ctxParams: { params: Promise<{ offerId: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const ctx = await resolveAuthzContext()
  if (ctx.error) {
    return NextResponse.json({ error: ctx.error.message, code: ctx.error.reason }, { status: ctx.error.status })
  }
  try {
    const { offerId } = await ctxParams.params
    const parsed = updateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    const { organizationId, ...fields } = parsed.data
    const offer = await updateOffer(ctx.user.id, organizationId, offerId, fields)
    return NextResponse.json({ offer })
  } catch (err) {
    if (err instanceof CatalogServiceError) {
      return NextResponse.json({ error: err.message, code: 'DENIED' }, { status: err.status })
    }
    console.error('offer PATCH error', err)
    return NextResponse.json({ error: 'Failed to update offer' }, { status: 500 })
  }
}
