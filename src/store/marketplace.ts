import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { CartItem, ProductDTO, ProductOfferSummaryDTO, ProductVariantDTO, SessionUser } from '@/lib/types'
import type { StorefrontSettings, BannerSlideDTO } from '@/lib/settings/schema'
import { DEFAULT_STOREFRONT_SETTINGS } from '@/lib/settings/schema'
import { parseLocation, viewToQuery } from '@/lib/routing'
import {
  DEFAULT_DISPLAY_CURRENCY,
  setActiveCurrency as setLibActiveCurrency,
  type DisplayCurrency,
} from '@/lib/currency'

// ── Pre-hydration write gate ─────────────────────────────────────────────────
// The persist middleware serializes partialized state on EVERY set(). Child
// effects run BEFORE the root component's rehydrate() (child-first ordering),
// so an early set() (e.g. ProductView's trackView, setSpaActive) writes the
// initial EMPTY cart over the persisted one before it is ever read — the
// "cart resets on every reload" bug. Writes are deferred until rehydrate
// completes; the last deferred write is flushed when the gate opens.
type HydrationGlobals = typeof globalThis & { __vendoraStoreHydrated?: boolean; __vendoraPendingWrite?: [string, string] | null }
const g = () => globalThis as HydrationGlobals
const isStoreHydrated = () => g().__vendoraStoreHydrated === true

/** Opens the write gate and flushes the deferred write (call after rehydrate). */
export const markStoreHydrated = () => {
  g().__vendoraStoreHydrated = true
  const pending = g().__vendoraPendingWrite
  g().__vendoraPendingWrite = null
  if (pending && typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(pending[0], pending[1])
    } catch {
      /* storage full/unavailable — same as any dropped write */
    }
  }
}

const gatedStorage = createJSONStorage(() => ({
  getItem: (name: string) => window.localStorage.getItem(name),
  setItem: (name: string, value: string) => {
    if (!isStoreHydrated()) {
      g().__vendoraPendingWrite = [name, value]
      return
    }
    window.localStorage.setItem(name, value)
  },
  removeItem: (name: string) => window.localStorage.removeItem(name),
}))

/**
 * Cart lines are keyed by product, variant AND offer: the same product from
 * two different companies (two offers) is two independent lines.
 * Legacy persisted carts (no variantId/offerId) keep the plain productId key.
 */
export const cartLineKey = (productId: string, variantId?: string | null, offerId?: string | null) =>
  offerId
    ? `${productId}::o:${offerId}${variantId ? `::v:${variantId}` : ''}`
    : variantId
      ? `${productId}::${variantId}`
      : productId

export type View =
  | 'home'
  | 'catalog'
  | 'product'
  | 'store'
  | 'brands' // the brands directory (all brands | one brand's products)
  | 'cart'
  | 'checkout'
  | 'orders'
  | 'favorites'
  | 'seller'
  | 'account'
  | 'admin'
  | 'rfqs'
  | 'business'
  | 'complaints' // COMPLAINT-1: buyer console — my complaints & trust reports
  | 'financing' // applicant surface: financing requests + accreditation + documents center
  | 'financier' // financier console: services, inbox, offers, accreditations
  | 'forgot-password' // AUTHSEC-1: email → reset link
  | 'reset-password' // AUTHSEC-1: token + new password
  | 'verify-email' // AUTHSEC-1: token consumption landing
  | 'register-company' // Merchant/Dealer company registration wizard (5 steps)
  | 'register-financier' // financier application door (admin-approved)
  | 'myfinancing' // legacy applicant financing alias (deep links)

export interface ViewParams {
  productId?: string
  category?: string
  query?: string
  sellerId?: string
  sellerTab?: string
  adminTab?: string // admin console: active sidebar section (?view=admin&tab=…)
  rfqId?: string
  quoteId?: string
  disputeId?: string // seller dashboard: open a specific dispute
  scheduleId?: string // buyer RFQ view: open a specific recurring schedule
  requestId?: string // financing view: open a specific financing/accreditation request
  financingSection?: string // financing view: boot on a specific section (overview | services | requests | accreditation | documents | agreements)
  financingWizard?: string // financing view: reopen the application wizard for a service (?view=financing&wizard=<serviceId>) — survives reloads/back
  accountTab?: string // buyer account console: open a specific tab (?view=account&tab=profile — IA-100)
  authToken?: string // AUTHSEC-1: raw token from reset/verify email links
  financierTab?: string // financier console: boot on a specific section (requests | accreditations | …)
  brandSlug?: string // brands view: one brand's product listing (?view=brands&brand=…)
  myfinancingTab?: string // my-financing view: boot on a specific tab
  financingTab?: string // financing view: deep-link a section (mirror of financingSection)
}

