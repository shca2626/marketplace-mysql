import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { adminListRates, listActiveCurrencies, CurrencyServiceError } from '@/server/modules/currencies/service'

// GET /api/admin/fx — the FX console data: current rates per pair + history
// + the currency list (Phase 7.2). Query: ?base=USD&quote=YER&limit=60.
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin('pricing.view')
  if (error) return error
  try {
    const sp = req.nextUrl.searchParams
    const [{ current, history }, currencies] = await Promise.all([
      adminListRates({ base: sp.get('base') ?? undefined, quote: sp.get('quote') ?? undefined, limit: parseInt(sp.get('limit') || '60') || 60 }),
      listActiveCurrencies(),
    ])
    return NextResponse.json({ currencies, current, history })
  } catch (err) {
    if (err instanceof CurrencyServiceError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('admin fx GET error', err)
    return NextResponse.json({ error: 'Failed to load FX console' }, { status: 500 })
  }
}
