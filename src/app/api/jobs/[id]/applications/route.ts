import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { applyToJob, JobError, listJobApplications } from '@/server/modules/jobs/service'

// GET /api/jobs/[id]/applications?organizationId= — the company-side applicant
// pipeline for one posting (membership + org.jobs.manage). ?status= optional.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const { id } = await params
    const organizationId = req.nextUrl.searchParams.get('organizationId') || ''
    const status = req.nextUrl.searchParams.get('status') || undefined
    const applications = await listJobApplications(user.id, organizationId, id, status)
    return NextResponse.json({ applications })
  } catch (err) {
    if (err instanceof JobError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    console.error('job applications GET error', err)
    return NextResponse.json({ error: 'Failed to load the applicants' }, { status: 500 })
  }
}

// POST /api/jobs/[id]/applications — apply (any authenticated actor).
//   { coverNote, contactEmail? }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const rl = enforceRateLimit(req, 'jobApply', RATE_LIMITS.jobApply, user.id)
    if (rl) return rl

    const { id } = await params
    const body = (await req.json()) as { coverNote?: string; contactEmail?: string | null }
    const application = await applyToJob(user.id, id, body.coverNote ?? '', body.contactEmail ?? null)
    return NextResponse.json({ application }, { status: 201 })
  } catch (err) {
    if (err instanceof JobError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    console.error('job applications POST error', err)
    return NextResponse.json({ error: 'Failed to submit the application' }, { status: 500 })
  }
}
