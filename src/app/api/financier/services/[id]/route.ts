import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import {
  getOwnService,
  updateService,
  archiveService,
} from '@/server/modules/financing/services'
import { FinancingError } from '@/server/modules/financing/shared'

// GET /api/financier/services/[id] — own service detail incl. the composed
// requirements (the checklist the applicant will face).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id } = await ctx.params
    const result = await getOwnService(user.id, id)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier service detail error', err)
    return NextResponse.json({ error: 'Failed to load the service' }, { status: 500 })
  }
}

const patchSchema = z.object({
  category: z.string().min(2).max(40).optional(),
  name: z.string().trim().min(3).max(160).optional(),
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
})

// PATCH /api/financier/services/[id] — update fields / publish / archive.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financier:services', { limit: 60, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const parsed = patchSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid service patch', details: parsed.error.flatten() }, { status: 400 })
    }
    const service = await updateService(user.id, id, parsed.data)
    return NextResponse.json({ service })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier service PATCH error', err)
    return NextResponse.json({ error: 'Failed to update the service' }, { status: 500 })
  }
}

// DELETE /api/financier/services/[id] — soft ARCHIVE (requests/offers keep
// their references; the service can be reactivated later).
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financier:services', { limit: 30, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const service = await archiveService(user.id, id)
    return NextResponse.json({ service })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier service DELETE error', err)
    return NextResponse.json({ error: 'Failed to archive the service' }, { status: 500 })
  }
}
