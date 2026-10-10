import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import { supplierFinancingInbox } from '@/server/modules/rfq/supplier-financing'
import { RfqServiceError } from '@/server/modules/rfq/service'

export const dynamic = 'force-dynamic'

// GET /api/supplier-rfqs/inbox?organizationId=… — financing-linked RFQs the
// company may quote on (accredited pool; minimum-disclosure payloads only).
export async function GET(req: NextRequest) {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const organizationId = req.nextUrl.searchParams.get('organizationId') || ''
    if (!organizationId) return NextResponse.json({ rfqs: [] })
    const rfqs = await supplierFinancingInbox(user!.id, organizationId)
    return NextResponse.json({ rfqs })
  } catch (err) {
    if (err instanceof RfqServiceError) {
      return NextResponse.json({ error: err.message, code: 'DENIED' }, { status: err.status })
    }
    console.error('supplier inbox GET error', err)
    return NextResponse.json({ error: 'Failed to load supplier inbox' }, { status: 500 })
  }
}
