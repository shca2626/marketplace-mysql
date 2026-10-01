'use client'

import { useEffect } from 'react'
import { ThemeProvider } from 'next-themes'
import type { SessionUser } from '@/lib/types'
import type { StorefrontSettings, BannerSlideDTO } from '@/lib/settings/schema'
import { useMarketplace, markStoreHydrated } from '@/store/marketplace'
import { MarketSiteStrip } from '@/components/site/market-site-strip'
import { Header } from '@/components/marketplace/header'
import { Footer } from '@/components/marketplace/footer'
import { CartDrawer } from '@/components/marketplace/cart-drawer'
import { AuthModal } from '@/components/marketplace/auth-modal'
import { BackToTop } from '@/components/marketplace/back-to-top'
import { StorefrontTheme } from '@/components/marketplace/storefront-theme'

/**
 * Market public chrome for the real (server-rendered) market routes
 * — /market/product/[id], /market/store/[id], /market/category/[slug]
 * (pagedesign.md Phase 2).
 *
 * Renders the SAME storefront chrome as the /market SPA (MarketplaceApp's
 * public branch): slim platform strip + marketplace header (search,
 * categories, cart badge) + marketing footer + cart drawer + auth modal.
 *
 * Runs the same boot sequence as the SPA (persisted cart rehydration,
 * session restore, storefront settings) so the header is fully alive —
 * cart badge, avatar, announcement bar — on these pages too.
 *
 * NOTE: `spaActive` deliberately stays FALSE here. The SPA is not mounted,
 * so store.navigate() falls back to a full page navigation to /market?view=…
 * which is exactly what links like "View full marketplace" want.
 */
export function MarketPublicShell({ children }: { children: React.ReactNode }) {
  const setUser = useMarketplace((s) => s.setUser)
  const setAuthChecked = useMarketplace((s) => s.setAuthChecked)
  const applySettings = useMarketplace((s) => s.applySettings)

  useEffect(() => {
    let cancelled = false
    // Persisted cart (skipHydration) — rehydrate after mount to avoid
    // SSR mismatch, exactly like MarketplaceApp does.
    void useMarketplace.persist.rehydrate().then(markStoreHydrated)

    // Session restore with the SPA's ADM-001 resilience: only an explicit
    // 401 concludes "signed out"; transient failures retry briefly and keep
    // any persisted user.
    const restore = async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await fetch('/api/auth/me', { cache: 'no-store' })
          if (res.status === 401) {
            if (!cancelled) setUser(null)
            break
          }
          if (res.ok) {
            const json = (await res.json()) as { user: SessionUser | null }
            if (!cancelled) setUser(json.user ?? null)
            break
          }
          await new Promise((r) => setTimeout(r, 350 * (attempt + 1)))
        } catch {
          await new Promise((r) => setTimeout(r, 350 * (attempt + 1)))
        }
      }
      if (!cancelled) setAuthChecked(true)
    }
    void restore()

    // Storefront configuration (announcement bar, branding) for the header.
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
    }
  }, [setUser, setAuthChecked, applySettings])

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      {/* Live theme bridge — admin-configured accent / radius / default-mode */}
      <StorefrontTheme />
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        {/* Slim platform strip — five primary pages always reachable (§4.2) */}
        <MarketSiteStrip />
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        <CartDrawer />
        <AuthModal />
        <BackToTop />
      </div>
    </ThemeProvider>
  )
}
