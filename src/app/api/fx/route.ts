import { NextResponse } from 'next/server'
import { listActiveCurrencies, adminListRates } from '@/server/modules/currencies/service'

// GET /api/fx — public display-conversion surface: the active currency list
// + the latest authoritative rate per pair (Phase 7.2). Read-only; used by
// the storefront price switcher. Admin management lives under /api/admin/fx.
export async function GET() {
  try {
    const [currencies, { current }] = await Promise.all([listActiveCurrencies(), adminListRates({ limit: 1 })])
    return NextResponse.json(
      { currencies, rates: current },
      { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } }
    )
  } catch (err) {
    console.error('fx GET error', err)
    return NextResponse.json({ error: 'Failed to load exchange rates' }, { status: 500 })
  }
}
