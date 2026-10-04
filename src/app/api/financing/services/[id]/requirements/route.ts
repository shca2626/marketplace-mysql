import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/server/guards'
import { financingError } from '@/lib/financing-api'
import { listServiceRequirements } from '@/server/modules/financing/conditions'

// GET /api/financing/services/[id]/requirements — the ACTIVE requirements
// composed for one service, as seen by a signed-in applicant (wizard step 3
// renders the checklist before any request exists). Active-only by default,
// so no actor guard is needed (listServiceRequirements guards the inactive
// composer view only). The public detail route keeps requirements private;
// this read is behind requireUser per the FIN-6 plan.

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id } = await ctx.params
    const requirements = await listServiceRequirements(id)
    return NextResponse.json({ requirements })
  } catch (err) {
    return financingError(err, 'load the service requirements')
  }
}
