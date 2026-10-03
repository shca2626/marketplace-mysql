import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { listMyOffers } from '@/server/modules/catalog/offers'

// GET /api/offers/mine — the signed-in seller's offers across the whole
// catalog (their console "My offers" surface), with product context.
export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Please sign in first' }, { status: 401 })
    const offers = await listMyOffers(user.id)
    return NextResponse.json({ offers })
  } catch (err) {
    console.error('my offers GET error', err)
    return NextResponse.json({ error: 'Failed to load your offers' }, { status: 500 })
  }
}
