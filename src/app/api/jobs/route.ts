import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { createJob, JobError, listOrgJobs, publicJobFeed } from '@/server/modules/jobs/service'

// GET /api/jobs — the public jobs board feed (no auth).
//   ?q= search · ?type= FULL_TIME|PART_TIME|CONTRACT|INTERNSHIP|TEMPORARY
//   ?location= substring · ?page= 1-based
//   ?organizationId= — the company-side management list instead (requires
//   membership + OWNER/ADMIN or org.jobs.manage; includes every status).
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const organizationId = sp.get('organizationId')
    if (organizationId) {
      const { user, error } = await requireUser()
      if (error) return error
      const jobs = await listOrgJobs(organizationId, user.id)
      return NextResponse.json({ jobs })
    }
    const feed = await publicJobFeed({
      q: sp.get('q') ?? undefined,
      type: sp.get('type') ?? undefined,
      location: sp.get('location') ?? undefined,
      page: Number(sp.get('page') ?? '1') || 1,
    })
    return NextResponse.json(feed)
  } catch (err) {
    if (err instanceof JobError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    console.error('jobs GET error', err)
    return NextResponse.json({ error: 'Failed to load the jobs board' }, { status: 500 })
  }
}

// POST /api/jobs — publish a job posting (membership + OWNER/ADMIN or org.jobs.manage).
export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const rl = enforceRateLimit(req, 'jobWrite', RATE_LIMITS.jobWrite, user.id)
    if (rl) return rl

    const body = (await req.json()) as Record<string, unknown>
    const job = await createJob({
      userId: user.id,
      organizationId: String(body.organizationId ?? ''),
      title: String(body.title ?? ''),
      department: body.department ? String(body.department) : null,
      location: body.location ? String(body.location) : null,
      employmentType: String(body.employmentType ?? 'FULL_TIME'),
      description: String(body.description ?? ''),
      requirements: body.requirements ? String(body.requirements) : null,
      salaryMin: body.salaryMin != null ? Number(body.salaryMin) : null,
      salaryMax: body.salaryMax != null ? Number(body.salaryMax) : null,
      salaryCurrency: body.salaryCurrency ? String(body.salaryCurrency) : 'USD',
      expiresAt: body.expiresAt ? new Date(String(body.expiresAt)) : null,
    })
    return NextResponse.json({ job }, { status: 201 })
  } catch (err) {
    if (err instanceof JobError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    console.error('jobs POST error', err)
    return NextResponse.json({ error: 'Failed to publish the job posting' }, { status: 500 })
  }
}
