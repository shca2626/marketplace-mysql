import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { buyerRefunds } from '@/server/modules/refunds/service'

// GET /api/refunds — the signed-in buyer's refund history (Phase 7.7.3):
// obligation + execution states with item-level allocations.
export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const refunds = await buyerRefunds(user.id)
    return NextResponse.json({ refunds })
  } catch (err) {
    console.error('refunds GET error', err)
    return NextResponse.json({ error: 'Failed to load refunds' }, { status: 500 })
  }
}
