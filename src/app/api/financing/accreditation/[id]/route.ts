import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/server/guards'
import { financingError } from '@/lib/financing-api'
import { getOwned } from '@/server/modules/financing/accreditation'

// GET /api/financing/accreditation/[id] — applicant-organization detail:
// checklist verdicts + gate state + decision fields.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id } = await ctx.params
    const request = await getOwned(user, id)
    return NextResponse.json({ request })
  } catch (err) {
    return financingError(err, 'load the accreditation request')
  }
}
