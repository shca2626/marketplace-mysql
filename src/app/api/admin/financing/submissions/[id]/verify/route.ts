import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { financingError, readJson } from '@/lib/financing-api'
import { verifySubmission, rejectSubmission, waiveSubmission } from '@/server/modules/financing/submissions'

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
    const body = (await readJson(req)) as { verdict?: string; note?: string }
    const verdict = (body.verdict ?? 'VERIFIED').toUpperCase()
    const note = (body.note ?? '').trim()
    if (verdict === 'REJECTED' && !note) {
      return NextResponse.json({ error: 'A note is required when rejecting' }, { status: 400 })
    }
    if (verdict === 'WAIVED' && !note) {
      return NextResponse.json({ error: 'A note is required when waiving' }, { status: 400 })
    }
    const submission =
      verdict === 'REJECTED'
        ? await rejectSubmission(user.id, id, note)
        : verdict === 'WAIVED'
          ? await waiveSubmission(user.id, id, note)
          : await verifySubmission(user.id, id, note || undefined)
    return NextResponse.json({ submission })
  } catch (err) {
    return financingError(err, 'verify the checklist item')
  }
}
