import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import {
  listOwnServices,
  createService,
  SERVICE_KINDS,
  FINANCING_CATEGORIES,
  ACCREDITATION_CATEGORIES,
} from '@/server/modules/financing/services'
import { FinancingError } from '@/server/modules/financing/shared'

// GET /api/financier/services — the console's own services (any status) with
// active requirement counts.
export async function GET() {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const services = await listOwnServices(user.id)
    return NextResponse.json({ services })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier services GET error', err)
    return NextResponse.json({ error: 'Failed to load your services' }, { status: 500 })
  }
}

const createSchema = z.object({
  serviceKind: z.enum(SERVICE_KINDS),
  category: z.string().min(2).max(40),
  name: z.string().trim().min(3).max(160),
  summary: z.string().trim().max(300).nullable().optional(),
  description: z.string().trim().max(8000).nullable().optional(),
  targetSegment: z.enum(['BUSINESS', 'INDIVIDUAL', 'BOTH']).nullable().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
  currency: z.string().length(3).optional(),
  amountMin: z.number().min(0).nullable().optional(),
  amountMax: z.number().min(0).nullable().optional(),
  rateType: z.enum(['MURABAHA_ANNUAL', 'FIXED_ANNUAL', 'FLAT_FEE']).nullable().optional(),
  rateMax: z.number().min(0).max(100).nullable().optional(),
  feeFlat: z.number().min(0).nullable().optional(),
  tenorMinMonths: z.number().int().min(1).max(120).nullable().optional(),
  tenorMaxMonths: z.number().int().min(1).max(120).nullable().optional(),
  repaymentFrequency: z.enum(['MONTHLY', 'QUARTERLY', 'LUMP_SUM']).nullable().optional(),
  gracePeriodDays: z.number().int().min(0).max(365).nullable().optional(),
  shariaCompliant: z.boolean().optional(),
  processingDays: z.number().int().min(1).max(90).nullable().optional(),
  accreditationValidMonths: z.number().int().min(1).max(60).nullable().optional(),
  accreditationFeeAmount: z.number().min(0).nullable().optional(),
  attributes: z
    .object({
      kind: z.enum(['FEATURE', 'ELIGIBILITY_CONDITION']),
      texts: z.array(z.string().trim().max(300)).max(30),
    })
    .optional(),
  coverage: z.array(z.string().trim().max(120)).max(60).optional(),
})

// POST /api/financier/services — create (DRAFT default). Optional nested
// attributes/coverage payloads are applied right after the create.
export async function POST(req: NextRequest) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financier:services', { limit: 40, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl

  try {
    const parsed = createSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid service payload', details: parsed.error.flatten() }, { status: 400 })
    }
    const { attributes, coverage, ...input } = parsed.data
    const allowedCategories = input.serviceKind === 'ACCREDITATION' ? ACCREDITATION_CATEGORIES : FINANCING_CATEGORIES
    if (!(allowedCategories as readonly string[]).includes(input.category)) {
      return NextResponse.json({ error: `category must be one of ${allowedCategories.join(', ')}` }, { status: 400 })
    }
    let service = await createService(user.id, input)
    if (attributes?.texts?.length) {
      const { setServiceAttributes } = await import('@/server/modules/financing/services')
      service = await setServiceAttributes(user.id, service.id, attributes.kind, attributes.texts)
    }
    if (coverage?.length) {
      const { setServiceCoverage } = await import('@/server/modules/financing/services')
      service = await setServiceCoverage(user.id, service.id, coverage)
    }
    return NextResponse.json({ service }, { status: 201 })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier services POST error', err)
    return NextResponse.json({ error: 'Failed to create the service' }, { status: 500 })
  }
}

