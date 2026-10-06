import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { CartItem, CartOfferInput, ProductDTO, ProductVariantDTO, SessionUser } from '@/lib/types'
import type { StorefrontSettings, BannerSlideDTO } from '@/lib/settings/schema'
import { DEFAULT_STOREFRONT_SETTINGS } from '@/lib/settings/schema'
import {
  DEFAULT_DISPLAY_CURRENCY,
  setActiveCurrency as setLibActiveCurrency,
  type DisplayCurrency,
} from '@/lib/currency'
import { parseLocation, viewToQuery } from '@/lib/routing'

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
 * Cart lines are keyed by product AND variant AND offer: the same product in
 * two combinations (e.g. different sizes) is two independent lines, and the
 * same product bought from a DIFFERENT vendor offer is its own line too
 * (Phase 4 multi-vendor). Legacy persisted carts (no variantId/offerId) keep
 * the plain productId key.
 */
export const cartLineKey = (productId: string, variantId?: string | null, offerId?: string | null) =>
  variantId
    ? `${productId}::${variantId}`
    : offerId
      ? `${productId}::offer::${offerId}`
      : productId

export type View =
  | 'home'
  | 'catalog'
  | 'product'
  | 'store'
  | 'brands' // Phase 12: the brands directory (all brands | one brand's products)
  | 'cart'
  | 'checkout'
  | 'orders'
  | 'favorites'
  | 'seller'
  | 'account'
  | 'admin'
  | 'rfqs'
  | 'business'
  | 'financing' // applicant surface: financing requests + accreditation + documents center
  | 'financier' // financier console: services, inbox, offers, accreditations
  | 'forgot-password' // AUTHSEC-1: email → reset link
  | 'reset-password' // AUTHSEC-1: token + new password
  | 'verify-email' // AUTHSEC-1: token consumption landing
  | 'register-company' // Phase 3: Merchant/Dealer company registration wizard (5 steps)
  | 'register-financier' // Phase 3: financier application door (admin-approved)

export interface ViewParams {
  productId?: string
  category?: string
  query?: string
  sellerId?: string
  brandSlug?: string // Phase 12: brands view — boot focused on one brand
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
  resetVia?: 'phone' | 'email' // Phase 3: which reset flow the view should boot into
  resetPhone?: string // OTPFIX: local 9-digit phone carried from forgot-password (code already sent)
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

  // ── Dynamic display currency (Phase 8) ────────────────────────────────
  // Rates arrive from /api/settings/currency (DB-backed, live-refreshed).
  // `activeCurrency` drives formatUSD()/formatMoney() globally via the
  // module state in src/lib/currency.ts — every price on the storefront
  // converts automatically.
  currencyPref: string | null // persisted preferred code (null = USD base)
  currencyReady: boolean
  currencyList: DisplayCurrency[]
  activeCurrency: DisplayCurrency
  currencyBase: string
  lastRefreshedAt: string | null
  initCurrency: () => Promise<void>
  setActiveCurrencyCode: (code: string) => void

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
    offer?: CartOfferInput | null
  ) => { ok: boolean; message: string }
  updateQuantity: (lineId: string, quantity: number) => void
  removeFromCart: (lineId: string) => void
  saveForLater: (lineId: string) => void
  moveToCart: (lineId: string) => { ok: boolean; message: string }
  removeFromSaved: (lineId: string) => void
  clearCart: () => void
  setCartOpen: (open: boolean) => void
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

      // Phase 4 — an offer line buys from the OFFERING vendor, not the listing
      // owner: the offer's price/stock/seller are authoritative for the line.
      addToCart: (product, quantity = 1, variant = null, offer = null) => {
        const lineId = cartLineKey(product.id, variant?.id, offer?.id)
        const stock = offer?.stock ?? variant?.stock ?? product.stock
        const price = offer?.price ?? variant?.price ?? product.price
        const existing = get().cart.find(
          (i) => cartLineKey(i.productId, i.variantId, i.offerId) === lineId
        )
        const currentQty = existing?.quantity ?? 0
        const nextQty = currentQty + quantity
        if (nextQty > stock) {
          return { ok: false, message: `Only ${stock} in stock` }
        }
        if (existing) {
          set({
            cart: get().cart.map((i) =>
              cartLineKey(i.productId, i.variantId, i.offerId) === lineId
                ? { ...i, quantity: nextQty, stock }
                : i
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
            sellerId: offer?.sellerId ?? product.sellerId,
            sellerName:
              offer?.seller?.storeName ?? offer?.seller?.name ?? product.seller?.storeName ?? product.seller?.name ?? null,
            variantId: offer ? null : (variant?.id ?? null),
            variantLabel: offer ? null : (variant?.name ?? null),
            sku: offer?.sku ?? variant?.sku ?? product.sku ?? null,
            offerId: offer?.id ?? null,
            offerPrice: offer?.price ?? null,
            offerSellerName: offer?.seller?.storeName ?? offer?.seller?.name ?? null,
          }
          set({ cart: [...get().cart, item] })
        }
        return { ok: true, message: offer ? `Added from ${offer.seller?.storeName ?? 'seller'}'s offer` : 'Added to cart' }
      },

      updateQuantity: (lineId, quantity) =>
        set({
          cart: get()
            .cart.map((i) =>
              cartLineKey(i.productId, i.variantId, i.offerId) === lineId ? { ...i, quantity } : i
            )
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
          savedForLater: [
            item,
            ...get().savedForLater.filter((i) => cartLineKey(i.productId, i.variantId, i.offerId) !== lineId),
          ],
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
          savedForLater: get().savedForLater.filter(
            (i) => cartLineKey(i.productId, i.variantId, i.offerId) !== lineId
          ),
          cart: existing
            ? get().cart.map((i) =>
                cartLineKey(i.productId, i.variantId, i.offerId) === lineId ? { ...i, quantity: nextQty } : i
              )
            : [...get().cart, item],
        })
        return { ok: true, message: 'Moved to cart' }
      },

      removeFromSaved: (lineId) =>
        set({
          savedForLater: get().savedForLater.filter(
            (i) => cartLineKey(i.productId, i.variantId, i.offerId) !== lineId
          ),
        }),

      clearCart: () => set({ cart: [] }),

      setCartOpen: (open) => set({ cartOpen: open }),

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
        currencyPref: state.currencyPref,
      }),
      // Avoid SSR hydration mismatch: rehydrate explicitly after mount (see MarketplaceApp)
      skipHydration: true,
    }
  )
)
