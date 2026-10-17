import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin } from '@/lib/http'
import { adminCloseJob, JobError } from '@/server/modules/jobs/service'

// PATCH /api/admin/jobs/[id] — moderation close (jobs.moderate).
//   { reason } — surfaced to the company + written to the audit trail.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const { user, error } = await requireAdmin('jobs.moderate')
  if (error) return error
  try {
    const { id } = await params
    const body = (await req.json()) as { reason?: string }
    const job = await adminCloseJob(user.id, id, body.reason ?? '')
    return NextResponse.json({ job })
  } catch (err) {
    if (err instanceof JobError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    console.error('admin job PATCH error', err)
    return NextResponse.json({ error: 'Failed to moderate the job posting' }, { status: 500 })
  }
}
