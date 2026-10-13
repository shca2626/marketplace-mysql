import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser } from '@/server/guards'
import { financingError } from '@/lib/financing-api'
import { FinancingServiceError } from '@/server/modules/financing/types'
import { assertApplicantActor } from '@/server/modules/financing/shared'
import { listChecklist } from '@/server/modules/financing/submissions'

// GET /api/financing/requests/[id]/checklist — the request's requirement
// checklist with per-item verdicts (applicant side; the service's
// listChecklist is unguarded by design — request-level access is enforced here).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id } = await ctx.params
    const row = await db.financingRequest.findUnique({
      where: { id },
      select: { createdById: true, organizationId: true },
    })
    if (!row) throw new FinancingServiceError('Financing request not found', 404)
    if (user.role !== 'ADMIN') {
      await assertApplicantActor(user.id, { createdById: row.createdById, organizationId: row.organizationId })
    }
    const checklist = await listChecklist({ type: 'FINANCING', id })
    return NextResponse.json({ checklist })
  } catch (err) {
    return financingError(err, 'load the request checklist')
  }
}
