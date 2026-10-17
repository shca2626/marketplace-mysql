import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { adminListJobs, JobError } from '@/server/modules/jobs/service'

// GET /api/admin/jobs — the platform-side jobs queue (jobs.view).
//   ?status= OPEN | PAUSED | CLOSED · ?q= search (title, number, org name)
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin('jobs.view')
  if (error) return error
  try {
    const sp = req.nextUrl.searchParams
    const jobs = await adminListJobs({
      status: sp.get('status') || undefined,
      q: sp.get('q') || undefined,
    })
    return NextResponse.json({ jobs })
  } catch (err) {
    if (err instanceof JobError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    console.error('admin jobs GET error', err)
    return NextResponse.json({ error: 'Failed to load the jobs queue' }, { status: 500 })
  }
}
