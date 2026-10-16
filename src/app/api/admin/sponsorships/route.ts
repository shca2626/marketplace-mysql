import { NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { listAllSponsorships, SponsorshipError } from '@/server/modules/sponsorships/service'

// GET /api/admin/sponsorships — the Monetization → Sponsorships console:
// every placement (revenue rows live on the immutable fee ledger, event
// SPONSORSHIP; this view shows the operational state of the placements).
export async function GET() {
  const { error } = await requireAdmin('payouts.view')
  if (error) return error
  try {
    const placements = await listAllSponsorships()
    const active = placements.filter((p) => p.status === 'ACTIVE').length
    const revenue = placements
      .filter((p) => p.status !== 'CANCELLED')
      .reduce((sum, p) => sum + p.amount, 0)
    return NextResponse.json({
      placements,
      stats: { total: placements.length, active, revenue: Math.round(revenue * 100) / 100 },
    })
  } catch (err) {
    if (err instanceof SponsorshipError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('admin sponsorships GET error', err)
    return NextResponse.json({ error: 'Failed to load sponsorships' }, { status: 500 })
  }
}
