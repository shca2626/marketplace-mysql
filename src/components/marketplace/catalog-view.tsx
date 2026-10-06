'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BadgeCheck, ChevronDown, Info, Loader2, Medal, PackageSearch, SlidersHorizontal, X } from 'lucide-react'
import { useMarketplace } from '@/store/marketplace'
import { useApi } from '@/hooks/use-api'
import type { CategoryDTO, ProductDTO } from '@/lib/types'
import { ProductCard, ProductCardSkeleton } from './product-card'
// Phase 7.2 — mobile display-currency chips (desktop copy lives in the header)
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

// ── Phase 12 (task 12-b) — discovery depth ───────────────────────────────────
// • spec=<Label>::<Value> facet filters (shareable via the URL — kept in the
//   query string with history.replaceState so deep links work on boot)
// • brand=<slug> catalog filter (the brands directory links here)
// • typo-tolerant search strip ("Showing results for …" / "Did you mean …")
// • "Bestsellers in <category>" rail (top 6 by soldCount, horizontal scroll)
// ─────────────────────────────────────────────────────────────────────────────

interface ProductsResponse {
  items: ProductDTO[]
  total: number
  page: number
  pages: number
  /** set when the server re-ran a typo-corrected query that yielded results */
  suggestion?: { original: string; corrected: string }
  /** set when nothing matched and no correction helped — "did you mean" chips */
  suggestions?: string[]
}

interface FacetsResponse {
  category: { slug: string; name: string } | null
  labels: Array<{
    label: string
    key: string | null
    unit: string | null
    values: Array<{ value: string; count: number }>
  }>
}

interface BrandsDirectoryResponse {
  brands: Array<{
    id: string
    name: string
    slug: string
    productCount: number
  }>
  total: number
}

const SORTS = [
  { value: 'popular', label: 'Most popular' },
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'rating', label: 'Best rated' },
]

const PER_PAGE = 12

/** Read the shareable spec/brand params straight from the address bar (client-only mount). */
function readLocationFilters() {
  if (typeof window === 'undefined') return { specs: [] as string[], brand: '' }
  const sp = new URLSearchParams(window.location.search)
  return {
    specs: sp.getAll('spec').filter((s) => s.includes('::')).slice(0, 12),
    brand: sp.get('brand') ?? '',
  }
}

/** Keep the facet/brand filters in the URL (replaceState — shareable, no history spam). */
function syncLocationFilters(specs: string[], brand: string) {
  if (typeof window === 'undefined') return
  try {
    const url = new URL(window.location.href)
    url.searchParams.delete('spec')
    url.searchParams.delete('brand')
    for (const s of specs) url.searchParams.append('spec', s)
    if (brand) url.searchParams.set('brand', brand)
    window.history.replaceState({}, '', url)
  } catch {
    /* non-fatal — the grid keeps working even if the URL can't be touched */
  }
}

