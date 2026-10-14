import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { financingError } from '@/server/modules/financing/catalog'
import { answerSubmission, type SubmissionAnswer } from '@/server/modules/financing/submissions'
import { submissionAnswerSchema } from '@/server/modules/financing/types'

// PATCH /api/financing/requests/[id]/submissions/[sid] — answer ONE checklist
// item with a typed payload (validated per conditionType inside the service).
// Editable only while the request is DRAFT or RETURNED_FOR_COMPLETION.

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; sid: string }> }
) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financing:answers', { limit: 120, windowMs: 60_000 }, user!.id)
  if (rl) return rl

  try {
    const { sid } = await ctx.params
    const parsed = submissionAnswerSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid answer payload' },
        { status: 400 }
      )
    }
    const result = await answerSubmission(user!.id, sid, parsed.data as SubmissionAnswer)
    return NextResponse.json(result)
  } catch (err) {
    const svc = financingError(err)
    if (svc) return NextResponse.json({ error: svc.message }, { status: svc.status })
    console.error('financing submission PATCH error', err)
    return NextResponse.json({ error: 'Failed to save answer' }, { status: 500 })
  }
}
