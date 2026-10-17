import { NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { JobError, listMyApplications } from '@/server/modules/jobs/service'

// GET /api/applications/mine — the applicant-side view of every job the user
// applied to, with live posting status and company facts.
export async function GET() {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const applications = await listMyApplications(user.id)
    return NextResponse.json({ applications })
  } catch (err) {
    if (err instanceof JobError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    console.error('applications/mine GET error', err)
    return NextResponse.json({ error: 'Failed to load your applications' }, { status: 500 })
  }
}
