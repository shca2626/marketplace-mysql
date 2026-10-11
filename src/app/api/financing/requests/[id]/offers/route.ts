import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/server/guards'
import { financingError } from '@/lib/financing-api'
import { listOffers } from '@/server/modules/financing/offers'

// GET /api/financing/requests/[id]/offers — the offers of one request.
// The service guard allows the applicant (creator/org member), the financing
// organization (only once the request passed the gate — R-4) and platform
// admins; everyone else gets a 404.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id } = await ctx.params
    const offers = await listOffers(user, id)
    return NextResponse.json({ offers })
  } catch (err) {
    return financingError(err, 'load the offers')
  }
}
