import type { View, ViewParams } from '@/store/marketplace'

/**
 * URL ↔ view mapping for the marketplace SPA.
 * Every view is addressable so links are shareable, refresh-safe and the
 * browser back/forward buttons work. The SPA lives under /market
 * (pagedesign.md Phase 0); state lives in query params on /market.
 *
 *   /market                           → market home (shop)
 *   /market?view=catalog&category=…   → catalog filtered by category
 *   /market?view=catalog&q=…         → catalog search results
 *   /market?view=product&id=<cuid>   → product detail
 *   /market?view=store&id=<sellerId> → seller public storefront
 *   /market?view=cart | checkout | orders | favorites | account | admin
 *   /market?view=seller&tab=orders    → seller dashboard tab
 *   /market?view=rfqs | business      → B2B: requests for quote / business account
 *   /market?view=account&tab=profile  → buyer account console, Profile & Security tab
 *   /market?view=financing&section=documents → financing console, documents vault
 *
 * Legacy deep links on / (?view=…) are 301'd to /market by src/middleware.ts.
 */

const VIEWS = new Set<View>([
  'home',
  'catalog',
  'product',
  'store',
  'cart',
  'checkout',
  'orders',
  'favorites',
  'seller',
  'account',
  'admin',
  'rfqs',
  'business',
  'financing',
  'financier',
  'forgot-password',
  'reset-password',
  'verify-email',
])

/** Serialize a view + params into a query string (no leading "?"). */
export function viewToQuery(view: View, params: ViewParams = {}): string {
  const sp = new URLSearchParams()
  if (view !== 'home') sp.set('view', view)
  if (view === 'product' && params.productId) sp.set('id', params.productId)
  if (view === 'store' && params.sellerId) sp.set('id', params.sellerId)
  if (view === 'catalog') {
    if (params.category) sp.set('category', params.category)
    if (params.query) sp.set('q', params.query)
  }
  if (view === 'seller' && params.sellerTab) sp.set('tab', params.sellerTab)
  if (view === 'admin' && params.adminTab) sp.set('tab', params.adminTab)
  if (view === 'account' && params.accountTab) sp.set('tab', params.accountTab)
  if (view === 'rfqs' && params.rfqId) sp.set('rfq', params.rfqId)
  if (view === 'rfqs' && params.scheduleId) sp.set('schedule', params.scheduleId)
  if (view === 'seller' && params.disputeId) sp.set('dispute', params.disputeId)
  if (view === 'financing' && params.requestId) sp.set('request', params.requestId)
  if (view === 'financing' && params.financingSection) sp.set('section', params.financingSection)
  if (view === 'financing' && params.financingWizard) sp.set('wizard', params.financingWizard)
  if ((view === 'reset-password' || view === 'verify-email') && params.authToken) sp.set('token', params.authToken)
  const qs = sp.toString()
  return qs
}

/** Build the full href (with or without search params) under /market. */
export function viewToHref(view: View, params: ViewParams = {}): string {
  const qs = viewToQuery(view, params)
  return qs ? `/market?${qs}` : '/market'
}

export interface LocationState {
  view: View
  params: ViewParams
}

/** Parse the current window location into view + params. */
export function parseLocation(href: string = typeof window !== 'undefined' ? window.location.href : ''): LocationState {
  try {
    const url = new URL(href, 'http://localhost')
    const sp = url.searchParams
    const rawView = sp.get('view')
    const view = (rawView && VIEWS.has(rawView as View) ? rawView : 'home') as View
    const params: ViewParams = {}
    const id = sp.get('id')
    if (view === 'product' && id) params.productId = id
    if (view === 'store' && id) params.sellerId = id
    if (view === 'catalog') {
      const category = sp.get('category')
      const q = sp.get('q')
      if (category) params.category = category
      if (q) params.query = q
    }
    if (view === 'seller') {
      const tab = sp.get('tab')
      if (tab) params.sellerTab = tab
    }
    if (view === 'admin') {
      const tab = sp.get('tab')
      if (tab) params.adminTab = tab
    }
    if (view === 'account') {
      const tab = sp.get('tab')
      if (tab) params.accountTab = tab
    }
    if (view === 'rfqs') {
      const rfq = sp.get('rfq')
      if (rfq) params.rfqId = rfq
      const schedule = sp.get('schedule')
      if (schedule) params.scheduleId = schedule
    }
    if (view === 'seller') {
      const dispute = sp.get('dispute')
      if (dispute) params.disputeId = dispute
    }
    if (view === 'financing') {
      const request = sp.get('request')
      if (request) params.requestId = request
      const section = sp.get('section')
      if (section) params.financingSection = section
      const wizard = sp.get('wizard')
      if (wizard) params.financingWizard = wizard
    }
    if (view === 'reset-password' || view === 'verify-email') {
      const token = sp.get('token')
      if (token) params.authToken = token
    }
    return { view, params }
  } catch {
    return { view: 'home', params: {} }
  }
}
