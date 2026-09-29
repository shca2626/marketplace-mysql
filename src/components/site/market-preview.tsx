'use client'

import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { useMarketplace } from '@/store/marketplace'
import { useApi } from '@/hooks/use-api'
import type { HomeFeed } from '@/lib/types'
import { ProductCard, ProductCardSkeleton } from '@/components/marketplace/product-card'
import { Button } from '@/components/ui/button'

/**
 * S3 — Market preview (pagedesign.md §5.1): the SAME components as the
 * market page (category tiles + ProductCard) so the homepage genuinely
 * feels like a section of the market and click-through is continuous.
 */
export function MarketPreview() {
  const navigate = useMarketplace((s) => s.navigate)
  const { data, loading } = useApi<HomeFeed>('/api/home')

  const categories = data?.categories ?? []
  const featured = (data?.featured ?? []).slice(0, 8)

  return (
    <section className="bg-muted/40 py-12 sm:py-14" aria-labelledby="market-heading">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary/80">Market</p>
            <h2 id="market-heading" className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
              Shop the market
            </h2>
            <p className="mt-1 text-sm text-muted-foreground sm:text-base">
              Engineer-reviewed solar gear from vetted, independent stores.
            </p>
          </div>
          <Button variant="ghost" className="group hidden shrink-0 rounded-full text-primary sm:flex" asChild>
            <a href="/market">
              Browse the full market <ArrowRight size={15} className="ml-1 transition-transform duration-200 group-hover:translate-x-0.5" />
            </a>
          </Button>
        </div>

        {/* Category tiles — same style as the market home */}
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
          {(loading ? Array.from({ length: 6 }) : categories).map((c, i) =>
            loading || !c ? (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />
            ) : (
              <motion.button
                key={c.id}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05, duration: 0.3 }}
                onClick={() => navigate('catalog', { category: c.slug })}
                className="group flex flex-col items-center gap-2.5 rounded-2xl border bg-card p-5 text-center transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:bg-primary/[0.03] hover:shadow-lg hover:shadow-primary/10 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-[0.97]"
              >
                {c.coverImage && (
                  <img
                    src={c.coverImage}
                    alt=""
                    loading="lazy"
                    className="h-11 w-11 rounded-xl object-cover shadow-sm ring-1 ring-transparent transition-all duration-200 group-hover:scale-110 group-hover:ring-2 group-hover:ring-primary/25"
                  />
                )}
                <div>
                  <p className="text-sm font-semibold leading-tight transition-colors group-hover:text-primary">{c.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{c.productCount} items</p>
                </div>
              </motion.button>
            )
          )}
        </div>

        {/* Featured products — the market's own ProductCard */}
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {(loading ? Array.from({ length: 8 }) : featured).map((p, i) =>
            loading || !p ? <ProductCardSkeleton key={i} /> : <ProductCard key={p.id} product={p} index={i} />
          )}
        </div>

        <div className="mt-7 text-center sm:hidden">
          <Button variant="outline" className="rounded-full" asChild>
            <a href="/market">
              Browse the full market <ArrowRight size={15} className="ml-1" />
            </a>
          </Button>
        </div>
      </div>
    </section>
  )
}
