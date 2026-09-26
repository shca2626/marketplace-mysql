import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { getAgreement } from '@/server/modules/financing/agreements'
import { FinancingError } from '@/server/modules/financing/shared'

// GET /api/financier/agreements/[id] — agreement detail (financier staff,
// applicant, or admin — viewer-scoped guard in the service).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id } = await ctx.params
    const agreement = await getAgreement({ id: user.id, role: user.role }, id)
    return NextResponse.json({ agreement })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financier agreement detail error', err)
    return NextResponse.json({ error: 'Failed to load the agreement' }, { status: 500 })
  }
}
