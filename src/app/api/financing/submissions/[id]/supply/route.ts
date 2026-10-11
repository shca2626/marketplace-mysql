import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { financingError, readJson } from '@/lib/financing-api'
import { supplySubmission } from '@/server/modules/financing/submissions'

// POST /api/financing/submissions/[id]/supply — the applicant supplies an
// answer/document for one checklist item (PENDING|REJECTED → SUBMITTED).
// Works for both financing and accreditation parents (service-resolved).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error

  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const rl = enforceRateLimit(req, 'productWrite', RATE_LIMITS.productWrite, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const submission = await supplySubmission(user, id, await readJson(req))
    return NextResponse.json({ submission })
  } catch (err) {
    return financingError(err, 'supply the checklist item')
  }
}
