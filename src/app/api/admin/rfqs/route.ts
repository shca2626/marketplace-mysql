import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { adminListRfqs, RfqServiceError } from '@/server/modules/rfq/service'

// GET /api/admin/rfqs — platform-wide RFQ monitor (filterable)
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error
  try {
    const { searchParams } = new URL(req.url)
    const rfqs = await adminListRfqs({
      status: searchParams.get('status') ?? undefined,
      search: searchParams.get('search') ?? undefined,
    })
    return NextResponse.json({ rfqs })
  } catch (err) {
    if (err instanceof RfqServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin rfqs GET error', err)
    return NextResponse.json({ error: 'Failed to load RFQs' }, { status: 500 })
  }
}
