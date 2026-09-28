import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { submitFinancingRequest } from '@/server/modules/financing/requests'
import { FinancingError } from '@/server/modules/financing/shared'

// POST /api/financing/requests/[id]/submit — DRAFT → SUBMITTED: generates the
// per-service checklist (PROFILE_FIELD auto-evals + wizard answers), stamps
// consent + expiry, enters the platform gate queue.
const schema = z.object({
  consent: z.boolean().optional(),
  answers: z
    .array(
      z.object({
        requirementId: z.string().optional(),
        conditionTemplateId: z.string().optional(),
        valueText: z.string().max(500).nullable().optional(),
        valueNumber: z.number().nullable().optional(),
        valueDate: z.string().nullable().optional(),
        accountDocumentId: z.string().nullable().optional(),
        confirmed: z.boolean().optional(),
      })
    )
    .max(60)
    .optional(),
})

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financing:submit', { limit: 30, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    let body: z.infer<typeof schema> = {}
    try {
      body = schema.parse(await req.json())
    } catch {
      body = {}
    }
    const request = await submitFinancingRequest(user.id, id, {
      consent: body.consent,
      answers: body.answers,
    })
    return NextResponse.json({ request })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financing submit error', err)
    return NextResponse.json({ error: 'Failed to submit the request' }, { status: 500 })
  }
}
