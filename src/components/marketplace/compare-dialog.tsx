'use client'

import { Fragment, useMemo, useState } from 'react'
import {
  ArrowRight,
  Award,
  BadgeCheck,
  Check,
  Minus,
  ShoppingCart,
  Star,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useMarketplace } from '@/store/marketplace'
import { attributesForCategory, conditionLabel, type AttributeDef } from '@/lib/catalog'
import type { ProductDTO } from '@/lib/types'
import { formatUSD } from '@/lib/format'
import { cardImage } from '@/lib/storage/url'
import { StarRating } from './star-rating'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

// Product comparison (catalog-driven, progressive disclosure).
// ────────────────────────────────────────────────────────────
// The comparison table shows ONLY the details that matter:
//   • core commerce rows (price, rating, stock, seller…)
//   • the union of category attributes across the compared set,
//     filtered to rows where at least one product actually has a value
//   • a "Differences only" toggle that hides rows where every product
//     agrees — the friendly way to compare when 40 attributes exist.
// Category mixing is supported: electronics vs fashion shows the union
// of both categories' attributes (still only filled ones).

const MAX_COMPARE = 4

/** Normalize an attribute value for display + equality checks. */
function attrValue(v: ProductDTO['attributes'][string] | undefined): string | null {
  if (v === undefined || v === null || v === '') return null
  if (Array.isArray(v)) return v.length > 0 ? v.join(', ') : null
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  return String(v)
}

function unitSuffix(def: AttributeDef): string {
  return def.unit ? ` ${def.unit}` : ''
}

interface Row {
  key: string
  label: string
  group: 'essentials' | 'purchasing' | 'details'
  values: (string | null)[] // aligned with items; null = not specified
  differs: boolean
}

function buildRows(items: ProductDTO[]): { rows: Row[]; categoryLabel: string } {
  const rows: Row[] = []

  const push = (key: string, label: string, group: Row['group'], values: (string | null)[], opts: { differs?: boolean } = {}) => {
    const nonNull = values.filter((v) => v !== null)
    // Progressive disclosure: drop rows nobody filled (except essentials).
    if (group !== 'essentials' && nonNull.length === 0) return
    const differs = opts.differs ?? new Set(values.map((v) => v ?? '\u0000')).size > 1
    rows.push({ key, label, group, values, differs })
  }

  // ── essentials ──
  push('price', 'Price', 'essentials', items.map((p) => formatUSD(p.price)))
  push('rating', 'Rating', 'essentials', items.map((p) => `${p.rating.toFixed(1)} (${p.reviewCount})`), {
    differs: new Set(items.map((p) => p.rating.toFixed(1))).size > 1,
  })
  push(
    'stock',
    'Availability',
    'essentials',
    items.map((p) => (p.stock === 0 ? 'Sold out' : p.stock <= 5 ? `Only ${p.stock} left` : 'In stock')),
  )
  push('brand', 'Brand', 'essentials', items.map((p) => p.brand ?? null))
  push('condition', 'Condition', 'essentials', items.map((p) => conditionLabel(p.condition || 'NEW')))
  push('seller', 'Seller', 'essentials', items.map((p) => p.seller?.storeName ?? p.seller?.name ?? null))
  push('category', 'Category', 'essentials', items.map((p) => p.category.name))

  // ── purchasing terms ──
  push('freeShipping', 'Free shipping', 'purchasing', items.map((p) => (p.freeShipping ? 'Yes' : 'No')))
  push('warranty', 'Warranty', 'purchasing', items.map((p) => (p.warrantyMonths != null ? `${p.warrantyMonths} months` : '—')))
  push('handling', 'Ships in', 'purchasing', items.map((p) => `${p.handlingDays} day${p.handlingDays === 1 ? '' : 's'}`))
  push('minOrder', 'Min. order', 'purchasing', items.map((p) => `${p.minOrderQty} unit${p.minOrderQty === 1 ? '' : 's'}`))
  push(
    'variants',
    'Options',
    'purchasing',
    items.map((p) => (p.variants.length > 0 ? `${p.variants.length} variants` : null)),
  )

  // ── category details (progressive disclosure) ──
  // Union of attribute definitions across the involved categories; label
  // collisions between categories share one row (e.g. "Material").
  const defsByKey = new Map<string, AttributeDef>()
  for (const p of items) {
    for (const def of attributesForCategory(p.category.slug)) {
      if (!defsByKey.has(def.key)) defsByKey.set(def.key, def)
    }
  }
  for (const def of defsByKey.values()) {
    push(
      `attr:${def.key}`,
      def.label,
      'details',
      items.map((p) => {
        const v = attrValue(p.attributes[def.key])
        return v === null ? null : def.type === 'number' ? `${v}${unitSuffix(def)}` : v
      }),
    )
  }

  const sameCategory = new Set(items.map((p) => p.category.slug)).size === 1
  const categoryLabel = sameCategory ? items[0].category.name : 'Multiple categories'
  return { rows, categoryLabel }
}

