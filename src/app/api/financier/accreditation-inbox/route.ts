import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/server/guards'
import { financingError } from '@/lib/financing-api'
import { listFinancierInbox } from '@/server/modules/financing/accreditation'
import { ACCREDITATION_REQUEST_STATUSES } from '@/server/modules/financing/types'

// GET /api/financier/accreditation-inbox — accreditation requests of my
// financier organizations (post-gate only, R-4 — service-enforced).
export async function GET(req: NextRequest) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const sp = req.nextUrl.searchParams
    const status = sp.get('status') ?? undefined
    if (status && !(ACCREDITATION_REQUEST_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json({ error: 'Unknown accreditation status filter' }, { status: 400 })
    }
    const result = await listFinancierInbox(user, {
      status: status as (typeof ACCREDITATION_REQUEST_STATUSES)[number],
      page: parseInt(sp.get('page') || '1') || 1,
    })
    return NextResponse.json(result)
  } catch (err) {
    return financingError(err, 'load the accreditation inbox')
  }
}
