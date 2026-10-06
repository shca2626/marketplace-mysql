import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { reconcileRevenue, financierCommissionOverview, resolveRange } from '@/server/modules/fees/revenue'

// GET /api/admin/fees/reconcile?from&to — the Phase 11.3 revenue console
// payload: the FeeAssessment ledger reconciled to the cent against payout
// commissions, financing success fees and paid subscription invoices, plus the
// financier commission overview (custom FINANCING_SUCCESS rules vs the platform
// default). Per-currency subtotals only — never summed across currencies.
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin('payouts.view')
  if (error) return error
  try {
    const sp = req.nextUrl.searchParams
    const range = resolveRange(sp.get('from'), sp.get('to'))
    const [reconcile, financiers] = await Promise.all([
      reconcileRevenue(range),
      financierCommissionOverview(range),
    ])
    return NextResponse.json({ reconcile, financiers })
  } catch (err) {
    console.error('admin fees reconcile GET error', err)
    return NextResponse.json({ error: 'Failed to reconcile revenue' }, { status: 500 })
  }
}
