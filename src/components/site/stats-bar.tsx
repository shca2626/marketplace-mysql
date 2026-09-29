'use client'

import { useEffect, useRef, useState } from 'react'
import { useInView } from 'framer-motion'
import { useApi } from '@/hooks/use-api'
import type { HomeFeed } from '@/lib/types'
import { formatNumber } from '@/lib/format'

/**
 * S6 — Live numbers band (pagedesign.md §5.1): counts from /api/home with a
 * subtle count-up animation when scrolled into view.
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
    { label: 'Products listed', value: data?.stats.productCount ?? 0 },
    { label: 'Vetted sellers', value: data?.stats.sellerCount ?? 0 },
    { label: 'Funding entities', value: 3 },
    { label: 'Categories', value: data?.categories.length ?? 6 },
    { label: 'Reviews', value: data?.stats.reviewCount ?? 0 },
    { label: 'Orders', value: data?.stats.orderCount ?? 0 },
  ]

  return (
    <section aria-label="Platform statistics" className="border-y bg-card">
      <div className="mx-auto grid max-w-7xl grid-cols-3 gap-x-4 gap-y-6 px-4 py-8 sm:grid-cols-6 sm:py-9">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <p className="text-xl font-extrabold tracking-tight text-primary sm:text-2xl">
              <Counter target={s.value} />
            </p>
            <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">
              {s.label}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
