'use client'

import { useState } from 'react'
import {
  Ban,
  CheckCircle2,
  ChevronDown,
  Coins,
  Layers,
  Loader2,
  PiggyBank,
  Save,
  SearchX,
  ShieldAlert,
  Undo2,
  Wallet,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { formatDate, formatNumber, formatUSD, timeAgo } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  AdminEmptyState,
  SearchInput,
  StatusBadge,
  apiRequest,
  toastApiError,
  useDebounced,
} from './shared'
import { useStepUp } from './step-up-guard'

// ── Types (contracts of /api/admin/payouts) ────────────────────────────────────

type PayoutStatus = 'PENDING' | 'PAID' | 'CANCELLED'
type SettleMode = 'mark-paid' | 'cancel' | 'reverse'
type LinePurpose = 'SETTLEMENT' | 'REVERSAL' | 'REISSUE'
type LineStatus = 'PENDING' | 'EFFECTIVE' | 'REVERSED' | 'CANCELLED'

interface PayoutLineSummary {
  total: number
  effective: number
  reversed: number
  cancellations: number
  reversals: number
}

interface PayoutRow {
  id: string
  number: string
  seller: { id: string; name: string; storeName: string | null; email: string }
  periodEnd: string
  itemCount: number
  grossAmount: number
  commissionRate: number
  commission: number
  netAmount: number
  status: PayoutStatus
  paidAt: string | null
  note: string | null
  // Phase 7.4C — external transfer discipline (S4)
  transferReference: string | null
  transferIdempotencyKey: string | null
  executedAt: string | null
  lineSummary: PayoutLineSummary
  createdAt: string
}

interface PayoutsResponse {
  total: number
  page: number
  pages: number
  totalsByStatus: Record<string, { count: number; net: number; commission: number }>
  payouts: PayoutRow[]
}

interface PayoutPreview {
  sellerId: string
  sellerName: string
  storeName: string | null
  commissionRate: number
  unsettledItems: number
  grossAmount: number
  commission: number
  netAmount: number
}

interface VendorOption {
  id: string
  name: string
  storeName: string | null
  email: string
}

// ── Palette ─────────────────────────────────────────────────────────────────────

