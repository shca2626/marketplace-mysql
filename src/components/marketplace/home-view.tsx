'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, BadgeCheck, Clock, Flame, Search, ShieldCheck, Sparkles, Store, TrendingUp, X } from 'lucide-react'
import { useMarketplace } from '@/store/marketplace'
import { useApi } from '@/hooks/use-api'
import type { HomeFeed, ProductDTO } from '@/lib/types'
import { formatNumber, formatUSD } from '@/lib/format'
import { HERO_COLLAGE, HERO_IMAGE } from '@/lib/constants'
import { ProductCard, ProductCardSkeleton } from './product-card'
import { StarRating } from './star-rating'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

export function HomeView() {
  const navigate = useMarketplace((s) => s.navigate)
  const recentlyViewed = useMarketplace((s) => s.recentlyViewed)
  const clearRecentlyViewed = useMarketplace((s) => s.clearRecentlyViewed)
  const { data, loading } = useApi<HomeFeed>('/api/home')
  const [search, setSearch] = useState('')

  const idsQuery = recentlyViewed.length > 0 ? recentlyViewed.join(',') : null
  const { data: recentData } = useApi<{ items: ProductDTO[] }>(
    idsQuery ? `/api/products?ids=${encodeURIComponent(idsQuery)}&limit=10` : null
  )
  const recentItems = recentData?.items ?? []

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (search.trim()) navigate('catalog', { query: search.trim() })
  }

  return (
    <div>
      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-orange-50 via-amber-50/60 to-rose-50 dark:from-orange-950/30 dark:via-amber-950/15 dark:to-rose-950/20">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-rose-400/10 blur-3xl" />
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 lg:grid-cols-2 lg:py-20">
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="relative z-10"
          >
            <Badge variant="secondary" className="mb-4 gap-1.5 rounded-full px-3 py-1 text-xs font-medium">
              <Sparkles size={13} className="text-primary" />
              Over {formatNumber(data?.stats.sellerCount ?? 0)} independent sellers
            </Badge>
            <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl">
              Shop unique finds from{' '}
              <span className="bg-gradient-to-r from-orange-600 to-rose-500 bg-clip-text text-transparent">
                real people
              </span>
              , not algorithms.
            </h1>
            <p className="mt-4 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
              Vendora is a marketplace for well-made things — curated by independent sellers who actually
              care about their craft.
            </p>
            <form onSubmit={submitSearch} className="relative mt-7 max-w-md" role="search">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Try “headphones”, “yoga mat”, “candle”…"
                className="h-12 rounded-2xl border-transparent bg-background pl-11 pr-28 text-sm shadow-lg shadow-orange-900/5 focus-visible:ring-1"
                aria-label="Search the marketplace"
              />
              <Button type="submit" className="absolute right-1.5 top-1/2 h-9 -translate-y-1/2 rounded-xl px-5">
                Search
              </Button>
            </form>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" className="rounded-xl" onClick={() => navigate('catalog')}>
                Browse all products <ArrowRight size={16} className="ml-1" />
              </Button>
              <Button size="lg" variant="outline" className="rounded-xl" onClick={() => navigate('seller')}>
                <Store size={16} className="mr-1.5" /> Start selling
              </Button>
            </div>
            <div className="mt-9 flex flex-wrap gap-x-8 gap-y-3">
              {[
                { label: 'Products', value: formatNumber(data?.stats.productCount ?? 0) },
                { label: 'Reviews', value: formatNumber(data?.stats.reviewCount ?? 0) },
                { label: 'Orders', value: formatNumber(data?.stats.orderCount ?? 0) },
                { label: 'Avg. rating', value: '4.6★' },
              ].map((s) => (
                <div key={s.label}>
                  <p className="text-xl font-extrabold tabular-nums">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Hero visual */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="relative mx-auto w-full max-w-md lg:max-w-none"
          >
            <div className="relative overflow-hidden rounded-3xl border-4 border-background shadow-2xl shadow-orange-900/10">
              <img
                src={HERO_IMAGE}
                alt="Shopping bags full of marketplace finds"
                className="aspect-[4/3] w-full object-cover"
              />
            </div>
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute -left-3 top-8 hidden rounded-2xl border bg-background/95 p-3 shadow-xl backdrop-blur sm:flex sm:items-center sm:gap-3"
            >
              <img src={HERO_COLLAGE[0]} alt="" className="hidden h-12 w-12 rounded-xl object-cover sm:block" />
              <div>
                <p className="text-xs font-semibold">Aura Headphones</p>
                <p className="text-xs text-muted-foreground">{formatUSD(189.99)} · 312 sold</p>
              </div>
              <BadgeCheck size={16} className="text-primary" />
            </motion.div>
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
              className="absolute -bottom-4 -right-2 hidden items-center gap-3 rounded-2xl border bg-background/95 p-3 shadow-xl backdrop-blur sm:flex"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                <ShieldCheck size={17} />
              </span>
              <div>
                <p className="text-xs font-semibold">Buyer protection</p>
                <p className="text-xs text-muted-foreground">On every order</p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── Categories ────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-12" aria-labelledby="categories-heading">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h2 id="categories-heading" className="text-2xl font-bold tracking-tight">Shop by category</h2>
            <p className="mt-1 text-sm text-muted-foreground">Find your thing, faster.</p>
          </div>
          <Button variant="ghost" className="rounded-full text-primary" onClick={() => navigate('catalog')}>
            View all <ArrowRight size={15} className="ml-1" />
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
          {(loading ? Array.from({ length: 6 }) : data?.categories ?? []).map((c, i) =>
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
                className="group flex flex-col items-center gap-2.5 rounded-2xl border bg-card p-5 text-center transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-md"
              >
                {c.coverImage && (
                  <img
                    src={c.coverImage}
                    alt=""
                    loading="lazy"
                    className="h-11 w-11 rounded-xl object-cover shadow-sm transition-transform group-hover:scale-110"
                  />
                )}
                <div>
                  <p className="text-sm font-semibold leading-tight">{c.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{c.productCount} items</p>
                </div>
              </motion.button>
            )
          )}
        </div>
      </section>

      {/* ── Recently viewed ─────────────────────────────── */}
      {recentlyViewed.length > 0 && recentItems.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pb-12 pt-4" aria-labelledby="recent-heading">
          <div className="mb-5 flex items-end justify-between">
            <div>
              <h2 id="recent-heading" className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                <Clock className="text-primary" size={22} /> Recently viewed
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">Pick up where you left off.</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full text-xs text-muted-foreground hover:text-foreground"
              onClick={clearRecentlyViewed}
            >
              <X size={14} className="mr-1" /> Clear history
            </Button>
          </div>
          <div className="scrollbar-thin -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2">
            {recentItems.map((p) => (
              <button
                key={p.id}
                onClick={() => navigate('product', { productId: p.id })}
                className="group flex w-44 shrink-0 snap-start flex-col gap-2 rounded-2xl border bg-card p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md sm:w-52"
              >
                <div className="aspect-square overflow-hidden rounded-xl bg-muted">
                  {p.images[0] && (
                    <img
                      src={p.images[0]}
                      alt={p.title}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 dark:brightness-[0.96]"
                    />
                  )}
                </div>
                <p className="line-clamp-2 min-h-10 text-sm font-medium leading-5">{p.title}</p>
                <div className="flex w-full items-baseline justify-between gap-1.5">
                  <span className="text-sm font-bold text-primary">{formatUSD(p.price)}</span>
                  {p.compareAtPrice && (
                    <span className="text-[11px] text-muted-foreground line-through">
                      {formatUSD(p.compareAtPrice)}
                    </span>
                  )}
                </div>
                <StarRating value={p.rating} showValue count={p.reviewCount} />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── Featured ─────────────────────────────────────── */}
      <section className="bg-muted/40 py-12" aria-labelledby="featured-heading">
        <div className="mx-auto max-w-7xl px-4">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <h2 id="featured-heading" className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                <BadgeCheck className="text-primary" size={22} /> Featured picks
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">Hand-picked favorites from our editors.</p>
            </div>
            <Button variant="ghost" className="hidden rounded-full text-primary sm:flex" onClick={() => navigate('catalog')}>
              View all <ArrowRight size={15} className="ml-1" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {(loading ? Array.from({ length: 8 }) : data?.featured ?? []).map((p, i) =>
              loading || !p ? <ProductCardSkeleton key={i} /> : <ProductCard key={p.id} product={p} index={i} />
            )}
          </div>
        </div>
      </section>

      {/* ── Sell CTA ─────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-12">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-orange-600 to-rose-500 px-6 py-10 text-white sm:px-12">
          <div className="pointer-events-none absolute -right-10 -top-10 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-16 left-1/3 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
            <div className="max-w-xl">
              <Badge className="mb-3 border-white/30 bg-white/15 text-white hover:bg-white/20">
                <Store size={13} className="mr-1.5" /> Turn your craft into a business
              </Badge>
              <h2 className="text-3xl font-extrabold tracking-tight">Sell on Vendora in minutes</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/90 sm:text-base">
                Open a free storefront, list your products and reach thousands of shoppers. We only take 5%
                when you make a sale — no listing fees, ever.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <Button
                size="lg"
                className="rounded-xl bg-white text-orange-700 hover:bg-white/90"
                onClick={() => navigate('seller')}
              >
                Open your storefront <ArrowRight size={16} className="ml-1" />
              </Button>
              <p className="text-center text-xs text-white/80">Free to start · 5% flat fee</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Trending ─────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 pb-12" aria-labelledby="trending-heading">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h2 id="trending-heading" className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <Flame className="text-orange-500" size={22} /> Trending this week
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">What everyone is adding to cart.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {(loading ? Array.from({ length: 8 }) : data?.trending ?? []).map((p, i) =>
            loading || !p ? <ProductCardSkeleton key={i} /> : <ProductCard key={p.id} product={p} index={i} />
          )}
        </div>
      </section>

      {/* ── New arrivals ──────────────────────────────────── */}
      <section className="bg-muted/40 py-12" aria-labelledby="new-heading">
        <div className="mx-auto max-w-7xl px-4">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <h2 id="new-heading" className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                <TrendingUp className="text-primary" size={22} /> Fresh arrivals
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">Just listed by our sellers.</p>
            </div>
            <Button variant="ghost" className="hidden rounded-full text-primary sm:flex" onClick={() => navigate('catalog')}>
              View all <ArrowRight size={15} className="ml-1" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {(loading ? Array.from({ length: 8 }) : data?.newArrivals ?? []).map((p, i) =>
              loading || !p ? <ProductCardSkeleton key={i} /> : <ProductCard key={p.id} product={p} index={i} />
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
