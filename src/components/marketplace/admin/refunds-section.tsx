'use client'

// ─────────────────────────────────────────────────────────────────────────────
// REFUND QUEUE (Phase 7.7.3) — obligation vs. execution, item-level.
// Mounted inside the Payments tab behind the Payments | Refunds switch.
//
// Server surface (all live):
//   GET  /api/admin/refunds                 → { total, pages, countsByStatus, refunds }
//   POST /api/admin/refunds/[id]/approve    → { refund }        (payments.capture)
//   POST /api/admin/refunds/[id]/deny       → { refund }        (payments.capture)
//   POST /api/admin/refunds/[id]/complete   → { refund }        (payments.capture + step-up)
//        — complete REQUIRES a paymentReference (execution evidence) and a
//          fresh step-up MFA window (6.7.5); the guard mirrors payouts-tab.
//
// An APPROVED refund is an OBLIGATION (nothing paid yet); COMPLETED is the
// EXECUTION event — it releases payout claims and appends REVERSAL entries on
// the settlement ledger, then re-derives the order's paymentStatus from
// COMPLETED refunds only.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import {
  Banknote,
  CheckCircle2,
  Loader2,
  ReceiptText,
  RefreshCw,
  SearchX,
  ShieldAlert,
  XCircle,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { formatDate, timeAgo } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { AdminEmptyState, SearchInput, apiRequest, useDebounced } from './shared'
import { useStepUp } from './step-up-guard'

// ── Types (contract of GET /api/admin/refunds) ───────────────────────────────

type RefundStatus = 'REQUESTED' | 'APPROVED' | 'COMPLETED' | 'DENIED' | 'CANCELLED'
type DecideMode = 'approve' | 'deny' | 'complete'

interface RefundItem {
  orderItemId: string
  title: string
  quantity: number
  refundedQty: number
  unitPrice: number
  amount: number
}

interface RefundRow {
  id: string
  number: string
  orderId: string
  status: RefundStatus
  reason: string
  amountTotal: number
  currency: string
  paymentReference: string | null
  createdAt: string
  approvedAt: string | null
  completedAt: string | null
  order: { id: string; poNumber: string | null; paymentStatus: string; buyerName: string }
  requestedBy: { id: string; name: string } | null
  items: RefundItem[]
}

interface RefundsResponse {
  total: number
  page: number
  pages: number
  countsByStatus: Record<string, number>
  refunds: RefundRow[]
}

// ── Palette ──────────────────────────────────────────────────────────────────

const REFUND_STATUS_MAP: Record<RefundStatus, { label: string; badge: string; dot: string }> = {
  REQUESTED: {
    label: 'Requested',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    dot: 'bg-amber-400',
  },
  APPROVED: {
    label: 'Approved — obligation',
    badge: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
    dot: 'bg-orange-400',
  },
  COMPLETED: {
    label: 'Completed',
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    dot: 'bg-emerald-400',
  },
  DENIED: {
    label: 'Denied',
    badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
    dot: 'bg-rose-400',
  },
  CANCELLED: {
    label: 'Cancelled',
    badge: 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400',
    dot: 'bg-stone-400',
  },
}

const STATUS_TILES: RefundStatus[] = ['REQUESTED', 'APPROVED', 'COMPLETED', 'DENIED', 'CANCELLED']

const PAGE_SIZE = 20

const shortId = (id: string) => `#${id.slice(-8).toUpperCase()}`

