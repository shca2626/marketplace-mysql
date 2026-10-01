import { NextRequest, NextResponse } from 'next/server'

// ─────────────────────────────────────────────────────────────────────────────
// LEGACY SPA → REAL-URL REDIRECTS (pagedesign.md §3 / §8, Phases 0 + 2)
//
// The marketplace started as a single-route SPA driven by `?view=` params.
// pagedesign Phase 0 moved it to /market; Phase 2 extracts the three public
// SEO surfaces to real server-rendered routes:
//
//   /market?view=product&id=X  → 301 /market/product/X   (product detail page)
//   /market?view=store&id=X    → 301 /market/store/X      (seller storefront page)
//   /market?view=catalog&…    → untouched (SPA catalog stays the full
//                               browsing surface — filters/search/pagination)
//
// Legacy deep links on / (?view=…) still 307 to the same view under /market
// (307 during development so browsers don't hard-cache; the /market param →
// real-URL map below is already permanent → 301).
// ─────────────────────────────────────────────────────────────────────────────

/** Matched pathnames only (query-insensitive). */
export const config = {
  matcher: ['/', '/market'],
}

export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl

  // ── Legacy: /?view=… → /market?view=… (pagedesign Phase 0) ──
  // Plain `/` (no view param) is NOT redirected — it is the platform homepage.
  if (pathname === '/') {
    if (!searchParams.has('view')) return NextResponse.next()
    const url = req.nextUrl.clone()
    url.pathname = '/market'
    return NextResponse.redirect(url, 307)
  }

  // ── Phase 2: /market?view=product|store&id=… → real server-rendered URLs ──
  if (pathname === '/market') {
    const view = searchParams.get('view')
    if ((view === 'product' || view === 'store') && searchParams.has('id')) {
      const id = searchParams.get('id')
      if (id) {
        const url = req.nextUrl.clone()
        url.pathname = `/market/${view}/${id}`
        // view + id are consumed by the real route; anything else the caller
        // attached (utm_*, etc.) is preserved.
        const rest = new URLSearchParams(searchParams)
        rest.delete('view')
        rest.delete('id')
        const qs = rest.toString()
        url.search = qs ? `?${qs}` : ''
        return NextResponse.redirect(url, 301)
      }
    }
  }

  return NextResponse.next()
}
