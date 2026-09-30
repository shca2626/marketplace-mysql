'use client'

import { useEffect, useRef, useState } from 'react'
import { useInView } from 'framer-motion'
import { Landmark, LayoutGrid, Package, ShoppingCart, Star, Store } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import type { HomeFeed } from '@/lib/types'
import { formatNumber } from '@/lib/format'

/**
 * S6 — Live numbers band (pagedesign.md §5.1): counts from /api/home with a
 * subtle count-up animation when scrolled into view.
 * Vendora "bh" system: white band, gold icon tiles, navy values.
 */
function Counter({ target, suffix = '' }: { target: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (!inView || target <= 0) return
    const duration = 900
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(Math.round(target * eased))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [inView, target])

  return (
    <span ref={ref} className="tabular-nums">
      {formatNumber(value)}
      {suffix}
    </span>
  )
}

export function StatsBar() {
  const { data } = useApi<HomeFeed>('/api/home')

  const stats = [
    { icon: Package, label: 'Products listed', value: data?.stats.productCount ?? 0 },
    { icon: Store, label: 'Vetted sellers', value: data?.stats.sellerCount ?? 0 },
    { icon: Landmark, label: 'Funding entities', value: 3 },
    { icon: LayoutGrid, label: 'Categories', value: data?.categories.length ?? 6 },
    { icon: Star, label: 'Reviews', value: data?.stats.reviewCount ?? 0 },
    { icon: ShoppingCart, label: 'Orders', value: data?.stats.orderCount ?? 0 },
  ]

  return (
    <section aria-label="Platform statistics" className="border-y border-bh-border bg-bh-card">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-4 gap-y-7 px-4 py-9 sm:grid-cols-3 sm:py-10 lg:grid-cols-6">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col items-center gap-2 text-center">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-bh-bg-gold text-bh-gold" aria-hidden>
              <s.icon size={16} />
            </span>
            <div>
              <p className="text-2xl font-bold tabular-nums tracking-tight text-bh-navy">
                <Counter target={s.value} />
              </p>
              <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-bh-muted sm:text-xs">
                {s.label}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
