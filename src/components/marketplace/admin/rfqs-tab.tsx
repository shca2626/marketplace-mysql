'use client'

import { useMemo, useState } from 'react'
import {
  Ban,
  Eye,
  FileText,
  Loader2,
  PackageSearch,
  Plus,
  SearchX,
  Send,
  ShieldAlert,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import type { QuoteDTO, RfqDTO } from '@/lib/types'
import { formatDate, formatUSD, timeAgo } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  AdminEmptyState,
  FilterChips,
  ProductPicker,
  QUOTE_STATUS_MAP,
  RFQ_STATUS_MAP,
  SearchInput,
  StatusBadge,
  apiRequest,
  localInputToIso,
  toastApiError,
  useDebounced,
} from './shared'

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'UNDER_REVIEW', label: 'In review' },
  { value: 'QUOTED', label: 'Quoted' },
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'ORDERED', label: 'Ordered' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'DRAFT', label: 'Draft' },
]

/** Statuses where the platform can still respond with a quote. */
const QUOTEABLE = new Set(['SUBMITTED', 'UNDER_REVIEW', 'QUOTED'])

export function RfqsTab() {
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search)
  const [openId, setOpenId] = useState<string | null>(null)

  const query = new URLSearchParams()
  if (statusFilter) query.set('status', statusFilter)
  if (debouncedSearch.trim()) query.set('search', debouncedSearch.trim())
  const { data, loading, error, refetch } = useApi<{ rfqs: RfqDTO[] }>(`/api/admin/rfqs?${query.toString()}`)
  const rfqs = data?.rfqs ?? []

  const showCounts = statusFilter === '' && !debouncedSearch.trim()
  const counts = rfqs.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1
    return acc
  }, {})
  const openNegotiations = rfqs.filter((r) => QUOTEABLE.has(r.status)).length

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterChips
          options={STATUS_FILTERS.map((f) => ({
            ...f,
            count: showCounts && f.value ? counts[f.value] : undefined,
          }))}
          value={statusFilter}
          onChange={setStatusFilter}
          ariaLabel="Filter RFQs by status"
        />
        <div className="flex flex-wrap items-center gap-3">
          {showCounts && (
            <span className="shrink-0 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              {openNegotiations} awaiting response
            </span>
          )}
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search RFQs — number, buyer, title…"
            ariaLabel="Search RFQs"
            className="min-w-0 flex-1 md:max-w-72"
          />
        </div>
      </div>

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {!loading && error && (
        <AdminEmptyState icon={ShieldAlert} title="Couldn't load RFQs" description={error}>
          <Button variant="outline" className="rounded-xl" onClick={() => void refetch()}>
            Try again
          </Button>
        </AdminEmptyState>
      )}

      {!loading && !error && rfqs.length === 0 && (
        <AdminEmptyState
          icon={SearchX}
          title={debouncedSearch.trim() || statusFilter ? 'No RFQs match' : 'No RFQs yet'}
          description={
            debouncedSearch.trim() || statusFilter
              ? 'Try clearing the search or switching the status filter.'
              : 'Buyer quote requests will appear here the moment they are submitted.'
          }
        />
      )}

      {/* Desktop table */}
      {!loading && !error && rfqs.length > 0 && (
        <div className="hidden overflow-hidden rounded-2xl border md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-medium">RFQ</th>
                <th scope="col" className="px-4 py-3 font-medium">Buyer</th>
                <th scope="col" className="px-4 py-3 font-medium">Lines</th>
                <th scope="col" className="px-4 py-3 font-medium">Quotes</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Created</th>
                <th scope="col" className="px-4 py-3 text-right font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rfqs.map((rfq) => (
                <tr key={rfq.id} className="border-b transition-colors last:border-0 hover:bg-accent/50">
                  <td className="px-4 py-3.5">
                    <p className="font-semibold tabular-nums">{rfq.number}</p>
                    <p className="max-w-xs truncate text-xs text-muted-foreground">
                      {rfq.title ?? rfq.lines[0]?.productName ?? 'Open request'}
                    </p>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="truncate font-medium">{rfq.requester.name}</p>
                    <p className="max-w-[180px] truncate text-xs text-muted-foreground">
                      {rfq.organizationName ?? rfq.requester.email}
                    </p>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-muted-foreground">
                      {rfq.lineCount ?? rfq.lines.length} · {(rfq.totalQuantity ?? rfq.lines.reduce((s, l) => s + l.quantity, 0))} units
                    </span>
                  </td>
                  <td className="px-4 py-3.5 tabular-nums text-muted-foreground">{rfq.quoteCount ?? rfq.quotes?.length ?? 0}</td>
                  <td className="px-4 py-3.5">
                    <StatusBadge status={rfq.status} map={RFQ_STATUS_MAP} />
                  </td>
                  <td className="px-4 py-3.5 text-muted-foreground" title={formatDate(rfq.createdAt)}>
                    {timeAgo(rfq.createdAt)}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-lg"
                      onClick={() => setOpenId(rfq.id)}
                      aria-label={`Open ${rfq.number}`}
                    >
                      <Eye size={13} className="mr-1.5" /> Open
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile stacked cards */}
      {!loading && !error && rfqs.length > 0 && (
        <div className="space-y-3 md:hidden">
          {rfqs.map((rfq) => (
            <Card key={rfq.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold tabular-nums">{rfq.number}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {rfq.requester.name}
                      {rfq.organizationName ? ` · ${rfq.organizationName}` : ''}
                    </p>
                  </div>
                  <StatusBadge status={rfq.status} map={RFQ_STATUS_MAP} />
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>
                    {rfq.lineCount ?? rfq.lines.length} lines · {rfq.quoteCount ?? 0} quotes · {timeAgo(rfq.createdAt)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-lg"
                    onClick={() => setOpenId(rfq.id)}
                    aria-label={`Open ${rfq.number}`}
                  >
                    Open
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <RfqDetailDialog rfqId={openId} onClose={() => setOpenId(null)} onChanged={() => void refetch()} />
    </div>
  )
}

// ── Detail dialog ─────────────────────────────────────────────────────────────

function RfqDetailDialog({
  rfqId,
  onClose,
  onChanged,
}: {
  rfqId: string | null
  onClose: () => void
  onChanged: () => void
}) {
  const { data, loading, refetch } = useApi<{ rfq: RfqDTO }>(rfqId ? `/api/rfqs/${rfqId}` : null, {
    skip: !rfqId,
  })
  const rfq = data?.rfq
  const [quoteOpen, setQuoteOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  if (!rfqId) return null
  const open = !!rfqId

  const refresh = () => {
    void refetch()
    onChanged()
  }

  const review = async () => {
    setBusy('review')
    const res = await apiRequest(`/api/rfqs/${rfqId}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'REVIEW' }),
    })
    setBusy(null)
    if (!res.ok) {
      toastApiError(res.error, 'Could not start review')
      return
    }
    toast({ title: 'Review started', description: `${rfq?.number} is now under review.` })
    refresh()
  }

  const reject = async () => {
    setBusy('reject')
    const res = await apiRequest(`/api/rfqs/${rfqId}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'REJECT' }),
    })
    setBusy(null)
    if (!res.ok) {
      toastApiError(res.error, 'Could not reject RFQ')
      return
    }
    toast({ title: 'RFQ rejected', description: `${rfq?.number} has been closed as rejected.` })
    refresh()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : undefined)}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        {loading || !rfq ? (
          <div className="space-y-4 py-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3 pr-6">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <FileText size={20} />
                </span>
                <div className="min-w-0">
                  <DialogTitle className="leading-tight tabular-nums">{rfq.number}</DialogTitle>
                  <DialogDescription className="mt-0.5 flex flex-wrap items-center gap-2">
                    <StatusBadge status={rfq.status} map={RFQ_STATUS_MAP} />
                    <span>
                      {rfq.requester.name}
                      {rfq.organizationName ? ` · ${rfq.organizationName}` : ''}
                    </span>
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            {/* Meta */}
            <div className="grid grid-cols-2 gap-3 rounded-xl border p-4 text-sm sm:grid-cols-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Created</p>
                <p className="mt-0.5" title={formatDate(rfq.createdAt)}>{timeAgo(rfq.createdAt)}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Submitted</p>
                <p className="mt-0.5" title={rfq.submittedAt ? formatDate(rfq.submittedAt) : undefined}>
                  {rfq.submittedAt ? timeAgo(rfq.submittedAt) : '—'}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Buyer</p>
                <p className="mt-0.5 truncate" title={rfq.requester.email}>{rfq.requester.name}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Organization</p>
                <p className="mt-0.5 truncate">{rfq.organizationName ?? '—'}</p>
              </div>
            </div>

            {rfq.description && (
              <div className="rounded-xl border p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Description</p>
                <p className="mt-1 whitespace-pre-line text-sm">{rfq.description}</p>
              </div>
            )}

            {/* Requested lines */}
            <section aria-label="Requested lines">
              <h3 className="mb-2 text-sm font-semibold">Requested lines ({rfq.lines.length})</h3>
              <div className="space-y-1.5 rounded-xl border p-2">
                {rfq.lines.map((l) => (
                  <div key={l.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
                    <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg border bg-muted">
                      {l.product?.image ? (
                        <img src={l.product.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <PackageSearch size={15} className="m-auto block text-muted-foreground" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{l.product?.title ?? l.productName}</p>
                      <p className="text-xs text-muted-foreground">
                        qty {l.quantity}
                        {l.product ? ` · retail ${formatUSD(l.product.price)}` : ' · open item'}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {l.targetPrice ? formatUSD(l.targetPrice) : <span className="text-muted-foreground">no target</span>}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {/* Quotes */}
            <section aria-label="Quotes">
              <h3 className="mb-2 text-sm font-semibold">Quotes ({rfq.quotes?.length ?? 0})</h3>
              {(rfq.quotes ?? []).length === 0 ? (
                <p className="rounded-xl border border-dashed px-4 py-5 text-center text-xs text-muted-foreground">
                  No quotes issued yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {(rfq.quotes ?? []).map((q) => (
                    <QuoteCard key={q.id} quote={q} />
                  ))}
                </div>
              )}
            </section>

            {/* Admin actions */}
            <section aria-label="RFQ actions" className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed p-4">
              {rfq.status === 'SUBMITTED' && (
                <Button size="sm" className="rounded-xl" onClick={() => void review()} disabled={busy !== null}>
                  {busy === 'review' ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Eye size={14} className="mr-1.5" />}
                  Start review
                </Button>
              )}
              {QUOTEABLE.has(rfq.status) && (
                <Button
                  size="sm"
                  className="rounded-xl"
                  onClick={() => setQuoteOpen(true)}
                  disabled={busy !== null}
                >
                  <Send size={14} className="mr-1.5" /> Issue quote
                </Button>
              )}
              {QUOTEABLE.has(rfq.status) && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="rounded-xl text-destructive hover:text-destructive" disabled={busy !== null}>
                      {busy === 'reject' ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Ban size={14} className="mr-1.5" />}
                      Reject RFQ
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Reject {rfq.number}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        The negotiation closes as rejected — the buyer is notified and no further quotes can be issued.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => void reject()}
                      >
                        Reject
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              {!QUOTEABLE.has(rfq.status) && (
                <p className="text-xs text-muted-foreground">
                  This RFQ is in a terminal state — no further platform actions are available.
                </p>
              )}
            </section>
          </>
        )}
      </DialogContent>
      </Dialog>

      {rfq && quoteOpen && (
        <IssueQuoteDialog
          rfq={rfq}
          onClose={() => setQuoteOpen(false)}
          onIssued={() => {
            setQuoteOpen(false)
            refresh()
          }}
        />
      )}
    </>
  )
}

// ── Quote card (detail dialog body) ───────────────────────────────────────────

function QuoteCard({ quote }: { quote: QuoteDTO }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="rounded-xl border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold tabular-nums">
            {quote.number}
            <StatusBadge status={quote.status} map={QUOTE_STATUS_MAP} />
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            by {quote.createdBy.name}
            {quote.sentAt ? ` · sent ${timeAgo(quote.sentAt)}` : ` · ${timeAgo(quote.createdAt)}`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold tabular-nums">{formatUSD(quote.total)}</p>
          <p className="text-[11px] text-muted-foreground">
            {quote.lines.length} {quote.lines.length === 1 ? 'line' : 'lines'}
            {quote.paymentTerms ? ` · ${quote.paymentTerms}` : ''}
          </p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {quote.validUntil && (
          <span title={formatDate(quote.validUntil)}>Valid until {formatDate(quote.validUntil)}</span>
        )}
        {quote.discountTotal > 0 && <span>Discount −{formatUSD(quote.discountTotal)}</span>}
        {quote.shippingTotal > 0 && <span>Shipping {formatUSD(quote.shippingTotal)}</span>}
        {quote.taxTotal > 0 && <span>Tax {formatUSD(quote.taxTotal)}</span>}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="font-medium text-primary hover:underline"
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Hide' : 'Show'} quote ${quote.number} lines`}
        >
          {expanded ? 'Hide lines' : 'Show lines'}
        </button>
      </div>
      {quote.notes && <p className="mt-1.5 text-xs italic text-muted-foreground">{quote.notes}</p>}
      {expanded && (
        <div className="mt-2 space-y-1 border-t pt-2">
          {quote.lines.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-3 text-xs">
              <span className="min-w-0 truncate">
                {l.productTitle ?? 'Product'} × {l.quantity}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatUSD(l.unitPrice)} · <span className="font-semibold text-foreground">{formatUSD(l.lineTotal)}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Issue quote dialog ────────────────────────────────────────────────────────

interface EditableQuoteLine {
  key: string
  rfqLineId?: string
  productId: string
  productTitle: string
  image?: string | null
  quantity: string
  unitPrice: string
}

function IssueQuoteDialog({
  rfq,
  onClose,
  onIssued,
}: {
  rfq: RfqDTO
  onClose: () => void
  onIssued: () => void
}) {
  // Fresh state on every mount — the parent only mounts this dialog while the
  // issue-quote flow is open, so lines re-prefill from the RFQ each time.
  const [lines, setLines] = useState<EditableQuoteLine[]>(
    rfq.lines
      .filter((l) => l.productId)
      .map((l) => ({
        key: `${l.id}`,
        rfqLineId: l.id,
        productId: l.productId!,
        productTitle: l.product?.title ?? l.productName,
        image: l.product?.image ?? null,
        quantity: String(l.quantity),
        unitPrice: (l.targetPrice ?? l.product?.price ?? 0).toFixed(2),
      }))
  )
  const [extras, setExtras] = useState({
    validUntil: '',
    paymentTerms: 'NET-30',
    notes: '',
    discountTotal: '',
    shippingTotal: '',
    taxTotal: '',
  })
  const [saving, setSaving] = useState(false)

  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0),
    [lines]
  )
  const discount = Number(extras.discountTotal) || 0
  const shipping = Number(extras.shippingTotal) || 0
  const tax = Number(extras.taxTotal) || 0
  const total = Math.max(0, subtotal - discount + shipping + tax)

  const addProduct = (p: { id: string; title: string; price: number; image?: string | null }) => {
    setLines((prev) => [
      ...prev,
      {
        key: `${p.id}-extra-${Date.now()}`,
        productId: p.id,
        productTitle: p.title,
        image: p.image ?? null,
        quantity: '1',
        unitPrice: p.price.toFixed(2),
      },
    ])
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (lines.length === 0) {
      toast({ title: 'Nothing to quote', description: 'Add at least one line before sending.', variant: 'destructive' })
      return
    }
    if (lines.some((l) => (Number(l.quantity) || 0) < 1)) {
      toast({ title: 'Check quantities', description: 'Every line needs a quantity of at least 1.', variant: 'destructive' })
      return
    }
    const validUntilIso = localInputToIso(extras.validUntil)
    if (validUntilIso && new Date(validUntilIso).getTime() <= Date.now()) {
      toast({ title: 'Invalid validity', description: '“Valid until” must be in the future.', variant: 'destructive' })
      return
    }
    setSaving(true)
    const res = await apiRequest(`/api/rfqs/${rfq.id}/quotes`, {
      method: 'POST',
      body: JSON.stringify({
        lines: lines.map((l) => ({
          productId: l.productId,
          quantity: Math.max(1, Math.floor(Number(l.quantity) || 1)),
          unitPrice: Math.max(0, Number(l.unitPrice) || 0),
          rfqLineId: l.rfqLineId,
        })),
        validUntil: validUntilIso,
        paymentTerms: extras.paymentTerms.trim() || null,
        notes: extras.notes.trim() || null,
        discountTotal: discount > 0 ? discount : undefined,
        shippingTotal: shipping > 0 ? shipping : undefined,
        taxTotal: tax > 0 ? tax : undefined,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      toastApiError(res.error, 'Could not issue quote')
      return
    }
    toast({
      title: 'Quote issued',
      description: `${rfq.number} — the buyer can now review your offer.`,
    })
    onIssued()
  }

  const openLineCount = rfq.lines.filter((l) => !l.productId).length

  return (
    <Dialog open onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Issue quote — {rfq.number}</DialogTitle>
          <DialogDescription>
            Lines are prefilled from the request. Adjust quantities and unit prices, then send.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {/* Lines */}
          <div className="space-y-2">
            {lines.length === 0 && (
              <p className="rounded-xl border border-dashed px-4 py-5 text-center text-xs text-muted-foreground">
                No prefilled lines — add products below.
              </p>
            )}
            {lines.map((l, i) => (
              <div key={l.key} className="rounded-xl border p-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg border bg-muted">
                    {l.image ? (
                      <img src={l.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <PackageSearch size={15} className="m-auto block text-muted-foreground" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{l.productTitle}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatUSD(Number(l.unitPrice) || 0)} × {l.quantity || 0} ={' '}
                      <span className="font-semibold text-foreground">
                        {formatUSD((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0))}
                      </span>
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 rounded-lg p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                    aria-label={`Remove ${l.productTitle} from quote`}
                  >
                    <Ban size={14} />
                  </Button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 pl-[46px]">
                  <div className="space-y-1">
                    <Label htmlFor={`ql-qty-${i}`} className="text-[11px]">
                      Quantity
                    </Label>
                    <Input
                      id={`ql-qty-${i}`}
                      type="number"
                      min={1}
                      step={1}
                      value={l.quantity}
                      onChange={(e) => setLines((prev) => prev.map((x, idx) => (idx === i ? { ...x, quantity: e.target.value } : x)))}
                      className="h-8 rounded-lg text-sm"
                      aria-label={`Quantity for ${l.productTitle}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`ql-price-${i}`} className="text-[11px]">
                      Unit price (USD)
                    </Label>
                    <Input
                      id={`ql-price-${i}`}
                      type="number"
                      min={0}
                      step="0.01"
                      value={l.unitPrice}
                      onChange={(e) => setLines((prev) => prev.map((x, idx) => (idx === i ? { ...x, unitPrice: e.target.value } : x)))}
                      className="h-8 rounded-lg text-sm"
                      aria-label={`Unit price for ${l.productTitle}`}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Add products */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Plus size={12} className="mr-1 inline" /> Add more products
            </p>
            <ProductPicker onPick={addProduct} label="Search products to add to the quote" />
            {openLineCount > 0 && (
              <p className="text-[11px] text-muted-foreground">
                {openLineCount} open-item {openLineCount === 1 ? 'line lacks' : 'lines lack'} a catalog product — pick
                matching products above to quote them.
              </p>
            )}
          </div>

          {/* Quote terms */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="q-valid">Valid until</Label>
              <Input
                id="q-valid"
                type="datetime-local"
                value={extras.validUntil}
                onChange={(e) => setExtras((x) => ({ ...x, validUntil: e.target.value }))}
                aria-label="Quote validity deadline"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q-terms">Payment terms</Label>
              <Input
                id="q-terms"
                maxLength={24}
                value={extras.paymentTerms}
                onChange={(e) => setExtras((x) => ({ ...x, paymentTerms: e.target.value }))}
                placeholder="NET-30"
                aria-label="Payment terms, e.g. NET-30"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="q-notes">Notes to buyer (optional)</Label>
            <Textarea
              id="q-notes"
              rows={2}
              className="resize-none"
              maxLength={5000}
              value={extras.notes}
              onChange={(e) => setExtras((x) => ({ ...x, notes: e.target.value }))}
              placeholder="Volume flexibility, delivery windows, substitutions…"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="q-discount">Discount total</Label>
              <Input
                id="q-discount"
                type="number"
                min={0}
                step="0.01"
                value={extras.discountTotal}
                onChange={(e) => setExtras((x) => ({ ...x, discountTotal: e.target.value }))}
                aria-label="Discount total in US dollars"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q-shipping">Shipping total</Label>
              <Input
                id="q-shipping"
                type="number"
                min={0}
                step="0.01"
                value={extras.shippingTotal}
                onChange={(e) => setExtras((x) => ({ ...x, shippingTotal: e.target.value }))}
                aria-label="Shipping total in US dollars"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q-tax">Tax total</Label>
              <Input
                id="q-tax"
                type="number"
                min={0}
                step="0.01"
                value={extras.taxTotal}
                onChange={(e) => setExtras((x) => ({ ...x, taxTotal: e.target.value }))}
                aria-label="Tax total in US dollars"
              />
            </div>
          </div>

          {/* Totals preview */}
          <div className="space-y-1.5 rounded-xl border bg-muted/40 p-4 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatUSD(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Discount</span>
                <span className="tabular-nums">−{formatUSD(discount)}</span>
              </div>
            )}
            {shipping > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Shipping</span>
                <span className="tabular-nums">+{formatUSD(shipping)}</span>
              </div>
            )}
            {tax > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Tax</span>
                <span className="tabular-nums">+{formatUSD(tax)}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-1.5 font-bold">
              <span>Quote total</span>
              <span className="tabular-nums">{formatUSD(total)}</span>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" className="rounded-xl" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="rounded-xl" disabled={saving}>
              {saving ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : <Send size={15} className="mr-1.5" />}
              Send quote
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
