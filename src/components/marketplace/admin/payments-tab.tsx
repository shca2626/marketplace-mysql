'use client'

import { useState } from 'react'
import {
  BadgeCheck,
  Banknote,
  CreditCard,
  FileText,
  Landmark,
  Loader2,
  Save,
  SearchX,
  ShieldAlert,
  XCircle,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { formatNumber, formatUSD, timeAgo } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  AdminEmptyState,
  SearchInput,
  apiRequest,
  toastApiError,
  useDebounced,
} from './shared'

// ── Types (contracts of /api/admin/payments) ──────────────────────────────────

type PaymentMethod = 'CARD' | 'BANK_TRANSFER' | 'INVOICE'
type PaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'

interface PaymentRow {
  id: string
  method: PaymentMethod
  status: PaymentStatus
  amount: number
  reference: string
  dueAt: string | null
  paidAt: string | null
  note: string | null
  createdAt: string
  order: {
    id: string
    status: string
    total: number
    sourceType: 'CART' | 'RFQ' | null
    paymentTerms: string | null
    poNumber: string | null
    createdAt: string
    buyer: { id: string; name: string; email: string }
    sellerCount: number
    itemCount: number
  }
  capturedBy: { id: string; name: string } | null
}

interface PaymentsResponse {
  total: number
  page: number
  pages: number
  totalsByStatus: Record<string, { count: number; amount: number }>
  payments: PaymentRow[]
}

interface PaymentsConfigResponse {
  config: { bankName: string; accountName: string; accountDetails: string; instructions: string }
  methods: unknown[]
  cardGateway: 'simulated' | 'disabled'
}

// ── Palette ────────────────────────────────────────────────────────────────────

const PAYMENT_STATUS_STYLE: Record<PaymentStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  SUCCEEDED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  FAILED: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  CANCELLED: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
}

const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING: 'Pending',
  SUCCEEDED: 'Succeeded',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
}

const PAYMENT_METHOD_ICON: Record<PaymentMethod, typeof CreditCard> = {
  CARD: CreditCard,
  BANK_TRANSFER: Landmark,
  INVOICE: FileText,
}

const METHOD_FILTERS = [
  { value: '', label: 'Any method' },
  { value: 'CARD', label: 'Card' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'INVOICE', label: 'Invoice' },
]

const STATUS_FILTERS: PaymentStatus[] = ['PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED']

const PAGE_SIZE = 20

const shortId = (id: string) => `#${id.slice(-8).toUpperCase()}`
const isOverdue = (iso: string | null) => !!iso && new Date(iso).getTime() < Date.now()

// ── Payments tab ──────────────────────────────────────────────────────────────

