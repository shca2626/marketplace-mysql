'use client'

import { useState } from 'react'
import {
  Archive,
  ArchiveRestore,
  BadgeCheck,
  ClipboardCheck,
  Check,
  Loader2,
  PackageSearch,
  Pencil,
  SearchX,
  ShieldAlert,
  ShieldCheck,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import type { CategoryDTO, ProductDTO } from '@/lib/types'
import { formatDate, formatNumber, formatUSD, timeAgo } from '@/lib/format'
import { cardImage } from '@/lib/storage/url'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
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
import { ProductFormDialog } from '../product-form-dialog'

// ── Types (contract of GET /api/products?scope=all) ─────────────────────────

interface ProductsResponse {
  items: ProductDTO[]
  total: number
  page: number
  pages: number
}

// ── Types (contract of GET /api/admin/product-approvals) ─────────────────────

interface AdminProposalRow {
  id: string
  title: string
  description: string
  price: number
  images: string[]
  categoryId: string
  /** "Category · Organization name" — the org is appended by the serializer. */
  categoryName: string
  approvalState: string
  reviewNote: string | null
  createdAt: string
  offerCount: number
}

const PROPOSALS_FILTER = '__proposals'

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'ARCHIVED', label: 'Archived' },
  { value: PROPOSALS_FILTER, label: 'Proposals' },
]

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'popular', label: 'Most popular' },
  { value: 'rating', label: 'Top rated' },
  { value: 'price-asc', label: 'Price: low → high' },
  { value: 'price-desc', label: 'Price: high → low' },
]

const PAGE_SIZE = 24

// ── Admin products tab (moderation) ──────────────────────────────────────────

