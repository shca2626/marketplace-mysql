'use client'

import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ThemeProvider } from 'next-themes'
import { useMarketplace, type View } from '@/store/marketplace'
import type { SessionUser } from '@/lib/types'
import { Header } from './header'
import { Footer } from './footer'
import { HomeView } from './home-view'
import { CatalogView } from './catalog-view'
import { ProductView } from './product-view'
import { CartView } from './cart-view'
import { CheckoutView } from './checkout-view'
import { OrdersView } from './orders-view'
import { FavoritesView } from './favorites-view'
import { SellerView } from './seller-view'
import { AccountView } from './account-view'
import { CartDrawer } from './cart-drawer'
import { AuthModal } from './auth-modal'

const VIEWS: Record<View, () => React.ReactNode> = {
  home: () => <HomeView />,
  catalog: () => <CatalogView />,
  product: () => <ProductView />,
  cart: () => <CartView />,
  checkout: () => <CheckoutView />,
  orders: () => <OrdersView />,
  favorites: () => <FavoritesView />,
  seller: () => <SellerView />,
  account: () => <AccountView />,
}

export function MarketplaceApp() {
  const view = useMarketplace((s) => s.view)
  const setUser = useMarketplace((s) => s.setUser)
  const setAuthChecked = useMarketplace((s) => s.setAuthChecked)

  // Restore persisted cart (after hydration to avoid SSR mismatch) and session
  useEffect(() => {
    let cancelled = false
    void useMarketplace.persist.rehydrate()
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
    return () => {
      cancelled = true
    }
  }, [setUser, setAuthChecked])

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
      </div>
    </ThemeProvider>
  )
}
