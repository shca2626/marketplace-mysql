import { NextResponse } from 'next/server'
import { getPublicCurrencies } from '@/server/modules/currency/service'

// GET /api/settings/currency — public: active display currencies + live rates.
// The storefront bootstraps its currency switcher from this payload; rates
// refresh themselves in the background when stale (see service).
export async function GET() {
  try {
    const payload = await getPublicCurrencies()
    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
    })
  } catch (err) {
    console.error('[api/settings/currency] failed', err)
    return NextResponse.json({ error: 'Failed to load currencies' }, { status: 500 })
  }
}
