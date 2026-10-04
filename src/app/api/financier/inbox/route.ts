import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/server/guards'
import { financingError } from '@/lib/financing-api'
import { listFinancierInbox } from '@/server/modules/financing/requests'
import { FINANCING_REQUEST_STATUSES } from '@/server/modules/financing/types'

// GET /api/financier/inbox — the financing request inbox for the financier
// organizations I belong to. R-4 STRUCTURAL: only post-gate requests are
// ever listed; asking for a pre-forward status is refused by the service.
export async function GET(req: NextRequest) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const sp = req.nextUrl.searchParams
    const status = sp.get('status') ?? undefined
    if (status && !(FINANCING_REQUEST_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json({ error: 'Unknown request status filter' }, { status: 400 })
    }
    const result = await listFinancierInbox(user, {
      status: status as (typeof FINANCING_REQUEST_STATUSES)[number],
      page: parseInt(sp.get('page') || '1') || 1,
    })
    return NextResponse.json(result)
  } catch (err) {
    return financingError(err, 'load the financier inbox')
  }
}