export function CatalogView() {
  const params = useMarketplace((s) => s.params)
  const navigate = useMarketplace((s) => s.navigate)

  const initial = useMemo(readLocationFilters, [])
  const [category, setCategory] = useState<string>(params.category ?? '')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [sort, setSort] = useState('popular')
  const [page, setPage] = useState(1)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  // Phase 12 — spec facets (["Label::Value"]) + brand filter
  const [specs, setSpecs] = useState<string[]>(initial.specs)
  const [brand, setBrand] = useState(initial.brand)
  // Phase 12 — typo-suggestion payloads from the last products response
  const [suggestion, setSuggestion] = useState<ProductsResponse['suggestion'] | null>(null)
  const [suggestions, setSuggestions] = useState<string[]>([])
  // The query the user explicitly re-searched via "search instead for …"
  // (suppresses the correction for that term — breaks the suggest loop)
  const [suppressedQuery, setSuppressedQuery] = useState<string | null>(null)

  // Accumulated product list across pages (infinite scroll / Load more)
  const [products, setProducts] = useState<ProductDTO[]>([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const requestSeqRef = useRef(0) // guards against stale async responses overwriting newer ones

  // Sync local state when navigation params change while the view stays mounted
  // (e.g. searching from a product page, switching categories from the header)
  const navKey = `${params.category ?? ''}|${params.query ?? ''}`
  const [prevNavKey, setPrevNavKey] = useState(navKey)
  if (prevNavKey !== navKey) {
    setPrevNavKey(navKey)
    setCategory(params.category ?? '')
    setPage(1)
    setProducts([])
    setSpecs([])
    setBrand('')
    setSuggestion(null)
    setSuggestions([])
    setLoading(true) // avoid flashing the empty state before the fetch starts
  }

  const { data: catData } = useApi<{ categories: CategoryDTO[] }>('/api/categories')
  const categories = catData?.categories ?? []

  // Phase 12 — facet aggregation + brand list (both cheap, cached server-side)
  const { data: facetsData } = useApi<FacetsResponse>(
    category ? `/api/products/facets?category=${encodeURIComponent(category)}` : null
  )
  const facetLabels = facetsData?.labels ?? []
  const { data: brandsData } = useApi<BrandsDirectoryResponse>('/api/brands')
  const brandOptions = (brandsData?.brands ?? []).slice(0, 20)

  const activeBrand = brandOptions.find((b) => b.slug === brand) ?? null

  const baseQuery = useMemo(() => {
    const sp = new URLSearchParams()
    if (params.query) sp.set('q', params.query)
    if (category) sp.set('category', category)
    if (minPrice) sp.set('min', minPrice)
    if (maxPrice) sp.set('max', maxPrice)
    if (brand) sp.set('brand', brand)
    for (const s of specs) sp.append('spec', s)
    if (suppressedQuery && suppressedQuery === params.query) sp.set('nosuggest', '1')
    sp.set('sort', sort)
    sp.set('limit', String(PER_PAGE))
    return sp.toString()
  }, [params.query, category, minPrice, maxPrice, sort, brand, specs, suppressedQuery])

  const loadPage = useCallback(
    async (p: number, mode: 'replace' | 'append') => {
      const seq = ++requestSeqRef.current
      if (mode === 'replace') setLoading(true)
      else setLoadingMore(true)
      try {
        const res = await fetch(`/api/products?${baseQuery}&page=${p}`, { cache: 'no-store' })
        if (!res.ok) return
        const json = (await res.json()) as ProductsResponse
        if (seq !== requestSeqRef.current) return // a newer request superseded this one
        setTotal(json.total)
        setPages(json.pages)
        setSuggestion(json.suggestion ?? null)
        setSuggestions(json.suggestions ?? [])
        setProducts((prev) => {
          if (mode === 'replace' || p === 1) return json.items
          const seen = new Set(prev.map((x) => x.id))
          return [...prev, ...json.items.filter((x) => !seen.has(x.id))]
        })
      } catch {
        // network error — keep current items; Load more stays available for retry
      } finally {
        if (seq === requestSeqRef.current) {
          setLoading(false)
          setLoadingMore(false)
        }
      }
    },
    [baseQuery]
  )

  // (Re)load the first page whenever filters/sort/query change
  useEffect(() => {
    void loadPage(1, 'replace')
  }, [loadPage])

  const canLoadMore = page < pages && !loadingMore && !loading && products.length > 0

  const loadMore = useCallback(() => {
    if (page >= pages || loadingMore || loading) return
    const next = page + 1
    setPage(next)
    void loadPage(next, 'append')
  }, [page, pages, loadingMore, loading, loadPage])

  // Auto-load next page when the sentinel scrolls into view
  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !canLoadMore) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore()
      },
      { rootMargin: '600px 0px' }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [canLoadMore, loadMore])

  // ── Phase 12 — "Bestsellers in <category>" rail (top 6 by soldCount) ──────
  // Pure-category strip: hidden once the visitor searches or refines so it
  // never disagrees with the grid below it.
  const bestsellersVisible = Boolean(category) && !params.query && specs.length === 0 && !brand
  const [bestsellers, setBestsellers] = useState<ProductDTO[]>([])
  const bestsellersKey = bestsellersVisible ? category : null
  useEffect(() => {
    if (!bestsellersKey) {
      setBestsellers([])
      return
    }
    let cancelled = false
    fetch(`/api/products?category=${encodeURIComponent(bestsellersKey)}&sort=popular&limit=6`, {
      cache: 'no-store',
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status))
        return (await res.json()) as ProductsResponse
      })
      .then((json) => {
        if (!cancelled) setBestsellers(json.items ?? [])
      })
      .catch(() => {
        if (!cancelled) setBestsellers([])
      })
    return () => {
      cancelled = true
    }
  }, [bestsellersKey])

  const hasFilters = Boolean(category || minPrice || maxPrice || params.query || brand || specs.length > 0)
  const activeFilterCount =
    (category ? 1 : 0) +
    (minPrice || maxPrice ? 1 : 0) +
    (params.query ? 1 : 0) +
    (brand ? 1 : 0) +
    specs.length

  const clearFilters = () => {
    setCategory('')
    setMinPrice('')
    setMaxPrice('')
    setPage(1)
    setSpecs([])
    setBrand('')
    syncLocationFilters([], '')
    navigate('catalog')
  }

  // ── facet + brand helpers ─────────────────────────────────────────────────
  const toggleSpec = (label: string, value: string) => {
    const key = `${label}::${value}`
    const next = specs.includes(key) ? specs.filter((s) => s !== key) : [...specs, key]
    setSpecs(next)
    setPage(1)
    syncLocationFilters(next, brand)
  }

  const chooseBrand = (slug: string) => {
    setBrand(slug)
    setPage(1)
    syncLocationFilters(specs, slug)
  }

  /** "search instead for <original>" — refetch without the server correction. */
  const searchInstead = () => {
    if (!params.query) return
    setSuppressedQuery(params.query)
    setPage(1)
  }

  const filterContent = (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-sm font-semibold">Categories</h3>
        <RadioGroup
          value={category || 'all'}
          onValueChange={(v) => {
            setCategory(v === 'all' ? '' : v)
            setSpecs([])
            syncLocationFilters([], brand)
            setPage(1)
          }}
          className="gap-1"
        >
          {[
            { value: 'all', id: 'cat-all', name: 'All categories', count: categories.reduce((s, c) => s + (c.productCount ?? 0), 0) },
            ...categories.map((c) => ({ value: c.slug, id: `cat-${c.slug}`, name: c.name, count: c.productCount })),
          ].map((row) => {
            const selected = (category || 'all') === row.value
            return (
              <label
                key={row.id}
                htmlFor={row.id}
                className={cn(
                  'flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 transition-colors',
                  selected ? 'bg-bh-soft-blue' : 'hover:bg-bh-soft-blue/60'
                )}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <RadioGroupItem value={row.value} id={row.id} className="border-bh-faded" />
                  <span
                    className={cn(
                      'truncate text-sm',
                      selected ? 'font-semibold text-bh-navy' : 'font-normal text-bh-subtle'
                    )}
                  >
                    {row.name}
                  </span>
                </span>
                <span
                  className={cn(
                    'shrink-0 text-xs tabular-nums',
                    selected ? 'font-semibold text-bh-gold-dark' : 'text-bh-muted'
                  )}
                >
                  {row.count}
                </span>
              </label>
            )
          })}
        </RadioGroup>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold">Price range</h3>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            placeholder="Min"
            value={minPrice}
            onChange={(e) => {
              setMinPrice(e.target.value)
              setPage(1)
            }}
            className="h-9 text-sm tabular-nums [color-scheme:light] dark:[color-scheme:dark]"
            aria-label="Minimum price"
          />
          <span className="text-muted-foreground">—</span>
          <Input
            type="number"
            min={0}
            placeholder="Max"
            value={maxPrice}
            onChange={(e) => {
              setMaxPrice(e.target.value)
              setPage(1)
            }}
            className="h-9 text-sm tabular-nums [color-scheme:light] dark:[color-scheme:dark]"
            aria-label="Maximum price"
          />
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {[
            { label: 'Under $25', min: '', max: '25' },
            { label: '$25–$75', min: '25', max: '75' },
            { label: '$75–$150', min: '75', max: '150' },
            { label: '$150+', min: '150', max: '' },
          ].map((r) => (
            <button
              key={r.label}
              onClick={() => {
                setMinPrice(r.min)
                setMaxPrice(r.max)
                setPage(1)
              }}
              className={cn(
                'rounded-full border border-bh-border bg-bh-card px-2.5 py-1 text-xs text-bh-muted transition-colors hover:border-bh-gold/50 hover:text-bh-navy',
                minPrice === r.min && maxPrice === r.max && 'border-bh-navy bg-bh-navy text-white hover:border-bh-navy hover:text-white'
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Phase 12 — spec-attribute facets ("Refine") for the selected category */}
      {category && facetLabels.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-semibold">Refine</h3>
          <p className="mb-3 text-xs text-bh-muted">Narrow by specification attributes.</p>
          <div className="max-h-96 space-y-4 overflow-y-auto pr-1 scrollbar-thin">
            {facetLabels.map((f) => (
              <div key={f.label}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-bh-subtle">
                  {f.label}
                  {f.unit ? <span className="ml-1 font-normal normal-case text-bh-muted">({f.unit})</span> : null}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {f.values.map((v) => {
                    const active = specs.includes(`${f.label}::${v.value}`)
                    return (
                      <button
                        key={v.value}
                        onClick={() => toggleSpec(f.label, v.value)}
                        aria-pressed={active}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                          active
                            ? 'border-bh-navy bg-bh-navy font-medium text-white'
                            : 'border-bh-border bg-bh-card text-bh-muted hover:border-bh-gold/50 hover:text-bh-navy'
                        )}
                      >
                        {active && <span className="h-1.5 w-1.5 rounded-full bg-bh-gold" aria-hidden />}
                        {v.value}
                        <span className={cn('tabular-nums', active ? 'text-white/70' : 'text-bh-muted')}>
                          {v.count}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Phase 12 — brand filter */}
      {brandOptions.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold">Brands</h3>
          <div className="max-h-64 space-y-1 overflow-y-auto pr-1 scrollbar-thin">
            <button
              onClick={() => chooseBrand('')}
              className={cn(
                'flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-sm transition-colors',
                !brand ? 'bg-bh-soft-blue font-semibold text-bh-navy' : 'text-bh-subtle hover:bg-bh-soft-blue/60'
              )}
            >
              All brands
            </button>
            {brandOptions.map((b) => (
              <button
                key={b.id}
                onClick={() => chooseBrand(brand === b.slug ? '' : b.slug)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-left text-sm transition-colors',
                  brand === b.slug
                    ? 'bg-bh-soft-blue font-semibold text-bh-navy'
                    : 'text-bh-subtle hover:bg-bh-soft-blue/60'
                )}
              >
                <span className="truncate">{b.name}</span>
                <span
                  className={cn(
                    'shrink-0 text-xs tabular-nums',
                    brand === b.slug ? 'font-semibold text-bh-gold-dark' : 'text-bh-muted'
                  )}
                >
                  {b.productCount}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  const categoryName = categories.find((c) => c.slug === category)?.name ?? 'Products'

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-bh-navy sm:text-3xl">
          {params.query ? (
            <>
              Results for <span className="text-bh-gold-dark">“{params.query}”</span>
            </>
          ) : category ? (
            categoryName
          ) : (
            'All products'
          )}
        </h1>
        <p className="mt-1 text-sm text-bh-muted">
          {loading ? 'Loading…' : `${total} ${total === 1 ? 'product' : 'products'} found`}
        </p>
      </div>

      <div className="flex gap-8">
        {/* Sidebar filters (desktop) */}
        <aside className="hidden w-56 shrink-0 lg:block" aria-label="Filters">
          <div className="sticky top-36 max-h-[calc(100vh-11rem)] space-y-6 overflow-y-auto rounded-2xl border border-bh-border bg-bh-card p-5 shadow-card scrollbar-thin">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-bh-navy">
                <SlidersHorizontal size={14} className="text-bh-gold-dark" /> Filters
              </h3>
              {hasFilters && (
                <Button variant="ghost" size="sm" className="h-7 rounded-full px-2 text-xs text-bh-action" onClick={clearFilters}>
                  Clear
                </Button>
              )}
            </div>
            {filterContent}
          </div>
        </aside>

        {/* Main */}
        <div className="min-w-0 flex-1">
          {/* Toolbar */}
          <div className="mb-5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="rounded-full lg:hidden">
                  <SlidersHorizontal size={14} className="mr-1.5" /> Filters
                  {activeFilterCount > 0 && (
                    <Badge className="ml-1.5 h-5 min-w-5 justify-center rounded-full px-1.5 text-[10px] font-bold leading-none">
                      {activeFilterCount}
                    </Badge>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-80">
                <SheetHeader>
                  <SheetTitle className="text-left">Filters</SheetTitle>
                </SheetHeader>
                <div className="px-4 pb-8">{filterContent}</div>
              </SheetContent>
            </Sheet>

            {hasFilters && (
              <Button variant="ghost" size="sm" className="rounded-full text-muted-foreground lg:hidden" onClick={clearFilters}>
                <X size={14} className="mr-1" /> Clear
              </Button>
            )}

            <div className="ml-auto flex min-w-0 items-center gap-2">
              {/* Phase 7.2 — display currency on mobile (the header copy is
                  hidden below sm to keep the compact top bar uncluttered). */}
              <span className="hidden text-xs text-bh-muted sm:block">Sort by</span>
              <Select value={sort} onValueChange={(v) => { setSort(v); setPage(1) }}>
                <SelectTrigger
                  size="sm"
                  className="h-9 w-32 rounded-full text-sm sm:w-44"
                  aria-label="Sort products"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORTS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Typo-suggestion strip (Phase 12) */}
          {suggestion && !loading && (
            <div
              className="mb-4 flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-2xl border border-bh-gold/30 bg-bh-bg-gold/60 px-4 py-3 text-sm text-bh-subtle"
              role="status"
            >
              <Info size={15} className="mr-1 shrink-0 text-bh-gold-dark" aria-hidden />
              <span>
                Showing results for{' '}
                <span className="font-semibold text-bh-navy">“{suggestion.corrected}”</span>
              </span>
              <span className="text-bh-muted">—</span>
              <button
                onClick={searchInstead}
                className="font-medium text-bh-action underline underline-offset-2 transition-colors hover:text-bh-navy"
              >
                search instead for “{suggestion.original}”
              </button>
            </div>
          )}
          {!loading && products.length === 0 && suggestions.length > 0 && (
            <div
              className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-2 rounded-2xl border border-bh-border bg-bh-card px-4 py-3 text-sm text-bh-subtle shadow-card"
              role="status"
            >
              <span>Did you mean</span>
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => navigate('catalog', { query: s })}
                  className="rounded-full border border-bh-gold/40 bg-bh-bg-gold px-3 py-1 text-xs font-semibold text-bh-gold-dark transition-colors hover:border-bh-gold hover:text-bh-navy"
                >
                  {s}
                </button>
              ))}
              <span>?</span>
            </div>
          )}

          {/* Active filter chips */}
          {(category || minPrice || maxPrice || brand || specs.length > 0) && (
            <div className="mb-4 flex flex-wrap gap-2">
              {category && (
                <span className="inline-flex items-center gap-1 rounded-full bg-bh-navy py-1.5 pl-3 pr-2 text-xs font-medium text-white">
                  {categoryName}
                  <button
                    onClick={() => {
                      setCategory('')
                      setSpecs([])
                      syncLocationFilters([], brand)
                    }}
                    className="rounded-full p-0.5 transition-colors hover:text-bh-gold-light"
                    aria-label="Remove category filter"
                  >
                    <X size={12} />
                  </button>
                </span>
              )}
              {(minPrice || maxPrice) && (
                <span className="inline-flex items-center gap-1 rounded-full bg-bh-navy py-1.5 pl-3 pr-2 text-xs font-medium text-white">
                  ${minPrice || '0'} – ${maxPrice || '∞'}
                  <button
                    onClick={() => {
                      setMinPrice('')
                      setMaxPrice('')
                    }}
                    className="rounded-full p-0.5 transition-colors hover:text-bh-gold-light"
                    aria-label="Remove price filter"
                  >
                    <X size={12} />
                  </button>
                </span>
              )}
              {brand && (
                <span className="inline-flex items-center gap-1 rounded-full bg-bh-navy py-1.5 pl-3 pr-2 text-xs font-medium text-white">
                  <BadgeCheck size={12} className="text-bh-gold" aria-hidden />
                  {activeBrand?.name ?? brand}
                  <button
                    onClick={() => chooseBrand('')}
                    className="rounded-full p-0.5 transition-colors hover:text-bh-gold-light"
                    aria-label="Remove brand filter"
                  >
                    <X size={12} />
                  </button>
                </span>
              )}
              {specs.map((s) => {
                const sep = s.indexOf('::')
                const label = s.slice(0, sep)
                const value = s.slice(sep + 2)
                return (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1 rounded-full bg-bh-navy py-1.5 pl-3 pr-2 text-xs font-medium text-white"
                  >
                    {label}: {value}
                    <button
                      onClick={() => toggleSpec(label, value)}
                      className="rounded-full p-0.5 transition-colors hover:text-bh-gold-light"
                      aria-label={`Remove ${label} ${value} filter`}
                    >
                      <X size={12} />
                    </button>
                  </span>
                )
              })}
            </div>
          )}

          {/* Bestsellers rail (Phase 12) — top 6 by soldCount on a category page */}
          {bestsellersVisible && bestsellers.length > 0 && (
            <section className="mb-6" aria-labelledby="bestsellers-heading">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 id="bestsellers-heading" className="flex items-center gap-2 text-base font-bold tracking-tight text-bh-navy">
                  <Medal size={16} className="text-bh-gold-dark" aria-hidden />
                  Bestsellers in {categoryName}
                </h2>
                <span className="text-xs text-bh-muted">Top by units sold</span>
              </div>
              <div className="flex snap-x gap-4 overflow-x-auto pb-2 scrollbar-thin" role="list" aria-label={`Bestsellers in ${categoryName}`}>
                {bestsellers.map((p, i) => (
                  <div key={p.id} className="w-40 shrink-0 snap-start sm:w-48" role="listitem">
                    <ProductCard product={p} index={i} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Grid */}
          {loading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-bh-border bg-bh-card py-16 text-center shadow-card">
              <div className="relative">
                <div className="absolute inset-0 -z-10 scale-150 rounded-full bg-bh-gold/15 blur-2xl" aria-hidden />
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-bh-bg-gold text-bh-gold-dark shadow-sm">
                  <PackageSearch size={34} aria-hidden />
                </div>
              </div>
              <h3 className="mt-5 text-lg font-semibold text-bh-navy">No products found</h3>
              <p className="mt-1 max-w-sm text-sm text-bh-muted">
                {params.query
                  ? `Nothing matches “${params.query}” with these filters — try clearing them or search for something else.`
                  : 'Try adjusting your filters or browse a category below.'}
              </p>
              <Button
                className="mt-5 rounded-full bg-bh-gold font-semibold text-bh-navy-deep hover:bg-bh-gold-light"
                onClick={clearFilters}
              >
                Clear all filters
              </Button>
              {categories.length > 0 && (
                <div className="mt-7 w-full border-t border-bh-border bg-bh-soft-blue/50 px-6 py-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-bh-muted">
                    Popular categories
                  </p>
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    {categories.slice(0, 6).map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          // Navigate (not just setCategory) so a stale search
                          // query from the empty state is cleared too.
                          if (params.query) navigate('catalog', { category: c.slug })
                          else {
                            setCategory(c.slug)
                            setSpecs([])
                            syncLocationFilters([], brand)
                            setPage(1)
                          }
                        }}
                        className="rounded-full border border-bh-border bg-bh-card px-3.5 py-1.5 text-xs font-medium text-bh-subtle shadow-sm transition-all hover:-translate-y-0.5 hover:border-bh-gold/50 hover:text-bh-navy"
                      >
                        {c.name}
                        <span className="ml-1.5 text-bh-muted">{c.productCount}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                {products.map((p, i) => (
                  <ProductCard key={p.id} product={p} index={i % PER_PAGE} />
                ))}
                {loadingMore &&
                  Array.from({ length: 4 }).map((_, i) => (
                    <ProductCardSkeleton key={`more-${i}`} />
                  ))}
              </div>

              {/* Infinite-scroll sentinel + Load more */}
              <div ref={sentinelRef} className="h-px" aria-hidden="true" />
              <div className="mt-8 flex flex-col items-center gap-2.5">
                <p className="text-xs text-bh-muted" aria-live="polite">
                  Showing {products.length} of {total}{' '}
                  {total === 1 ? 'product' : 'products'}
                  {pages > 1 && !loadingMore && canLoadMore ? ' — scroll for more' : ''}
                </p>
                {canLoadMore && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={loadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore ? (
                      <Loader2 size={14} className="mr-1.5 animate-spin" />
                    ) : (
                      <ChevronDown size={14} className="mr-1.5" />
                    )}
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
