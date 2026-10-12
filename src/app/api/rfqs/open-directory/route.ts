import { NextResponse } from 'next/server'
import { requireModule } from '@/server/guards'
import { openRfqDirectory, RfqServiceError } from '@/server/modules/rfq/service'

// GET /api/rfqs/open-directory — SELLER-facing "Open Requests" board (STAB-6):
// live RFQs carrying free-form (productId=null) lines, ranked by keyword match
// against the seller's ACTIVE catalog. Admins get an empty list (they use the
// admin monitor, same as the inbox route).
//
// MODULE GATE: the `rfq` module must be enabled for the caller's context —
// requireModule resolves the caller's org chains (union) so an org-type flip
// steers only that org's people, and unknown keys fail CLOSED.
export async function GET() {
  const { user, error } = await requireModule('rfq')
  if (error) return error
  try {
    if (user!.role !== 'SELLER') {
      return NextResponse.json({ rfqs: [] })
    }
    const rfqs = await openRfqDirectory(user!.id)
    return NextResponse.json({ rfqs })
  } catch (err) {
    if (err instanceof RfqServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('rfq open-directory GET error', err)
    return NextResponse.json({ error: 'Failed to load open requests' }, { status: 500 })
  }
}
