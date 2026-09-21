import { NextResponse } from 'next/server'
import { getStorefrontSettings, getActiveSlides } from '@/lib/settings/server'

// GET /api/settings — public storefront configuration.
// Returns the effective settings (defaults when nothing stored) plus the
// ACTIVE banner slides in display order. Cached server-side (5 min TTL,
// busted on every admin write).
export async function GET() {
  try {
    const [settings, slides] = await Promise.all([getStorefrontSettings(), getActiveSlides()])
    return NextResponse.json({ settings, slides })
  } catch (err) {
    console.error('[api/settings] failed', err)
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 })
  }
}
