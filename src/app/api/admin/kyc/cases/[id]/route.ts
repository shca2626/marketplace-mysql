import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { decideCaseManually, KycCaseError } from '@/server/modules/kyc/provider/dispatch'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN · KYC CASE MANUAL DECISION (Phase 12.4) — the manual-queue action.
//
// POST /api/admin/kyc/cases/[id]  {action: 'approve'|'reject'|'requeue', note?}
//
//   approve → document VERIFIED + case APPROVED (+ decidedById)
//   reject  → document REJECTED + case REJECTED (+ decidedById)
//   requeue → case back to PENDING (e.g. dispatched by mistake)
//
// SUBMITTED cases are refused (409): the provider is in flight. The note is
// optional (the vault convention of mandatory rejection notes applies to the
// classic queue; the manual queue records the actor on the case row itself).
// financing.documents.verify.
// ─────────────────────────────────────────────────────────────────────────────

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve'), note: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal('reject'), note: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal('requeue'), note: z.string().trim().max(500).optional() }),
])

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin('financing.documents.verify')
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'admin:kyc-case-decide', { limit: 120, windowMs: 60_000 }, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid decision', details: parsed.error.flatten() }, { status: 400 })
    }
    const result = await decideCaseManually(id, user.id, parsed.data.action, parsed.data.note)
    return NextResponse.json({ ok: true, caseStatus: result.caseStatus })
  } catch (err) {
    if (err instanceof KycCaseError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('kyc case decision error', err)
    return NextResponse.json({ error: 'Failed to decide the case' }, { status: 500 })
  }
}
