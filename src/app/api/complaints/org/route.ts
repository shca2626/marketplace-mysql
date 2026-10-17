import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { ComplaintError, listComplaintsAgainstOrg } from '@/server/modules/complaints/service'

// GET /api/complaints/org — the Selling → Complaints panel: complaints filed
// AGAINST the caller's organization (member + org.offers.manage / OWNER / ADMIN,
// all verified server-side — navigation visibility is not a control).
//   ?organizationId=
export async function GET(req: NextRequest) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const organizationId = req.nextUrl.searchParams.get('organizationId') || ''
    if (!organizationId) return NextResponse.json({ error: 'organizationId is required' }, { status: 400 })

    const complaints = await listComplaintsAgainstOrg(user.id, organizationId)
    return NextResponse.json({ complaints })
  } catch (err) {
    if (err instanceof ComplaintError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    console.error('org complaints GET error', err)
    return NextResponse.json({ error: 'Failed to load complaints' }, { status: 500 })
  }
}
