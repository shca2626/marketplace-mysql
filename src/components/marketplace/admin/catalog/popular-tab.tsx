'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN CONSOLE → CATALOG POPULAR RAIL (Phase 4).
// The ranked products powering the homepage Popular rail. Reorder with the
// arrows (ranks re-POST per swap), remove with X, and add any listing in the
// catalog through the admin search combobox.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  PackageSearch,
  Plus,
  Search,
  ShieldAlert,
  TrendingUp,
  X,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { formatUSD } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { AdminEmptyState, apiRequest, toastApiError } from '../shared'

interface PopularRow {
  id: string
  title: string
  price: number
  popularRank: number
  featured: boolean
  category: string
  seller: string | null
  image: string | null
}

interface SearchItem {
  id: string
  title: string
  price: number
  image: string | null
  category?: string
  status?: string
}

export function CatalogPopularTab() {
  const [rows, setRows] = useState<PopularRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  // Add-product combobox state
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchItem[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [adding, setAdding] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await apiRequest<{ products: PopularRow[] }>('/api/admin/catalog/popular')
      if (!res.ok || !res.data) {
        setLoadError(res.error ?? 'Failed to load the popular rail')
        setRows([])
      } else {
        setRows(res.data.products)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Debounced admin product search (scope=all — every status)
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults(null)
      return
    }
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      abortRef.current?.abort()
      abortRef.current = ctrl
      setSearching(true)
      try {
        const res = await fetch(`/api/products?q=${encodeURIComponent(q)}&scope=all&limit=10`, { signal: ctrl.signal })
        if (!res.ok) return
        const json = (await res.json()) as { items?: SearchItem[] }
        setResults(json.items ?? [])
      } catch {
        /* aborted or offline */
      } finally {
        if (!ctrl.signal.aborted) setSearching(false)
      }
    }, 250)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [query])

  const setRank = async (productId: string, rank: number | null, label: string, other?: { productId: string; rank: number }) => {
    const res = await apiRequest('/api/admin/catalog/popular', {
      method: 'POST',
      body: JSON.stringify({ productId, rank }),
    })
    if (!res.ok) {
      toastApiError(res.error, 'Could not update the rank')
      return false
    }
    if (other) {
      const res2 = await apiRequest('/api/admin/catalog/popular', {
        method: 'POST',
        body: JSON.stringify({ productId: other.productId, rank: other.rank }),
      })
      if (!res2.ok) {
        toastApiError(res2.error, 'Rank swap half-finished — reloaded the rail')
        void load()
        return false
      }
    }
    if (rank === null) toast({ title: 'Removed from the rail', description: label })
    return true
  }

  const move = async (index: number, dir: -1 | 1) => {
    const swapIndex = index + dir
    if (swapIndex < 0 || swapIndex >= rows.length) return
    const a = rows[index]
    const b = rows[swapIndex]
    const aRank = a.popularRank
    const bRank = b.popularRank
    setBusyId(`${a.id}|${b.id}`)
    // Optimistic swap, then persist both ranks
    setRows((list) => {
      const next = [...list]
      next[index] = { ...a, popularRank: bRank }
      next[swapIndex] = { ...b, popularRank: aRank }
      next.sort((x, y) => x.popularRank - y.popularRank)
      return next
    })
    await setRank(a.id, bRank, a.title, { productId: b.id, rank: aRank })
    setBusyId(null)
    void load()
  }

  const remove = async (row: PopularRow) => {
    setBusyId(row.id)
    await setRank(row.id, null, row.title)
    setBusyId(null)
    void load()
  }

  const addProduct = async (item: SearchItem) => {
    setAdding(true)
    const nextRank = rows.length > 0 ? Math.max(...rows.map((r) => r.popularRank)) + 1 : 1
    const ok = await setRank(item.id, nextRank, item.title)
    setAdding(false)
    if (ok) {
      toast({ title: 'Added to the popular rail', description: `${item.title} — rank #${nextRank}` })
      setQuery('')
      setResults(null)
      void load()
    }
  }

  return (
    <div className="space-y-5">
      <p className="max-w-xl text-sm text-muted-foreground">
        Ranked products power the homepage Popular rail. Rank #1 shows first — reorder with the arrows, or add any
        listing from the catalog below.
      </p>

      {/* Add product */}
      <div className="space-y-2 rounded-2xl border p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Plus size={14} /> Add a product
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search every listing — title, store, category…"
            className="h-10 rounded-xl pl-10 pr-9 text-sm"
            aria-label="Search products to add to the popular rail"
          />
          {searching && <Loader2 size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />}
          {query && !searching && (
            <button
              type="button"
              onClick={() => {
                setQuery('')
                setResults(null)
              }}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X size={14} />
            </button>
          )}
        </div>
        {query.trim().length >= 2 && (
          <div className="max-h-60 space-y-1 overflow-y-auto scrollbar-thin rounded-xl border bg-card p-1.5">
            {!results && searching ? (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">Searching…</p>
            ) : !results || results.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">No products match your search.</p>
            ) : (
              results.map((item) => {
                const alreadyRanked = rows.some((r) => r.id === item.id)
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={alreadyRanked || adding}
                    onClick={() => void addProduct(item)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors focus-visible:bg-accent focus-visible:outline-none',
                      alreadyRanked ? 'opacity-50' : 'hover:bg-accent'
                    )}
                    aria-label={`Add ${item.title} to the popular rail`}
                  >
                    <span className="h-9 w-9 shrink-0 overflow-hidden rounded-md border bg-muted">
                      {item.image ? (
                        <img src={item.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <PackageSearch size={15} className="m-auto block text-muted-foreground" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{item.title}</span>
                      <span className="block text-xs text-muted-foreground">
                        {formatUSD(item.price)}
                        {item.category ? ` · ${item.category}` : ''}
                      </span>
                    </span>
                    {alreadyRanked ? (
                      <Badge className="rounded-full border-0 bg-emerald-100 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        On rail
                      </Badge>
                    ) : (
                      <Plus size={14} className="shrink-0 text-muted-foreground" />
                    )}
                  </button>
                )
              })
            )}
          </div>
        )}
      </div>

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      )}

      {!loading && loadError && (
        <AdminEmptyState icon={ShieldAlert} title="Couldn't load the popular rail" description={loadError}>
          <Button variant="outline" className="rounded-xl" onClick={() => void load()}>
            Try again
          </Button>
        </AdminEmptyState>
      )}

      {!loading && !loadError && rows.length === 0 && (
        <AdminEmptyState
          icon={TrendingUp}
          title="Nothing ranked yet"
          description="Add the first product above — ranked products appear on the homepage Popular rail in this order."
        />
      )}

      {!loading && !loadError && rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div
              key={row.id}
              className={cn(
                'flex items-center gap-3 rounded-xl border p-2.5 transition-colors',
                busyId === row.id ? 'opacity-60' : 'hover:bg-accent/50'
              )}
            >
              <span className="w-8 shrink-0 text-center text-sm font-extrabold tabular-nums text-muted-foreground">
                {row.popularRank}
              </span>
              <span className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border bg-muted">
                {row.image ? (
                  <img src={row.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <PackageSearch size={16} className="m-auto block text-muted-foreground" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {row.title}
                  {row.featured && <span className="ml-1.5 text-[10px] font-semibold uppercase text-primary">Featured</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {row.category} · {row.seller ?? 'Platform'} · {formatUSD(row.price)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 rounded-lg p-0"
                  disabled={i === 0 || busyId?.includes(row.id)}
                  onClick={() => void move(i, -1)}
                  aria-label={`Move ${row.title} up`}
                >
                  <ChevronUp size={15} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 rounded-lg p-0"
                  disabled={i === rows.length - 1 || busyId?.includes(row.id)}
                  onClick={() => void move(i, 1)}
                  aria-label={`Move ${row.title} down`}
                >
                  <ChevronDown size={15} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 rounded-lg p-0 text-muted-foreground hover:text-destructive"
                  disabled={busyId === row.id}
                  onClick={() => void remove(row)}
                  aria-label={`Remove ${row.title} from the rail`}
                >
                  <X size={15} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
