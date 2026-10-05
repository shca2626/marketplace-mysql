'use client'

import { useMemo, useState } from 'react'
import {
  Archive,
  ArchiveRestore,
  CheckSquare,
  FileClock,
  Loader2,
  PackageSearch,
  Pencil,
  Plus,
  SearchX,
  ShieldAlert,
  Star,
  Trash2,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import type { CategoryDTO, ProductDTO } from '@/lib/types'
import { formatDate, formatNumber, formatUSD, timeAgo } from '@/lib/format'
import { cardImage } from '@/lib/storage/url'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AdminEmptyState,
  FilterChips,
  PL_STATUS_MAP,
  SearchInput,
  StatusBadge,
  apiRequest,
  toastApiError,
  useDebounced,
} from './shared'
import { AdminProductFormDialog } from './admin-product-form-dialog'
import {
  BulkReasonDialog,
  ProductAuditDialog,
  ProductReasonDialog,
  type ModerationAction,
} from './product-moderation-dialogs'

// ── Types (contract of GET /api/products?scope=all) ─────────────────────────

interface ProductsResponse {
  items: ProductDTO[]
  total: number
  page: number
  pages: number
}

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'ARCHIVED', label: 'Archived' },
]

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'popular', label: 'Most popular' },
  { value: 'rating', label: 'Top rated' },
  { value: 'price-asc', label: 'Price: low → high' },
  { value: 'price-desc', label: 'Price: high → low' },
]

const PAGE_SIZE = 24

// ── Admin products tab (Phase 9.2/9.3 — CRUD + moderation with teeth) ───────

