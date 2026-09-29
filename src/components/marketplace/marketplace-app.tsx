'use client'

// ─────────────────────────────────────────────────────────────────────────────
// APP ROOT — STRICT STOREFRONT / CONSOLE SEPARATION
//
// The public storefront and the internal consoles are two different products
// sharing one route (single-page app):
//
//   STOREFRONT (home, catalog, product, store, cart, checkout)
//     → StorefrontLayout: promo bar, marketplace header (search, categories,
//       cart), marketing footer, cart drawer, back-to-top.
//
//   CONSOLES (admin, seller, account, rfqs, business, orders, favorites)
//     → each view mounts its own DashboardLayout: role-aware sidebar,
//       contextual topbar, spacious content area and a slim utility footer.
//       ZERO storefront chrome inside — no promo bar, no catalog search,
//       no category nav, no marketing footer.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ThemeProvider } from 'next-themes'
import { useMarketplace, type View } from '@/store/marketplace'
import type { SessionUser } from '@/lib/types'
import type { StorefrontSettings, BannerSlideDTO } from '@/lib/settings/schema'
import { parseLocation } from '@/lib/routing'
import { DASHBOARD_VIEWS } from '@/components/dashboards/nav-config'
import { Header } from './header'
import { Footer } from './footer'
import { HomeView } from './home-view'
import { CatalogView } from './catalog-view'
import { ProductView } from './product-view'
import { StoreView } from './store-view'
import { CartView } from './cart-view'
import { CheckoutView } from './checkout-view'
import { SellerView } from './seller-view'
import { AdminView } from './admin-view'
// Buyer console pages — existing views mounted in the shared dashboard shell.
import { BuyerDashboard } from '@/components/dashboards/buyer-dashboard'
import { BuyerRfqsPage, BuyerBusinessPage, BuyerOrdersPage, BuyerFavoritesPage } from '@/components/dashboards/buyer-pages'
import { FinancingView } from './financing-view'
import { FinancierView } from './financier-view'
import { CartDrawer } from './cart-drawer'
import { AuthModal } from './auth-modal'
import { ForgotPasswordView, ResetPasswordView, VerifyEmailView } from './auth-views'
import { BackToTop } from './back-to-top'
import { StorefrontTheme } from './storefront-theme'

/** Public shopping surfaces. */
const STOREFRONT_VIEWS: Record<string, () => React.ReactNode> = {
  home: () => <HomeView />,
  catalog: () => <CatalogView />,
  product: () => <ProductView />,
  store: () => <StoreView />,
  cart: () => <CartView />,
  checkout: () => <CheckoutView />,
  'forgot-password': () => <ForgotPasswordView />,
  'reset-password': () => <ResetPasswordView />,
  'verify-email': () => <VerifyEmailView />,
}

/** Internal consoles — every one mounts its own DashboardLayout. */
const CONSOLE_VIEWS: Record<string, () => React.ReactNode> = {
  admin: () => <AdminView />,
  seller: () => <SellerView />,
  account: () => <BuyerDashboard />,
  rfqs: () => <BuyerRfqsPage />,
  business: () => <BuyerBusinessPage />,
  orders: () => <BuyerOrdersPage />,
  favorites: () => <BuyerFavoritesPage />,
  financing: () => <FinancingView />,
  financier: () => <FinancierView />,
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

  const isConsole = DASHBOARD_VIEWS.has(view)
  const active = isConsole ? CONSOLE_VIEWS[view] : STOREFRONT_VIEWS[view]

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      {/* Live theme bridge — pushes admin-configured accent / radius /
          default-mode onto the document root for BOTH storefront and
          dashboards the moment settings load or change. */}
      <StorefrontTheme />
      {isConsole ? (
        /* ── Internal console — dedicated dashboard shell ── */
        <div className="min-h-screen bg-muted/40 text-foreground">
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              {active?.()}
            </motion.div>
          </AnimatePresence>
          <AuthModal />
        </div>
      ) : (
        /* ── Public storefront — marketing chrome ── */
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
                {active?.()}
              </motion.div>
            </AnimatePresence>
          </main>
          <Footer />
          <CartDrawer />
          <AuthModal />
          <BackToTop />
        </div>
      )}
    </ThemeProvider>
  )
}
