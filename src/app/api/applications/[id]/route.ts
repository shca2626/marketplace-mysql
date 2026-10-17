import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { assertSameOrigin } from '@/lib/http'
import {
  decideApplication,
  JobError,
  type ApplicationStatus,
  withdrawApplication,
} from '@/server/modules/jobs/service'

// PATCH /api/applications/[id] — two-sided transitions, distinguished by the
// authenticated actor (server-verified, never trusted from the body):
//   applicant:  { action: 'withdraw' }
//   company:    { status: VIEWED | SHORTLISTED | REJECTED, organizationId }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id } = await params
    const body = (await req.json()) as { action?: string; status?: string; organizationId?: string }

    if (body.action === 'withdraw') {
      const application = await withdrawApplication(user.id, id)
      return NextResponse.json({ application })
    }
    if (body.status && ['VIEWED', 'SHORTLISTED', 'REJECTED'].includes(body.status)) {
      const application = await decideApplication(
        user.id,
        String(body.organizationId ?? ''),
        id,
        body.status as ApplicationStatus
      )
      return NextResponse.json({ application })
    }
    return NextResponse.json({ error: 'Unsupported application action' }, { status: 400 })
  } catch (err) {
    if (err instanceof JobError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    console.error('application PATCH error', err)
    return NextResponse.json({ error: 'Failed to update the application' }, { status: 500 })
  }
}
