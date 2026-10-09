import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveAuthzContext } from '@/server/authz/context'
import { listOrgOffers, createOffer, CatalogServiceError } from '@/server/modules/catalog/service'
import { assertSameOrigin } from '@/lib/http'

export const dynamic = 'force-dynamic'

const createSchema = z.object({
  organizationId: z.string().min(1),
  productId: z.string().min(1),
  storeId: z.string().max(191).optional().nullable(),
  price: z.number().positive().max(10_000_000),
  compareAtPrice: z.number().positive().max(10_000_000).optional().nullable(),
  stock: z.number().int().min(0).max(1_000_000).optional(),
  moq: z.number().int().min(1).max(100_000).optional().nullable(),
  sku: z.string().trim().max(80).optional().nullable(),
  freeShipping: z.boolean().optional(),
  shippingFee: z.number().min(0).max(100_000).optional().nullable(),
  processingDays: z.number().int().min(0).max(365).optional().nullable(),
  leadTimeNote: z.string().trim().max(300).optional().nullable(),
  status: z.enum(['DRAFT', 'ACTIVE']).optional(),
  variants: z
    .array(
      z.object({
        variantId: z.string().min(1),
        price: z.number().positive().max(10_000_000).optional().nullable(),
        stock: z.number().int().min(0).max(1_000_000).optional(),
        sku: z.string().trim().max(80).optional().nullable(),
      })
    )
    .max(60)
    .optional(),
})

// GET /api/offers?organizationId=…[&status=]
export async function GET(req: NextRequest) {
  const ctx = await resolveAuthzContext()
  if (ctx.error) {
    return NextResponse.json({ error: ctx.error.message, code: ctx.error.reason }, { status: ctx.error.status })
  }
  const organizationId = req.nextUrl.searchParams.get('organizationId') || ''
  const status = req.nextUrl.searchParams.get('status') || ''
  if (!organizationId || !ctx.orgs.some((o) => o.id === organizationId)) {
    return NextResponse.json({ error: 'You are not a member of that organization', code: 'NO_MEMBERSHIP' }, { status: 403 })
  }
  try {
    const offers = await listOrgOffers(ctx.user.id, organizationId, status ? { status } : {})
    return NextResponse.json({ offers })
  } catch (err) {
    if (err instanceof CatalogServiceError) {
      return NextResponse.json({ error: err.message, code: 'DENIED' }, { status: err.status })
    }
    console.error('offers GET error', err)
    return NextResponse.json({ error: 'Failed to load offers' }, { status: 500 })
  }
}

// POST /api/offers — create a company offer on a shared-catalog product
export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const ctx = await resolveAuthzContext()
  if (ctx.error) {
    return NextResponse.json({ error: ctx.error.message, code: ctx.error.reason }, { status: ctx.error.status })
  }
  try {
    const parsed = createSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    const offer = await createOffer(ctx.user.id, parsed.data.organizationId, parsed.data)
    return NextResponse.json({ offer }, { status: 201 })
  } catch (err) {
    if (err instanceof CatalogServiceError) {
      return NextResponse.json({ error: err.message, code: 'DENIED' }, { status: err.status })
    }
    console.error('offers POST error', err)
    return NextResponse.json({ error: 'Failed to create offer' }, { status: 500 })
  }
}