export function PaymentsTab() {
  // Bank-transfer config
  const {
    data: configData,
    loading: configLoading,
    refetch: refetchConfig,
  } = useApi<PaymentsConfigResponse>('/api/admin/payments/config')

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search)
  const [statusFilter, setStatusFilter] = useState('')
  const [methodFilter, setMethodFilter] = useState('')
  const [page, setPage] = useState(1)

  // Settlement dialog state
  const [settleFor, setSettleFor] = useState<PaymentRow | null>(null)
  const [settleMode, setSettleMode] = useState<'capture' | 'fail'>('capture')
  const [settleNote, setSettleNote] = useState('')
  const [settling, setSettling] = useState(false)

  // Render-time keyed sync: jump back to page 1 whenever filters change
  const filterKey = `${debouncedSearch}|${statusFilter}|${methodFilter}`
  const [appliedKey, setAppliedKey] = useState<string | null>(null)
  if (appliedKey !== filterKey) {
    setAppliedKey(filterKey)
    setPage(1)
  }

  const query = new URLSearchParams()
  if (debouncedSearch.trim()) query.set('q', debouncedSearch.trim())
  if (statusFilter) query.set('status', statusFilter)
  if (methodFilter) query.set('method', methodFilter)
  query.set('page', String(page))
  query.set('limit', String(PAGE_SIZE))
  const {
    data,
    loading,
    error,
    refetch: refetchList,
  } = useApi<PaymentsResponse>(`/api/admin/payments?${query.toString()}`)
  const payments = data?.payments ?? []

  const openSettle = (payment: PaymentRow, mode: 'capture' | 'fail') => {
    setSettleNote('')
    setSettleMode(mode)
    setSettleFor(payment)
  }

  const confirmSettle = async () => {
    if (!settleFor) return
    const payment = settleFor
    setSettling(true)
    const res = await apiRequest(`/api/admin/payments/${payment.id}/${settleMode === 'capture' ? 'capture' : 'fail'}`, {
      method: 'POST',
      body: JSON.stringify({ note: settleNote.trim() || undefined }),
    })
    setSettling(false)
    if (!res.ok) {
      toastApiError(res.error, settleMode === 'capture' ? 'Capture failed' : 'Update failed')
      return
    }
    setSettleFor(null)
    toast({
      title:
        settleMode === 'capture'
          ? `Captured ${formatUSD(payment.amount)}`
          : 'Payment marked as failed',
      description:
        settleMode === 'capture'
          ? `Order ${shortId(payment.order.id)} is now paid.`
          : `Order ${shortId(payment.order.id)} — the buyer was notified.`,
    })
    void refetchList()
  }

  const totalsByStatus = data?.totalsByStatus ?? {}

  return (
    <div className="space-y-5">
      {/* (a) Bank-transfer details shown to buyers */}
      <BankConfigCard
        configData={configData}
        loading={configLoading}
        onSaved={() => void refetchConfig()}
      />

      {/* (b) Settlement console */}
      <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setStatusFilter('')}
            aria-pressed={statusFilter === ''}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              statusFilter === ''
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
            }`}
          >
            All payments
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
                className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  selected
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background hover:border-primary/40'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${PAYMENT_STATUS_STYLE[status].split(' ')[0]}`} aria-hidden="true" />
                <span className={selected ? '' : 'text-foreground'}>{PAYMENT_STATUS_LABEL[status]}</span>
                <span className={selected ? 'opacity-80' : 'text-muted-foreground'}>
                  {bucket ? `${bucket.count} · ${formatUSD(bucket.amount)}` : '0'}
                </span>
              </button>
            )
          })}
        </div>
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search — reference, buyer, order…"
            ariaLabel="Search payments"
            className="min-w-0 flex-1 sm:max-w-72"
          />
          <Select value={methodFilter || 'any-method'} onValueChange={(v) => setMethodFilter(v === 'any-method' ? '' : v)}>
            <SelectTrigger className="h-10 w-full rounded-xl sm:w-44" aria-label="Filter by payment method">
              <SelectValue placeholder="Any method" />
            </SelectTrigger>
            <SelectContent>
              {METHOD_FILTERS.map((f) => (
                <SelectItem key={f.value || 'any-method'} value={f.value || 'any-method'}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

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
        <AdminEmptyState icon={ShieldAlert} title="Couldn't load payments" description={error}>
          <Button variant="outline" className="rounded-xl" onClick={() => void refetchList()}>
            Try again
          </Button>
        </AdminEmptyState>
      )}

      {/* Empty */}
      {!loading && !error && payments.length === 0 && (
        <AdminEmptyState
          icon={SearchX}
          title={debouncedSearch.trim() || statusFilter || methodFilter ? 'No payments match' : 'No payments yet'}
          description={
            debouncedSearch.trim() || statusFilter || methodFilter
              ? 'Try clearing the search or switching the filters.'
              : 'Payments recorded at checkout — card, bank transfer and invoice — appear here.'
          }
        />
      )}

      {/* Desktop table */}
      {!loading && !error && payments.length > 0 && (
        <div className="hidden overflow-x-auto rounded-2xl border lg:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-medium">Method</th>
                <th scope="col" className="px-4 py-3 font-medium">Amount</th>
                <th scope="col" className="px-4 py-3 font-medium">Order</th>
                <th scope="col" className="px-4 py-3 font-medium">Reference</th>
                <th scope="col" className="px-4 py-3 font-medium">Created</th>
                <th scope="col" className="px-4 py-3 font-medium">Due</th>
                <th scope="col" className="px-4 py-3 font-medium">Captured by</th>
                <th scope="col" className="px-4 py-3 text-right font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id} className="border-b align-top transition-colors last:border-0 hover:bg-accent/50">
                  <td className="px-4 py-3.5">
                    <MethodBadge method={payment.method} status={payment.status} />
                  </td>
                  <td className="px-4 py-3.5 font-semibold tabular-nums">{formatUSD(payment.amount)}</td>
                  <td className="px-4 py-3.5">
                    <p className="font-mono text-xs font-bold tracking-tight">{shortId(payment.order.id)}</p>
                    <p className="truncate text-xs text-muted-foreground" title={payment.order.buyer.email}>
                      {payment.order.buyer.name} · {payment.order.itemCount} items
                    </p>
                    {payment.order.poNumber && (
                      <p className="font-mono text-[11px] text-muted-foreground">PO {payment.order.poNumber}</p>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="max-w-36 truncate font-mono text-xs text-muted-foreground" title={payment.reference}>
                      {payment.reference}
                    </p>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-muted-foreground" title={new Date(payment.createdAt).toLocaleString()}>
                    {timeAgo(payment.createdAt)}
                  </td>
                  <td className="px-4 py-3.5">
                    {payment.dueAt ? (
                      <DueCell dueAt={payment.dueAt} overdue={payment.status === 'PENDING' && isOverdue(payment.dueAt)} />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    {payment.capturedBy ? (
                      <p className="text-xs">
                        <BadgeCheck size={12} className="mr-1 inline text-emerald-600 dark:text-emerald-400" />
                        {payment.capturedBy.name}
                        {payment.paidAt && (
                          <span className="block text-[11px] text-muted-foreground">
                            {new Date(payment.paidAt).toLocaleDateString()}
                          </span>
                        )}
                      </p>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    {payment.status === 'PENDING' ? (
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          className="h-8 rounded-lg"
                          onClick={() => openSettle(payment, 'capture')}
                          aria-label={`Capture payment ${payment.reference}`}
                        >
                          <Banknote size={13} className="mr-1.5" /> Capture
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-lg border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => openSettle(payment, 'fail')}
                          aria-label={`Mark payment ${payment.reference} as failed`}
                        >
                          <XCircle size={13} className="mr-1.5" /> Mark failed
                        </Button>
                      </div>
                    ) : (
                      <p className="text-right text-xs text-muted-foreground">Settled</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile + tablet stacked cards */}
      {!loading && !error && payments.length > 0 && (
        <div className="space-y-3 lg:hidden">
          {payments.map((payment) => (
            <Card key={payment.id}>
              <CardContent className="space-y-2.5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <MethodBadge method={payment.method} status={payment.status} />
                    <p className="mt-1 font-mono text-xs font-bold">{shortId(payment.order.id)}</p>
                    <p className="truncate text-xs text-muted-foreground" title={payment.order.buyer.email}>
                      {payment.order.buyer.name} · {payment.order.itemCount} items
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-bold tabular-nums">{formatUSD(payment.amount)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="font-mono" title={payment.reference}>
                    ref {payment.reference.slice(0, 14)}
                    {payment.reference.length > 14 ? '…' : ''}
                  </span>
                  <span title={new Date(payment.createdAt).toLocaleString()}>{timeAgo(payment.createdAt)}</span>
                  {payment.dueAt && (
                    <DueCell dueAt={payment.dueAt} overdue={payment.status === 'PENDING' && isOverdue(payment.dueAt)} />
                  )}
                  {payment.capturedBy && <span>by {payment.capturedBy.name}</span>}
                </div>
                {payment.status === 'PENDING' && (
                  <div className="flex flex-wrap items-center gap-1.5 border-t pt-2.5">
                    <Button size="sm" className="h-8 flex-1 rounded-lg" onClick={() => openSettle(payment, 'capture')}>
                      <Banknote size={13} className="mr-1.5" /> Capture
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 flex-1 rounded-lg border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => openSettle(payment, 'fail')}
                    >
                      <XCircle size={13} className="mr-1.5" /> Mark failed
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
            <span className="font-semibold tabular-nums text-foreground">{data.pages}</span> · {formatNumber(data.total)} payments
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

      {/* Capture / fail dialog */}
      <Dialog open={!!settleFor} onOpenChange={(open) => !open && !settling && setSettleFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {settleMode === 'capture' ? (
                <>
                  <Banknote size={16} className="text-emerald-600 dark:text-emerald-400" /> Capture payment
                </>
              ) : (
                <>
                  <XCircle size={16} className="text-destructive" /> Mark payment as failed
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {settleMode === 'capture' ? (
                <>
                  Confirm the money arrived{settleFor ? ` — ${formatUSD(settleFor.amount)} on order ${shortId(settleFor.order.id)}` : ''}.
                  The order flips to <strong>paid</strong> and the buyer is notified.
                </>
              ) : (
                <>
                  Records the payment as failed{settleFor ? ` — ${formatUSD(settleFor.amount)} on order ${shortId(settleFor.order.id)}` : ''}.
                  The buyer is notified so they can retry with another method.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="settle-note" className="text-xs text-muted-foreground">
              {settleMode === 'capture' ? 'Note (optional — e.g. bank slip reference)' : 'Reason (optional — e.g. transfer bounced)'}
            </Label>
            <Textarea
              id="settle-note"
              value={settleNote}
              onChange={(e) => setSettleNote(e.target.value.slice(0, 300))}
              placeholder={settleMode === 'capture' ? 'e.g. Slip #8842 verified at First Bank' : 'e.g. Buyer transfer bounced — insufficient funds'}
              className="min-h-[72px]"
            />
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" className="rounded-xl" onClick={() => setSettleFor(null)} disabled={settling}>
              Cancel
            </Button>
            <Button
              className={`rounded-xl ${settleMode === 'fail' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}`}
              disabled={settling}
              onClick={() => void confirmSettle()}
            >
              {settling ? <Loader2 size={15} className="mr-2 animate-spin" /> : null}
              {settleMode === 'capture' ? 'Confirm capture' : 'Mark as failed'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Bank-transfer config card ────────────────────────────────────────────────

function BankConfigCard({
  configData,
  loading,
  onSaved,
}: {
  configData: PaymentsConfigResponse | null
  loading: boolean
  onSaved: () => void
}) {
  const [form, setForm] = useState({ bankName: '', accountName: '', accountDetails: '', instructions: '' })
  const [saving, setSaving] = useState(false)
  const [initializedFor, setInitializedFor] = useState<PaymentsConfigResponse['config'] | null>(null)

  // Re-seed the form on every fresh payload (new object identity)
  if (configData && (!initializedFor || initializedFor !== configData.config)) {
    setInitializedFor(configData.config)
    setForm({
      bankName: configData.config.bankName ?? '',
      accountName: configData.config.accountName ?? '',
      accountDetails: configData.config.accountDetails ?? '',
      instructions: configData.config.instructions ?? '',
    })
  }

  const save = async () => {
    setSaving(true)
    const res = await apiRequest<{ config: PaymentsConfigResponse['config'] }>('/api/admin/payments/config', {
      method: 'PUT',
      body: JSON.stringify({
        bankName: form.bankName.trim(),
        accountName: form.accountName.trim(),
        accountDetails: form.accountDetails.trim(),
        instructions: form.instructions.trim(),
      }),
    })
    setSaving(false)
    if (!res.ok) {
      toastApiError(res.error, 'Couldn’t save bank details')
      return
    }
    toast({ title: 'Bank details saved', description: 'Buyers choosing bank transfer now see the updated details.' })
    onSaved()
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Landmark size={16} className="text-primary" /> Bank transfer details
          {configData && (
            <Badge
              className={`ml-auto rounded-full border-0 text-[11px] font-semibold ${
                configData.cardGateway === 'simulated'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
              }`}
            >
              Card gateway: {configData.cardGateway}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          These details appear to buyers at checkout when they choose bank transfer or invoice terms. Double-check the
          account before saving — every pending payment depends on it.
        </p>
        {loading && !configData ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-10 rounded-xl" />
            <Skeleton className="h-10 rounded-xl" />
            <Skeleton className="h-20 rounded-xl sm:col-span-2" />
            <Skeleton className="h-20 rounded-xl sm:col-span-2" />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cfg-bank-name">Bank name</Label>
              <Input
                id="cfg-bank-name"
                value={form.bankName}
                onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))}
                placeholder="e.g. First Merchant Bank"
                className="h-10 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cfg-account-name">Account name</Label>
              <Input
                id="cfg-account-name"
                value={form.accountName}
                onChange={(e) => setForm((f) => ({ ...f, accountName: e.target.value }))}
                placeholder="e.g. Vendora Marketplace Ltd"
                className="h-10 rounded-xl"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cfg-account-details">Account details</Label>
              <Textarea
                id="cfg-account-details"
                value={form.accountDetails}
                onChange={(e) => setForm((f) => ({ ...f, accountDetails: e.target.value }))}
                placeholder="Account number / IBAN, SWIFT-BIC, branch…"
                className="min-h-[64px] rounded-xl"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cfg-instructions">Buyer instructions</Label>
              <Textarea
                id="cfg-instructions"
                value={form.instructions}
                onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
                placeholder="e.g. Include the payment reference as the transfer memo. Payments reconcile within 2 business days."
                className="min-h-[64px] rounded-xl"
              />
            </div>
            <div className="sm:col-span-2">
              <Button className="rounded-xl" onClick={() => void save()} disabled={saving}>
                {saving ? <Loader2 size={15} className="mr-2 animate-spin" /> : <Save size={15} className="mr-2" />}
                Save bank details
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Row pieces ────────────────────────────────────────────────────────────────

function MethodBadge({ method, status }: { method: PaymentMethod; status: PaymentStatus }) {
  const Icon = PAYMENT_METHOD_ICON[method] ?? CreditCard
  const labels: Record<PaymentMethod, string> = {
    CARD: 'Card',
    BANK_TRANSFER: 'Bank transfer',
    INVOICE: 'Invoice',
  }
  return (
    <div className="space-y-1">
      <Badge
        variant="outline"
        className="rounded-full px-2 text-[11px] font-medium"
        title={`${labels[method]} payment`}
      >
        <Icon size={11} className="mr-1 text-primary" />
        {labels[method]}
      </Badge>
      <Badge
        className={`rounded-full border-0 text-[11px] font-semibold ${PAYMENT_STATUS_STYLE[status]}`}
      >
        {PAYMENT_STATUS_LABEL[status]}
      </Badge>
    </div>
  )
}

function DueCell({ dueAt, overdue }: { dueAt: string; overdue: boolean }) {
  return (
    <span
      className={`text-xs ${
        overdue ? 'font-semibold text-rose-600 dark:text-rose-400' : 'text-muted-foreground'
      }`}
      title={new Date(dueAt).toLocaleString()}
    >
      {new Date(dueAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
      {overdue ? ' · overdue' : ''}
    </span>
  )
}
