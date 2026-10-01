import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import {
  verifySubmission,
  rejectSubmission,
  waiveSubmission,
} from '@/server/modules/financing/submissions'
import { maybeAutoForward } from '@/server/modules/financing/requests'
import { maybeAutoForwardAccreditation } from '@/server/modules/financing/accreditation'
import { db } from '@/lib/db'
import { FinancingError } from '@/server/modules/financing/shared'

// POST /api/admin/financing/submissions/[id] — the gate's per-item verdict:
// {action: VERIFY | REJECT | WAIVE}. REJECT/WAIVE require a note. After a
// VERIFY, autoForwardWhenAllVerified (financingGeneral) may forward the
// parent request immediately — an admin verdict still happened on every item
// (automation pre-fills verdicts, never skips review — DP-23).
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('VERIFY'), note: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal('REJECT'), note: z.string().trim().min(3).max(500) }),
  z.object({ action: z.literal('WAIVE'), note: z.string().trim().min(3).max(500) }),
])

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin('financing.documents.verify')
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'admin:gate-verdict', { limit: 120, windowMs: 60_000 }, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid verdict', details: parsed.error.flatten() }, { status: 400 })
    }
    let submission
    if (parsed.data.action === 'VERIFY') {
      submission = await verifySubmission(user.id, id, parsed.data.note)
    } else if (parsed.data.action === 'REJECT') {
      submission = await rejectSubmission(user.id, id, parsed.data.note)
    } else {
      submission = await waiveSubmission(user.id, id, parsed.data.note)
    }
    // autoForwardWhenAllVerified — fire-and-forget, never fails the verdict
    let autoForwarded = false
    try {
      const parent = await db.requirementSubmission.findUnique({
        where: { id },
        select: {
          financingRequest: { select: { id: true } },
          accreditationRequest: { select: { id: true } },
        },
      })
      if (parent?.financingRequest) {
        autoForwarded = await maybeAutoForward(user.id, parent.financingRequest.id)
      } else if (parent?.accreditationRequest) {
        autoForwarded = await maybeAutoForwardAccreditation(user.id, parent.accreditationRequest.id)
      }
    } catch {
      autoForwarded = false
    }
    return NextResponse.json({ submission, autoForwarded })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin submission verdict error', err)
    return NextResponse.json({ error: 'Failed to record the verdict' }, { status: 500 })
  }
}
