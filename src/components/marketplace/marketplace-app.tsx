'use client'

import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ThemeProvider } from 'next-themes'
import { useMarketplace, type View } from '@/store/marketplace'
import type { SessionUser } from '@/lib/types'
import type { StorefrontSettings, BannerSlideDTO } from '@/lib/settings/schema'
import { parseLocation } from '@/lib/routing'
import { Header } from './header'
import { Footer } from './footer'
import { HomeView } from './home-view'
import { CatalogView } from './catalog-view'
import { ProductView } from './product-view'
import { StoreView } from './store-view'
import { CartView } from './cart-view'
import { CheckoutView } from './checkout-view'
import { OrdersView } from './orders-view'
import { FavoritesView } from './favorites-view'
import { SellerView } from './seller-view'
import { AccountView } from './account-view'
import { AdminView } from './admin-view'
import { RfqView } from './b2b/rfq-view'
import { BusinessView } from './b2b/business-view'
import { CartDrawer } from './cart-drawer'
import { AuthModal } from './auth-modal'
import { BackToTop } from './back-to-top'

const VIEWS: Record<View, () => React.ReactNode> = {
  home: () => <HomeView />,
  catalog: () => <CatalogView />,
  product: () => <ProductView />,
  store: () => <StoreView />,
  cart: () => <CartView />,
  checkout: () => <CheckoutView />,
  orders: () => <OrdersView />,
  favorites: () => <FavoritesView />,
  seller: () => <SellerView />,
  account: () => <AccountView />,
  admin: () => <AdminView />,
  rfqs: () => <RfqView />,
  business: () => <BusinessView />,
}

export function MarketplaceApp() {
  const view = useMarketplace((s) => s.view)
  const setUser = useMarketplace((s) => s.setUser)
  const setAuthChecked = useMarketplace((s) => s.setAuthChecked)
  const applyLocation = useMarketplace((s) => s.applyLocation)
  const applySettings = useMarketplace((s) => s.applySettings)

  // Restore persisted cart (after hydration to avoid SSR mismatch) and session.
  // Deep-link boot: honor ?view=… params from the URL on first paint,
  // and keep state in sync when the user navigates with back/forward.
  useEffect(() => {
    let cancelled = false
    void useMarketplace.persist.rehydrate()
    if (parseLocation().view !== 'home') applyLocation()
    const onPopState = () => applyLocation()
    window.addEventListener('popstate', onPopState)
    const restore = async () => {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' })
        const json = (await res.json()) as { user: SessionUser | null }
        if (!cancelled) setUser(json.user)
      } catch {
        // offline — stay signed out
      } finally {
        if (!cancelled) setAuthChecked(true)
      }
    }
    void restore()
    // Storefront configuration (branding, hero slides, sample images) —
    // fetched once at boot so the home page renders the configured slider.
    const loadSettings = async () => {
      try {
        const res = await fetch('/api/settings', { cache: 'no-store' })
        if (!res.ok) return
        const json = (await res.json()) as { settings?: StorefrontSettings; slides?: BannerSlideDTO[] }
        if (!cancelled && (json.settings || json.slides)) {
          applySettings({ settings: json.settings, slides: json.slides })
        }
      } catch {
        // keep defaults
      }
    }
    void loadSettings()
    return () => {
      cancelled = true
      window.removeEventListener('popstate', onPopState)
    }
  }, [setUser, setAuthChecked, applyLocation, applySettings])

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <Header />
        <main className="flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              {VIEWS[view]()}
            </motion.div>
          </AnimatePresence>
        </main>
        <Footer />
        <CartDrawer />
        <AuthModal />
        <BackToTop />
      </div>
    </ThemeProvider>
  )
}
