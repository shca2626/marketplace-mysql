import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireUser } from '@/server/guards'
import { createSupplierRfq, liveAccreditedOrgIds } from '@/server/modules/rfq/supplier-financing'
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

async function loadRequestForUser(userId: string, requestId: string) {
  const request = await db.financingRequest.findUnique({
    where: { id: requestId },
    include: {
      organization: { select: { id: true, name: true } },
      service: { select: { financierProfile: { include: { organization: { select: { id: true, name: true, status: true } } } } } },
    },
  })
  if (!request) return null
  if (request.createdById === userId) return request
  if (request.organizationId) {
    const member = await db.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: request.organizationId, userId } },
    })
    if (member) return request
  }
  return null
}

// GET /api/financing/requests/[id]/supplier-rfq — the applicant-facing sourcing
// state: the live supplier RFQ for this financing request (version, consent,
// quotes with supplier names), the accredited supplier pool size, and whether
// financing is finalized (ACTIVE agreement → order conversion unlocked).
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id } = await ctx.params
    const request = await loadRequestForUser(user!.id, id)
    if (!request) return NextResponse.json({ error: 'Financing request not found', code: 'NOT_FOUND' }, { status: 404 })

    const rfq = await db.rfq.findFirst({
      where: { financingRequestId: id, status: { in: ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'QUOTED', 'ACCEPTED', 'ORDERED'] } },
      orderBy: { version: 'desc' },
      include: {
        lines: { select: { id: true, productId: true, productName: true, quantity: true, targetPrice: true, variantName: true } },
        quotes: {
          where: { status: { in: ['SENT', 'PENDING_REVIEW', 'ACCEPTED', 'DECLINED', 'CONVERTED'] } },
          include: {
            createdBy: { select: { name: true } },
            sellerOrg: { select: { id: true, name: true } },
            lines: { select: { quantity: true, unitPrice: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    const financierOrgId = request.service.financierProfile.organizationId
    const accredited = await liveAccreditedOrgIds(financierOrgId)
    const agreement = await db.financingAgreement.findFirst({
      where: { offer: { requestId: id, status: 'ACCEPTED' }, status: 'ACTIVE' },
      select: { id: true, number: true },
    })
    // Previous versions (audit / version history for the applicant)
    const history = await db.rfq.findMany({
      where: { financingRequestId: id },
      orderBy: { version: 'desc' },
      select: { id: true, number: true, version: true, consentAt: true, status: true, supersededById: true, createdAt: true },
    })

    return NextResponse.json({
      rfq: rfq
        ? {
            id: rfq.id,
            number: rfq.number,
            title: rfq.title,
            status: rfq.status,
            version: rfq.version,
            consentAt: rfq.consentAt?.toISOString() ?? null,
            createdAt: rfq.createdAt.toISOString(),
            expiresAt: rfq.expiresAt?.toISOString() ?? null,
            lines: rfq.lines,
            quotes: rfq.quotes.map((q) => ({
              id: q.id,
              number: q.number,
              status: q.status,
              total: q.total,
              paymentTerms: q.paymentTerms,
              validUntil: q.validUntil?.toISOString() ?? null,
              createdAt: q.createdAt.toISOString(),
              supplierName: q.sellerOrg?.name ?? q.createdBy.name,
              supplierOrgId: q.sellerOrg?.id ?? null,
            })),
          }
        : null,
      financing: {
        requestStatus: request.status,
        gatePassed: !!request.forwardedAt || ['FORWARDED_TO_FINANCIER', 'UNDER_FINANCIER_REVIEW', 'OFFERED', 'ACCEPTED'].includes(request.status),
        agreementActive: !!agreement,
        agreementNumber: agreement?.number ?? null,
        accreditedSupplierCount: accredited.length,
        financierOrgName: request.service.financierProfile.organization.name,
        financierOrgStatus: request.service.financierProfile.organization.status,
      },
      history,
    })
  } catch (err) {
    console.error('supplier-rfq GET error', err)
    return NextResponse.json({ error: 'Failed to load sourcing state' }, { status: 500 })
  }
}

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
