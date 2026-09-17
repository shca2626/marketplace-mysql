'use client'

import { Store, ShieldCheck, Truck, RotateCcw, CreditCard } from 'lucide-react'
import { useMarketplace } from '@/store/marketplace'
import { useApi } from '@/hooks/use-api'
import type { CategoryDTO } from '@/lib/types'

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
        { label: 'Start Selling', onClick: () => navigate('seller') },
        { label: 'Seller Dashboard', onClick: () => navigate('seller') },
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
    <footer className="mt-auto border-t bg-muted/40">
      {/* Trust badges */}
      <div className="border-b bg-background">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-4 py-6 sm:grid-cols-4">
          {[
            { icon: Truck, title: 'Fast Shipping', text: 'Free over $75' },
            { icon: RotateCcw, title: 'Easy Returns', text: '30-day guarantee' },
            { icon: ShieldCheck, title: 'Secure Checkout', text: '256-bit SSL' },
            { icon: CreditCard, title: 'Flexible Payment', text: 'All major cards' },
          ].map((b) => (
            <div key={b.title} className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <b.icon size={18} />
              </span>
              <div>
                <p className="text-sm font-semibold leading-tight">{b.title}</p>
                <p className="text-xs text-muted-foreground">{b.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main footer */}
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-4 py-10 sm:grid-cols-3 lg:grid-cols-5">
        <div className="col-span-2 lg:col-span-2">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Store size={18} />
            </span>
            <span className="text-lg font-extrabold tracking-tight">Vendora</span>
          </div>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
            The marketplace where independent sellers and thoughtful buyers meet. Real products, real people,
            fair prices.
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            © {new Date().getFullYear()} Vendora Inc. All rights reserved.
          </p>
        </div>
        {links.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h4 className="mb-3 text-sm font-semibold">{col.title}</h4>
            <ul className="space-y-2">
              {col.items.map((item) => (
                <li key={item.label}>
                  <button
                    onClick={item.onClick}
                    className="text-sm text-muted-foreground transition-colors hover:text-primary"
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