export interface ApplySettingsPayload {
  settings?: StorefrontSettings
  slides?: BannerSlideDTO[]
}

interface MarketplaceState {
  view: View
  params: ViewParams
  user: SessionUser | null
  authChecked: boolean
  /** True while the marketplace SPA (/market) is mounted — lets navigate()
   *  work from OUTSIDE the SPA (platform pages like the homepage) by
   *  falling back to a full page navigation to /market?… (pagedesign Phase 0). */
  spaActive: boolean
  setSpaActive: (v: boolean) => void
  cart: CartItem[]
  savedForLater: CartItem[]
  cartOpen: boolean
  authModalOpen: boolean
  authMode: 'login' | 'register'
  afterAuth: { view: View; params?: ViewParams } | null
  recentlyViewed: string[]
  settings: StorefrontSettings // live storefront configuration (boot + admin saves)
  slides: BannerSlideDTO[] // active hero slides (boot + admin saves)

  navigate: (view: View, params?: ViewParams) => void
  applyLocation: (location?: { view: View; params?: ViewParams }) => void
  applySettings: (payload: ApplySettingsPayload) => void
  setUser: (user: SessionUser | null) => void
  setAuthChecked: (v: boolean) => void
  trackView: (productId: string) => void
  clearRecentlyViewed: () => void
  addToCart: (
    product: ProductDTO,
    quantity?: number,
    variant?: ProductVariantDTO | null,
    offer?: ProductOfferSummaryDTO | null
  ) => { ok: boolean; message: string }
  updateQuantity: (lineId: string, quantity: number) => void
  removeFromCart: (lineId: string) => void
  saveForLater: (lineId: string) => void
  moveToCart: (lineId: string) => { ok: boolean; message: string }
  removeFromSaved: (lineId: string) => void
  clearCart: () => void
  setCartOpen: (open: boolean) => void
  // ── Compare tray + dialog (up to 4 products side by side) ──
  compareItems: ProductDTO[]
  compareOpen: boolean
  setCompareOpen: (open: boolean) => void
  /** Toggle a product in the compare set (cap 4). Returns ok:false + a
   *  message when the cap is hit (callers toast it). */
  toggleCompare: (product: ProductDTO) => { ok: boolean; message?: string }
  removeFromCompare: (productId: string) => void
  clearCompare: () => void
  /** Sign-out sweep: cart + saved + recently-viewed + compare — every
   *  user-scoped commerce line is dropped in one call (C-1). */
  clearUserCommerceState: () => void
  // ── Dynamic display currency (rates from /api/settings/currency —
  // DB-backed, live-refreshed). `activeCurrency` drives formatUSD()/formatMoney()
  // globally via the module state in src/lib/currency.ts. ──
  currencyPref: string | null // persisted preferred code (null = USD base)
  currencyReady: boolean
  currencyList: DisplayCurrency[]
  activeCurrency: DisplayCurrency
  currencyBase: string
  lastRefreshedAt: string | null
  initCurrency: () => Promise<void>
  setActiveCurrencyCode: (code: string) => void
  openAuth: (mode?: 'login' | 'register', after?: { view: View; params?: ViewParams }) => void
  closeAuth: () => void
  setAuthMode: (mode: 'login' | 'register') => void
  cartCount: () => number
  cartSubtotal: () => number
}

