import { NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { sellerRfqInbox, RfqServiceError } from '@/server/modules/rfq/service'

// GET /api/rfqs/inbox — SELLER-facing inbox: open RFQs that reference my
// catalog products, with my-quote state. Admins get an empty list (they use
// the admin monitor).
export async function GET() {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    if (user!.role !== 'SELLER') {
      return NextResponse.json({ rfqs: [] })
    }
    const rfqs = await sellerRfqInbox(user!.id)
    return NextResponse.json({ rfqs })
  } catch (err) {
    if (err instanceof RfqServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('rfq inbox GET error', err)
    return NextResponse.json({ error: 'Failed to load quote requests' }, { status: 500 })
  }
}
