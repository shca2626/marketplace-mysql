import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { adminListPayments, checkoutMethods, getPaymentsConfig } from '@/server/modules/payments/service'

// GET /api/admin/payments — money settlement console: every payment with its
// order + buyer context, filterable by status/method/search.
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error
  try {
    const sp = req.nextUrl.searchParams
    const result = await adminListPayments({
      q: sp.get('q') ?? undefined,
      status: sp.get('status') ?? undefined,
      method: sp.get('method') ?? undefined,
      page: parseInt(sp.get('page') || '1') || 1,
      limit: parseInt(sp.get('limit') || '20') || 20,
    })
    return NextResponse.json(result)
  } catch (err) {
    console.error('admin payments GET error', err)
    return NextResponse.json({ error: 'Failed to load payments' }, { status: 500 })
  }
}
