import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { requireFinancierContext, FinancingError } from '@/server/modules/financing/shared'
import { activateTemplate } from '@/server/modules/financing/contracts'

// POST /api/financier/contracts/[id]/activate — single-active activation:
// every other template of the same kind retires, this one becomes ACTIVE
// (atomic; OWNER/ADMIN; audited). Existing executions keep their version.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'financier:contract-template', { limit: 40, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl
  try {
    const finCtx = await requireFinancierContext(user.id)
    const { id } = await ctx.params
    const template = await activateTemplate(user.id, finCtx.organizationId, id)
    return NextResponse.json({ template })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('contract template activate error', err)
    return NextResponse.json({ error: 'Failed to activate the template' }, { status: 500 })
  }
}
