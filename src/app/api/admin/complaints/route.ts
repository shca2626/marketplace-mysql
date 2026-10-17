import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import {
  ComplaintError,
  complaintStats,
  listAllComplaints,
} from '@/server/modules/complaints/service'

// GET /api/admin/complaints — the Complaints console queue (complaints.view).
//   ?status=  OPEN | ORG_RESPONDED | RESOLVED | DISMISSED | WITHDRAWN
//   &severity=  NORMAL | HIGH | CRITICAL
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin('complaints.view')
  if (error) return error
  try {
    const sp = req.nextUrl.searchParams
    const complaints = await listAllComplaints({
      status: sp.get('status') || undefined,
      severity: sp.get('severity') || undefined,
    })
    return NextResponse.json({ complaints, stats: complaintStats(complaints) })
  } catch (err) {
    if (err instanceof ComplaintError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    console.error('admin complaints GET error', err)
    return NextResponse.json({ error: 'Failed to load complaints' }, { status: 500 })
  }
}
