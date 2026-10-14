import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { financingError } from '@/lib/financing-api'
import { adminAccreditationQueue } from '@/server/modules/financing/accreditation'
import { ACCREDITATION_REQUEST_STATUSES } from '@/server/modules/financing/types'

// GET /api/admin/financing/accreditation-queue — the gate queue for
// accreditation requests (SUBMITTED + UNDER_PLATFORM_REVIEW, oldest first).
export async function GET(req: NextRequest) {
  const { user, error } = await requireAdmin('financing.gate.view')
  if (error) return error
  try {
    const status = req.nextUrl.searchParams.get('status') ?? undefined
    if (status && !(ACCREDITATION_REQUEST_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json({ error: 'Unknown accreditation status filter' }, { status: 400 })
    }
    const queue = await adminAccreditationQueue({
      status: status as (typeof ACCREDITATION_REQUEST_STATUSES)[number],
    })
    return NextResponse.json(queue)
  } catch (err) {
    return financingError(err, 'load the accreditation gate queue')
  }
}