export const useMarketplace = create<MarketplaceState>()(
  persist(
    (set, get) => ({
      view: 'home',
      params: {},
      user: null,
      authChecked: false,
      spaActive: false,
      setSpaActive: (v) => set({ spaActive: v }),
      cart: [],
      savedForLater: [],
      cartOpen: false,
      authModalOpen: false,
      authMode: 'login',
      afterAuth: null,
      recentlyViewed: [],
      settings: structuredClone(DEFAULT_STOREFRONT_SETTINGS),
      slides: [],

      navigate: (view, params = {}) => {
        set({ view, params, cartOpen: false })
        // Keep the address bar in sync so views are deep-linkable/shareable.
        // The SPA is rooted at /market (pagedesign.md Phase 0).
        if (typeof window !== 'undefined') {
          const qs = viewToQuery(view, params)
          const base = '/market'
          const next = qs ? `${base}?${qs}` : base
          // Outside the SPA (e.g. a ProductCard on the platform homepage):
          // a pushState would only change the URL without rendering the
          // market — so do a full navigation and let /market boot with the
          // deep-linked view.
          if (!get().spaActive) {
            window.location.assign(next)
            return
          }
          if (window.location.search !== (qs ? `?${qs}` : '') || window.location.pathname !== base) {
            window.history.pushState({}, '', next)
          }
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }
      },

      // Apply a location WITHOUT pushing a new history entry
      // (used on initial boot and on browser back/forward popstate)
      applyLocation: (location) => {
        const { view, params } = location ?? parseLocation()
        set({ view, params, cartOpen: false })
      },

      setUser: (user) => set({ user }),
      setAuthChecked: (v) => set({ authChecked: v }),

      // Live storefront configuration — applied at boot (/api/settings) and
      // after every admin settings save; never persisted (server is truth).
      applySettings: (payload) =>
        set({
          ...(payload.settings ? { settings: payload.settings } : {}),
          ...(payload.slides ? { slides: payload.slides } : {}),
        }),

      trackView: (productId) =>
        set((state) => ({
          recentlyViewed: [
            productId,
            ...state.recentlyViewed.filter((id) => id !== productId),
          ].slice(0, 10),
        })),

      clearRecentlyViewed: () => set({ recentlyViewed: [] }),

      addToCart: (product, quantity = 1, variant = null, offer = null) => {
        const lineId = cartLineKey(product.id, variant?.id, offer?.id)
        const stock = offer ? offer.stock : (variant?.stock ?? product.stock)
        const price = offer ? offer.price : (variant?.price ?? product.price)
        const existing = get().cart.find((i) => cartLineKey(i.productId, i.variantId, i.offerId) === lineId)
        const currentQty = existing?.quantity ?? 0
        const nextQty = currentQty + quantity
        if (nextQty > stock) {
          return { ok: false, message: `Only ${stock} in stock` }
        }
        if (existing) {
          set({
            cart: get().cart.map((i) =>
              cartLineKey(i.productId, i.variantId, i.offerId) === lineId ? { ...i, quantity: nextQty, stock, price } : i
            ),
          })
        } else {
          const item: CartItem = {
            productId: product.id,
            title: product.title,
            price,
            image: product.images[0] ?? null,
            stock,
            quantity: nextQty,
            sellerId: product.sellerId,
            sellerName: offer?.sellerOrgName ?? product.seller?.storeName ?? product.seller?.name ?? null,
            variantId: variant?.id ?? null,
            variantLabel: variant?.name ?? null,
            sku: variant?.sku ?? product.sku ?? null,
            offerId: offer?.id ?? null,
            sellerOrgId: offer?.sellerOrgId ?? null,
            sellerOrgName: offer?.sellerOrgName ?? null,
            leadTimeDays: offer?.processingDays ?? null,
          }
          set({ cart: [...get().cart, item] })
        }
        return { ok: true, message: 'Added to cart' }
      },

      updateQuantity: (lineId, quantity) =>
        set({
          cart: get()
            .cart.map((i) => (cartLineKey(i.productId, i.variantId, i.offerId) === lineId ? { ...i, quantity } : i))
            .filter((i) => i.quantity > 0),
        }),

      removeFromCart: (lineId) =>
        set({ cart: get().cart.filter((i) => cartLineKey(i.productId, i.variantId, i.offerId) !== lineId) }),

      // ── Save for later: park an item outside the active cart (still persisted).
      // Shipping progress + checkout only ever see the active cart.
      saveForLater: (lineId) => {
        const item = get().cart.find((i) => cartLineKey(i.productId, i.variantId, i.offerId) === lineId)
        if (!item) return
        set({
          cart: get().cart.filter((i) => cartLineKey(i.productId, i.variantId, i.offerId) !== lineId),
          savedForLater: [item, ...get().savedForLater.filter((i) => cartLineKey(i.productId, i.variantId, i.offerId) !== lineId)],
        })
      },

      moveToCart: (lineId) => {
        const item = get().savedForLater.find((i) => cartLineKey(i.productId, i.variantId, i.offerId) === lineId)
        if (!item) return { ok: false, message: 'Item not found' }
        const existing = get().cart.find((i) => cartLineKey(i.productId, i.variantId, i.offerId) === lineId)
        const nextQty = (existing?.quantity ?? 0) + item.quantity
        if (nextQty > item.stock) {
          return { ok: false, message: `Only ${item.stock} in stock` }
        }
        set({
          savedForLater: get().savedForLater.filter((i) => cartLineKey(i.productId, i.variantId, i.offerId) !== lineId),
          cart: existing
            ? get().cart.map((i) => (cartLineKey(i.productId, i.variantId, i.offerId) === lineId ? { ...i, quantity: nextQty } : i))
            : [...get().cart, item],
        })
        return { ok: true, message: 'Moved to cart' }
      },

      removeFromSaved: (lineId) =>
        set({ savedForLater: get().savedForLater.filter((i) => cartLineKey(i.productId, i.variantId, i.offerId) !== lineId) }),

      clearCart: () => set({ cart: [] }),

      setCartOpen: (open) => set({ cartOpen: open }),

      // ── Compare tray + dialog ──
      compareItems: [],
      compareOpen: false,
      setCompareOpen: (open) => set({ compareOpen: open }),
      toggleCompare: (product) => {
        const existing = get().compareItems.find((p) => p.id === product.id)
        if (existing) {
          set({ compareItems: get().compareItems.filter((p) => p.id !== product.id) })
          return { ok: true, message: 'Removed from compare' }
        }
        if (get().compareItems.length >= 4) {
          return { ok: false, message: 'You can compare up to 4 products' }
        }
        set({ compareItems: [...get().compareItems, product] })
        return { ok: true, message: 'Added to compare' }
      },
      removeFromCompare: (productId) =>
        set({ compareItems: get().compareItems.filter((p) => p.id !== productId) }),
      clearCompare: () => set({ compareItems: [] }),
      clearUserCommerceState: () =>
        set({ cart: [], savedForLater: [], recentlyViewed: [], compareItems: [] }),

      // ── Dynamic display currency ──
      currencyPref: null,
      currencyReady: false,
      currencyList: [],
      activeCurrency: DEFAULT_DISPLAY_CURRENCY,
      currencyBase: 'USD',
      lastRefreshedAt: null,

      // Boot the dynamic currency system: pull live rates + active list from
      // the server, then honor the visitor's persisted preference (if still
      // active) — otherwise stay on the USD base. The lib module state is
      // synced so formatUSD() converts every price immediately.
      initCurrency: async () => {
        if (get().currencyReady) return
        try {
          const res = await fetch('/api/settings/currency', { cache: 'no-store' })
          if (!res.ok) return
          const json = (await res.json()) as {
            base?: string
            lastRefreshedAt?: string | null
            currencies?: DisplayCurrency[]
          }
          const list = (json.currencies ?? []).filter((c) => c.rateToUsd > 0)
          const base = json.base ?? 'USD'
          const pref = get().currencyPref
          const chosen =
            (pref ? list.find((c) => c.code === pref) : undefined) ??
            list.find((c) => c.code === base) ??
            DEFAULT_DISPLAY_CURRENCY
          setLibActiveCurrency(chosen)
          set({
            currencyReady: true,
            currencyList: list,
            activeCurrency: chosen,
            currencyBase: base,
            lastRefreshedAt: json.lastRefreshedAt ?? null,
          })
        } catch {
          // offline → keep USD base, mark ready to avoid refetch loops
          set({ currencyReady: true })
        }
      },

      setActiveCurrencyCode: (code) => {
        const chosen = get().currencyList.find((c) => c.code === code)
        if (!chosen) return
        setLibActiveCurrency(chosen)
        set({ activeCurrency: chosen, currencyPref: code === get().currencyBase ? null : code })
      },

      openAuth: (mode = 'login', after) =>
        set({ authModalOpen: true, authMode: mode, afterAuth: after ?? null }),

      closeAuth: () => set({ authModalOpen: false, afterAuth: null }),

      // Switch login ↔ register inside an already-open modal without losing
      // the post-auth navigation intent (afterAuth) — fixes the onboarding
      // dead-end where register mode was unreachable from the UI.
      setAuthMode: (mode) => set({ authMode: mode }),

      cartCount: () => get().cart.reduce((sum, i) => sum + i.quantity, 0),

      cartSubtotal: () =>
        Math.round(get().cart.reduce((sum, i) => sum + i.price * i.quantity, 0) * 100) / 100,
    }),
    {
      name: 'vendora-store',
      storage: gatedStorage,
      partialize: (state) => ({
        cart: state.cart,
        savedForLater: state.savedForLater,
        recentlyViewed: state.recentlyViewed,
        compareItems: state.compareItems,
        currencyPref: state.currencyPref,
      }),
      // Avoid SSR hydration mismatch: rehydrate explicitly after mount (see MarketplaceApp)
      skipHydration: true,
    }
  )
)
