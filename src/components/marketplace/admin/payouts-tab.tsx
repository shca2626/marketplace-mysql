'use client'

import { useState } from 'react'
import {
  Ban,
  CheckCircle2,
  ChevronDown,
  Coins,
  Loader2,
  PiggyBank,
  Save,
  SearchX,
  ShieldAlert,
  Wallet,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { useStepUp } from './step-up-guard'
import { formatDate, formatNumber, formatUSD, timeAgo } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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

// ── Types (contracts of /api/admin/payouts) ────────────────────────────────────

type PayoutStatus = 'PENDING' | 'PAID' | 'CANCELLED'

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

const PAGE_SIZE = 20

const vendorLabel = (v: { name: string; storeName: string | null }) => v.storeName?.trim() || v.name

// ── Payouts tab ─────────────────────────────────────────────────────────────────

export function PayoutsTab() {
  // Step-up MFA (6.7.5): settling/cancelling a payout is a sensitive money
  // action — the guard prompts for a fresh code when the window expires.
  const { guard: guardStepUp, node: stepUpDialog } = useStepUp()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search)
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)

  // Payout-level dialogs
  const [settleFor, setSettleFor] = useState<PayoutRow | null>(null)
  const [settleMode, setSettleMode] = useState<'mark-paid' | 'cancel'>('mark-paid')
  const [settleNote, setSettleNote] = useState('')
  const [settling, setSettling] = useState(false)

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

  const openSettle = (payout: PayoutRow, mode: 'mark-paid' | 'cancel') => {
    setSettleNote('')
    setSettleMode(mode)
    setSettleFor(payout)
  }

  const confirmSettle = async () => {
    if (!settleFor) return
    const payout = settleFor
    setSettling(true)
    const res = await guardStepUp(() =>
      apiRequest(`/api/admin/payouts/${payout.id}/${settleMode === 'mark-paid' ? 'mark-paid' : 'cancel'}`, {
        method: 'POST',
        body: JSON.stringify(
          settleMode === 'mark-paid' ? { note: settleNote.trim() || undefined } : { reason: settleNote.trim() || undefined }
        ),
      })
    )
    setSettling(false)
    if (!res) return // step-up cancelled / enrollment required
    if (!res.ok) {
      toastApiError(res.error, settleMode === 'mark-paid' ? 'Update failed' : 'Cancel failed')
      return
    }
    setSettleFor(null)
    toast({
      title: settleMode === 'mark-paid' ? `Payout ${payout.number} marked paid` : `Payout ${payout.number} cancelled`,
      description:
        settleMode === 'mark-paid'
          ? `${formatUSD(payout.netAmount)} to ${vendorLabel(payout.seller)} — vendor notified.`
          : 'The vendor was notified. Settled items return to the unsettled pool.',
    })
    void refetchList()
  }

  const totalsByStatus = data?.totalsByStatus ?? {}

  return (
    <div className="space-y-5">
      {/* Step-up MFA dialog (6.7.5) */}
      {stepUpDialog}
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
                  </td>
                  <td className="px-4 py-3.5">
                    {payout.status === 'PENDING' ? (
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
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
                      </div>
                    ) : (
                      <p className="text-right text-xs text-muted-foreground">
                        {payout.status === 'PAID' ? 'Settled' : 'Closed'}
                      </p>
                    )}
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
                  </div>
                  <StatusBadge status={payout.status} map={PAYOUT_STATUS_MAP} />
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
                {payout.status === 'PENDING' && (
                  <div className="flex items-center gap-1.5 border-t pt-2.5">
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

      {/* Mark paid / cancel dialog */}
      <Dialog open={!!settleFor} onOpenChange={(open) => !open && !settling && setSettleFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {settleMode === 'mark-paid' ? (
                <>
                  <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" /> Mark payout as paid
                </>
              ) : (
                <>
                  <Ban size={16} className="text-destructive" /> Cancel payout
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {settleMode === 'mark-paid' ? (
                <>
                  Confirm the wire transfer went out{settleFor ? ` — ${formatUSD(settleFor.netAmount)} to ${vendorLabel(settleFor.seller)}` : ''}.
                  The vendor is notified.
                </>
              ) : (
                <>
                  Cancelling{settleFor ? ` payout ${settleFor.number}` : ''}? Its settled items return to the unsettled pool and the
                  vendor is notified.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="payout-note" className="text-xs text-muted-foreground">
              {settleMode === 'mark-paid' ? 'Note (optional — e.g. wire reference)' : 'Reason (optional — shown to the vendor)'}
            </Label>
            <Textarea
              id="payout-note"
              value={settleNote}
              onChange={(e) => setSettleNote(e.target.value.slice(0, 300))}
              placeholder={settleMode === 'mark-paid' ? 'e.g. Wire TRX-90421 sent 09:40' : 'e.g. Held for dispute review'}
              className="min-h-[72px]"
            />
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" className="rounded-xl" onClick={() => setSettleFor(null)} disabled={settling}>
              Keep pending
            </Button>
            <Button
              className={`rounded-xl ${settleMode === 'cancel' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}`}
              disabled={settling}
              onClick={() => void confirmSettle()}
            >
              {settling ? <Loader2 size={15} className="mr-2 animate-spin" /> : null}
              {settleMode === 'mark-paid' ? 'Confirm paid' : 'Cancel payout'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Commission config card ─────────────────────────────────────────────────────

function CommissionConfigCard() {
  // Step-up MFA (6.7.5): commission config changes the money split — guarded.
  const { guard: guardStepUp, node: stepUpDialog } = useStepUp()
  const { data, loading, refetch } = useApi<{ config: { defaultCommissionPercent: number; commissionTriggerStage?: string } }>(
    '/api/admin/payouts/config'
  )
  const [input, setInput] = useState('')
  const [triggerStage, setTriggerStage] = useState('DELIVERED')
  const [saving, setSaving] = useState(false)
  const [initializedFor, setInitializedFor] = useState<number | null>(null)

  if (data && initializedFor !== data.config.defaultCommissionPercent) {
    setInitializedFor(data.config.defaultCommissionPercent)
    setInput(String(data.config.defaultCommissionPercent))
    setTriggerStage(data.config.commissionTriggerStage ?? 'DELIVERED')
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
      apiRequest<{ config: { defaultCommissionPercent: number; commissionTriggerStage?: string } }>('/api/admin/payouts/config', {
        method: 'PUT',
        body: JSON.stringify({ defaultCommissionPercent: rate, commissionTriggerStage: triggerStage }),
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
      description: `Obligations now trigger when an order reaches ${triggerStage}. Vendors without an override settle at this rate.`,
    })
    void refetch()
  }

  return (
    <Card>
      {/* Step-up MFA dialog (6.7.5) */}
      {stepUpDialog}
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
              Applies to all vendors without an override. Scoped rates per organization / org type can be layered on top
              in <span className="font-medium text-foreground">Monetization → Fee Rules</span>.
            </p>
          </div>
        )}
        {loading && !data ? (
          <Skeleton className="h-10 w-full rounded-xl" />
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="commission-trigger" className="text-xs text-muted-foreground">
              Trigger stage (when commission is earned)
            </Label>
            <Select value={triggerStage} onValueChange={setTriggerStage}>
              <SelectTrigger id="commission-trigger" className="h-10 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PROCESSING">Processing — earliest, accrues when fulfillment starts</SelectItem>
                <SelectItem value="SHIPPED">Shipped — accrues when the order ships</SelectItem>
                <SelectItem value="DELIVERED">Delivered — safest, accrues on confirmed delivery</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              The fulfillment stage at which a commission obligation comes into existence for an order.
            </p>
          </div>
        )}
        <Button className="w-full rounded-xl" onClick={() => void save()} disabled={saving || !valid || (loading && !data)}>
          {saving ? <Loader2 size={15} className="mr-2 animate-spin" /> : <Save size={15} className="mr-2" />}
          Save rate
        </Button>
      </CardContent>
    </Card>
  )
}

function PercentIcon() {
  return <Coins size={16} className="text-primary" />
}

// ── Generate payout card ──────────────────────────────────────────────────────

function GeneratePayoutCard({ onGenerated }: { onGenerated: () => void }) {
  // Step-up MFA (6.7.5): generating a payout moves money — guarded.
  const { guard: guardStepUp, node: stepUpDialog } = useStepUp()
  const [vendorQuery, setVendorQuery] = useState('')
  const debouncedQuery = useDebounced(vendorQuery, 250)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [selected, setSelected] = useState<VendorOption | null>(null)

  const [preview, setPreview] = useState<PayoutPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [generating, setGenerating] = useState(false)

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
      {/* Step-up MFA dialog (6.7.5) */}
      {stepUpDialog}
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
