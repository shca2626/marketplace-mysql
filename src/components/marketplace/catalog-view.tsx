'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, PackageSearch, SlidersHorizontal, X } from 'lucide-react'
import { useMarketplace } from '@/store/marketplace'
import { useApi } from '@/hooks/use-api'
import type { CategoryDTO, ProductDTO } from '@/lib/types'
import { ProductCard, ProductCardSkeleton } from './product-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
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

interface ProductsResponse {
  items: ProductDTO[]
  total: number
  page: number
  pages: number
}

const SORTS = [
  { value: 'popular', label: 'Most popular' },
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'rating', label: 'Best rated' },
]

const PER_PAGE = 12

export function CatalogView() {
  const params = useMarketplace((s) => s.params)
  const navigate = useMarketplace((s) => s.navigate)

  const [category, setCategory] = useState<string>(params.category ?? '')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [sort, setSort] = useState('popular')
  const [page, setPage] = useState(1)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  // Sync local state when navigation params change while the view stays mounted
  // (e.g. searching from a product page, switching categories from the header)
  const navKey = `${params.category ?? ''}|${params.query ?? ''}`
  const [prevNavKey, setPrevNavKey] = useState(navKey)
  if (prevNavKey !== navKey) {
    setPrevNavKey(navKey)
    setCategory(params.category ?? '')
    setPage(1)
  }

  const { data: catData } = useApi<{ categories: CategoryDTO[] }>('/api/categories')
  const categories = catData?.categories ?? []

  const query = useMemo(() => {
    const sp = new URLSearchParams()
    if (params.query) sp.set('q', params.query)
    if (category) sp.set('category', category)
    if (minPrice) sp.set('min', minPrice)
    if (maxPrice) sp.set('max', maxPrice)
    sp.set('sort', sort)
    sp.set('page', String(page))
    sp.set('limit', String(PER_PAGE))
    return `/api/products?${sp.toString()}`
  }, [params.query, category, minPrice, maxPrice, sort, page])

  const { data, loading } = useApi<ProductsResponse>(query)
  const products = data?.items ?? []
  const hasFilters = Boolean(category || minPrice || maxPrice || params.query)

  const clearFilters = () => {
    setCategory('')
    setMinPrice('')
    setMaxPrice('')
    setPage(1)
    navigate('catalog')
  }

  const filterContent = (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-sm font-semibold">Categories</h3>
        <RadioGroup
          value={category || 'all'}
          onValueChange={(v) => {
            setCategory(v === 'all' ? '' : v)
            setPage(1)
          }}
          className="gap-2"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="all" id="cat-all" />
            <Label htmlFor="cat-all" className="cursor-pointer text-sm font-normal">
              All categories
            </Label>
          </div>
          {categories.map((c) => (
            <div key={c.id} className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value={c.slug} id={`cat-${c.slug}`} />
                <Label htmlFor={`cat-${c.slug}`} className="cursor-pointer text-sm font-normal">
                  {c.name}
                </Label>
              </div>
              <span className="text-xs text-muted-foreground">{c.productCount}</span>
            </div>
          ))}
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
            className="h-9 text-sm"
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
            className="h-9 text-sm"
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
                'rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground',
                minPrice === r.min && maxPrice === r.max && 'border-primary bg-primary/10 text-primary'
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {params.query ? (
            <>
              Results for <span className="text-primary">“{params.query}”</span>
            </>
          ) : category ? (
            categories.find((c) => c.slug === category)?.name ?? 'Products'
          ) : (
            'All products'
          )}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {loading ? 'Loading…' : `${data?.total ?? 0} products found`}
        </p>
      </div>

      <div className="flex gap-8">
        {/* Sidebar filters (desktop) */}
        <aside className="hidden w-56 shrink-0 lg:block" aria-label="Filters">
          <div className="sticky top-36 space-y-6 rounded-2xl border bg-card p-5">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                <SlidersHorizontal size={14} /> Filters
              </h3>
              {hasFilters && (
                <Button variant="ghost" size="sm" className="h-7 rounded-full px-2 text-xs text-primary" onClick={clearFilters}>
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
          <div className="mb-5 flex items-center justify-between gap-3">
            <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="rounded-full lg:hidden">
                  <SlidersHorizontal size={14} className="mr-1.5" /> Filters
                  {hasFilters && <Badge className="ml-1.5 h-4.5 min-w-4.5 rounded-full px-1 text-[10px]">•</Badge>}
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

            <div className="ml-auto flex items-center gap-2">
              <span className="hidden text-xs text-muted-foreground sm:block">Sort by</span>
              <Select value={sort} onValueChange={(v) => { setSort(v); setPage(1) }}>
                <SelectTrigger size="sm" className="h-9 w-44 rounded-full text-sm" aria-label="Sort products">
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

          {/* Active filter chips */}
          {(category || minPrice || maxPrice) && (
            <div className="mb-4 flex flex-wrap gap-2">
              {category && (
                <Badge variant="secondary" className="gap-1 rounded-full py-1.5 pl-3 pr-2 text-xs">
                  {categories.find((c) => c.slug === category)?.name ?? category}
                  <button onClick={() => setCategory('')} aria-label="Remove category filter">
                    <X size={12} />
                  </button>
                </Badge>
              )}
              {(minPrice || maxPrice) && (
                <Badge variant="secondary" className="gap-1 rounded-full py-1.5 pl-3 pr-2 text-xs">
                  ${minPrice || '0'} – ${maxPrice || '∞'}
                  <button
                    onClick={() => {
                      setMinPrice('')
                      setMaxPrice('')
                    }}
                    aria-label="Remove price filter"
                  >
                    <X size={12} />
                  </button>
                </Badge>
              )}
            </div>
          )}

          {/* Grid */}
          {loading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-20 text-center">
              <PackageSearch size={44} className="text-muted-foreground/40" />
              <h3 className="mt-4 text-lg font-semibold">No products found</h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Try adjusting your filters or search for something else.
              </p>
              <Button className="mt-5 rounded-full" onClick={clearFilters}>
                Clear all filters
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {products.map((p, i) => (
                <ProductCard key={p.id} product={p} index={i} />
              ))}
            </div>
          )}

          {/* Pagination */}
          {!loading && (data?.pages ?? 1) > 1 && (
            <nav className="mt-8 flex items-center justify-center gap-2" aria-label="Pagination">
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 rounded-full"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Previous page"
              >
                <ChevronLeft size={16} />
              </Button>
              {Array.from({ length: data?.pages ?? 1 }).map((_, i) => (
                <Button
                  key={i}
                  variant={page === i + 1 ? 'default' : 'outline'}
                  size="icon"
                  className="h-9 w-9 rounded-full text-sm"
                  onClick={() => setPage(i + 1)}
                  aria-label={`Page ${i + 1}`}
                  aria-current={page === i + 1 ? 'page' : undefined}
                >
                  {i + 1}
                </Button>
              ))}
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 rounded-full"
                disabled={page >= (data?.pages ?? 1)}
                onClick={() => setPage((p) => p + 1)}
                aria-label="Next page"
              >
                <ChevronRight size={16} />
              </Button>
            </nav>
          )}
        </div>
      </div>
    </div>
  )
}
