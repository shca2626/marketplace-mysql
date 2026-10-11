import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { requireFinancierContext, FinancingError } from '@/server/modules/financing/shared'
import { updateDraft } from '@/server/modules/financing/contracts'

const updateSchema = z.object({
  title: z.string().trim().min(3).max(160).optional(),
  body: z.string().min(10).max(60000).optional(),
})

// PUT /api/financier/contracts/[id] — edit a DRAFT template (409 once
// ACTIVE/RETIRED — the live sha256 can never drift; sha256 recomputed on
// body change; OWNER/ADMIN; audited).
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financier:contract-template', { limit: 40, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl
  try {
    const finCtx = await requireFinancierContext(user.id)
    const { id } = await ctx.params
    const parsed = updateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid template payload', details: parsed.error.flatten() }, { status: 400 })
    }
    const template = await updateDraft(user.id, finCtx.organizationId, id, parsed.data)
    return NextResponse.json({ template })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('contract template PUT error', err)
    return NextResponse.json({ error: 'Failed to update the template' }, { status: 500 })
  }
}
