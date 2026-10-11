import { NextResponse } from 'next/server'
import { requireUser } from '@/server/guards'
import {
  sellerCommissionView,
  CommissionServiceError,
} from '@/server/modules/commission/service'

// GET /api/seller/commission — supplier transparency: their commission
// obligations, statements and invoices (what the platform earned on their
// delivered orders and what is still open).
export async function GET() {
  const { user, error } = await requireUser()
  if (error) return error
  try {
    const view = await sellerCommissionView(user!.id)
    return NextResponse.json(view)
  } catch (err) {
    if (err instanceof CommissionServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('seller commission GET error', err)
    return NextResponse.json({ error: 'Failed to load commission data' }, { status: 500 })
  }
}
