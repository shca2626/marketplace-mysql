import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { CartItem, ProductDTO, SessionUser } from '@/lib/types'
import { parseLocation, viewToQuery } from '@/lib/routing'

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

export interface ViewParams {
  productId?: string
  category?: string
  query?: string
  sellerId?: string
  sellerTab?: string
}

interface MarketplaceState {
  view: View
  params: ViewParams
  user: SessionUser | null
  authChecked: boolean
  cart: CartItem[]
  cartOpen: boolean
  authModalOpen: boolean
  authMode: 'login' | 'register'
  afterAuth: { view: View; params?: ViewParams } | null
  recentlyViewed: string[]

  navigate: (view: View, params?: ViewParams) => void
  applyLocation: (location?: { view: View; params?: ViewParams }) => void
  setUser: (user: SessionUser | null) => void
  setAuthChecked: (v: boolean) => void
  trackView: (productId: string) => void
  clearRecentlyViewed: () => void
  addToCart: (product: ProductDTO, quantity?: number) => { ok: boolean; message: string }
  updateQuantity: (productId: string, quantity: number) => void
  removeFromCart: (productId: string) => void
  clearCart: () => void
  setCartOpen: (open: boolean) => void
  openAuth: (mode?: 'login' | 'register', after?: { view: View; params?: ViewParams }) => void
  closeAuth: () => void
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
      cartOpen: false,
      authModalOpen: false,
      authMode: 'login',
      afterAuth: null,
      recentlyViewed: [],

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

      trackView: (productId) =>
        set((state) => ({
          recentlyViewed: [
            productId,
            ...state.recentlyViewed.filter((id) => id !== productId),
          ].slice(0, 10),
        })),

      clearRecentlyViewed: () => set({ recentlyViewed: [] }),

      addToCart: (product, quantity = 1) => {
        const existing = get().cart.find((i) => i.productId === product.id)
        const currentQty = existing?.quantity ?? 0
        const nextQty = currentQty + quantity
        if (nextQty > product.stock) {
          return { ok: false, message: `Only ${product.stock} in stock` }
        }
        if (existing) {
          set({
            cart: get().cart.map((i) =>
              i.productId === product.id ? { ...i, quantity: nextQty, stock: product.stock } : i
            ),
          })
        } else {
          const item: CartItem = {
            productId: product.id,
            title: product.title,
            price: product.price,
            image: product.images[0] ?? null,
            stock: product.stock,
            quantity: nextQty,
            sellerId: product.sellerId,
            sellerName: product.seller?.storeName ?? product.seller?.name ?? null,
          }
          set({ cart: [...get().cart, item] })
        }
        return { ok: true, message: 'Added to cart' }
      },

      updateQuantity: (productId, quantity) =>
        set({
          cart: get()
            .cart.map((i) => (i.productId === productId ? { ...i, quantity } : i))
            .filter((i) => i.quantity > 0),
        }),

      removeFromCart: (productId) =>
        set({ cart: get().cart.filter((i) => i.productId !== productId) }),

      clearCart: () => set({ cart: [] }),

      setCartOpen: (open) => set({ cartOpen: open }),

      openAuth: (mode = 'login', after) =>
        set({ authModalOpen: true, authMode: mode, afterAuth: after ?? null }),

      closeAuth: () => set({ authModalOpen: false, afterAuth: null }),

      cartCount: () => get().cart.reduce((sum, i) => sum + i.quantity, 0),

      cartSubtotal: () =>
        Math.round(get().cart.reduce((sum, i) => sum + i.price * i.quantity, 0) * 100) / 100,
    }),
    {
      name: 'vendora-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ cart: state.cart, recentlyViewed: state.recentlyViewed }),
      // Avoid SSR hydration mismatch: rehydrate explicitly after mount (see MarketplaceApp)
      skipHydration: true,
    }
  )
)
