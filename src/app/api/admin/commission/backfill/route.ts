import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import {
  backfillCommissionObligations,
  CommissionServiceError,
} from '@/server/modules/commission/service'

// POST /api/admin/commission/backfill — create obligations for orders that
// were DELIVERED before this module existed (idempotent).
export async function POST() {
  const { user, error } = await requireAdmin('payouts.manage')
  if (error) return error
  try {
    const result = await backfillCommissionObligations(user!.id)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof CommissionServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('commission backfill error', err)
    return NextResponse.json({ error: 'Backfill failed' }, { status: 500 })
  }
}
