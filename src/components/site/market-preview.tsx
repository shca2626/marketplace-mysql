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
 * Vendora "bh" system: white band section, navy heads, gold hover accents.
 */
export function MarketPreview() {
  const navigate = useMarketplace((s) => s.navigate)
  const { data, loading } = useApi<HomeFeed>('/api/home')

  const categories = data?.categories ?? []
  const featured = (data?.featured ?? []).slice(0, 8)

  return (
    <section className="border-y border-bh-border bg-bh-card py-12 sm:py-14" aria-labelledby="market-heading">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full border border-bh-gold/25 bg-bh-bg-gold px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-bh-gold-dark">
              Market
            </p>
            <h2 id="market-heading" className="h2-practical mt-3 text-balance tracking-tight text-bh-navy sm:text-2xl lg:text-3xl">
              Shop the market
            </h2>
            <p className="mt-1 text-sm text-bh-subtle sm:text-base">
              Engineer-reviewed solar gear from vetted, independent stores.
            </p>
          </div>
          <Button variant="ghost" className="group hidden shrink-0 rounded-full text-bh-action hover:text-bh-navy-deep sm:flex" asChild>
            <a href="/market">
              Browse the full market <ArrowRight size={15} className="ml-1 transition-transform duration-200 group-hover:translate-x-0.5" />
            </a>
          </Button>
        </div>

        {/* Category tiles — same style as the market home */}
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
          {(loading ? Array.from({ length: 6 }) : categories).map((c, i) =>
            loading || !c ? (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-bh-soft-blue" />
            ) : (
              <motion.button
                key={c.id}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05, duration: 0.3 }}
                onClick={() => navigate('catalog', { category: c.slug })}
                className="group flex flex-col items-center gap-2.5 rounded-2xl border border-bh-border bg-bh-card p-5 text-center shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-bh-gold/40 hover:shadow-hover focus-visible:ring-2 focus-visible:ring-bh-action focus-visible:ring-offset-2 active:scale-[0.97]"
              >
                {c.coverImage && (
                  <img
                    src={c.coverImage}
                    alt=""
                    loading="lazy"
                    className="h-11 w-11 rounded-xl object-cover shadow-sm ring-1 ring-transparent transition-all duration-200 group-hover:scale-110 group-hover:ring-2 group-hover:ring-bh-gold/40"
                  />
                )}
                <div>
                  <p className="text-sm font-semibold leading-tight text-bh-navy transition-colors group-hover:text-bh-action">{c.name}</p>
                  <p className="mt-0.5 text-xs text-bh-muted">{c.productCount} items</p>
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
          <Button variant="outline" className="rounded-full border-bh-border-dark text-bh-navy hover:text-bh-action" asChild>
            <a href="/market">
              Browse the full market <ArrowRight size={15} className="ml-1" />
            </a>
          </Button>
        </div>
      </div>
    </section>
  )
}
