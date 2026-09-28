import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import {
  adminGateQueue,
} from '@/server/modules/financing/requests'
import { adminAccreditationQueue } from '@/server/modules/financing/accreditation'

// GET /api/admin/financing/gate — THE GATE review queue (financing +
// accreditation requests in SUBMITTED/UNDER_PLATFORM_REVIEW/RETURNED).
// ?type=FINANCING|ACCREDITATION (default: both). Status + search + pagination.
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error
  try {
    const sp = req.nextUrl.searchParams
    const type = sp.get('type') ?? 'ALL'
    const page = Number(sp.get('page')) || 1
    const limit = Number(sp.get('limit')) || 20
    const status = sp.get('status') ?? undefined
    const search = sp.get('q') ?? sp.get('search') ?? undefined

    if (type === 'FINANCING') {
      const financing = await adminGateQueue({ status, search, page, limit })
      return NextResponse.json({ financing, accreditation: { requests: [], total: 0, page, limit } })
    }
    if (type === 'ACCREDITATION') {
      const accreditation = await adminAccreditationQueue({ status, search, page, limit })
      return NextResponse.json({ financing: { requests: [], total: 0, page, limit }, accreditation })
    }
    const [financing, accreditation] = await Promise.all([
      adminGateQueue({ status, search, page, limit }),
      adminAccreditationQueue({ status, search, page, limit }),
    ])
    return NextResponse.json({ financing, accreditation })
  } catch (err) {
    console.error('admin gate queue error', err)
    return NextResponse.json({ error: 'Failed to load the gate queue' }, { status: 500 })
  }
}
