import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { CartItem, ProductDTO, ProductVariantDTO, SessionUser } from '@/lib/types'
import type { StorefrontSettings, BannerSlideDTO } from '@/lib/settings/schema'
import { DEFAULT_STOREFRONT_SETTINGS } from '@/lib/settings/schema'
import { parseLocation, viewToQuery } from '@/lib/routing'

/**
 * Cart lines are keyed by product AND variant: the same product in two
 * combinations (e.g. different sizes) is two independent lines.
 * Legacy persisted carts (no variantId) keep the plain productId key.
 */
export const cartLineKey = (productId: string, variantId?: string | null) =>
  variantId ? `${productId}::${variantId}` : productId

export type View =
  | 'home'
  | 'catalog'
  | 'product'
  | 'store'
  | 'cart'
  | 'checkout'
  | 'orders'
  | 'favorites'
  | 'seller'
  | 'account'
  | 'admin'
  | 'rfqs'
  | 'business'

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
  addToCart: (product: ProductDTO, quantity?: number, variant?: ProductVariantDTO | null) => { ok: boolean; message: string }
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
        // Keep the address bar in sync so views are deep-linkable/shareable
        if (typeof window !== 'undefined') {
          const qs = viewToQuery(view, params)
          const next = qs ? `/?${qs}` : '/'
          if (window.location.search !== (qs ? `?${qs}` : '') || window.location.pathname !== '/') {
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

      addToCart: (product, quantity = 1, variant = null) => {
        const lineId = cartLineKey(product.id, variant?.id)
        const stock = variant?.stock ?? product.stock
        const price = variant?.price ?? product.price
        const existing = get().cart.find((i) => cartLineKey(i.productId, i.variantId) === lineId)
        const currentQty = existing?.quantity ?? 0
        const nextQty = currentQty + quantity
        if (nextQty > stock) {
          return { ok: false, message: `Only ${stock} in stock` }
        }
        if (existing) {
          set({
            cart: get().cart.map((i) =>
              cartLineKey(i.productId, i.variantId) === lineId ? { ...i, quantity: nextQty, stock } : i
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
            sellerName: product.seller?.storeName ?? product.seller?.name ?? null,
            variantId: variant?.id ?? null,
            variantLabel: variant?.name ?? null,
            sku: variant?.sku ?? product.sku ?? null,
          }
          set({ cart: [...get().cart, item] })
        }
        return { ok: true, message: 'Added to cart' }
      },

      updateQuantity: (lineId, quantity) =>
        set({
          cart: get()
            .cart.map((i) => (cartLineKey(i.productId, i.variantId) === lineId ? { ...i, quantity } : i))
            .filter((i) => i.quantity > 0),
        }),

      removeFromCart: (lineId) =>
        set({ cart: get().cart.filter((i) => cartLineKey(i.productId, i.variantId) !== lineId) }),

      // ── Save for later: park an item outside the active cart (still persisted).
      // Shipping progress + checkout only ever see the active cart.
      saveForLater: (lineId) => {
        const item = get().cart.find((i) => cartLineKey(i.productId, i.variantId) === lineId)
        if (!item) return
        set({
          cart: get().cart.filter((i) => cartLineKey(i.productId, i.variantId) !== lineId),
          savedForLater: [item, ...get().savedForLater.filter((i) => cartLineKey(i.productId, i.variantId) !== lineId)],
        })
      },

      moveToCart: (lineId) => {
        const item = get().savedForLater.find((i) => cartLineKey(i.productId, i.variantId) === lineId)
        if (!item) return { ok: false, message: 'Item not found' }
        const existing = get().cart.find((i) => cartLineKey(i.productId, i.variantId) === lineId)
        const nextQty = (existing?.quantity ?? 0) + item.quantity
        if (nextQty > item.stock) {
          return { ok: false, message: `Only ${item.stock} in stock` }
        }
        set({
          savedForLater: get().savedForLater.filter((i) => cartLineKey(i.productId, i.variantId) !== lineId),
          cart: existing
            ? get().cart.map((i) => (cartLineKey(i.productId, i.variantId) === lineId ? { ...i, quantity: nextQty } : i))
            : [...get().cart, item],
        })
        return { ok: true, message: 'Moved to cart' }
      },

      removeFromSaved: (lineId) =>
        set({ savedForLater: get().savedForLater.filter((i) => cartLineKey(i.productId, i.variantId) !== lineId) }),

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
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        cart: state.cart,
        savedForLater: state.savedForLater,
        recentlyViewed: state.recentlyViewed,
      }),
      // Avoid SSR hydration mismatch: rehydrate explicitly after mount (see MarketplaceApp)
      skipHydration: true,
    }
  )
)
