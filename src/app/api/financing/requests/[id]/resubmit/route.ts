import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { resubmitFinancingRequest } from '@/server/modules/financing/requests'
import { FinancingError } from '@/server/modules/financing/shared'

// POST /api/financing/requests/[id]/resubmit — RETURNED_FOR_COMPLETION →
// UNDER_PLATFORM_REVIEW. Re-supplies the flagged items (REJECTED → SUBMITTED);
// previously VERIFIED/WAIVED items are preserved.
const schema = z.object({
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
  const rl = enforceRateLimit(req, 'financing:resubmit', { limit: 30, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    let body: z.infer<typeof schema> = {}
    try {
      body = schema.parse(await req.json())
    } catch {
      body = {}
    }
    const request = await resubmitFinancingRequest(user.id, id, { answers: body.answers })
    return NextResponse.json({ request })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financing resubmit error', err)
    return NextResponse.json({ error: 'Failed to resubmit the request' }, { status: 500 })
  }
}
