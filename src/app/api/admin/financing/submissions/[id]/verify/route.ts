import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { financingError, readJson } from '@/lib/financing-api'
import { verifySubmission } from '@/server/modules/financing/submissions'

// POST /api/admin/financing/submissions/[id]/verify — the gate's per-item
// verdict (body: { verdict: VERIFIED | REJECTED | WAIVED, note? } — a note is
// required on REJECTED/WAIVED). Works for both request kinds (parent-resolved).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin('financing.gate.review')
  if (error) return error

  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const rl = enforceRateLimit(req, 'productWrite', RATE_LIMITS.productWrite, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const submission = await verifySubmission(user, id, await readJson(req))
    return NextResponse.json({ submission })
  } catch (err) {
    return financingError(err, 'verify the checklist item')
  }
}