export function AdminProductsTab() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search)
  const [statusFilter, setStatusFilter] = useState('')
  const [sort, setSort] = useState('newest')
  const [page, setPage] = useState(1)
  const proposalsMode = statusFilter === PROPOSALS_FILTER

  // Pending product proposals (company-submitted catalog entries awaiting the
  // platform gate) — powers the "Proposals" filter chip + its count.
  const {
    data: proposalsData,
    loading: proposalsLoading,
    error: proposalsError,
    refetch: refetchProposals,
  } = useApi<{ proposals: AdminProposalRow[] }>('/api/admin/product-approvals')
  const proposals = proposalsData?.proposals ?? []

  // Row-action state
  const [busyId, setBusyId] = useState<string | null>(null)
  const [deleteFor, setDeleteFor] = useState<ProductDTO | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [editing, setEditing] = useState<ProductDTO | null>(null)
  const [formOpen, setFormOpen] = useState(false)

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
  if (statusFilter && !proposalsMode) query.set('status', statusFilter)
  query.set('sort', sort)
  query.set('page', String(page))
  query.set('limit', String(PAGE_SIZE))
  const {
    data,
    loading,
    error,
    refetch: refetchList,
  } = useApi<ProductsResponse>(proposalsMode ? null : `/api/products?${query.toString()}`)
  const products = data?.items ?? []

  const { data: catData } = useApi<{ categories: CategoryDTO[] }>('/api/categories')
  const categories = catData?.categories ?? []

  const patchProduct = async (
    product: ProductDTO,
    body: { status?: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'; featured?: boolean },
    okTitle: string,
    okDescription?: string
  ) => {
    setBusyId(product.id)
    const res = await apiRequest(`/api/products/${product.id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
    setBusyId(null)
    if (!res.ok) {
      toastApiError(res.error)
      return
    }
    toast({ title: okTitle, description: okDescription })
    void refetchList()
  }

  const confirmDelete = async () => {
    if (!deleteFor) return
    const product = deleteFor
    setDeleting(true)
    const res = await apiRequest<{ ok: boolean; archived: boolean }>(`/api/products/${product.id}`, {
      method: 'DELETE',
    })
    setDeleting(false)
    setDeleteFor(null)
    if (!res.ok || !res.data?.ok) {
      toastApiError(res.error)
      return
    }
    if (res.data?.archived) {
      toast({
        title: 'Listing archived',
        description: `"${product.title}" has order history, so it was archived instead of hard-deleted.`,
      })
    } else {
      toast({ title: 'Listing deleted', description: `"${product.title}" was permanently removed.` })
    }
    void refetchList()
  }

  const openEdit = (product: ProductDTO) => {
    setEditing(product)
    setFormOpen(true)
  }

  const sellerLabel = (p: ProductDTO) => p.seller?.storeName?.trim() || p.seller?.name || 'Unknown seller'

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <FilterChips
          options={
            proposals.length > 0
              ? [...STATUS_FILTERS.filter((f) => f.value !== PROPOSALS_FILTER), { value: PROPOSALS_FILTER, label: 'Proposals', count: proposals.length }]
              : STATUS_FILTERS
          }
          value={statusFilter}
          onChange={setStatusFilter}
          ariaLabel="Filter products by status"
        />
        {!proposalsMode && (
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search listings — title…"
              ariaLabel="Search listings"
              className="min-w-0 flex-1 md:max-w-72"
            />
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
          </div>
        )}
      </div>

      {/* ── Product proposals queue (platform approval gate) ── */}
      {proposalsMode && (
        <ProposalsQueue
          proposals={proposals}
          loading={proposalsLoading}
          error={proposalsError}
          onRefetch={() => {
            void refetchProposals()
            void refetchList()
          }}
        />
      )}

      {/* Loading */}
      {!proposalsMode && loading && (
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
      {!proposalsMode && !loading && !error && products.length === 0 && (
        <AdminEmptyState
          icon={SearchX}
          title={debouncedSearch.trim() || statusFilter ? 'No listings match' : 'No listings yet'}
          description={
            debouncedSearch.trim() || statusFilter
              ? 'Try clearing the search or switching the status filter.'
              : 'Every listing on the platform — any seller — shows up here for moderation.'
          }
        />
      )}

      {/* Desktop table */}
      {!loading && !error && products.length > 0 && (
        <div className="hidden overflow-x-auto rounded-2xl border lg:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
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
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <ProductThumb product={product} />
                      <div className="min-w-0 max-w-64">
                        <p className="truncate font-semibold" title={product.title}>{product.title}</p>
                        <p className="truncate text-xs text-muted-foreground" title={formatDate(product.createdAt)}>
                          Listed {timeAgo(product.createdAt)}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="max-w-40 truncate text-muted-foreground" title={sellerLabel(product)}>
                      {sellerLabel(product)}
                    </p>
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
                      onToggle={(p) =>
                        patchProduct(
                          p,
                          { featured: !p.featured },
                          p.featured ? 'Removed from featured' : 'Added to featured',
                          p.featured
                            ? 'The listing no longer appears in featured placements.'
                            : 'The listing now appears in featured placements.'
                        )
                      }
                    />
                  </td>
                  <td className="px-4 py-3.5">
                    <RowActions
                      product={product}
                      busy={busyId === product.id}
                      onEdit={openEdit}
                      onArchive={(p) =>
                        patchProduct(
                          p,
                          { status: p.status === 'ARCHIVED' ? 'DRAFT' : 'ARCHIVED' },
                          p.status === 'ARCHIVED' ? 'Listing restored to draft' : 'Listing archived',
                          p.status === 'ARCHIVED'
                            ? 'Publish it from the seller console or set it active once reviewed.'
                            : 'Hidden from the storefront and preserved for order history.'
                        )
                      }
                      onDelete={setDeleteFor}
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
                    <ProductThumb product={product} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold" title={product.title}>{product.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{sellerLabel(product)}</p>
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
                    onToggle={(p) =>
                      patchProduct(
                        p,
                        { featured: !p.featured },
                        p.featured ? 'Removed from featured' : 'Added to featured',
                        p.featured
                          ? 'The listing no longer appears in featured placements.'
                          : 'The listing now appears in featured placements.'
                      )
                    }
                  />
                  <RowActions
                    product={product}
                    busy={busyId === product.id}
                    onEdit={openEdit}
                    onArchive={(p) =>
                      patchProduct(
                        p,
                        { status: p.status === 'ARCHIVED' ? 'DRAFT' : 'ARCHIVED' },
                        p.status === 'ARCHIVED' ? 'Listing restored to draft' : 'Listing archived',
                        p.status === 'ARCHIVED'
                          ? 'Publish it from the seller console or set it active once reviewed.'
                          : 'Hidden from the storefront and preserved for order history.'
                      )
                    }
                    onDelete={setDeleteFor}
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

      {/* Delete confirm */}
      <AlertDialog open={!!deleteFor} onOpenChange={(open) => !open && setDeleteFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleteFor?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the listing from {deleteFor ? sellerLabel(deleteFor) : 'the seller'}. If the product
              has order history it will be archived instead, so past orders stay intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep listing</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault()
                void confirmDelete()
              }}
            >
              {deleting ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Trash2 size={14} className="mr-1.5" />}
              Delete listing
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Full editor (admin override) */}
      <ProductFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) setEditing(null)
        }}
        categories={categories}
        editing={editing}
        onSaved={() => {
          void refetchList()
        }}
      />
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
  onArchive,
  onDelete,
}: {
  product: ProductDTO
  busy: boolean
  onEdit: (product: ProductDTO) => void
  onArchive: (product: ProductDTO) => void
  onDelete: (product: ProductDTO) => void
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
        onClick={() => onArchive(product)}
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
        onClick={() => onDelete(product)}
        aria-label={`Delete ${product.title}`}
      >
        <Trash2 size={13} className="mr-1.5" /> Delete
      </Button>
    </div>
  )
}

// ── Product proposals queue (platform approval gate) ──────────────────────────

const PROPOSAL_QUEUE_MAP = {
  PENDING_APPROVAL: { label: 'Pending', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
} as const

/** categoryName is "Category · Organization name" — the org lives after the separator. */
function proposalOrg(p: AdminProposalRow): string {
  const parts = p.categoryName.split(' · ')
  return parts.length > 1 ? (parts.slice(1).join(' · ')) : 'Unknown organization'
}

function proposalCategory(p: AdminProposalRow): string {
  return p.categoryName.split(' · ')[0] ?? ''
}

function ProposalsQueue({
  proposals,
  loading,
  error,
  onRefetch,
}: {
  proposals: AdminProposalRow[]
  loading: boolean
  error: string | null
  onRefetch: () => void
}) {
  const [decideFor, setDecideFor] = useState<AdminProposalRow | null>(null)
  const [approving, setApproving] = useState(true)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const openDecision = (p: AdminProposalRow, approve: boolean) => {
    setDecideFor(p)
    setApproving(approve)
    setNote('')
  }

  const decide = async () => {
    if (!decideFor) return
    const proposal = decideFor
    setBusy(true)
    const res = await apiRequest(`/api/products/${proposal.id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ approve: approving, note: note.trim() || null }),
    })
    setBusy(false)
    if (!res.ok) {
      toastApiError(res.error, 'Review failed')
      return
    }
    setDecideFor(null)
    toast({
      title: approving ? 'Proposal approved' : 'Proposal rejected',
      description: approving
        ? `"${proposal.title}" is now part of the shared catalog — its initial offer is live.`
        : `"${proposal.title}" was rejected${note.trim() ? ' with your note' : ''}.`,
    })
    onRefetch()
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-2xl" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <AdminEmptyState icon={ShieldAlert} title="Couldn't load the approval queue" description={error}>
        <Button variant="outline" className="rounded-xl" onClick={onRefetch}>
          Try again
        </Button>
      </AdminEmptyState>
    )
  }

  if (proposals.length === 0) {
    return (
      <AdminEmptyState
        icon={ShieldCheck}
        title="All caught up"
        description="No product proposals are waiting for review — new company submissions land here for the platform gate."
      />
    )
  }

  const renderRowActions = (p: AdminProposalRow) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        size="sm"
        className="h-8 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
        onClick={() => openDecision(p, true)}
      >
        <Check size={13} className="mr-1.5" /> Approve
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-8 rounded-lg border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => openDecision(p, false)}
      >
        <X size={13} className="mr-1.5" /> Reject
      </Button>
    </div>
  )

  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <ClipboardCheck size={16} className="text-primary" />
        <span>
          <span className="font-semibold text-foreground">{proposals.length}</span> company proposal
          {proposals.length === 1 ? '' : 's'} awaiting the platform approval gate.
        </span>
      </p>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-2xl border lg:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="px-4 py-3 font-medium">Proposal</th>
              <th scope="col" className="px-4 py-3 font-medium">Company</th>
              <th scope="col" className="px-4 py-3 font-medium">Price</th>
              <th scope="col" className="px-4 py-3 font-medium">Submitted</th>
              <th scope="col" className="px-4 py-3 font-medium">State</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {proposals.map((p) => (
              <tr key={p.id} className="border-b transition-colors last:border-0 hover:bg-accent/50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted">
                      {p.images?.[0] ? (
                        <img src={cardImage(p.images) ?? p.images[0]} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <PackageSearch size={16} className="text-muted-foreground" />
                      )}
                    </span>
                    <div className="min-w-0 max-w-72">
                      <p className="truncate font-semibold" title={p.title}>
                        {p.title}
                      </p>
                      <p className="truncate text-xs text-muted-foreground" title={p.description}>
                        {p.description}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  <p className="max-w-44 truncate font-medium" title={proposalOrg(p)}>
                    {proposalOrg(p)}
                  </p>
                  <p className="max-w-44 truncate text-xs text-muted-foreground">{proposalCategory(p)}</p>
                </td>
                <td className="px-4 py-3.5 font-semibold tabular-nums">{formatUSD(p.price)}</td>
                <td className="px-4 py-3.5 text-muted-foreground" title={formatDate(p.createdAt)}>
                  {timeAgo(p.createdAt)}
                </td>
                <td className="px-4 py-3.5">
                  <StatusBadge status={p.approvalState} map={PROPOSAL_QUEUE_MAP} />
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex justify-end">{renderRowActions(p)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile + tablet stacked cards */}
      <div className="space-y-3 lg:hidden">
        {proposals.map((p) => (
          <Card key={p.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted">
                    {p.images?.[0] ? (
                      <img src={cardImage(p.images) ?? p.images[0]} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <PackageSearch size={16} className="text-muted-foreground" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold" title={p.title}>
                      {p.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {proposalOrg(p)} · {formatUSD(p.price)} · {timeAgo(p.createdAt)}
                    </p>
                  </div>
                </div>
                <StatusBadge status={p.approvalState} map={PROPOSAL_QUEUE_MAP} />
              </div>
              {p.description && (
                <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{p.description}</p>
              )}
              <div className="mt-3 border-t pt-3">{renderRowActions(p)}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Approve / reject with optional note */}
      <Dialog open={!!decideFor} onOpenChange={(open) => !open && setDecideFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {approving ? (
                <BadgeCheck size={17} className="text-emerald-600 dark:text-emerald-400" />
              ) : (
                <ShieldAlert size={17} className="text-destructive" />
              )}
              {approving ? 'Approve proposal' : 'Reject proposal'}
            </DialogTitle>
            <DialogDescription className="line-clamp-2">
              “{decideFor?.title}” — {decideFor ? proposalOrg(decideFor) : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="proposal-note">
              Review note <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="proposal-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                approving
                  ? 'e.g. Verified against the manufacturer catalog — welcome aboard.'
                  : 'e.g. Needs datasheet photos and a verified brand before listing.'
              }
              className="min-h-20 rounded-xl"
              maxLength={2000}
            />
            <p className="text-[11px] text-muted-foreground">
              {approving
                ? 'Approving publishes the product to the shared catalog and activates its initial offer.'
                : 'The note is shown to the company in their proposals list.'}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setDecideFor(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              className={cn(
                'rounded-xl',
                approving ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
              )}
              disabled={busy}
              onClick={() => void decide()}
            >
              {busy ? (
                <Loader2 size={14} className="mr-1.5 animate-spin" />
              ) : approving ? (
                <Check size={14} className="mr-1.5" />
              ) : (
                <X size={14} className="mr-1.5" />
              )}
              {approving ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
