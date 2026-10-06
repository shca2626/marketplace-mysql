import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { getFinancingRequestDetail } from '@/server/modules/financing/requests'
import { FinancingError } from '@/server/modules/financing/shared'

// GET /api/financing/requests/[id] — applicant detail: full checklist with
// verdicts + gate status + offers (never DRAFT offers). Applicant org members
// or the creator; platform reviewers holding financing.gate.view get the
// dossier too (RBAC — no legacy User.role bypass).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id } = await ctx.params
    const request = await getFinancingRequestDetail(user.id, id)
    return NextResponse.json({ request })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('financing request detail GET error', err)
    return NextResponse.json({ error: 'Failed to load the request' }, { status: 500 })
  }
}
