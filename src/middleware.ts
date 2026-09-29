import { NextRequest, NextResponse } from 'next/server'

// ─────────────────────────────────────────────────────────────────────────────
// LEGACY SPA REDIRECT (pagedesign.md §8, Phase 0)
//
// Before the multi-page split, the entire marketplace lived at `/` behind
// `?view=…` query params. The SPA now lives at /market, so any legacy deep
// link (bookmarks, shared URLs, email links: /?view=product&id=…) must land
// on the same view under /market.
//
// Plain `/` (no view param) is NOT redirected — it is the new platform
// homepage rendered by src/app/(site)/page.tsx.
//
// 307 (temporary) is used during development so browsers don't hard-cache
// the redirect; switch to 308 (permanent, method-preserving) at launch for
// SEO once the URL scheme is frozen.
// ─────────────────────────────────────────────────────────────────────────────

export function middleware(req: NextRequest) {
  if (!req.nextUrl.searchParams.has('view')) return NextResponse.next()

  const url = req.nextUrl.clone()
  url.pathname = '/market'
  return NextResponse.redirect(url, 307)
}

// Matcher matches the PATHNAME only (query-insensitive), so this runs for
// every visit to `/` — the has('view') guard above keeps plain visits intact.
export const config = {
  matcher: '/',
}
