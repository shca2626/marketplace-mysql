import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { FinancingError } from '@/server/modules/financing/shared'
import { EsignError, getExecutionContext } from '@/server/modules/financing/esign'

// GET /api/financing/agreements/[id]/contract — the buyer-side execution
// context: the ACTIVE template rendered for this agreement, the exact consent
// sentence, existing execution summary + MFA enrollment state. 404
// TEMPLATE_INACTIVE when the financier has no active template (the UI stays
// quiet — nothing to sign yet).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id } = await ctx.params
    const context = await getExecutionContext(user.id, id)
    return NextResponse.json(context)
  } catch (err) {
    if (err instanceof EsignError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    }
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('esign context GET error', err)
    return NextResponse.json({ error: 'Failed to load the signing context' }, { status: 500 })
  }
}
