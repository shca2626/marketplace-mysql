import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { getAccreditationDetail } from '@/server/modules/financing/accreditation'
import { FinancingError } from '@/server/modules/financing/shared'

// GET /api/accreditation/requests/[id] — org member detail: checklist + gate
// status + decision fields.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id } = await ctx.params
    const request = await getAccreditationDetail(user.id, id, user.role)
    return NextResponse.json({ request })
  } catch (err) {
    if (err instanceof FinancingError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('accreditation detail error', err)
    return NextResponse.json({ error: 'Failed to load the accreditation request' }, { status: 500 })
  }
}
