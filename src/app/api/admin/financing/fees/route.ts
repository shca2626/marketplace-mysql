import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { adminListFees } from '@/server/modules/financing/agreements'

// GET /api/admin/financing/fees — the fee console: FinancingFee rows with
// agreement context (ACCRUED → INVOICED → PAID mirrors the Payout console).
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin('financing.fees.manage')
  if (error) return error
  try {
    const sp = req.nextUrl.searchParams
    const fees = await adminListFees({ status: sp.get('status') ?? undefined })
    return NextResponse.json({ fees })
  } catch (err) {
    console.error('admin fees error', err)
    return NextResponse.json({ error: 'Failed to load the fees' }, { status: 500 })
  }
}
