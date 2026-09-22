import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { sellerEarnings } from '@/server/modules/payouts/service'

// GET /api/seller/earnings — the signed-in vendor's settlement summary:
// pending (settled-eligible) revenue, commission rate, lifetime payouts and
// the last 10 payout batches.
export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Please sign in first' }, { status: 401 })
    if (user.role !== 'SELLER' && user.role !== 'ADMIN')
      return NextResponse.json({ error: 'Seller access required' }, { status: 403 })

    const earnings = await sellerEarnings(user.id)
    return NextResponse.json(earnings)
  } catch (err) {
    console.error('seller earnings GET error', err)
    return NextResponse.json({ error: 'Failed to load earnings' }, { status: 500 })
  }
}
