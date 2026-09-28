import { NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { listLiveAccreditations } from '@/server/modules/financing/accreditation'

// GET /api/accreditation/valid — the user's orgs' LIVE accreditations
// (ACCREDITED + validUntil in the future). Powers the RFQ participation
// unlock check (§9.10) and the applicant badge.
export async function GET() {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const live = await listLiveAccreditations(user.id)
    return NextResponse.json({ live })
  } catch (err) {
    console.error('accreditation valid error', err)
    return NextResponse.json({ error: 'Failed to load live accreditations' }, { status: 500 })
  }
}
