'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  BadgeCheck,
  ChevronDown,
  ExternalLink,
  Globe2,
  Loader2,
  PackageX,
  Search,
  Store,
} from 'lucide-react'
import { useMarketplace } from '@/store/marketplace'
import type { ProductDTO } from '@/lib/types'
import { formatUSD } from '@/lib/format'
import { ProductCard, ProductCardSkeleton } from './product-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
// BRANDS DIRECTORY — Phase 12 (lastplan v5 §12): public storefront view.
//
// Two modes driven by params.brandSlug:
//   • Directory: every brand with live listings (logo, product count, a peek
//     at its top products) — /market?view=brands
//   • Brand page (brandSlug set): the brand's story + ALL its live products
//     with search-within-brand + sort — /market?view=brands&brand=<slug>
// ─────────────────────────────────────────────────────────────────────────────

interface BrandDirectoryItem {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  description: string | null
  originCountry: string | null
  isVerified: boolean
  productCount: number
  topCategories: { slug: string; name: string; count: number }[]
  preview: { id: string; title: string; price: number; thumbnail: string | null }[]
}

interface DirectoryResponse {
  brands: BrandDirectoryItem[]
  total: number
}

interface BrandDetail {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  description: string | null
  websiteUrl: string | null
  originCountry: string | null
  isVerified: boolean
  productCount: number
}

interface BrandDetailResponse {
  brand: BrandDetail
  items: ProductDTO[]
  total: number
  page: number
  pages: number
}

const BRAND_SORTS = [
  { value: 'popular', label: 'Most popular' },
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'rating', label: 'Best rated' },
]

function BrandMark({
  name,
  logoUrl,
  size = 'md',
  className,
}: {
  name: string
  logoUrl: string | null
  size?: 'md' | 'lg'
  className?: string
}) {
  const box = size === 'lg' ? 'h-16 w-16 rounded-2xl text-xl' : 'h-11 w-11 rounded-xl text-sm'
  if (logoUrl) {
    return (
      <span className={cn('flex shrink-0 items-center justify-center overflow-hidden border border-bh-border bg-bh-card', box, className)}>
        <img src={logoUrl} alt={`${name} logo`} className="h-full w-full object-contain p-1" loading="lazy" />
      </span>
    )
  }
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center bg-bh-navy-deep font-extrabold uppercase tracking-wide text-bh-gold',
        box,
        className
      )}
    >
      {name.slice(0, 2)}
    </span>
  )
}

export function BrandsView() {
  const params = useMarketplace((s) => s.params)
  const navigate = useMarketplace((s) => s.navigate)

  if (params.brandSlug) {
    return <BrandPage slug={params.brandSlug} />
  }
  return <BrandsDirectory />
}

// ── Directory mode ───────────────────────────────────────────────────────────

