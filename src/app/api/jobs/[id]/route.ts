import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { getPublicJob, JobError, listOrgJobs, updateJob } from '@/server/modules/jobs/service'

// GET /api/jobs/[id] — public job detail (increments the view counter).
//   ?organizationId= — when present, the company-side management view instead
//   (requires membership + org.jobs.manage; includes every status).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const organizationId = req.nextUrl.searchParams.get('organizationId')
    if (organizationId) {
      const { user, error } = await requireUser()
      if (error) return error
      const jobs = await listOrgJobs(organizationId, user.id)
      const mine = jobs.find((j) => j.id === id)
      if (!mine) return NextResponse.json({ error: 'Job posting not found' }, { status: 404 })
      return NextResponse.json({ job: mine })
    }
    const job = await getPublicJob(id)
    return NextResponse.json({ job })
  } catch (err) {
    if (err instanceof JobError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    console.error('job GET error', err)
    return NextResponse.json({ error: 'Failed to load the job posting' }, { status: 500 })
  }
}

// PATCH /api/jobs/[id] — update fields or move status (OPEN↔PAUSED, →CLOSED).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const rl = enforceRateLimit(req, 'jobWrite', RATE_LIMITS.jobWrite, user.id)
    if (rl) return rl

    const { id } = await params
    const body = (await req.json()) as Record<string, unknown>
    const job = await updateJob(user.id, String(body.organizationId ?? ''), id, {
      ...(body.title !== undefined ? { title: String(body.title) } : {}),
      ...(body.department !== undefined ? { department: body.department ? String(body.department) : null } : {}),
      ...(body.location !== undefined ? { location: body.location ? String(body.location) : null } : {}),
      ...(body.employmentType !== undefined ? { employmentType: String(body.employmentType) } : {}),
      ...(body.description !== undefined ? { description: String(body.description) } : {}),
      ...(body.requirements !== undefined ? { requirements: body.requirements ? String(body.requirements) : null } : {}),
      ...(body.salaryMin !== undefined ? { salaryMin: body.salaryMin != null ? Number(body.salaryMin) : null } : {}),
      ...(body.salaryMax !== undefined ? { salaryMax: body.salaryMax != null ? Number(body.salaryMax) : null } : {}),
      ...(body.status !== undefined ? { status: String(body.status) } : {}),
      ...(body.expiresAt !== undefined
        ? { expiresAt: body.expiresAt ? new Date(String(body.expiresAt)) : null }
        : {}),
    })
    return NextResponse.json({ job })
  } catch (err) {
    if (err instanceof JobError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    console.error('job PATCH error', err)
    return NextResponse.json({ error: 'Failed to update the job posting' }, { status: 500 })
  }
}
