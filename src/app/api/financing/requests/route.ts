import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import {
  createFinancingRequest,
  createMultiFinancingRequests,
  listMyFinancingRequests,
} from '@/server/modules/financing/requests'
import { FinancingError } from '@/server/modules/financing/shared'

// POST /api/financing/requests — applicant creates a DRAFT application.
// Single-financier: {serviceId}. Multi-financier (DP-25): {serviceIds: [...]}
// → N sibling DRAFTs sharing a multiGroupId (one per financier, own checklist).
const answerSchema = z.object({
  requirementId: z.string().optional(),
  conditionTemplateId: z.string().optional(),
  valueText: z.string().max(500).nullable().optional(),
  valueNumber: z.number().nullable().optional(),
  valueDate: z.string().nullable().optional(),
  accountDocumentId: z.string().nullable().optional(),
  confirmed: z.boolean().optional(),
})

const createSchema = z.object({
  serviceId: z.string().optional(),
  serviceIds: z.array(z.string()).min(2).max(8).optional(),
  organizationId: z.string().nullable().optional(),
  targetType: z.string().max(16).optional(),
  targetId: z.string().max(64).nullable().optional(),
  activityStatus: z.string().max(16).nullable().optional(),
  activityName: z.string().max(160).nullable().optional(),
  activityDescription: z.string().max(4000).nullable().optional(),
  activityStartDate: z.string().nullable().optional(),
  activityCity: z.string().max(120).nullable().optional(),
  activityDistrict: z.string().max(120).nullable().optional(),
  activityAddress: z.string().max(255).nullable().optional(),
  activityLocationType: z.string().max(16).nullable().optional(),
  activityCategory: z.string().max(24).nullable().optional(),
  activityCategoryOther: z.string().max(160).nullable().optional(),
  capitalAmount: z.number().min(0).nullable().optional(),
  ownContributionAmount: z.number().min(0).nullable().optional(),
  monthlyInstallmentCapacity: z.number().min(0).nullable().optional(),
  previousFinancing: z.boolean().nullable().optional(),
  otherIncomeSources: z.string().max(500).nullable().optional(),
  amountRequested: z.number().positive().max(1_000_000_000),
  currency: z.string().length(3).optional(),
  purpose: z.string().max(4000).nullable().optional(),
  tenorRequestedMonths: z.number().int().min(1).max(120).nullable().optional(),
  guaranteeType: z.string().max(24).nullable().optional(),
  guaranteeTypeOther: z.string().max(160).nullable().optional(),
  guaranteeStatus: z.string().max(24).nullable().optional(),
  guaranteeStatusOther: z.string().max(160).nullable().optional(),
  applicantNotes: z.string().max(4000).nullable().optional(),
  submit: z.boolean().optional(),
  consent: z.boolean().optional(),
  answers: z.array(answerSchema).max(60).optional(),
})

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financing:create-request', { limit: 20, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl

  try {
    const parsed = createSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid application payload', details: parsed.error.flatten() }, { status: 400 })
    }
    const { submit: doSubmit, consent, answers, serviceId, serviceIds, ...rest } = parsed.data
    if (!serviceIds && !serviceId) {
      return NextResponse.json({ error: 'Pick a service to apply for' }, { status: 400 })
    }
    const created = serviceIds
      ? await createMultiFinancingRequests(user.id, { ...rest, serviceIds })
      : [await createFinancingRequest(user.id, { ...rest, serviceId: serviceId! })]
    if (doSubmit) {
      const { submitFinancingRequest } = await import('@/server/modules/financing/requests')
      const submitted = []
      for (const r of created) {
        submitted.push(await submitFinancingRequest(user.id, r.id, { consent, answers }))
      }
      return NextResponse.json({ requests: created, submitted }, { status: 201 })
    }
    return NextResponse.json({ requests: created }, { status: 201 })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financing requests POST error', err)
    return NextResponse.json({ error: 'Failed to create the application' }, { status: 500 })
  }
}

// GET /api/financing/requests — my requests (created by me or my orgs) with
// multiGroupId grouping for the sibling comparison view (DP-25).
export async function GET(req: NextRequest) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    void req
    const result = await listMyFinancingRequests(user.id)
    return NextResponse.json(result)
  } catch (err) {
    console.error('financing requests GET error', err)
    return NextResponse.json({ error: 'Failed to load your requests' }, { status: 500 })
  }
}
