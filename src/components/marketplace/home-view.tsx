'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, BadgeCheck, Clock, Flame, Search, ShieldCheck, Sparkles, Store, Sun, TrendingUp, X } from 'lucide-react'
import { useMarketplace } from '@/store/marketplace'
import { useApi } from '@/hooks/use-api'
import type { CategoryDTO, HomeFeed, ProductDTO } from '@/lib/types'
import { formatNumber, formatUSD } from '@/lib/format'
import { HERO_COLLAGE, HERO_IMAGE } from '@/lib/constants'
import { ProductCard, ProductCardSkeleton } from './product-card'
import { StarRating } from './star-rating'
import { HeroSlider } from './hero-slider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/** Gold pill eyebrow chip (bh system — light sections). */
function Eyebrow({ icon: IconComp, children }: { icon?: React.ComponentType<{ size?: number; className?: string }>; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-bh-gold/25 bg-bh-bg-gold px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-bh-gold-dark">
      {IconComp && <IconComp size={13} aria-hidden />}
      {children}
    </span>
  )
}

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
      {/* ── Admin-controlled hero banner carousel ─────────── */}
      <HeroSlider />

      {/* ── Hero (bh navy band with layered gold art) ─────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#052e56] via-[#06396c] to-[#0a4a8c] text-white">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-bh-gold/20 blur-[120px]" />
          <div className="absolute -right-24 top-10 h-80 w-80 rounded-full bg-bh-gold/10 blur-[100px]" />
          <div
            className="absolute inset-0 opacity-[0.13]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(211,175,60,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(211,175,60,0.14) 1px, transparent 1px)',
              backgroundSize: '44px 44px',
              maskImage: 'radial-gradient(ellipse 85% 70% at 50% 0%, black, transparent)',
            }}
          />
          <Sun className="absolute right-[6%] top-14 h-40 w-40 text-bh-gold/15" strokeWidth={0.8} />
        </div>
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 lg:grid-cols-2 lg:py-20">
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="relative z-10"
          >
            <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-bh-gold/30 bg-bh-gold/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-bh-gold">
              <Sparkles size={13} aria-hidden />
              Over {formatNumber(data?.stats.sellerCount ?? 0)} engineer-owned solar stores
            </span>
            <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight text-white sm:text-5xl">
              Power everything with{' '}
              <span className="bg-gradient-to-r from-bh-gold-light to-bh-gold bg-clip-text text-transparent">
                sunlight
              </span>
              , not fuel.
            </h1>
            <p className="mt-4 max-w-lg text-base leading-relaxed text-white/75 sm:text-lg">
              Vendora is the renewable energy marketplace — solar panels, LiFePO4 storage, inverters and
              submersible pumps from stores that size systems properly.
            </p>
            <form onSubmit={submitSearch} className="relative mt-7 max-w-md" role="search">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-bh-muted" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Try “450W panel”, “LiFePO4”, “submersible pump”…"
                className="h-12 rounded-2xl border-transparent bg-white pl-11 pr-28 text-sm text-bh-navy-deep shadow-lg focus-visible:ring-bh-gold/60"
                aria-label="Search the marketplace"
              />
              <Button
                type="submit"
                className="absolute right-1.5 top-1/2 h-9 -translate-y-1/2 rounded-xl bg-bh-gold px-5 font-semibold text-bh-navy-deep hover:bg-bh-gold-light"
              >
                Search
              </Button>
            </form>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                size="lg"
                className="rounded-xl bg-bh-gold px-7 text-base font-bold text-bh-navy-deep shadow-card hover:bg-bh-gold-light"
                onClick={() => navigate('catalog')}
              >
                Browse all products <ArrowRight size={16} className="ml-1" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="rounded-xl border-white/25 bg-transparent px-7 text-base text-white hover:bg-white/10 hover:text-white"
                onClick={() => navigate('register-company')}
              >
                <Store size={16} className="mr-1.5" /> Sell as a company
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
                  <p className="text-xl font-extrabold tabular-nums text-white">{s.value}</p>
                  <p className="text-xs text-white/60">{s.label}</p>
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
            <div className="relative overflow-hidden rounded-3xl border-4 border-white shadow-2xl shadow-[#031d38]/50">
              <img
                src={HERO_IMAGE}
                alt="Rooftop home solar array at golden hour"
                className="aspect-[4/3] w-full object-cover"
              />
            </div>
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute -left-3 top-8 hidden rounded-2xl border border-bh-border bg-bh-card/95 p-3 shadow-hover backdrop-blur sm:flex sm:items-center sm:gap-3"
            >
              <img src={HERO_COLLAGE[3]} alt="" className="hidden h-12 w-12 rounded-xl object-cover sm:block" />
              <div>
                <p className="text-xs font-semibold text-bh-navy">Helios M-450 Panel 450W</p>
                <p className="text-xs text-bh-muted">{formatUSD(189.99)} · 412 sold</p>
              </div>
              <BadgeCheck size={16} className="text-bh-gold" />
            </motion.div>
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
              className="absolute -bottom-4 -right-2 hidden items-center gap-3 rounded-2xl border border-bh-border bg-bh-card/95 p-3 shadow-hover backdrop-blur sm:flex"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                <ShieldCheck size={17} />
              </span>
              <div>
                <p className="text-xs font-semibold text-bh-navy">Buyer protection</p>
                <p className="text-xs text-bh-muted">On every order</p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── Categories (white band) ───────────────────────── */}
      <section className="border-y border-bh-border bg-bh-card py-12" aria-labelledby="categories-heading">
        <div className="mx-auto max-w-7xl px-4">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <Eyebrow>Categories</Eyebrow>
              <h2 id="categories-heading" className="mt-3 text-2xl font-bold tracking-tight text-bh-navy">
                Shop by category
              </h2>
              <p className="mt-1 text-sm text-bh-subtle">Find your thing, faster.</p>
            </div>
            <Button variant="ghost" className="rounded-full text-bh-action hover:text-bh-navy-deep" onClick={() => navigate('catalog')}>
              View all <ArrowRight size={15} className="ml-1" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
            {(loading ? (Array.from({ length: 6 }) as (CategoryDTO | undefined)[]) : data?.categories ?? []).map((c, i) =>
              loading || !c ? (
                <div key={i} className="h-24 animate-pulse rounded-2xl bg-bh-soft-blue/70" />
              ) : (
                <motion.button
                  key={c.id}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05, duration: 0.3 }}
                  onClick={() => navigate('catalog', { category: c.slug })}
                  className="group flex flex-col items-center gap-2.5 rounded-2xl border border-bh-border bg-bh-card p-5 text-center shadow-card transition-all duration-200 hover:-translate-y-1 hover:border-bh-gold/40 hover:shadow-hover focus-visible:ring-2 focus-visible:ring-bh-gold/60 focus-visible:ring-offset-2 active:scale-[0.97]"
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
                    <p className="text-sm font-semibold leading-tight text-bh-navy transition-colors group-hover:text-bh-gold-dark">
                      {c.name}
                    </p>
                    <p className="mt-0.5 text-xs text-bh-muted">{c.productCount} items</p>
                  </div>
                </motion.button>
              )
            )}
          </div>
        </div>
      </section>

      {/* ── Recently viewed (canvas) ─────────────────────── */}
      {recentlyViewed.length > 0 && recentItems.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pb-12 pt-4" aria-labelledby="recent-heading">
          <div className="mb-5 flex items-end justify-between">
            <div>
              <h2 id="recent-heading" className="flex items-center gap-2 text-2xl font-bold tracking-tight text-bh-navy">
                <Clock className="text-bh-gold-dark" size={22} /> Recently viewed
              </h2>
              <p className="mt-1 text-sm text-bh-subtle">Pick up where you left off.</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full text-xs text-bh-muted hover:text-foreground"
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
                className="group flex w-44 shrink-0 snap-start flex-col gap-2 rounded-2xl border border-bh-border bg-bh-card p-3 text-left shadow-card transition-all hover:-translate-y-0.5 hover:border-bh-gold/40 hover:shadow-hover sm:w-52"
              >
                <div className="aspect-square overflow-hidden rounded-xl bg-bh-soft-blue/60">
                  {p.images[0] && (
                    <img
                      src={p.images[0]}
                      alt={p.title}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 dark:brightness-[0.96]"
                    />
                  )}
                </div>
                <p className="line-clamp-2 min-h-10 text-sm font-medium leading-5 text-bh-ink">{p.title}</p>
                <div className="flex w-full items-baseline justify-between gap-1.5">
                  <span className="text-sm font-bold text-bh-navy">{formatUSD(p.price)}</span>
                  {p.compareAtPrice && (
                    <span className="text-[11px] text-bh-muted line-through">
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

      {/* ── Featured (white band) ─────────────────────────── */}
      <section className="border-y border-bh-border bg-bh-card py-12" aria-labelledby="featured-heading">
        <div className="mx-auto max-w-7xl px-4">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <Eyebrow icon={BadgeCheck}>Editor’s choice</Eyebrow>
              <h2 id="featured-heading" className="mt-3 text-2xl font-bold tracking-tight text-bh-navy">
                Featured picks
              </h2>
              <p className="mt-1 text-sm text-bh-subtle">Hand-picked favorites from our editors.</p>
            </div>
            <Button
              variant="ghost"
              className="group hidden rounded-full text-bh-action hover:text-bh-navy-deep sm:flex"
              onClick={() => navigate('catalog')}
            >
              View all <ArrowRight size={15} className="ml-1 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {(loading ? (Array.from({ length: 8 }) as (ProductDTO | undefined)[]) : data?.featured ?? []).map((p, i) =>
              loading || !p ? <ProductCardSkeleton key={i} /> : <ProductCard key={p.id} product={p} index={i} />
            )}
          </div>
        </div>
      </section>

      {/* ── Sell CTA (canvas + navy card) ────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-12">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#052e56] via-[#06396c] to-[#0a4a8c] px-6 py-10 text-white sm:px-12">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-bh-gold/20 blur-[110px]" />
            <div className="absolute -right-16 bottom-0 h-72 w-72 rounded-full bg-bh-gold/10 blur-[100px]" />
            <div
              className="absolute inset-0 opacity-[0.12]"
              style={{
                backgroundImage:
                  'linear-gradient(rgba(211,175,60,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(211,175,60,0.14) 1px, transparent 1px)',
                backgroundSize: '44px 44px',
                maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black, transparent)',
              }}
            />
          </div>
          <div className="relative flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
            <div className="max-w-xl">
              <span className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-white/90 backdrop-blur-sm">
                <Store size={13} aria-hidden /> For companies & suppliers
              </span>
              <h2 className="text-3xl font-extrabold tracking-tight text-white">Sell on the shared catalog</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/75 sm:text-base">
                Offer your products on the marketplace with your own pricing, stock and lead times — or
                propose new products to the catalog. Your company workspace has everything you need.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <Button
                size="lg"
                className="rounded-xl bg-bh-gold px-7 text-base font-bold text-bh-navy-deep shadow-card hover:bg-bh-gold-light"
                onClick={() => navigate('business')}
              >
                Open your company workspace <ArrowRight size={16} className="ml-1" />
              </Button>
              <p className="text-center text-xs text-white/70">Offers, proposals, stores & sales in one place</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Trending (white band) ─────────────────────────── */}
      <section className="border-y border-bh-border bg-bh-card py-12" aria-labelledby="trending-heading">
        <div className="mx-auto max-w-7xl px-4">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <Eyebrow icon={Flame}>Hot right now</Eyebrow>
              <h2 id="trending-heading" className="mt-3 text-2xl font-bold tracking-tight text-bh-navy">
                Trending this week
              </h2>
              <p className="mt-1 text-sm text-bh-subtle">What everyone is adding to cart.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {(loading ? (Array.from({ length: 8 }) as (ProductDTO | undefined)[]) : data?.trending ?? []).map((p, i) =>
              loading || !p ? <ProductCardSkeleton key={i} /> : <ProductCard key={p.id} product={p} index={i} />
            )}
          </div>
        </div>
      </section>

      {/* ── New arrivals (canvas) ────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-12" aria-labelledby="new-heading">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <Eyebrow icon={TrendingUp}>Just listed</Eyebrow>
            <h2 id="new-heading" className="mt-3 text-2xl font-bold tracking-tight text-bh-navy">
              Fresh arrivals
            </h2>
            <p className="mt-1 text-sm text-bh-subtle">Just listed by our sellers.</p>
          </div>
          <Button
            variant="ghost"
            className="group hidden rounded-full text-bh-action hover:text-bh-navy-deep sm:flex"
            onClick={() => navigate('catalog')}
          >
            View all <ArrowRight size={15} className="ml-1 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {(loading ? (Array.from({ length: 8 }) as (ProductDTO | undefined)[]) : data?.newArrivals ?? []).map((p, i) =>
            loading || !p ? <ProductCardSkeleton key={i} /> : <ProductCard key={p.id} product={p} index={i} />
          )}
        </div>
      </section>
    </div>
  )
}
