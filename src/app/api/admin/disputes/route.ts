import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { adminListDisputes, DisputeServiceError } from '@/server/modules/rfq/disputes'

// GET /api/admin/disputes?status= — the admin mediation queue.
// status filter: OPEN | SELLER_RESPONDED | ESCALATED | RESOLVED | CANCELLED | ALL

export async function GET(req: NextRequest) {
  const { user, error } = await requireAdmin()
  if (error) return error
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') ?? undefined
    const disputes = await adminListDisputes(status ?? undefined)
    return NextResponse.json({ disputes })
  } catch (err) {
    if (err instanceof DisputeServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin disputes GET error', err)
    return NextResponse.json({ error: 'Failed to load dispute queue' }, { status: 500 })
  }
}