/** Money in the refund's own currency (explicit code, Phase 7.2). */
function formatMoney(amount: number, currency: string): string {
  return `${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
}

// ── Refunds section ───────────────────────────────────────────────────────────

export function RefundsSection() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search)
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)

  // Detail + decision dialogs
  const [detailFor, setDetailFor] = useState<RefundRow | null>(null)
  const [decideFor, setDecideFor] = useState<RefundRow | null>(null)
  const [decideMode, setDecideMode] = useState<DecideMode>('approve')
  const [note, setNote] = useState('')
  const [reference, setReference] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Phase 6 (6.7.5) — completing a refund (money execution) is step-up guarded.
  const { guard: guardStepUp, node: stepUpDialog } = useStepUp()

  // Render-time keyed sync: jump back to page 1 whenever filters change
  const filterKey = `${debouncedSearch}|${statusFilter}`
  const [appliedKey, setAppliedKey] = useState<string | null>(null)
  if (appliedKey !== filterKey) {
    setAppliedKey(filterKey)
    setPage(1)
  }

  const query = new URLSearchParams()
  if (debouncedSearch.trim()) query.set('q', debouncedSearch.trim())
  if (statusFilter) query.set('status', statusFilter)
  query.set('page', String(page))
  query.set('limit', String(PAGE_SIZE))
  const {
    data,
    loading,
    error: listError,
    refetch,
  } = useApi<RefundsResponse>(`/api/admin/refunds?${query.toString()}`)
  const refunds = data?.refunds ?? []
  const countsByStatus = data?.countsByStatus ?? {}

  const openDecide = (refund: RefundRow, mode: DecideMode) => {
    setNote('')
    setReference('')
    setError(null)
    setDecideMode(mode)
    setDecideFor(refund)
  }

  const canSubmit = decideMode === 'complete' ? reference.trim().length >= 3 : true

  const confirmDecide = async () => {
    if (!decideFor) return
    const refund = decideFor
    const action = decideMode // approve | deny | complete
    const body =
      decideMode === 'complete'
        ? { paymentReference: reference.trim(), note: note.trim() || undefined }
        : { note: note.trim() || undefined }

    setBusy(true)
    setError(null)
    const res = await guardStepUp(() =>
      apiRequest<{ refund: RefundRow }>(`/api/admin/refunds/${refund.id}/${action}`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
    )
    setBusy(false)
    if (!res) return // step-up cancelled / enrollment required
    if (!res.ok) {
      setError(res.error ?? 'The action failed — please try again')
      return
    }
    setDecideFor(null)
    toast({
      title:
        decideMode === 'approve'
          ? `Refund ${refund.number} approved`
          : decideMode === 'deny'
            ? `Refund ${refund.number} denied`
            : `Refund ${refund.number} completed`,
      description:
        decideMode === 'approve'
          ? `${formatMoney(refund.amountTotal, refund.currency)} — the obligation is established; completion needs execution evidence.`
          : decideMode === 'deny'
            ? 'The buyer was notified.'
            : `${formatMoney(refund.amountTotal, refund.currency)} returned (ref ${reference.trim()}) — payout claims released, order payment status re-derived.`,
    })
    setDetailFor(null)
    void refetch()
  }

  return (
    <div className="space-y-5">
      {/* KPI strip — counts by status, clickable to filter */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {STATUS_TILES.map((status) => {
          const entry = REFUND_STATUS_MAP[status]
          const selected = statusFilter === status
          return (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(selected ? '' : status)}
              aria-pressed={selected}
              aria-label={`Show ${entry.label} refunds`}
              className={cn(
                'rounded-2xl border bg-card p-4 text-left transition-all hover:shadow-md',
                selected ? 'border-primary/60 ring-1 ring-primary/30' : 'hover:border-primary/40'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <span className={cn('h-2 w-2 rounded-full', entry.dot)} aria-hidden="true" />
                  {entry.label.split(' — ')[0]}
                </p>
              </div>
              <p className="mt-1.5 text-2xl font-extrabold tabular-nums">
                {loading && !data ? '—' : (countsByStatus[status] ?? 0)}
              </p>
            </button>
          )
        })}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setStatusFilter('')}
            aria-pressed={statusFilter === ''}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors',
              statusFilter === ''
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
            )}
          >
            All refunds
          </button>
          {STATUS_TILES.map((status) => {
            const selected = statusFilter === status
            return (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(selected ? '' : status)}
                aria-pressed={selected}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors',
                  selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:border-primary/40'
                )}
              >
                <span className={cn('h-2 w-2 rounded-full', REFUND_STATUS_MAP[status].dot)} aria-hidden="true" />
                <span className={selected ? '' : 'text-foreground'}>{REFUND_STATUS_MAP[status].label.split(' — ')[0]}</span>
                <span className={selected ? 'opacity-80' : 'text-muted-foreground'}>{countsByStatus[status] ?? 0}</span>
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-2.5">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search — refund number, item…"
            ariaLabel="Search refunds"
            className="min-w-0 flex-1 sm:max-w-72"
          />
          <Button variant="outline" className="h-10 shrink-0 rounded-xl" onClick={() => void refetch()} disabled={loading}>
            {loading ? <Loader2 size={15} className="mr-2 animate-spin" /> : <RefreshCw size={15} className="mr-2" />}
            Refresh
          </Button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && listError && (
        <AdminEmptyState icon={ShieldAlert} title="Couldn't load refunds" description={listError}>
          <Button variant="outline" className="rounded-xl" onClick={() => void refetch()}>
            Try again
          </Button>
        </AdminEmptyState>
      )}

      {/* Empty */}
      {!loading && !listError && refunds.length === 0 && (
        <AdminEmptyState
          icon={SearchX}
          title={debouncedSearch.trim() || statusFilter ? 'No refunds match' : 'No refunds yet'}
          description={
            debouncedSearch.trim() || statusFilter
              ? 'Try clearing the search or switching the status filter.'
              : 'Buyer refund requests on paid orders will appear here.'
          }
        />
      )}

      {/* Desktop table */}
      {!loading && !listError && refunds.length > 0 && (
        <div className="hidden overflow-x-auto rounded-2xl border lg:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-medium">Refund</th>
                <th scope="col" className="px-4 py-3 font-medium">Order</th>
                <th scope="col" className="px-4 py-3 font-medium">Items</th>
                <th scope="col" className="px-4 py-3 font-medium">Amount</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 text-right font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {refunds.map((refund) => (
                <tr key={refund.id} className="border-b align-top transition-colors last:border-0 hover:bg-accent/50">
                  <td className="px-4 py-3.5">
                    <button
                      type="button"
                      onClick={() => setDetailFor(refund)}
                      className="font-mono text-xs font-bold tracking-tight underline-offset-2 hover:underline"
                      aria-label={`Open refund ${refund.number} details`}
                    >
                      {refund.number}
                    </button>
                    <p className="text-xs text-muted-foreground" title={new Date(refund.createdAt).toLocaleString()}>
                      {timeAgo(refund.createdAt)}
                    </p>
                    {refund.requestedBy && (
                      <p className="truncate text-[11px] text-muted-foreground" title={refund.requestedBy.name}>
                        by {refund.requestedBy.name}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="font-mono text-xs font-bold tracking-tight">{shortId(refund.order.id)}</p>
                    {refund.order.poNumber && (
                      <p className="font-mono text-[11px] text-muted-foreground">PO {refund.order.poNumber}</p>
                    )}
                    <p className="max-w-36 truncate text-xs text-muted-foreground" title={refund.order.buyerName}>
                      {refund.order.buyerName}
                    </p>
                  </td>
                  <td className="max-w-52 px-4 py-3.5">
                    <ItemsSummary items={refund.items} />
                  </td>
                  <td className="px-4 py-3.5 font-semibold tabular-nums">
                    {formatMoney(refund.amountTotal, refund.currency)}
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusBadge refund={refund} />
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {(refund.status === 'REQUESTED' || refund.status === 'APPROVED') && (
                        <Button
                          size="sm"
                          className="h-8 rounded-lg"
                          onClick={() => openDecide(refund, refund.status === 'REQUESTED' ? 'approve' : 'complete')}
                          aria-label={
                            refund.status === 'REQUESTED'
                              ? `Approve refund ${refund.number}`
                              : `Complete refund ${refund.number} with execution evidence`
                          }
                        >
                          {refund.status === 'REQUESTED' ? (
                            <>
                              <CheckCircle2 size={13} className="mr-1.5" /> Approve
                            </>
                          ) : (
                            <>
                              <Banknote size={13} className="mr-1.5" /> Complete
                            </>
                          )}
                        </Button>
                      )}
                      {(refund.status === 'REQUESTED' || refund.status === 'APPROVED') && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-lg border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => openDecide(refund, 'deny')}
                          aria-label={`Deny refund ${refund.number}`}
                        >
                          <XCircle size={13} className="mr-1.5" /> Deny
                        </Button>
                      )}
                      {refund.status !== 'REQUESTED' && refund.status !== 'APPROVED' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 rounded-lg text-muted-foreground"
                          onClick={() => setDetailFor(refund)}
                          aria-label={`Open refund ${refund.number} details`}
                        >
                          <ReceiptText size={13} className="mr-1.5" /> Details
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile + tablet stacked cards */}
      {!loading && !listError && refunds.length > 0 && (
        <div className="space-y-3 lg:hidden">
          {refunds.map((refund) => (
            <Card key={refund.id}>
              <CardContent className="space-y-2.5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => setDetailFor(refund)}
                      className="font-mono text-xs font-bold tracking-tight underline-offset-2 hover:underline"
                      aria-label={`Open refund ${refund.number} details`}
                    >
                      {refund.number}
                    </button>
                    <p className="truncate text-xs text-muted-foreground" title={refund.order.buyerName}>
                      {refund.order.buyerName}
                      {refund.order.poNumber ? ` · PO ${refund.order.poNumber}` : ''}
                    </p>
                    <p className="text-[11px] text-muted-foreground" title={new Date(refund.createdAt).toLocaleString()}>
                      {timeAgo(refund.createdAt)}
                      {refund.requestedBy ? ` · by ${refund.requestedBy.name}` : ''}
                    </p>
                  </div>
                  <StatusBadge refund={refund} />
                </div>
                <div className="flex items-start justify-between gap-3 border-t pt-2.5">
                  <div className="min-w-0">
                    <ItemsSummary items={refund.items} />
                  </div>
                  <p className="shrink-0 text-sm font-bold tabular-nums">{formatMoney(refund.amountTotal, refund.currency)}</p>
                </div>
                {(refund.status === 'REQUESTED' || refund.status === 'APPROVED') && (
                  <div className="flex flex-wrap items-center gap-1.5 border-t pt-2.5">
                    <Button
                      size="sm"
                      className="h-8 flex-1 rounded-lg"
                      onClick={() => openDecide(refund, refund.status === 'REQUESTED' ? 'approve' : 'complete')}
                    >
                      {refund.status === 'REQUESTED' ? (
                        <>
                          <CheckCircle2 size={13} className="mr-1.5" /> Approve
                        </>
                      ) : (
                        <>
                          <Banknote size={13} className="mr-1.5" /> Complete
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 flex-1 rounded-lg border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => openDecide(refund, 'deny')}
                    >
                      <XCircle size={13} className="mr-1.5" /> Deny
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 rounded-lg text-muted-foreground"
                      onClick={() => setDetailFor(refund)}
                      aria-label={`Open refund ${refund.number} details`}
                    >
                      <ReceiptText size={13} />
                    </Button>
                  </div>
                )}
                {refund.status !== 'REQUESTED' && refund.status !== 'APPROVED' && (
                  <div className="border-t pt-2.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 rounded-lg text-muted-foreground"
                      onClick={() => setDetailFor(refund)}
                      aria-label={`Open refund ${refund.number} details`}
                    >
                      <ReceiptText size={13} className="mr-1.5" /> Details
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && !listError && data && data.pages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Page <span className="font-semibold tabular-nums text-foreground">{page}</span> of{' '}
            <span className="font-semibold tabular-nums text-foreground">{data.pages}</span> · {data.total} refunds
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

      {/* Detail dialog */}
      <RefundDetailDialog refund={detailFor} onClose={() => setDetailFor(null)} />

      {/* Approve / deny / complete dialog */}
      <Dialog open={!!decideFor} onOpenChange={(open) => !open && !busy && setDecideFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {decideMode === 'approve' ? (
                <>
                  <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" /> Approve refund
                </>
              ) : decideMode === 'deny' ? (
                <>
                  <XCircle size={16} className="text-destructive" /> Deny refund
                </>
              ) : (
                <>
                  <Banknote size={16} className="text-primary" /> Complete refund — record execution
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {decideMode === 'approve' ? (
                <>
                  {decideFor ? `${decideFor.number} — ${formatMoney(decideFor.amountTotal, decideFor.currency)} to ${decideFor.order.buyerName}` : ''}.
                  Approval establishes the <strong>obligation</strong> — nothing is paid until you record the execution.
                </>
              ) : decideMode === 'deny' ? (
                <>
                  Denying{decideFor ? ` ${decideFor.number}` : ''} refuses the request. The buyer is notified.
                </>
              ) : (
                <>
                  Completing{decideFor ? ` ${decideFor.number} — ${formatMoney(decideFor.amountTotal, decideFor.currency)}` : ''} is
                  the <strong>execution</strong> event: payout claims are released, REVERSAL entries land on the settlement
                  ledger and the order&apos;s payment status is re-derived. Needs a fresh identity check.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {decideMode === 'complete' && (
              <div className="space-y-1.5">
                <Label htmlFor="refund-payment-ref" className="text-xs text-muted-foreground">
                  Payment reference — required
                </Label>
                <Input
                  id="refund-payment-ref"
                  value={reference}
                  onChange={(e) => setReference(e.target.value.slice(0, 190))}
                  placeholder="e.g. PSP-REF-88213 or BANK-TRF-552"
                  className="h-10 rounded-xl font-mono"
                  aria-describedby="refund-payment-ref-hint"
                />
                <p id="refund-payment-ref-hint" className="text-xs text-muted-foreground">
                  Execution evidence — PSP refund id or bank reference.
                </p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="refund-note" className="text-xs text-muted-foreground">
                {decideMode === 'complete'
                  ? 'Note (optional — context for the audit log)'
                  : decideMode === 'deny'
                    ? 'Reason (recommended — the buyer sees it)'
                    : 'Note (optional — recorded with the decision)'}
              </Label>
              <Textarea
                id="refund-note"
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 1000))}
                placeholder={
                  decideMode === 'approve'
                    ? 'e.g. Item arrived damaged — photo evidence attached'
                    : decideMode === 'deny'
                      ? 'e.g. Outside the 14-day return window'
                      : 'e.g. Refunded via original card — PSP ref above'
                }
                className="min-h-[72px]"
              />
            </div>
            {error && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive"
              >
                {error}
              </p>
            )}
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" className="rounded-xl" onClick={() => setDecideFor(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              className={`rounded-xl ${decideMode === 'deny' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}`}
              disabled={busy || !canSubmit}
              onClick={() => void confirmDecide()}
            >
              {busy ? <Loader2 size={15} className="mr-2 animate-spin" /> : null}
              {decideMode === 'approve' ? 'Approve' : decideMode === 'deny' ? 'Deny refund' : 'Record execution'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Phase 6 — step-up MFA dialog (shared retry guard) */}
      {stepUpDialog}
    </div>
  )
}

// ── Row pieces ───────────────────────────────────────────────────────────────

function StatusBadge({ refund }: { refund: RefundRow }) {
  const entry = REFUND_STATUS_MAP[refund.status] ?? {
    label: refund.status,
    badge: 'bg-muted text-muted-foreground',
    dot: 'bg-muted-foreground',
  }
  return (
    <Badge className={cn('shrink-0 rounded-full border-0 text-[11px] font-semibold', entry.badge)}>{entry.label}</Badge>
  )
}

function ItemsSummary({ items }: { items: RefundItem[] }) {
  if (items.length === 0) return <span className="text-xs text-muted-foreground">No item allocations</span>
  const visible = items.slice(0, 2)
  const rest = items.length - visible.length
  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((item) => (
        <Badge key={item.orderItemId} variant="outline" className="max-w-40 truncate rounded-full px-2 text-[11px] font-medium">
          {item.title}
        </Badge>
      ))}
      {rest > 0 && (
        <Badge variant="outline" className="rounded-full px-2 text-[11px] font-medium text-muted-foreground">
          +{rest}
        </Badge>
      )}
    </div>
  )
}

// ── Detail dialog ─────────────────────────────────────────────────────────────

function RefundDetailDialog({ refund, onClose }: { refund: RefundRow | null; onClose: () => void }) {
  if (!refund) return null
  return (
    <Dialog open={!!refund} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ReceiptText size={16} className="text-primary" /> Refund {refund.number}
          </DialogTitle>
          <DialogDescription>
            Requested by {refund.requestedBy?.name ?? '—'} {timeAgo(refund.createdAt)} on order{' '}
            {shortId(refund.order.id)}
            {refund.order.poNumber ? ` (PO ${refund.order.poNumber})` : ''}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-2xl border bg-muted/30 p-3.5">
            <StatusBadge refund={refund} />
            <p className="text-base font-extrabold tabular-nums">{formatMoney(refund.amountTotal, refund.currency)}</p>
            <p className="text-xs text-muted-foreground">
              Order payment: <span className="font-medium text-foreground">{refund.order.paymentStatus.replaceAll('_', ' ').toLowerCase()}</span>
            </p>
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Reason</p>
            <p className="rounded-xl border bg-card p-3 text-sm">{refund.reason}</p>
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Items</p>
            <div className="max-h-64 overflow-y-auto scrollbar-thin rounded-xl border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="px-3 py-2 font-medium">Item</th>
                    <th scope="col" className="px-3 py-2 font-medium">Qty × unit</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {refund.items.map((item) => (
                    <tr key={item.orderItemId} className="border-b transition-colors last:border-0 hover:bg-accent/50">
                      <td className="max-w-48 truncate px-3 py-2 text-xs font-medium" title={item.title}>
                        {item.title}
                      </td>
                      <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">
                        {item.quantity} × {item.unitPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2 text-right text-xs font-semibold tabular-nums">
                        {item.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                  {refund.items.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-3 py-4 text-center text-xs text-muted-foreground">
                        No item allocations recorded.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl border p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Requested</p>
              <p className="mt-0.5" title={new Date(refund.createdAt).toLocaleString()}>
                {formatDate(refund.createdAt)}
              </p>
            </div>
            <div className="rounded-xl border p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Approved</p>
              <p className="mt-0.5">{refund.approvedAt ? formatDate(refund.approvedAt) : '—'}</p>
            </div>
            <div className="rounded-xl border p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Completed</p>
              <p className="mt-0.5">{refund.completedAt ? formatDate(refund.completedAt) : '—'}</p>
            </div>
            <div className="rounded-xl border p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Execution evidence</p>
              <p className="mt-0.5 truncate font-mono" title={refund.paymentReference ?? undefined}>
                {refund.paymentReference ?? '—'}
              </p>
            </div>
          </div>
        </div>
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" className="rounded-xl" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
