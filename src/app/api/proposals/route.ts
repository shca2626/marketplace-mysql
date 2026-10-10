import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveAuthzContext } from '@/server/authz/context'
import { proposeProduct, listOrgProposals, CatalogServiceError } from '@/server/modules/catalog/service'
import { assertSameOrigin } from '@/lib/http'

export const dynamic = 'force-dynamic'

const proposalSchema = z.object({
  organizationId: z.string().min(1),
  title: z.string().trim().min(3).max(200),
  description: z.string().min(10).max(8000),
  price: z.number().min(0).max(10_000_000),
  images: z.array(z.string().max(500)).max(12).optional().default([]),
  categoryId: z.string().min(1),
  sku: z.string().trim().max(80).optional().nullable(),
  moq: z.number().int().min(1).max(100_000).optional().nullable(),
  specs: z.array(z.object({ label: z.string().max(60), value: z.string().max(300) })).max(30).optional(),
  highlights: z.array(z.string().max(200)).max(12).optional(),
  initialOffer: z
    .object({
      price: z.number().min(0).max(10_000_000).optional(),
      stock: z.number().int().min(0).max(1_000_000).optional(),
      leadTimeDays: z.number().int().min(0).max(365).optional().nullable(),
    })
    .optional(),
})

// GET /api/proposals?organizationId=…
export async function GET(req: NextRequest) {
  const ctx = await resolveAuthzContext()
  if (ctx.error) {
    return NextResponse.json({ error: ctx.error.message, code: ctx.error.reason }, { status: ctx.error.status })
  }
  const organizationId = req.nextUrl.searchParams.get('organizationId') || ''
  if (!organizationId || !ctx.orgs.some((o) => o.id === organizationId)) {
    return NextResponse.json({ error: 'You are not a member of that organization', code: 'NO_MEMBERSHIP' }, { status: 403 })
  }
  try {
    const proposals = await listOrgProposals(ctx.user.id, organizationId)
    return NextResponse.json({ proposals })
  } catch (err) {
    if (err instanceof CatalogServiceError) {
      return NextResponse.json({ error: err.message, code: 'DENIED' }, { status: err.status })
    }
    console.error('proposals GET error', err)
    return NextResponse.json({ error: 'Failed to load proposals' }, { status: 500 })
  }
}

// POST /api/proposals — submit a new product proposal (private until approved)
export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const ctx = await resolveAuthzContext()
  if (ctx.error) {
    return NextResponse.json({ error: ctx.error.message, code: ctx.error.reason }, { status: ctx.error.status })
  }
  try {
    const parsed = proposalSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    const proposal = await proposeProduct(ctx.user.id, parsed.data.organizationId, parsed.data)
    return NextResponse.json({ proposal }, { status: 201 })
  } catch (err) {
    if (err instanceof CatalogServiceError) {
      return NextResponse.json({ error: err.message, code: 'DENIED' }, { status: err.status })
    }
    console.error('proposals POST error', err)
    return NextResponse.json({ error: 'Failed to submit proposal' }, { status: 500 })
  }
}
