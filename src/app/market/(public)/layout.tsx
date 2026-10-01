import { MarketPublicShell } from '@/components/market/pages/market-public-shell'

/**
 * Layout for the REAL public market routes (pagedesign.md Phase 2):
 *
 *   /market/product/[id]     — server-rendered product detail
 *   /market/store/[id]      — server-rendered seller storefront
 *   /market/category/[slug]  — server-rendered category landing page
 *
 * The route group `(public)` keeps this chrome OFF the /market SPA itself
 * (src/app/market/page.tsx renders MarketplaceApp which brings its own
 * identical storefront chrome) while giving the new server pages the exact
 * same wrapper: platform strip → market header (search/categories/cart) →
 * content → market footer. Navigation stays consistent across the boundary.
 *
 * Sticky-footer rules: min-h-screen flex-col shell in MarketPublicShell with
 * main flex-1 — footer sits at the bottom on short pages, pushed down on
 * long ones.
 */
export default function MarketPublicLayout({ children }: { children: React.ReactNode }) {
  return <MarketPublicShell>{children}</MarketPublicShell>
}