const PAYOUT_STATUS_MAP: Record<string, { label: string; badge: string }> = {
  PENDING: { label: 'Pending', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  PAID: { label: 'Paid', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  CANCELLED: { label: 'Cancelled', badge: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
}

const STATUS_FILTERS: PayoutStatus[] = ['PENDING', 'PAID', 'CANCELLED']

// Phase 7.4B — ledger line chips
const LINE_PURPOSE_MAP: Record<LinePurpose, { label: string; badge: string }> = {
  SETTLEMENT: { label: 'Settlement', badge: 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300' },
  REISSUE: { label: 'Reissue', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  REVERSAL: { label: 'Reversal', badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' },
}

const LINE_STATUS_MAP: Record<LineStatus, { label: string; badge: string }> = {
  EFFECTIVE: { label: 'Effective', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  PENDING: { label: 'Pending', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  REVERSED: {
    label: 'Reversed',
    badge: 'border border-rose-300 bg-background text-rose-700 dark:border-rose-900 dark:text-rose-300',
  },
  CANCELLED: { label: 'Cancelled', badge: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
}

const PAGE_SIZE = 20

const vendorLabel = (v: { name: string; storeName: string | null }) => v.storeName?.trim() || v.name
const shortId = (id: string) => `#${id.slice(-8).toUpperCase()}`

// ── Payouts tab ─────────────────────────────────────────────────────────────────

export function PayoutsTab() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search)
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)

  // Payout-level dialogs
  const [settleFor, setSettleFor] = useState<PayoutRow | null>(null)
  const [settleMode, setSettleMode] = useState<SettleMode>('mark-paid')
  const [settleNote, setSettleNote] = useState('')
  const [settleReference, setSettleReference] = useState('')
  const [settleError, setSettleError] = useState<string | null>(null)
  const [settling, setSettling] = useState(false)

  // Phase 7.4B — the settlement ledger dialog
  const [ledgerFor, setLedgerFor] = useState<PayoutRow | null>(null)

  // Phase 6 (6.7.5) — payout mutations are step-up guarded.
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
    error,
    refetch: refetchList,
  } = useApi<PayoutsResponse>(`/api/admin/payouts?${query.toString()}`)
  const payouts = data?.payouts ?? []

  const openSettle = (payout: PayoutRow, mode: SettleMode) => {
    setSettleNote('')
    setSettleReference('')
    setSettleError(null)
    setSettleMode(mode)
    setSettleFor(payout)
  }

  const settleValid =
    settleMode === 'mark-paid'
      ? settleReference.trim().length > 0
      : settleMode === 'reverse'
        ? settleNote.trim().length >= 3
        : true

  const confirmSettle = async () => {
    if (!settleFor) return
    const payout = settleFor
    setSettling(true)
    setSettleError(null)
    const res = await guardStepUp(() =>
      apiRequest(`/api/admin/payouts/${payout.id}/${settleMode === 'mark-paid' ? 'mark-paid' : settleMode === 'cancel' ? 'cancel' : 'reverse'}`, {
        method: 'POST',
        body: JSON.stringify(
          settleMode === 'mark-paid'
            ? { transferReference: settleReference.trim(), note: settleNote.trim() || undefined }
            : { reason: settleNote.trim() || undefined }
        ),
      })
    )
    setSettling(false)
    if (!res) return // step-up cancelled / enrollment required
    if (!res.ok) {
      // 400 (missing reference) / 409 (duplicate reference, wrong state) —
      // surfaced inline so the operator can fix and retry without losing input.
      setSettleError(res.error ?? 'The action failed — please try again')
      return
    }
    setSettleFor(null)
    toast({
      title:
        settleMode === 'mark-paid'
          ? `Payout ${payout.number} marked paid`
          : settleMode === 'cancel'
            ? `Payout ${payout.number} cancelled`
            : `Payout ${payout.number} reversed`,
      description:
        settleMode === 'mark-paid'
          ? `${formatUSD(payout.netAmount)} to ${vendorLabel(payout.seller)} — ref ${settleReference.trim()} recorded on the settlement ledger.`
          : settleMode === 'cancel'
            ? 'The vendor was notified. Settled items return to the unsettled pool.'
            : 'REVERSAL entries appended, originals flipped to REVERSED and claims released — a corrected payout can reissue.',
    })
    void refetchList()
  }

  const totalsByStatus = data?.totalsByStatus ?? {}

  return (
    <div className="space-y-5">
      {/* (a) + (b) config & generate */}
      <div className="grid gap-4 lg:grid-cols-3">
        <CommissionConfigCard />
        <GeneratePayoutCard onGenerated={() => void refetchList()} />
      </div>

      {/* Status chips + filters */}
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
            All payouts
          </button>
          {STATUS_FILTERS.map((status) => {
            const bucket = totalsByStatus[status]
            const selected = statusFilter === status
            return (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                aria-pressed={selected}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors',
                  selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:border-primary/40'
                )}
              >
                <span className={cn('h-2 w-2 rounded-full', PAYOUT_STATUS_MAP[status].badge.split(' ')[0])} aria-hidden="true" />
                <span className={selected ? '' : 'text-foreground'}>{PAYOUT_STATUS_MAP[status].label}</span>
                <span className={selected ? 'opacity-80' : 'text-muted-foreground'}>
                  {bucket ? `${bucket.count} · ${formatUSD(bucket.net)}` : '0'}
                </span>
              </button>
            )
          })}
        </div>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search — payout number, vendor…"
          ariaLabel="Search payouts"
          className="min-w-0 flex-1 sm:max-w-72"
        />
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
      {!loading && error && (
        <AdminEmptyState icon={ShieldAlert} title="Couldn't load payouts" description={error}>
          <Button variant="outline" className="rounded-xl" onClick={() => void refetchList()}>
            Try again
          </Button>
        </AdminEmptyState>
      )}

      {/* Empty */}
      {!loading && !error && payouts.length === 0 && (
        <AdminEmptyState
          icon={SearchX}
          title={debouncedSearch.trim() || statusFilter ? 'No payouts match' : 'No payouts yet'}
          description={
            debouncedSearch.trim() || statusFilter
              ? 'Try clearing the search or switching the status filter.'
              : 'Generate a payout above to settle a vendor’s paid order items.'
          }
        />
      )}

      {/* Desktop table */}
      {!loading && !error && payouts.length > 0 && (
        <div className="hidden overflow-x-auto rounded-2xl border lg:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-medium">Payout</th>
                <th scope="col" className="px-4 py-3 font-medium">Vendor</th>
                <th scope="col" className="px-4 py-3 font-medium">Period end</th>
                <th scope="col" className="px-4 py-3 font-medium">Items</th>
                <th scope="col" className="px-4 py-3 font-medium">Gross</th>
                <th scope="col" className="px-4 py-3 font-medium">Rate</th>
                <th scope="col" className="px-4 py-3 font-medium">Commission</th>
                <th scope="col" className="px-4 py-3 font-medium">Net</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 text-right font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((payout) => (
                <tr key={payout.id} className="border-b align-top transition-colors last:border-0 hover:bg-accent/50">
                  <td className="px-4 py-3.5">
                    <p className="font-mono text-xs font-bold tracking-tight">{payout.number}</p>
                    <p className="text-xs text-muted-foreground" title={new Date(payout.createdAt).toLocaleString()}>
                      {timeAgo(payout.createdAt)}
                    </p>
                    {payout.note && (
                      <p className="max-w-36 truncate text-[11px] text-muted-foreground" title={payout.note}>
                        “{payout.note}”
                      </p>
                    )}
                    {payout.transferReference && (
                      <Badge
                        variant="outline"
                        className="mt-1 max-w-44 truncate rounded-full px-1.5 font-mono text-[10px]"
                        title={
                          payout.executedAt
                            ? `Transfer reference — executed ${formatDate(payout.executedAt)}`
                            : 'Transfer reference'
                        }
                      >
                        TRF {payout.transferReference}
                      </Badge>
                    )}
                    <div className="mt-1">
                      <LineSummaryChip summary={payout.lineSummary} />
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="max-w-44 truncate font-semibold" title={vendorLabel(payout.seller)}>
                      {vendorLabel(payout.seller)}
                    </p>
                    <p className="max-w-44 truncate text-xs text-muted-foreground" title={payout.seller.email}>
                      {payout.seller.email}
                    </p>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-muted-foreground">{formatDate(payout.periodEnd)}</td>
                  <td className="px-4 py-3.5 tabular-nums">{payout.itemCount}</td>
                  <td className="px-4 py-3.5 tabular-nums">{formatUSD(payout.grossAmount)}</td>
                  <td className="px-4 py-3.5 tabular-nums text-muted-foreground">{payout.commissionRate}%</td>
                  <td className="px-4 py-3.5 tabular-nums text-muted-foreground">
                    <span className="block" title="Platform commission">
                      −{formatUSD(payout.commission)}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 font-bold tabular-nums">{formatUSD(payout.netAmount)}</td>
                  <td className="px-4 py-3.5">
                    <StatusBadge status={payout.status} map={PAYOUT_STATUS_MAP} />
                    {payout.paidAt && (
                      <p className="mt-1 text-[11px] text-muted-foreground">Paid {formatDate(payout.paidAt)}</p>
                    )}
                    {payout.executedAt && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground" title={new Date(payout.executedAt).toLocaleString()}>
                        Executed {timeAgo(payout.executedAt)}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 rounded-lg text-muted-foreground"
                        onClick={() => setLedgerFor(payout)}
                        aria-label={`Open the settlement ledger for payout ${payout.number}`}
                      >
                        <Layers size={13} className="mr-1.5" /> Ledger
                      </Button>
                      {payout.status === 'PENDING' ? (
                        <>
                          <Button
                            size="sm"
                            className="h-8 rounded-lg"
                            onClick={() => openSettle(payout, 'mark-paid')}
                            aria-label={`Mark payout ${payout.number} as paid`}
                          >
                            <CheckCircle2 size={13} className="mr-1.5" /> Mark paid
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-lg border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => openSettle(payout, 'cancel')}
                            aria-label={`Cancel payout ${payout.number}`}
                          >
                            <Ban size={13} className="mr-1.5" /> Cancel
                          </Button>
                        </>
                      ) : payout.status === 'PAID' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-lg border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          disabled={payout.lineSummary ? payout.lineSummary.effective === 0 : false}
                          onClick={() => openSettle(payout, 'reverse')}
                          aria-label={`Reverse payout ${payout.number}`}
                        >
                          <Undo2 size={13} className="mr-1.5" /> Reverse
                        </Button>
                      ) : (
                        <p className="text-right text-xs text-muted-foreground">Closed</p>
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
      {!loading && !error && payouts.length > 0 && (
        <div className="space-y-3 lg:hidden">
          {payouts.map((payout) => (
            <Card key={payout.id}>
              <CardContent className="space-y-2.5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-bold">{payout.number}</p>
                    <p className="truncate text-sm font-semibold">{vendorLabel(payout.seller)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatDate(payout.periodEnd)} · {payout.itemCount} items
                    </p>
                    {payout.transferReference && (
                      <Badge
                        variant="outline"
                        className="mt-1 max-w-44 truncate rounded-full px-1.5 font-mono text-[10px]"
                        title={
                          payout.executedAt
                            ? `Transfer reference — executed ${formatDate(payout.executedAt)}`
                            : 'Transfer reference'
                        }
                      >
                        TRF {payout.transferReference}
                      </Badge>
                    )}
                    <div className="mt-1">
                      <LineSummaryChip summary={payout.lineSummary} />
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <StatusBadge status={payout.status} map={PAYOUT_STATUS_MAP} />
                    {payout.executedAt && (
                      <p className="text-[11px] text-muted-foreground" title={new Date(payout.executedAt).toLocaleString()}>
                        Executed {timeAgo(payout.executedAt)}
                      </p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/50 p-2.5 text-center">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Gross</p>
                    <p className="text-xs font-semibold tabular-nums">{formatUSD(payout.grossAmount)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      −{payout.commissionRate}%
                    </p>
                    <p className="text-xs font-semibold tabular-nums">{formatUSD(payout.commission)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Net</p>
                    <p className="text-xs font-bold tabular-nums">{formatUSD(payout.netAmount)}</p>
                  </div>
                </div>
                {payout.note && (
                  <p className="truncate text-[11px] text-muted-foreground" title={payout.note}>
                    “{payout.note}”
                  </p>
                )}
                {payout.status === 'PENDING' ? (
                  <div className="flex flex-wrap items-center gap-1.5 border-t pt-2.5">
                    <Button size="sm" className="h-8 flex-1 rounded-lg" onClick={() => openSettle(payout, 'mark-paid')}>
                      <CheckCircle2 size={13} className="mr-1.5" /> Mark paid
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 flex-1 rounded-lg border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => openSettle(payout, 'cancel')}
                    >
                      <Ban size={13} className="mr-1.5" /> Cancel
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 rounded-lg text-muted-foreground"
                      onClick={() => setLedgerFor(payout)}
                      aria-label={`Open the settlement ledger for payout ${payout.number}`}
                    >
                      <Layers size={13} className="mr-1" /> Ledger
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-1.5 border-t pt-2.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 rounded-lg text-muted-foreground"
                      onClick={() => setLedgerFor(payout)}
                      aria-label={`Open the settlement ledger for payout ${payout.number}`}
                    >
                      <Layers size={13} className="mr-1" /> Ledger
                    </Button>
                    {payout.status === 'PAID' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-lg border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={payout.lineSummary ? payout.lineSummary.effective === 0 : false}
                        onClick={() => openSettle(payout, 'reverse')}
                      >
                        <Undo2 size={13} className="mr-1.5" /> Reverse
                      </Button>
                    )}
                  </div>
                )}
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
            <span className="font-semibold tabular-nums text-foreground">{data.pages}</span> · {formatNumber(data.total)} payouts
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

      {/* Mark paid / cancel / reverse dialog (Phase 7.4 — transfer discipline) */}
      <Dialog open={!!settleFor} onOpenChange={(open) => !open && !settling && setSettleFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {settleMode === 'mark-paid' ? (
                <>
                  <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" /> Mark payout as paid
                </>
              ) : settleMode === 'cancel' ? (
                <>
                  <Ban size={16} className="text-destructive" /> Cancel payout
                </>
              ) : (
                <>
                  <Undo2 size={16} className="text-destructive" /> Reverse payout
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {settleMode === 'mark-paid' ? (
                <>
                  Confirm the wire transfer went out{settleFor ? ` — ${formatUSD(settleFor.netAmount)} to ${vendorLabel(settleFor.seller)}` : ''}
                  with evidence. The lines flip to <strong>effective</strong> only on this confirmed execution.
                </>
              ) : settleMode === 'cancel' ? (
                <>
                  Cancelling{settleFor ? ` payout ${settleFor.number}` : ''}? Its settled items return to the unsettled pool and the
                  vendor is notified.
                </>
              ) : (
                <>
                  Reversing{settleFor ? ` payout ${settleFor.number}` : ''} posts REVERSAL ledger entries, flips the effective
                  lines to <strong>reversed</strong> and releases their claims — a corrected payout can reissue afterwards.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {settleMode === 'mark-paid' && (
              <div className="space-y-1.5">
                <Label htmlFor="payout-transfer-ref" className="text-xs text-muted-foreground">
                  Bank transfer reference — required
                </Label>
                <Input
                  id="payout-transfer-ref"
                  value={settleReference}
                  onChange={(e) => setSettleReference(e.target.value.slice(0, 190))}
                  placeholder="e.g. TRF-90421"
                  className="h-10 rounded-xl font-mono"
                  aria-describedby="payout-transfer-ref-hint"
                />
                <p id="payout-transfer-ref-hint" className="text-xs text-muted-foreground">
                  Bank transfer reference — required evidence for the settlement ledger. It must be unique across payouts.
                </p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="payout-note" className="text-xs text-muted-foreground">
                {settleMode === 'mark-paid'
                  ? 'Note (optional — context for the audit log)'
                  : settleMode === 'cancel'
                    ? 'Reason (optional — shown to the vendor)'
                    : 'Reason (required — recorded with the reversal)'}
              </Label>
              <Textarea
                id="payout-note"
                value={settleNote}
                onChange={(e) => setSettleNote(e.target.value.slice(0, 500))}
                placeholder={
                  settleMode === 'mark-paid'
                    ? 'e.g. Wire batch #12 — First Merchant Bank'
                    : settleMode === 'cancel'
                      ? 'e.g. Held for dispute review'
                      : 'e.g. Wrong account credited — recovering funds'
                }
                className="min-h-[72px]"
              />
            </div>
            {settleError && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive"
              >
                {settleError}
              </p>
            )}
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => setSettleFor(null)}
              disabled={settling}
            >
              {settleMode === 'mark-paid' ? 'Keep pending' : settleMode === 'cancel' ? 'Keep active' : 'Keep as is'}
            </Button>
            <Button
              className={`rounded-xl ${settleMode !== 'mark-paid' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}`}
              disabled={settling || !settleValid}
              onClick={() => void confirmSettle()}
            >
              {settling ? <Loader2 size={15} className="mr-2 animate-spin" /> : null}
              {settleMode === 'mark-paid' ? 'Confirm paid' : settleMode === 'cancel' ? 'Cancel payout' : 'Reverse payout'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Phase 7.4B — settlement ledger dialog */}
      <LedgerDialog payout={ledgerFor} onClose={() => setLedgerFor(null)} />

      {/* Phase 6 — step-up MFA dialog (shared retry guard) */}
      {stepUpDialog}
    </div>
  )
}

// ── Commission config card ─────────────────────────────────────────────────────

// ── Phase 7.4B — line summary chip ("4 lines · 4 effective" / "4 + 2 reversals") ──

function LineSummaryChip({ summary }: { summary: PayoutLineSummary }) {
  if (!summary) return null
  const hasReversals = summary.reversals > 0
  const label = hasReversals
    ? `${summary.total} + ${summary.reversals} reversals`
    : `${summary.total} lines · ${summary.effective} effective`
  return (
    <Badge
      variant="outline"
      className={cn(
        'rounded-full px-1.5 text-[10px] font-medium',
        hasReversals && 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300'
      )}
      title={`Settlement ledger: ${summary.total} lines — ${summary.effective} effective, ${summary.reversed} reversed, ${summary.cancellations} cancelled, ${summary.reversals} reversal entries`}
    >
      {label}
    </Badge>
  )
}

// ── Phase 7.4B — settlement ledger dialog (GET /api/admin/payouts/[id]) ──────

interface PayoutDetailLine {
  id: string
  linePurpose: LinePurpose
  status: LineStatus
  amount: number
  commission: number
  currency: string
  claimKey: string | null
  reversalOfLineId: string | null
  effectiveAt: string | null
  reversedAt: string | null
  createdAt: string
  orderItem: { id: string; title: string; quantity: number; price: number; orderId: string } | null
}

interface PayoutDetail {
  id: string
  number: string
  seller: { id: string; name: string; storeName: string | null; email: string }
  periodStart: string
  periodEnd: string
  itemCount: number
  grossAmount: number
  commissionRate: number
  commission: number
  netAmount: number
  currency: string
  status: PayoutStatus
  paidAt: string | null
  note: string | null
  transferReference: string | null
  transferIdempotencyKey: string | null
  executedAt: string | null
  createdAt: string
  lines: PayoutDetailLine[]
}

function LedgerDialog({ payout, onClose }: { payout: PayoutRow | null; onClose: () => void }) {
  const { data, loading, error } = useApi<{ payout: PayoutDetail }>(payout ? `/api/admin/payouts/${payout.id}` : null)
  const detail = data?.payout ?? null

  return (
    <Dialog open={!!payout} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers size={16} className="text-primary" /> Settlement ledger — {payout?.number ?? ''}
          </DialogTitle>
          <DialogDescription>
            The immutable PayoutLine ledger (Phase 7.4B). Amounts are never rewritten — only status transitions
            and appended reversal entries.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-2.5">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
        ) : error ? (
          <AdminEmptyState icon={ShieldAlert} title="Couldn't load the ledger" description={error}>
            <Button variant="outline" className="rounded-xl" onClick={onClose}>
              Close
            </Button>
          </AdminEmptyState>
        ) : !detail ? (
          <p className="text-sm text-muted-foreground">Payout not found.</p>
        ) : (
          <div className="space-y-4">
            {/* Header facts */}
            <div className="space-y-2.5 rounded-2xl border bg-muted/30 p-3.5">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <p className="text-sm font-semibold">{vendorLabel(detail.seller)}</p>
                <StatusBadge status={detail.status} map={PAYOUT_STATUS_MAP} />
                {detail.transferReference && (
                  <Badge variant="outline" className="rounded-full px-1.5 font-mono text-[10px]" title="Transfer reference">
                    TRF {detail.transferReference}
                  </Badge>
                )}
                {detail.executedAt && (
                  <p className="text-[11px] text-muted-foreground" title={new Date(detail.executedAt).toLocaleString()}>
                    Executed {formatDate(detail.executedAt)}
                  </p>
                )}
                {detail.transferIdempotencyKey && (
                  <p className="font-mono text-[10px] text-muted-foreground" title="Transfer idempotency key">
                    idem {detail.transferIdempotencyKey}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <PreviewStat label="Gross" value={formatUSD(detail.grossAmount)} />
                <PreviewStat label={`Commission · ${detail.commissionRate}%`} value={`−${formatUSD(detail.commission)}`} />
                <PreviewStat label="Net" value={formatUSD(detail.netAmount)} />
                <PreviewStat label="Lines" value={String(detail.lines.length)} />
              </div>
              {detail.note && (
                <p className="text-xs text-muted-foreground" title={detail.note}>
                  “{detail.note}”
                </p>
              )}
            </div>

            {/* Lines table */}
            <div className="max-h-96 overflow-y-auto overflow-x-auto scrollbar-thin rounded-2xl border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="px-3 py-2.5 font-medium">Purpose</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Amount</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Order item</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Claim</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Timing</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.lines.map((line) => (
                    <tr key={line.id} className="border-b align-top transition-colors last:border-0 hover:bg-accent/50">
                      <td className="px-3 py-2.5">
                        <StatusBadge status={line.linePurpose} map={LINE_PURPOSE_MAP} />
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusBadge status={line.status} map={LINE_STATUS_MAP} />
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">
                        <span className="font-semibold">{formatUSD(line.amount)}</span>
                        <span className="block text-[11px] text-muted-foreground">−{formatUSD(line.commission)} comm.</span>
                        <span className="block font-mono text-[10px] text-muted-foreground">{line.currency}</span>
                      </td>
                      <td className="max-w-48 px-3 py-2.5">
                        {line.orderItem ? (
                          <>
                            <p className="truncate text-xs font-medium" title={line.orderItem.title}>
                              {line.orderItem.title}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              ×{line.orderItem.quantity} · order {shortId(line.orderItem.orderId)}
                            </p>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {line.claimKey ? (
                          <p className="font-mono text-[10px]" title="Claim key — unique live settlement claim per order item">
                            {line.claimKey.slice(0, 10)}…
                          </p>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
                        {line.reversalOfLineId && (
                          <p className="mt-0.5 text-[10px] text-rose-600 dark:text-rose-400" title={line.reversalOfLineId}>
                            reversal of {shortId(line.reversalOfLineId)}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-muted-foreground">
                        <p title={new Date(line.createdAt).toLocaleString()}>Added {timeAgo(line.createdAt)}</p>
                        {line.effectiveAt && <p title={new Date(line.effectiveAt).toLocaleString()}>Effective {timeAgo(line.effectiveAt)}</p>}
                        {line.reversedAt && <p title={new Date(line.reversedAt).toLocaleString()}>Reversed {timeAgo(line.reversedAt)}</p>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" className="rounded-xl" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CommissionConfigCard() {
  const { data, loading, refetch } = useApi<{ config: { defaultCommissionPercent: number } }>('/api/admin/payouts/config')
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [initializedFor, setInitializedFor] = useState<number | null>(null)
  // Phase 6 (6.7.5) — commission config changes are step-up guarded.
  const { guard: guardStepUp, node: stepUpDialog } = useStepUp()

  if (data && initializedFor !== data.config.defaultCommissionPercent) {
    setInitializedFor(data.config.defaultCommissionPercent)
    setInput(String(data.config.defaultCommissionPercent))
  }

  const rate = Number(input)
  const valid = input.trim() !== '' && Number.isFinite(rate) && rate >= 0 && rate <= 90

  const save = async () => {
    if (!valid) {
      toast({
        title: 'Invalid commission rate',
        description: 'Enter a percentage between 0 and 90.',
        variant: 'destructive',
      })
      return
    }
    setSaving(true)
    const res = await guardStepUp(() =>
      apiRequest<{ config: { defaultCommissionPercent: number } }>('/api/admin/payouts/config', {
        method: 'PUT',
        body: JSON.stringify({ defaultCommissionPercent: rate }),
      })
    )
    setSaving(false)
    if (!res) return // step-up cancelled / enrollment required
    if (!res.ok) {
      toastApiError(res.error, 'Couldn’t save commission')
      return
    }
    toast({
      title: `Default commission set to ${rate}%`,
      description: 'Vendors without an override settle at this rate.',
    })
    void refetch()
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <PercentIcon /> Platform commission
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Default commission deducted from every payout. Vendors with a per-vendor override (set in the Vendors tab) are
          unaffected.
        </p>
        {loading && !data ? (
          <Skeleton className="h-10 w-full rounded-xl" />
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="default-commission" className="text-xs text-muted-foreground">
              Default rate (0–90%)
            </Label>
            <div className="relative">
              <Input
                id="default-commission"
                type="number"
                min={0}
                max={90}
                step="0.5"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="h-10 rounded-xl pr-8"
                aria-describedby="default-commission-hint"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
            </div>
            <p id="default-commission-hint" className="text-xs text-muted-foreground">
              Applies to all vendors without an override.
            </p>
          </div>
        )}
        <Button className="w-full rounded-xl" onClick={() => void save()} disabled={saving || !valid || (loading && !data)}>
          {saving ? <Loader2 size={15} className="mr-2 animate-spin" /> : <Save size={15} className="mr-2" />}
          Save rate
        </Button>
      </CardContent>

      {/* Phase 6 — step-up MFA dialog (shared retry guard) */}
      {stepUpDialog}
    </Card>
  )
}

function PercentIcon() {
  return <Coins size={16} className="text-primary" />
}

// ── Generate payout card ──────────────────────────────────────────────────────

function GeneratePayoutCard({ onGenerated }: { onGenerated: () => void }) {
  const [vendorQuery, setVendorQuery] = useState('')
  const debouncedQuery = useDebounced(vendorQuery, 250)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [selected, setSelected] = useState<VendorOption | null>(null)

  const [preview, setPreview] = useState<PayoutPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  // Phase 6 (6.7.5) — payout generation is step-up guarded.
  const { guard: guardStepUp, node: stepUpDialog } = useStepUp()

  // Vendor directory search — only while the picker is open
  const vendorQ = new URLSearchParams()
  if (debouncedQuery.trim()) vendorQ.set('q', debouncedQuery.trim())
  vendorQ.set('limit', '50')
  const { data: vendorData, loading: vendorsLoading } = useApi<{ vendors: VendorOption[] }>(
    pickerOpen ? `/api/admin/vendors?${vendorQ.toString()}` : null,
    { skip: !pickerOpen }
  )
  const vendors = vendorData?.vendors ?? []

  const loadPreview = async (vendorId: string) => {
    setPreviewLoading(true)
    const res = await apiRequest<{ preview: PayoutPreview }>(`/api/admin/payouts/preview?sellerId=${vendorId}`)
    setPreviewLoading(false)
    if (!res.ok || !res.data) {
      toastApiError(res.error, 'Couldn’t load the payout preview')
      setPreview(null)
      return
    }
    setPreview(res.data.preview)
  }

  const pickVendor = (vendor: VendorOption) => {
    setSelected(vendor)
    setPickerOpen(false)
    setVendorQuery('')
    setPreview(null)
    void loadPreview(vendor.id)
  }

  const generate = async () => {
    if (!selected) return
    setGenerating(true)
    const res = await guardStepUp(() =>
      apiRequest<{ payout: { number: string; netAmount: number } }>('/api/admin/payouts/generate', {
        method: 'POST',
        body: JSON.stringify({ sellerId: selected.id }),
      })
    )
    setGenerating(false)
    if (!res) return // step-up cancelled / enrollment required
    if (!res.ok || !res.data) {
      toastApiError(res.error, 'Payout not generated')
      return
    }
    toast({
      title: `Payout ${res.data.payout.number} generated`,
      description: `${formatUSD(res.data.payout.netAmount)} net to ${vendorLabel(selected)} — pending your payment.`,
    })
    setSelected(null)
    setPreview(null)
    onGenerated()
  }

  const nothingToSettle = !!preview && preview.unsettledItems === 0

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <PiggyBank size={16} className="text-primary" /> Generate a payout
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Pick a vendor to preview their unsettled items — order items from paid, non-cancelled orders — then settle them
          into a single payout batch.
        </p>

        {/* Vendor picker */}
        <div className="relative max-w-md">
          <SearchInput
            value={vendorQuery}
            onChange={(v) => {
              setVendorQuery(v)
              setPickerOpen(true)
            }}
            placeholder="Search vendors — store, owner, email…"
            ariaLabel="Search vendors for payout generation"
          />
          <button
            type="button"
            onClick={() => setPickerOpen((o) => !o)}
            aria-label={pickerOpen ? 'Close vendor list' : 'Open vendor list'}
            aria-expanded={pickerOpen}
            className="absolute right-11 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronDown size={14} className={cn('transition-transform', pickerOpen && 'rotate-180')} />
          </button>
          {pickerOpen && (
            <div className="absolute z-20 mt-1.5 max-h-64 w-full overflow-y-auto rounded-xl border bg-card p-1.5 shadow-lg">
              {vendorsLoading ? (
                <p className="px-3 py-3 text-center text-xs text-muted-foreground">Loading vendors…</p>
              ) : vendors.length === 0 ? (
                <p className="px-3 py-3 text-center text-xs text-muted-foreground">No vendors match.</p>
              ) : (
                vendors.map((vendor) => (
                  <button
                    key={vendor.id}
                    type="button"
                    onClick={() => pickVendor(vendor)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                    aria-label={`Select ${vendorLabel(vendor)}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{vendorLabel(vendor)}</span>
                      <span className="block truncate text-xs text-muted-foreground">{vendor.email}</span>
                    </span>
                    <ChevronDown size={13} className="shrink-0 -rotate-90 text-muted-foreground" />
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Selected vendor + preview */}
        {selected && (
          <div className="space-y-3 rounded-2xl border bg-muted/30 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Selected vendor</p>
                <p className="truncate font-semibold">{vendorLabel(selected)}</p>
                <p className="truncate text-xs text-muted-foreground">{selected.email}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 rounded-lg px-2 text-xs text-muted-foreground"
                onClick={() => {
                  setSelected(null)
                  setPreview(null)
                }}
                aria-label="Clear selected vendor"
              >
                Clear
              </Button>
            </div>

            {previewLoading ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 rounded-xl" />
                ))}
              </div>
            ) : preview ? (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <PreviewStat label="Unsettled items" value={formatNumber(preview.unsettledItems)} />
                  <PreviewStat label="Gross" value={formatUSD(preview.grossAmount)} />
                  <PreviewStat label={`Commission · ${preview.commissionRate}%`} value={`−${formatUSD(preview.commission)}`} />
                  <PreviewStat label="Net to vendor" value={formatUSD(preview.netAmount)} emphasis />
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">
                    {nothingToSettle
                      ? 'Nothing to settle — every paid item is already in a payout.'
                      : 'Generating stamps these items as settled and creates a pending payout.'}
                  </p>
                  <Button
                    className="shrink-0 rounded-xl"
                    onClick={() => void generate()}
                    disabled={generating || nothingToSettle}
                    aria-label={`Generate payout for ${vendorLabel(selected)}`}
                  >
                    {generating ? <Loader2 size={15} className="mr-2 animate-spin" /> : <Wallet size={15} className="mr-2" />}
                    Generate payout
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Preview unavailable — try re-selecting the vendor.</p>
            )}
          </div>
        )}
      </CardContent>

      {/* Phase 6 — step-up MFA dialog (shared retry guard) */}
      {stepUpDialog}
    </Card>
  )
}

function PreviewStat({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-0.5 truncate tabular-nums ${emphasis ? 'text-base font-extrabold text-primary' : 'text-sm font-semibold'}`}>
        {value}
      </p>
    </div>
  )
}
