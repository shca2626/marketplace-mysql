'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2, Search, TrendingUp } from 'lucide-react'
import { useMarketplace } from '@/store/marketplace'
import type { ProductDTO } from '@/lib/types'
import { formatUSD } from '@/lib/format'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface SearchBoxProps {
  placeholder?: string
  className?: string
  inputClassName?: string
  /** Called when the box navigates somewhere (lets the mobile sheet close itself) */
  onNavigate?: () => void
}

interface SuggestionsResponse {
  items: ProductDTO[]
  total: number
}

const MIN_CHARS = 2
const DEBOUNCE_MS = 220

/**
 * Search input with live product suggestions (debounced, cancellable)
 * and full keyboard navigation. Enter or "See all" goes to the catalog
 * results page. Arrow keys pick a product directly.
 */
export function SearchBox({
  placeholder = 'Search products…',
  className,
  inputClassName,
  onNavigate,
}: SearchBoxProps) {
  const navigate = useMarketplace((s) => s.navigate)
  const listboxId = useId() // unique per instance — header + mobile sheet can coexist
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<ProductDTO[]>([])
  const [total, setTotal] = useState(0)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1) // -1 = not hovering list; 0..n-1 = product
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch suggestions (debounced + abortable)
  useEffect(() => {
    const q = query.trim()
    if (q.length < MIN_CHARS) {
      setItems([])
      setTotal(0)
      setLoading(false)
      setOpen(false)
      return
    }
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl
      try {
        const res = await fetch(`/api/products?q=${encodeURIComponent(q)}&limit=5`, {
          signal: ctrl.signal,
        })
        if (!res.ok) return
        const json = (await res.json()) as SuggestionsResponse
        setItems(json.items ?? [])
        setTotal(json.total ?? 0)
        setOpen(true)
      } catch {
        // aborted or offline — keep previous state
      } finally {
        if (!ctrl.signal.aborted) setLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  // Close on outside click / Escape
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  useEffect(() => () => abortRef.current?.abort(), [])

  const go = (view: Parameters<typeof navigate>[0], params?: Parameters<typeof navigate>[1]) => {
    setOpen(false)
    setActiveIndex(-1)
    inputRef.current?.blur()
    onNavigate?.()
    navigate(view, params)
  }

  const submitAll = () => {
    const q = query.trim()
    if (!q) return
    go('catalog', { query: q })
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false)
      setActiveIndex(-1)
      return
    }
    if (!open || items.length === 0) {
      if (e.key === 'Enter') submitAll()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % (items.length + 1)) // +1 slot = "See all results"
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (i <= 0 ? items.length : i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIndex >= 0 && activeIndex < items.length) {
        go('product', { productId: items[activeIndex].id })
      } else {
        submitAll()
      }
    }
  }

  const showDropdown = open && query.trim().length >= MIN_CHARS

  return (
    <div ref={containerRef} className={cn('relative', className)} role="search">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setActiveIndex(-1)
        }}
        onFocus={() => {
          if (query.trim().length >= MIN_CHARS && items.length > 0) setOpen(true)
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={inputClassName}
        aria-label="Search products"
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls={listboxId}
        aria-autocomplete="list"
      />
      {loading && query.trim().length >= MIN_CHARS && (
        <Loader2
          size={14}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground"
          aria-hidden
        />
      )}

      <AnimatePresence>
        {showDropdown && (
          <motion.div
            id={listboxId}
            role="listbox"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-2xl border bg-popover p-1.5 text-popover-foreground shadow-xl"
          >
            {items.length === 0 && !loading ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                No matches for “{query.trim()}” — try another word
              </div>
            ) : (
              items.map((p, i) => (
                <button
                  key={p.id}
                  role="option"
                  aria-selected={activeIndex === i}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors',
                    activeIndex === i ? 'bg-accent' : 'hover:bg-accent/60'
                  )}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => go('product', { productId: p.id })}
                >
                  <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {p.images[0] ? (
                      <img
                        src={p.images[0]}
                        alt=""
                        className="h-full w-full object-cover dark:brightness-[0.96]"
                        loading="lazy"
                      />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {p.category.name} · {formatUSD(p.price)}
                    </span>
                  </span>
                </button>
              ))
            )}
            {items.length > 0 && (
              <button
                role="option"
                aria-selected={activeIndex === items.length}
                className={cn(
                  'mt-1 flex w-full items-center gap-2 rounded-xl border-t px-3 py-2.5 text-left text-sm font-medium text-primary transition-colors',
                  activeIndex === items.length ? 'bg-accent' : 'hover:bg-accent/60'
                )}
                onMouseEnter={() => setActiveIndex(items.length)}
                onClick={() => go('catalog', { query: query.trim() })}
              >
                <TrendingUp size={14} />
                See all results for “{query.trim()}”
                {total > items.length && (
                  <span className="ml-auto text-xs font-normal text-muted-foreground">
                    {total} total
                  </span>
                )}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