function BrandsDirectory() {
  const navigate = useMarketplace((s) => s.navigate)
  const [brands, setBrands] = useState<BrandDirectoryItem[] | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setBrands(null)
      setNotFound(false)
      try {
        const res = await fetch('/api/brands', { cache: 'no-store' })
        if (!res.ok) throw new Error(String(res.status))
        const json = (await res.json()) as DirectoryResponse
        if (!cancelled) setBrands(json.brands ?? [])
      } catch {
        if (!cancelled) setNotFound(true)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-bh-gold-dark">Directory</p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-bh-navy sm:text-3xl">
          Shop by brand
        </h1>
        <p className="mt-1 text-sm text-bh-muted">
          {brands === null
            ? 'Loading brands…'
            : `${brands.length} ${brands.length === 1 ? 'brand' : 'brands'} with live listings on Vendora`}
        </p>
      </div>

      {/* Grid */}
      {brands === null ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-bh-border bg-bh-card p-5 shadow-card">
              <div className="flex items-center gap-3">
                <Skeleton className="h-11 w-11 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
              <Skeleton className="mt-4 h-16 w-full rounded-xl" />
            </div>
          ))}
        </div>
      ) : brands.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-bh-border bg-bh-card py-16 text-center shadow-card">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-bh-bg-gold text-bh-gold-dark">
            <Store size={34} aria-hidden />
          </div>
          <h3 className="mt-5 text-lg font-semibold text-bh-navy">No brands yet</h3>
          <p className="mt-1 max-w-sm text-sm text-bh-muted">
            Brands appear here as soon as listings are linked to them — check back soon.
          </p>
          <Button
            className="mt-5 rounded-full bg-bh-gold font-semibold text-bh-navy-deep hover:bg-bh-gold-light"
            onClick={() => navigate('catalog')}
          >
            Browse the catalog
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {brands.map((b, i) => (
            <motion.button
              key={b.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: Math.min(i * 0.04, 0.3) }}
              onClick={() => navigate('brands', { brandSlug: b.slug })}
              className="group flex flex-col rounded-2xl border border-bh-border bg-bh-card p-5 text-left shadow-card transition-all hover:-translate-y-0.5 hover:border-bh-gold/50 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <BrandMark name={b.name} logoUrl={b.logoUrl} />
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate font-semibold text-bh-navy">
                      <span className="truncate">{b.name}</span>
                      {b.isVerified && (
                        <BadgeCheck size={15} className="shrink-0 text-bh-gold-dark" aria-label="Verified brand" />
                      )}
                    </p>
                    <p className="text-xs text-bh-muted">
                      {b.productCount} {b.productCount === 1 ? 'listing' : 'listings'}
                      {b.originCountry ? ` · ${b.originCountry}` : ''}
                    </p>
                  </div>
                </div>
                <span className="rounded-full border border-bh-border bg-bh-soft-blue px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-bh-muted">
                  Brand
                </span>
              </div>

              {b.description && (
                <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-bh-subtle">{b.description}</p>
              )}

              {b.topCategories.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {b.topCategories.map((c) => (
                    <span
                      key={c.slug}
                      className="rounded-full border border-bh-border bg-bh-card px-2.5 py-1 text-[11px] font-medium text-bh-subtle"
                    >
                      {c.name} <span className="text-bh-muted">{c.count}</span>
                    </span>
                  ))}
                </div>
              )}

              {b.preview.length > 0 && (
                <div className="mt-4 grid grid-cols-4 gap-2">
                  {b.preview.map((p) => (
                    <span key={p.id} className="block overflow-hidden rounded-lg border border-bh-border bg-bh-soft-blue/60" title={p.title}>
                      {p.thumbnail ? (
                        <img
                          src={p.thumbnail}
                          alt=""
                          className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-105 dark:brightness-[0.96]"
                          loading="lazy"
                        />
                      ) : (
                        <span className="flex aspect-square w-full items-center justify-center text-[10px] text-bh-muted">
                          {formatUSD(p.price)}
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </motion.button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Brand page mode ──────────────────────────────────────────────────────────

function BrandPage({ slug }: { slug: string }) {
  const navigate = useMarketplace((s) => s.navigate)
  const [brand, setBrand] = useState<BrandDetail | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('popular')
  const [products, setProducts] = useState<ProductDTO[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [debounced, setDebounced] = useState('')
  const requestSeqRef = useRef(0)

  // debounce the search-within-brand input
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim())
      setPage(1)
    }, 250)
    return () => clearTimeout(t)
  }, [search])

  const query = useMemo(() => {
    const sp = new URLSearchParams()
    if (debounced) sp.set('q', debounced)
    sp.set('sort', sort)
    sp.set('limit', '12')
    return sp.toString()
  }, [debounced, sort])

  useEffect(() => {
    const seq = ++requestSeqRef.current
    const load = async () => {
      setLoading(true)
      setNotFound(false)
      try {
        const res = await fetch(`/api/brands/${encodeURIComponent(slug)}?${query}&page=${page}`, {
          cache: 'no-store',
        })
        if (res.status === 404) {
          setNotFound(true)
          return
        }
        if (!res.ok) throw new Error(String(res.status))
        const json = (await res.json()) as BrandDetailResponse
        if (seq !== requestSeqRef.current || !json) return
        setBrand(json.brand)
        setTotal(json.total)
        setPages(json.pages)
        setProducts((prev) => {
          if (page === 1) return json.items
          const seen = new Set(prev.map((x) => x.id))
          return [...prev, ...json.items.filter((x) => !seen.has(x.id))]
        })
      } catch {
        /* keep current items — Load more stays available for retry */
      } finally {
        if (seq === requestSeqRef.current) {
          setLoading(false)
          setLoadingMore(false)
        }
      }
    }
    void load()
  }, [slug, query, page])

  const loadMore = () => {
    if (page >= pages || loadingMore || loading) return
    setLoadingMore(true)
    setPage(page + 1)
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16">
        <div className="flex flex-col items-center justify-center rounded-2xl border border-bh-border bg-bh-card py-16 text-center shadow-card">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-bh-bg-gold text-bh-gold-dark">
            <PackageX size={34} aria-hidden />
          </div>
          <h3 className="mt-5 text-lg font-semibold text-bh-navy">Brand not found</h3>
          <p className="mt-1 max-w-sm text-sm text-bh-muted">
            We couldn&apos;t find that brand — it may have been renamed or removed.
          </p>
          <Button
            className="mt-5 rounded-full bg-bh-gold font-semibold text-bh-navy-deep hover:bg-bh-gold-light"
            onClick={() => navigate('brands')}
          >
            <ArrowLeft size={14} className="mr-1.5" /> All brands
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-5">
        <Button
          variant="ghost"
          size="sm"
          className="rounded-full text-bh-muted hover:text-bh-navy"
          onClick={() => navigate('brands')}
        >
          <ArrowLeft size={14} className="mr-1.5" /> All brands
        </Button>
      </nav>

      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-bh-border bg-bh-card p-6 shadow-card sm:p-8">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-bh-gold/10 blur-[90px]" />
        {brand === null && loading ? (
          <div className="flex items-center gap-5">
            <Skeleton className="h-16 w-16 rounded-2xl" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
        ) : brand ? (
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
            <BrandMark name={brand.name} logoUrl={brand.logoUrl} size="lg" />
            <div className="min-w-0 flex-1">
              <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight text-bh-navy sm:text-3xl">
                {brand.name}
                {brand.isVerified && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-bh-gold/30 bg-bh-bg-gold px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-bh-gold-dark">
                    <BadgeCheck size={12} aria-hidden /> Verified
                  </span>
                )}
              </h1>
              <p className="mt-1 text-sm text-bh-muted">
                {brand.productCount} live {brand.productCount === 1 ? 'listing' : 'listings'}
                {brand.originCountry ? (
                  <>
                    {' '}· <Globe2 size={12} className="mb-0.5 inline" aria-hidden /> {brand.originCountry}
                  </>
                ) : null}
              </p>
              {brand.description && (
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-bh-subtle">{brand.description}</p>
              )}
              {brand.websiteUrl && (
                <a
                  href={brand.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-bh-action hover:underline"
                >
                  <ExternalLink size={13} aria-hidden /> {brand.websiteUrl.replace(/^https?:\/\//, '')}
                </a>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* Toolbar */}
      <div className="mt-6 mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search this brand…"
            className="h-10 rounded-full border-bh-border-dark bg-bh-card pl-10 text-sm shadow-none focus-visible:border-bh-gold/60 focus-visible:ring-bh-gold/40"
            aria-label="Search within this brand"
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-xs text-bh-muted sm:block">Sort by</span>
          <Select value={sort} onValueChange={(v) => { setSort(v); setPage(1) }}>
            <SelectTrigger size="sm" className="h-9 w-36 rounded-full text-sm sm:w-44" aria-label="Sort products">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BRAND_SORTS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Grid */}
      {loading && products.length === 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-bh-border bg-bh-card py-16 text-center shadow-card">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-bh-bg-gold text-bh-gold-dark">
            <PackageX size={34} aria-hidden />
          </div>
          <h3 className="mt-5 text-lg font-semibold text-bh-navy">
            {debounced ? 'Nothing matches your search' : 'This brand has no live listings'}
          </h3>
          <p className="mt-1 max-w-sm text-sm text-bh-muted">
            {debounced
              ? `Nothing in ${brand?.name ?? 'this brand'} matches “${debounced}” — try another word.`
              : 'Its products are currently unavailable — explore the full catalog instead.'}
          </p>
          <Button
            className="mt-5 rounded-full bg-bh-gold font-semibold text-bh-navy-deep hover:bg-bh-gold-light"
            onClick={() => navigate('catalog')}
          >
            Browse the catalog
          </Button>
        </div>
      ) : (
        <>
          <p className="mb-4 text-sm text-bh-muted" aria-live="polite">
            {loading ? 'Loading…' : `${total} ${total === 1 ? 'product' : 'products'} from ${brand?.name ?? 'this brand'}`}
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
            {products.map((p, i) => (
              <ProductCard key={p.id} product={p} index={i % 12} />
            ))}
            {loadingMore &&
              Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={`more-${i}`} />)}
          </div>
          {page < pages && (
            <div className="mt-8 flex justify-center">
              <Button variant="outline" size="sm" className="rounded-full" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? (
                  <Loader2 size={14} className="mr-1.5 animate-spin" />
                ) : (
                  <ChevronDown size={14} className="mr-1.5" />
                )}
                {loadingMore ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