export function CompareDialog() {
  const compareItems = useMarketplace((s) => s.compareItems)
  const compareOpen = useMarketplace((s) => s.compareOpen)
  const setCompareOpen = useMarketplace((s) => s.setCompareOpen)
  const removeFromCompare = useMarketplace((s) => s.removeFromCompare)
  const clearCompare = useMarketplace((s) => s.clearCompare)
  const navigate = useMarketplace((s) => s.navigate)
  const addToCart = useMarketplace((s) => s.addToCart)

  const [diffOnly, setDiffOnly] = useState(false)

  const { rows, categoryLabel } = useMemo(() => buildRows(compareItems), [compareItems])
  const visibleRows = useMemo(
    () => (diffOnly ? rows.filter((r) => r.differs) : rows),
    [rows, diffOnly],
  )

  const groups: { key: Row['group']; title: string; description?: string }[] = [
    { key: 'essentials', title: 'Essentials' },
    { key: 'purchasing', title: 'Purchasing terms' },
    { key: 'details', title: 'Product details', description: 'Only details sellers filled in are shown' },
  ]

  // "Best" badges — only when comparing (≥2) and only when there's a clear winner.
  const minPrice = compareItems.length >= 2 ? Math.min(...compareItems.map((p) => p.price)) : null
  const maxRating = compareItems.length >= 2 ? Math.max(...compareItems.map((p) => p.rating)) : null
  const priceWinners = minPrice != null ? compareItems.filter((p) => p.price === minPrice) : []
  const ratingWinners = maxRating != null ? compareItems.filter((p) => p.rating === maxRating) : []

  const open = compareOpen && compareItems.length > 0

  return (
    <Dialog open={open} onOpenChange={(v) => setCompareOpen(v && compareItems.length > 0)}>
      <DialogContent className="flex max-h-[92vh] w-[min(96vw,72rem)] flex-col overflow-hidden rounded-2xl p-0 sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold tracking-tight">
              Compare products
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                {compareItems.length}/{MAX_COMPARE}
              </span>
            </DialogTitle>
            <DialogDescription className="mt-0.5 text-xs text-muted-foreground">
              {categoryLabel} · differences are highlighted
            </DialogDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <label className="hidden cursor-pointer select-none items-center gap-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:flex">
              <Checkbox checked={diffOnly} onCheckedChange={(v) => setDiffOnly(v === true)} aria-label="Show only differences" />
              Differences only
            </label>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 rounded-full px-2.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={clearCompare}
            >
              <Trash2 size={13} className="mr-1" /> Clear all
            </Button>
          </div>
        </div>

        {/* Mobile-only differences toggle (below sm) */}
        <div className="border-b px-5 py-2.5 sm:hidden">
          <label className="flex cursor-pointer select-none items-center gap-2 text-xs font-medium text-muted-foreground">
            <Checkbox checked={diffOnly} onCheckedChange={(v) => setDiffOnly(v === true)} />
            Differences only
          </label>
        </div>

        {/* Scrollable comparison body: sticky header row + grouped rows */}
        <div className="min-h-0 flex-1 overflow-auto scrollbar-thin">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <caption className="sr-only">Side-by-side product comparison</caption>
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 z-20 w-32 bg-card p-3 text-left align-bottom text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Product
                </th>
                {compareItems.map((p) => (
                  <th key={p.id} scope="col" className="min-w-40 max-w-56 p-3 align-bottom">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <div className="relative">
                        <button
                          onClick={() => {
                            setCompareOpen(false)
                            navigate('product', { productId: p.id })
                          }}
                          className="block h-20 w-20 overflow-hidden rounded-xl border bg-muted transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                          aria-label={`View ${p.title}`}
                        >
                          {p.images[0] ? (
                            <img src={cardImage(p.images)} alt={p.title} className="h-full w-full object-cover" loading="lazy" />
                          ) : (
                            <span className="flex h-full items-center justify-center text-[10px] text-muted-foreground">No image</span>
                          )}
                        </button>
                        <button
                          onClick={() => removeFromCompare(p.id)}
                          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-background text-muted-foreground shadow-md transition-colors hover:bg-destructive hover:text-white"
                          aria-label={`Remove ${p.title} from comparison`}
                        >
                          <X size={11} />
                        </button>
                      </div>
                      <button
                        onClick={() => {
                          setCompareOpen(false)
                          navigate('product', { productId: p.id })
                        }}
                        className="line-clamp-2 text-xs font-semibold leading-4 text-foreground transition-colors hover:text-primary"
                      >
                        {p.title}
                      </button>
                      <Button
                        size="sm"
                        className="h-7 w-full rounded-full px-2 text-[11px]"
                        disabled={p.stock === 0}
                        onClick={() => {
                          const res = addToCart(p, 1)
                          if (res.ok) {
                            setCompareOpen(false)
                            toast({ title: 'Added to cart', description: p.title })
                          } else {
                            toast({ title: 'Cannot add to cart', description: res.message, variant: 'destructive' })
                          }
                        }}
                      >
                        <ShoppingCart size={11} className="mr-1" /> Add to cart
                      </Button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const groupRows = visibleRows.filter((r) => r.group === g.key)
                if (groupRows.length === 0) return null
                return (
                  <Fragment key={g.key}>
                    <tr>
                      <th
                        colSpan={compareItems.length + 1}
                        scope="colgroup"
                        className="sticky left-0 bg-muted/60 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
                      >
                        {g.title}
                        {g.description && <span className="ml-2 font-normal normal-case tracking-normal opacity-80">— {g.description}</span>}
                      </th>
                    </tr>
                    {groupRows.map((row) => (
                      <tr key={row.key} className="border-b last:border-0 hover:bg-muted/30">
                        <th
                          scope="row"
                          className={cn(
                            'sticky left-0 z-10 bg-card p-3 text-left align-top text-xs font-medium text-muted-foreground',
                            row.differs && compareItems.length > 1 && 'font-semibold text-foreground',
                          )}
                        >
                          {row.label}
                        </th>
                        {row.values.map((v, i) => {
                          const product = compareItems[i]
                          const isPrice = row.key === 'price'
                          const isRating = row.key === 'rating'
                          const isBestPrice = isPrice && priceWinners.length > 0 && priceWinners.length < compareItems.length && product.price === minPrice
                          const isTopRated = isRating && ratingWinners.length > 0 && ratingWinners.length < compareItems.length && product.rating === maxRating
                          return (
                            <td
                              key={`${row.key}:${product.id}`}
                              className={cn(
                                'p-3 text-center align-top',
                                row.differs && compareItems.length > 1 && 'bg-primary/[0.045] dark:bg-primary/[0.06]',
                              )}
                            >
                              <span
                                className={cn(
                                  'inline-flex flex-col items-center gap-1',
                                  isPrice && 'text-base font-bold',
                                )}
                              >
                                {v ?? (
                                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/60">
                                    <Minus size={12} /> —
                                  </span>
                                )}
                                {(isBestPrice || isTopRated) && (
                                  <span
                                    className={cn(
                                      'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide',
                                      isBestPrice && 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400',
                                      isTopRated && 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
                                    )}
                                  >
                                    {isBestPrice && <BadgeCheck size={9} />}
                                    {isTopRated && <Award size={9} />}
                                    {isBestPrice ? 'Best price' : 'Top rated'}
                                  </span>
                                )}
                              </span>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </Fragment>
                )
              })}
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={compareItems.length + 1} className="p-8 text-center text-sm text-muted-foreground">
                    <Check size={16} className="mx-auto mb-2 text-primary" />
                    These products are identical on every filled detail.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3 border-t bg-muted/40 px-5 py-3 sm:px-6">
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <TrendingUp size={12} className="shrink-0 text-primary" />
            {compareItems.length < 2
              ? 'Add at least one more product to compare'
              : 'Rows where products differ are tinted for quick scanning'}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 rounded-full text-xs"
            onClick={() => {
              setCompareOpen(false)
              navigate('catalog')
            }}
          >
            Keep browsing <ArrowRight size={13} className="ml-1" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
