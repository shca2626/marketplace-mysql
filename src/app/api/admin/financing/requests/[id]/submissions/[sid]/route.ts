import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { financingError } from '@/server/modules/financing/catalog'
import { adminVerdict } from '@/server/modules/financing/submissions'
import { adminVerdictSchema } from '@/server/modules/financing/types'

// POST /api/admin/financing/requests/[id]/submissions/[sid] — the gate
// console's per-item verdict: { verdict: 'verify' | 'reject' | 'waive', note }.
// reject/waive require a note; waiving only works on optional items. Works on
// both request families (the submission knows its parent).

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; sid: string }> }
) {
  const { user, error } = await requireAdmin('financing.gate.review')
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'admin:financing', { limit: 120, windowMs: 60_000 }, user!.id)
  if (rl) return rl

  try {
    const { sid } = await ctx.params
    const parsed = adminVerdictSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid verdict payload' },
        { status: 400 }
      )
    }
    const result = await adminVerdict({
      admin: { id: user!.id, role: user!.role },
      submissionId: sid,
      payload: parsed.data,
    })
    return NextResponse.json(result)
  } catch (err) {
    const svc = financingError(err)
    if (svc) return NextResponse.json({ error: svc.message }, { status: svc.status })
    console.error('admin submission verdict error', err)
    return NextResponse.json({ error: 'Failed to record verdict' }, { status: 500 })
  }
}
