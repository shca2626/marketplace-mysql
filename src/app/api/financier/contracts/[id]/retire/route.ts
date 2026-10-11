import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { requireFinancierContext, FinancingError } from '@/server/modules/financing/shared'
import { retireTemplate } from '@/server/modules/financing/contracts'

// POST /api/financier/contracts/[id]/retire — ACTIVE → RETIRED. Deliberately
// leaves no active template: new signings fail closed until a new activation
// (OWNER/ADMIN; audited).
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
    const template = await retireTemplate(user.id, finCtx.organizationId, id)
    return NextResponse.json({ template })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('contract template retire error', err)
    return NextResponse.json({ error: 'Failed to retire the template' }, { status: 500 })
  }
}