export function AdminProductsTab() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search)
  const [statusFilter, setStatusFilter] = useState('')
  const [sort, setSort] = useState('newest')
  const [page, setPage] = useState(1)

  // Row-action state
  const [busyId, setBusyId] = useState<string | null>(null)
  const [moderating, setModerating] = useState<{ product: ProductDTO; action: ModerationAction } | null>(null)
  const [editing, setEditing] = useState<ProductDTO | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [auditFor, setAuditFor] = useState<ProductDTO | null>(null)

  // Bulk-action state (9.3)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkAction, setBulkAction] = useState<'archive' | 'restore' | 'feature' | 'unfeature' | null>(null)

  // Render-time keyed sync: jump back to page 1 whenever filters change
  const filterKey = `${debouncedSearch}|${statusFilter}|${sort}`
  const [appliedKey, setAppliedKey] = useState<string | null>(null)
  if (appliedKey !== filterKey) {
    setAppliedKey(filterKey)
    setPage(1)
  }

  const query = new URLSearchParams()
  query.set('scope', 'all')
  if (debouncedSearch.trim()) query.set('q', debouncedSearch.trim())
  if (statusFilter) query.set('status', statusFilter)
  query.set('sort', sort)
  query.set('page', String(page))
  query.set('limit', String(PAGE_SIZE))
  const {
    data,
    loading,
    error,
    refetch: refetchList,
  } = useApi<ProductsResponse>(`/api/products?${query.toString()}`)
  const products = data?.items ?? []

  const { data: catData } = useApi<{ categories: CategoryDTO[] }>('/api/categories')
  void catData // the admin form fetches its own lookups; kept for future filters
  const toggleFeature = async (product: ProductDTO) => {
    setBusyId(product.id)
    const res = await apiRequest(`/api/products/${product.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ featured: !product.featured }),
    })
    setBusyId(null)
    if (!res.ok) {
      toastApiError(res.error)
      return
    }
    toast({
      title: product.featured ? 'Removed from featured' : 'Added to featured',
      description: product.featured
        ? 'The listing no longer appears in featured placements.'
        : 'The listing now appears in featured placements.',
    })
    void refetchList()
  }

  // ── Bulk selection helpers ──
  const pageIds = useMemo(() => products.map((p) => p.id), [products])
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id))
  const selectedOnPage = useMemo(
    () => pageIds.filter((id) => selected.has(id)).length,
    [pageIds, selected]
  )

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allOnPageSelected) pageIds.forEach((id) => next.delete(id))
      else pageIds.forEach((id) => next.add(id))
      return next
    })
  }

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const applyBulk = async (action: 'archive' | 'restore' | 'feature' | 'unfeature', reason: string) => {
    const ids = [...selected]
    const res = await apiRequest<{ affected: number; ids: string[] }>('/api/admin/products/bulk', {
      method: 'POST',
      body: JSON.stringify({ ids, action, reason }),
    })
    if (!res.ok) {
      toastApiError(res.error, 'Bulk action failed')
      return
    }
    toast({
      title: `Bulk ${action} applied`,
      description: `${res.data?.affected ?? ids.length} listing(s) updated — one audit entry written.`,
    })
    setSelected(new Set())
    void refetchList()
  }

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }
  const openEdit = (product: ProductDTO) => {
    setEditing(product)
    setFormOpen(true)
  }

  const sellerLabel = (p: ProductDTO) =>
    p.sellerId ? p.seller?.storeName?.trim() || p.seller?.name || 'Unknown seller' : 'Vendora Catalog'

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <FilterChips
          options={STATUS_FILTERS}
          value={statusFilter}
          onChange={setStatusFilter}
          ariaLabel="Filter products by status"
        />
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search listings — title…"
            ariaLabel="Search listings"
            className="min-w-0 flex-1 md:max-w-72"
          />
          <div className="flex items-center gap-2.5">
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger className="h-10 w-full rounded-xl sm:w-48" aria-label="Sort products">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* 9.2 — the owner's repeated ask: admin-side product creation */}
            <Button className="h-10 shrink-0 rounded-xl" onClick={openCreate}>
              <Plus size={15} className="mr-1.5" /> Add Product
            </Button>
          </div>
        </div>
      </div>

      {/* Bulk-action toolbar (9.3) — appears when rows are selected */}
      {selected.size > 0 && (
        <div
          role="toolbar"
          aria-label="Bulk actions"
          className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-2xl border border-primary/30 bg-primary/10 px-3.5 py-2.5 backdrop-blur"
        >
          <span className="mr-1 inline-flex items-center gap-1.5 text-sm font-semibold">
            <CheckSquare size={15} className="text-primary" />
            {selected.size} selected
            {selectedOnPage < selected.size && (
              <span className="text-xs font-normal text-muted-foreground">({selectedOnPage} on this page)</span>
            )}
          </span>
          <Button variant="outline" size="sm" className="h-8 rounded-lg" onClick={() => setBulkAction('archive')}>
            <Archive size={13} className="mr-1.5" /> Archive
          </Button>
          <Button variant="outline" size="sm" className="h-8 rounded-lg" onClick={() => setBulkAction('restore')}>
            <ArchiveRestore size={13} className="mr-1.5" /> Restore
          </Button>
          <Button variant="outline" size="sm" className="h-8 rounded-lg" onClick={() => setBulkAction('feature')}>
            <Star size={13} className="mr-1.5" /> Feature
          </Button>
          <Button variant="outline" size="sm" className="h-8 rounded-lg" onClick={() => setBulkAction('unfeature')}>
            <Star size={13} className="mr-1.5" /> Unfeature
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-8 rounded-lg text-muted-foreground"
            onClick={() => setSelected(new Set())}
          >
            Clear selection
          </Button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <AdminEmptyState icon={ShieldAlert} title="Couldn't load the catalog" description={error}>
          <Button variant="outline" className="rounded-xl" onClick={() => void refetchList()}>
            Try again
          </Button>
        </AdminEmptyState>
      )}

      {/* Empty */}
      {!loading && !error && products.length === 0 && (
        <AdminEmptyState
          icon={SearchX}
          title={debouncedSearch.trim() || statusFilter ? 'No listings match' : 'No listings yet'}
          description={
            debouncedSearch.trim() || statusFilter
              ? 'Try clearing the search or switching the status filter.'
              : 'Create the first curated catalog record with Add Product — every listing on the platform shows up here for moderation.'
          }
        >
          {!debouncedSearch.trim() && !statusFilter && (
            <Button className="rounded-xl" onClick={openCreate}>
              <Plus size={15} className="mr-1.5" /> Add Product
            </Button>
          )}
        </AdminEmptyState>
      )}

      {/* Desktop table */}
      {!loading && !error && products.length > 0 && (
        <div className="hidden overflow-x-auto rounded-2xl border lg:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="w-10 px-3 py-3">
                  <Checkbox
                    checked={allOnPageSelected}
                    onCheckedChange={toggleAll}
                    aria-label="Select all listings on this page"
                  />
                </th>
                <th scope="col" className="px-4 py-3 font-medium">Listing</th>
                <th scope="col" className="px-4 py-3 font-medium">Seller</th>
                <th scope="col" className="px-4 py-3 font-medium">Price</th>
                <th scope="col" className="px-4 py-3 font-medium">Stock</th>
                <th scope="col" className="px-4 py-3 font-medium">Sold</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Featured</th>
                <th scope="col" className="px-4 py-3 text-right font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id} className="border-b transition-colors last:border-0 hover:bg-accent/50">
                  <td className="px-3 py-3">
                    <Checkbox
                      checked={selected.has(product.id)}
                      onCheckedChange={() => toggleOne(product.id)}
                      aria-label={`Select ${product.title}`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <ProductThumb product={product} />
                      <div className="min-w-0 max-w-64">
                        <p className="truncate font-semibold" title={product.title}>{product.title}</p>
                        <p className="truncate text-xs text-muted-foreground" title={formatDate(product.createdAt)}>
                          Listed {timeAgo(product.createdAt)}
                          {(product.offerCount ?? 0) > 0 ? ` · ${product.offerCount} offer${product.offerCount === 1 ? '' : 's'}` : ''}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    {product.sellerId ? (
                      <p className="max-w-40 truncate text-muted-foreground" title={sellerLabel(product)}>
                        {sellerLabel(product)}
                      </p>
                    ) : (
                      <Badge className="rounded-full border-0 bg-primary/15 text-[11px] font-semibold text-primary">
                        Vendora Catalog
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3.5 font-semibold tabular-nums">{formatUSD(product.price)}</td>
                  <td className="px-4 py-3.5 tabular-nums">
                    <StockCell stock={product.stock} />
                  </td>
                  <td className="px-4 py-3.5 tabular-nums text-muted-foreground">{formatNumber(product.soldCount)}</td>
                  <td className="px-4 py-3.5">
                    <StatusBadge status={product.status} map={PL_STATUS_MAP} />
                  </td>
                  <td className="px-4 py-3.5">
                    <FeatureToggle
                      product={product}
                      busy={busyId === product.id}
                      onToggle={(p) => void toggleFeature(p)}
                    />
                  </td>
                  <td className="px-4 py-3.5">
                    <RowActions
                      product={product}
                      busy={busyId === product.id}
                      onEdit={openEdit}
                      onModerate={(p, action) => setModerating({ product: p, action })}
                      onHistory={setAuditFor}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile + tablet stacked cards */}
      {!loading && !error && products.length > 0 && (
        <div className="space-y-3 lg:hidden">
          {products.map((product) => (
            <Card key={product.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Checkbox
                      checked={selected.has(product.id)}
                      onCheckedChange={() => toggleOne(product.id)}
                      aria-label={`Select ${product.title}`}
                      className="mt-6"
                    />
                    <ProductThumb product={product} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold" title={product.title}>{product.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {sellerLabel(product)}
                        {(product.offerCount ?? 0) > 0 ? ` · ${product.offerCount} offer${product.offerCount === 1 ? '' : 's'}` : ''}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatUSD(product.price)} · <StockCell stock={product.stock} /> · {formatNumber(product.soldCount)} sold
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={product.status} map={PL_STATUS_MAP} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3">
                  <FeatureToggle
                    product={product}
                    busy={busyId === product.id}
                    onToggle={(p) => void toggleFeature(p)}
                  />
                  <RowActions
                    product={product}
                    busy={busyId === product.id}
                    onEdit={openEdit}
                    onModerate={(p, action) => setModerating({ product: p, action })}
                    onHistory={setAuditFor}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && !error && data && data.pages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Page <span className="font-semibold tabular-nums text-foreground">{page}</span> of{' '}
            <span className="font-semibold tabular-nums text-foreground">{data.pages}</span> · {formatNumber(data.total)} listings
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-lg"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              aria-label="Previous page"
            >
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-lg"
              onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
              disabled={page >= data.pages}
              aria-label="Next page"
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Full admin editor (create curated + full-field edit, 9.2/9.3) */}
      <AdminProductFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) {
            setEditing(null)
            void refetchList()
          }
        }}
        editing={editing}
        onSaved={() => {
          void refetchList()
          if (!editing) setSelected(new Set())
        }}
      />

      {/* Archive / restore / delete with mandatory reason */}
      <ProductReasonDialog
        product={moderating?.product ?? null}
        action={moderating?.action ?? 'archive'}
        onClose={() => setModerating(null)}
        onDone={() => void refetchList()}
      />

      {/* Bulk-action reason dialog */}
      <BulkReasonDialog
        open={bulkAction !== null}
        count={selected.size}
        action={bulkAction}
        onClose={() => setBulkAction(null)}
        onApply={async (reason) => {
          if (bulkAction) await applyBulk(bulkAction, reason)
        }}
      />

      {/* Per-edit audit diff viewer */}
      <ProductAuditDialog product={auditFor} onClose={() => setAuditFor(null)} />
    </div>
  )
}

// ── Row pieces ────────────────────────────────────────────────────────────────

function ProductThumb({ product }: { product: ProductDTO }) {
  const src = cardImage(product.images) ?? product.images?.[0]
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted">
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <PackageSearch size={16} className="text-muted-foreground" />
      )}
    </span>
  )
}

function StockCell({ stock }: { stock: number }) {
  return (
    <span
      className={
        stock <= 0
          ? 'font-semibold text-rose-600 dark:text-rose-400'
          : stock <= 5
            ? 'font-semibold text-amber-600 dark:text-amber-400'
            : 'text-foreground'
      }
    >
      {stock <= 0 ? 'Out' : stock}
    </span>
  )
}

function FeatureToggle({
  product,
  busy,
  onToggle,
}: {
  product: ProductDTO
  busy: boolean
  onToggle: (product: ProductDTO) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(product)}
      disabled={busy}
      aria-pressed={product.featured}
      aria-label={product.featured ? `Remove ${product.title} from featured` : `Feature ${product.title}`}
      className="flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-colors hover:bg-accent disabled:opacity-50"
    >
      <Star
        size={16}
        className={
          product.featured
            ? 'fill-amber-400 text-amber-400'
            : 'text-muted-foreground/50 hover:text-amber-400'
        }
      />
      <span className={product.featured ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}>
        {product.featured ? 'Featured' : 'Feature'}
      </span>
    </button>
  )
}

function RowActions({
  product,
  busy,
  onEdit,
  onModerate,
  onHistory,
}: {
  product: ProductDTO
  busy: boolean
  onEdit: (product: ProductDTO) => void
  onModerate: (product: ProductDTO, action: ModerationAction) => void
  onHistory: (product: ProductDTO) => void
}) {
  if (busy) {
    return (
      <span className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
        <Loader2 size={14} className="animate-spin" /> Saving…
      </span>
    )
  }
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <Button
        variant="outline"
        size="sm"
        className="h-8 rounded-lg"
        onClick={() => onEdit(product)}
        aria-label={`Edit ${product.title}`}
      >
        <Pencil size={13} className="mr-1.5" /> Edit
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-8 rounded-lg"
        onClick={() => onHistory(product)}
        aria-label={`Audit history for ${product.title}`}
        title="Audit history — field-level diffs"
      >
        <FileClock size={13} />
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-8 rounded-lg"
        onClick={() => onModerate(product, product.status === 'ARCHIVED' ? 'restore' : 'archive')}
        aria-label={product.status === 'ARCHIVED' ? `Restore ${product.title}` : `Archive ${product.title}`}
      >
        {product.status === 'ARCHIVED' ? (
          <>
            <ArchiveRestore size={13} className="mr-1.5" /> Restore
          </>
        ) : (
          <>
            <Archive size={13} className="mr-1.5" /> Archive
          </>
        )}
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-8 rounded-lg border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => onModerate(product, 'delete')}
        aria-label={`Delete ${product.title}`}
      >
        <Trash2 size={13} className="mr-1.5" /> Delete
      </Button>
    </div>
  )
}
