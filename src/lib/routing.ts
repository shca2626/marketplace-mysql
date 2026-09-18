import type { View, ViewParams } from '@/store/marketplace'

/**
 * URL ↔ view mapping for the single-route SPA.
 * Every view is addressable so links are shareable, refresh-safe and the
 * browser back/forward buttons work. All state lives in query params on `/`.
 *
 *   /                                → home
 *   /?view=catalog&category=fashion  → catalog filtered by category
 *   /?view=catalog&q=headphones      → catalog search results
 *   /?view=product&id=<cuid>         → product detail
 *   /?view=store&id=<sellerId>       → seller public storefront
 *   /?view=cart | checkout | orders | favorites | account
 *   /?view=seller&tab=orders         → seller dashboard tab
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
  const qs = sp.toString()
  return qs
}

/** Build the full href (with or without search params). */
export function viewToHref(view: View, params: ViewParams = {}): string {
  const qs = viewToQuery(view, params)
  return qs ? `/?${qs}` : '/'
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
    return { view, params }
  } catch {
    return { view: 'home', params: {} }
  }
}
