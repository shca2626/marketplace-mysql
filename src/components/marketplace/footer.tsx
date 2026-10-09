'use client'

import { Store } from 'lucide-react'
import { useMarketplace } from '@/store/marketplace'
import { useApi } from '@/hooks/use-api'
import type { CategoryDTO } from '@/lib/types'

/**
 * Market SPA footer — Vendora "bh" system. Mirrors the site footer
 * (src/components/site/site-footer.tsx): white surface, gold-dot trust
 * markers, navy column heads, navy-deep + gold brand tile — with the
 * market's SPA navigation and content.
 */
export function Footer() {
  const navigate = useMarketplace((s) => s.navigate)
  const { data } = useApi<{ categories: CategoryDTO[] }>('/api/categories')
  const categories = data?.categories ?? []

  const links: { title: string; items: { label: string; onClick: () => void }[] }[] = [
    {
      title: 'Shop',
      items: [
        { label: 'All Products', onClick: () => navigate('catalog') },
        ...(categories.slice(0, 4) ?? []).map((c) => ({
          label: c.name,
          onClick: () => navigate('catalog', { category: c.slug }),
        })),
      ],
    },
    {
      title: 'Sell',
      items: [
        { label: 'Sell as a Company', onClick: () => navigate('business') },
        { label: 'Company Workspace', onClick: () => navigate('business') },
        { label: 'Seller Guidelines', onClick: () => navigate('account') },
      ],
    },
    {
      title: 'Account',
      items: [
        { label: 'My Orders', onClick: () => navigate('orders') },
        { label: 'Favorites', onClick: () => navigate('favorites') },
        { label: 'Settings', onClick: () => navigate('account') },
      ],
    },
  ]

  return (
    <footer className="mt-auto border-t border-bh-border bg-bh-card">
      {/* Trust markers — gold dots (site-footer pattern) */}
      <div className="border-b border-bh-border">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-4 py-6 sm:grid-cols-4 sm:px-6 lg:px-8">
          {[
            { title: 'Fast Shipping', text: 'Free over $75' },
            { title: 'Easy Returns', text: '30-day guarantee' },
            { title: 'Secure Checkout', text: '256-bit SSL' },
            { title: 'Flexible Payment', text: 'All major cards' },
          ].map((b) => (
            <div key={b.title} className="flex items-center gap-3 px-1 py-0.5">
              <span className="h-2 w-2 shrink-0 rounded-full bg-bh-gold" aria-hidden />
              <div className="min-w-0">
                <p className="text-xs font-bold leading-tight text-bh-navy">{b.title}</p>
                <p className="text-xs text-bh-muted">{b.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main footer */}
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-4 py-10 sm:grid-cols-3 sm:px-6 lg:grid-cols-5 lg:px-8">
        <div className="col-span-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-bh-navy-deep text-bh-gold">
              <Store size={16} />
            </span>
            <span className="text-lg font-extrabold tracking-tight text-bh-navy">Vendora</span>
          </div>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-bh-muted">
            The solar energy marketplace where engineer-owned stores meet thoughtful buyers. Real systems,
            real warranties, fair prices.
          </p>
          <div className="mt-4 flex items-center gap-2" aria-hidden>
            <span className="h-1 w-8 rounded-full bg-bh-gold/70" />
            <span className="h-1 w-4 rounded-full bg-bh-gold/40" />
            <span className="h-1 w-2 rounded-full bg-bh-gold/25" />
          </div>
          <p className="mt-4 text-xs text-bh-muted">
            © {new Date().getFullYear()} Vendora Inc. All rights reserved.
          </p>
        </div>
        {links.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-bh-navy">{col.title}</h3>
            <ul className="mt-3 space-y-2">
              {col.items.map((item) => (
                <li key={item.label}>
                  <button
                    onClick={item.onClick}
                    className="text-sm text-bh-muted transition-colors hover:text-bh-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      {/* Safe area padding for mobile */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </footer>
  )
}
