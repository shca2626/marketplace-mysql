import { NextResponse } from 'next/server'
import { resolveModuleState } from '@/server/modules/modules/service'

// GET /api/modules — public platform-scope module state for the storefront.
// Powers nav/section gating for signed-out visitors (funding hub link,
// comparison tray, reviews, insights, solutions). No secrets — just booleans.
// Cached at the CDN edge for a minute; the resolver itself is memory-cached.
export async function GET() {
  try {
    const state = await resolveModuleState({})
    const enabled = Object.keys(state).filter((k) => state[k])
    return NextResponse.json(
      { modules: enabled },
      { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } }
    )
  } catch (err) {
    console.error('modules GET error', err)
    // Fail open — the storefront stays whole when module resolution breaks.
    return NextResponse.json({ modules: [] })
  }
}
