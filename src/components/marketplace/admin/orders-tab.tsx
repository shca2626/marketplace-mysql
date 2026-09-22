'use client'

import { useState } from 'react'
import {
  ArrowRight,
  CreditCard,
  DollarSign,
  FileText,
  Info,
  Landmark,
  Loader2,
  ReceiptText,
  RefreshCw,
  SearchX,
  ShieldAlert,
  ShoppingBag,
} from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { formatNumber, formatUSD, timeAgo } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
  SearchInput,
  StatusBadge,
  useDebounced,
} from './shared'

// ── Types (contract of GET /api/admin/orders) ────────────────────────────────

interface AdminOrderPayment {
  method: 'CARD' | 'BANK_TRANSFER' | 'INVOICE'
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'
  reference: string
  dueAt: string | null
  paidAt: string | null
}

interface AdminOrderRow {
  id: string
  total: number
  status: string
  fullName: string
  city: string | null
  country: string | null
  createdAt: string
  buyer: { id: string; name: string; email: string }
  organization: { id: string; name: string } | null
  itemCount: number
  sellerNames: string[]
  sourceType: 'CART' | 'RFQ' | null
  poNumber: string | null
  paymentTerms: string | null
  payment: AdminOrderPayment | null
}

interface AdminOrdersResponse {
  total: number
  page: number
  pages: number
  totals: { revenue: number; aov: number; statusCounts: Record<string, number> }
  orders: AdminOrderRow[]
}

// ── Palette (warm theme — no indigo) ─────────────────────────────────────────

const ORDER_STATUS_MAP: Record<string, { label: string; badge: string }> = {
  PENDING_PAYMENT: { label: 'Awaiting payment', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  PENDING_APPROVAL: { label: 'Awaiting approval', badge: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300' },
  PAID: { label: 'Paid', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  PROCESSING: { label: 'Processing', badge: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300' },
  SHIPPED: { label: 'Shipped', badge: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300' },
  DELIVERED: { label: 'Delivered', badge: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300' },
  CANCELLED: { label: 'Cancelled', badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' },
}

const ORDER_STATUS_ORDER = [
  'PENDING_PAYMENT',
  'PENDING_APPROVAL',
  'PAID',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
]

const PAYMENT_STATUS_STYLE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  SUCCEEDED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  FAILED: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  CANCELLED: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
}

const PAYMENT_METHOD_ICON: Record<string, typeof CreditCard> = {
  CARD: CreditCard,
  BANK_TRANSFER: Landmark,
  INVOICE: FileText,
}

const PAYMENT_STATUS_FILTERS = [
  { value: '', label: 'Any payment' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'SUCCEEDED', label: 'Succeeded' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

const PAGE_SIZE = 20

const shortId = (id: string) => `#${id.slice(-8).toUpperCase()}`
const isOverdue = (iso: string | null) => !!iso && new Date(iso).getTime() < Date.now()

// ── Admin orders tab (read-only oversight) ───────────────────────────────────

export function AdminOrdersTab() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search)
  const [statusFilter, setStatusFilter] = useState('')
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('')
  const [page, setPage] = useState(1)

  // Render-time keyed sync: jump back to page 1 whenever filters change
  const filterKey = `${debouncedSearch}|${statusFilter}|${paymentStatusFilter}`
  const [appliedKey, setAppliedKey] = useState<string | null>(null)
  if (appliedKey !== filterKey) {
    setAppliedKey(filterKey)
    setPage(1)
  }

  const query = new URLSearchParams()
  if (debouncedSearch.trim()) query.set('q', debouncedSearch.trim())
  if (statusFilter) query.set('status', statusFilter)
  if (paymentStatusFilter) query.set('paymentStatus', paymentStatusFilter)
  query.set('page', String(page))
  query.set('limit', String(PAGE_SIZE))
  const {
    data,
    loading,
    error,
    refetch,
  } = useApi<AdminOrdersResponse>(`/api/admin/orders?${query.toString()}`)
  const orders = data?.orders ?? []
  const totals = data?.totals

  // Status counts are global roll-ups — they stay truthful under any filter
  const statusCounts = totals?.statusCounts ?? {}

  return (
    <div className="space-y-5">
      {/* Header strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Orders</p>
            <ShoppingBag size={15} className="shrink-0 text-primary" />
          </div>
          <p className="mt-1.5 text-2xl font-extrabold tabular-nums">
            {loading && !data ? '—' : formatNumber(data?.total ?? 0)}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">matching current filters</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Gross revenue</p>
            <DollarSign size={15} className="shrink-0 text-primary" />
          </div>
          <p className="mt-1.5 text-2xl font-extrabold tabular-nums">
            {loading && !data ? '—' : formatUSD(totals?.revenue ?? 0)}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">non-cancelled orders</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Avg order</p>
            <ReceiptText size={15} className="shrink-0 text-primary" />
          </div>
          <p className="mt-1.5 text-2xl font-extrabold tabular-nums">
            {loading && !data ? '—' : formatUSD(totals?.aov ?? 0)}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">across all orders</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <FilterChips
          options={[
            { value: '', label: 'All' },
            ...ORDER_STATUS_ORDER.map((s) => ({
              value: s,
              label: ORDER_STATUS_MAP[s]?.label ?? s,
              count: statusCounts[s] ?? 0,
            })),
          ]}
          value={statusFilter}
          onChange={setStatusFilter}
          ariaLabel="Filter orders by status"
        />
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search — buyer, order id, PO…"
            ariaLabel="Search orders"
            className="min-w-0 flex-1 sm:max-w-72"
          />
          <Select
            value={paymentStatusFilter || 'any-payment'}
            onValueChange={(v) => setPaymentStatusFilter(v === 'any-payment' ? '' : v)}
          >
            <SelectTrigger className="h-10 w-full rounded-xl sm:w-44" aria-label="Filter by payment status">
              <SelectValue placeholder="Any payment" />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_STATUS_FILTERS.map((f) => (
                <SelectItem key={f.value || 'any-payment'} value={f.value || 'any-payment'}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" className="h-10 shrink-0 rounded-xl" onClick={() => void refetch()} disabled={loading}>
            {loading ? <Loader2 size={15} className="mr-2 animate-spin" /> : <RefreshCw size={15} className="mr-2" />}
            Refresh
          </Button>
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
        <AdminEmptyState icon={ShieldAlert} title="Couldn't load orders" description={error}>
          <Button variant="outline" className="rounded-xl" onClick={() => void refetch()}>
            Try again
          </Button>
        </AdminEmptyState>
      )}

      {/* Empty */}
      {!loading && !error && orders.length === 0 && (
        <AdminEmptyState
          icon={SearchX}
          title={debouncedSearch.trim() || statusFilter || paymentStatusFilter ? 'No orders match' : 'No orders yet'}
          description={
            debouncedSearch.trim() || statusFilter || paymentStatusFilter
              ? 'Try clearing the search or switching the filters.'
              : 'Every order placed on the platform will appear here.'
          }
        />
      )}

      {/* Desktop table */}
      {!loading && !error && orders.length > 0 && (
        <div className="hidden overflow-x-auto rounded-2xl border lg:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-medium">Order</th>
                <th scope="col" className="px-4 py-3 font-medium">Buyer</th>
                <th scope="col" className="px-4 py-3 font-medium">Sellers</th>
                <th scope="col" className="px-4 py-3 font-medium">Items</th>
                <th scope="col" className="px-4 py-3 font-medium">Total</th>
                <th scope="col" className="px-4 py-3 font-medium">Payment</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-b align-top transition-colors last:border-0 hover:bg-accent/50">
                  <td className="px-4 py-3.5">
                    <p className="font-mono text-xs font-bold tracking-tight">{shortId(order.id)}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground" title={new Date(order.createdAt).toLocaleString()}>
                      {timeAgo(order.createdAt)}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {order.sourceType === 'RFQ' && (
                        <Badge className="rounded-full border-0 bg-violet-100 px-1.5 text-[10px] font-semibold text-violet-800 dark:bg-violet-950 dark:text-violet-300">
                          RFQ
                        </Badge>
                      )}
                      {order.poNumber && (
                        <Badge variant="outline" className="rounded-full px-1.5 font-mono text-[10px]">
                          PO {order.poNumber}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="font-semibold">{order.fullName || order.buyer.name}</p>
                    <p className="truncate text-xs text-muted-foreground" title={order.buyer.email}>
                      {order.buyer.email}
                    </p>
                    {order.organization && (
                      <Badge variant="outline" className="mt-1 rounded-full px-1.5 text-[10px] font-medium">
                        {order.organization.name}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <SellerChips names={order.sellerNames} />
                  </td>
                  <td className="px-4 py-3.5 tabular-nums">{order.itemCount}</td>
                  <td className="px-4 py-3.5 font-semibold tabular-nums">{formatUSD(order.total)}</td>
                  <td className="px-4 py-3.5">
                    <PaymentCell payment={order.payment} paymentTerms={order.paymentTerms} />
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusBadge status={order.status} map={ORDER_STATUS_MAP} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile + tablet stacked cards */}
      {!loading && !error && orders.length > 0 && (
        <div className="space-y-3 lg:hidden">
          {orders.map((order) => (
            <Card key={order.id}>
              <CardContent className="space-y-2.5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-bold">{shortId(order.id)}</p>
                    <p className="text-xs text-muted-foreground" title={new Date(order.createdAt).toLocaleString()}>
                      {timeAgo(order.createdAt)}
                      {order.poNumber ? ` · PO ${order.poNumber}` : ''}
                      {order.sourceType === 'RFQ' ? ' · RFQ' : ''}
                    </p>
                  </div>
                  <StatusBadge status={order.status} map={ORDER_STATUS_MAP} />
                </div>
                <div className="text-sm">
                  <p className="font-semibold">{order.fullName || order.buyer.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{order.buyer.email}</p>
                  {order.organization && (
                    <Badge variant="outline" className="mt-1 rounded-full px-1.5 text-[10px] font-medium">
                      {order.organization.name}
                    </Badge>
                  )}
                </div>
                <SellerChips names={order.sellerNames} />
                <div className="flex items-center justify-between gap-3 border-t pt-2.5">
                  <p className="text-sm">
                    <span className="tabular-nums">{order.itemCount}</span>{' '}
                    <span className="text-xs text-muted-foreground">items</span>{' '}
                    <span className="mx-1 text-muted-foreground">·</span>{' '}
                    <span className="font-bold tabular-nums">{formatUSD(order.total)}</span>
                  </p>
                  <PaymentCell payment={order.payment} paymentTerms={order.paymentTerms} />
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
            <span className="font-semibold tabular-nums text-foreground">{data.pages}</span> · {formatNumber(data.total)} orders
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
    </div>
  )
}

// ── Row pieces ────────────────────────────────────────────────────────────────

function SellerChips({ names }: { names: string[] }) {
  if (names.length === 0) return <span className="text-xs text-muted-foreground">—</span>
  const visible = names.slice(0, 2)
  const rest = names.length - visible.length
  return (
    <div className="flex max-w-56 flex-wrap gap-1">
      {visible.map((name) => (
        <Badge key={name} variant="outline" className="max-w-32 truncate rounded-full px-2 text-[11px] font-medium">
          {name}
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

function PaymentCell({ payment, paymentTerms }: { payment: AdminOrderPayment | null; paymentTerms: string | null }) {
  if (!payment) {
    return (
      <div className="text-xs text-muted-foreground">
        <p>No payment record</p>
        {paymentTerms && <p className="text-[11px]">{paymentTerms}</p>}
      </div>
    )
  }
  const Icon = PAYMENT_METHOD_ICON[payment.method] ?? CreditCard
  const overdue = payment.status === 'PENDING' && isOverdue(payment.dueAt)
  return (
    <div className="space-y-1">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
          PAYMENT_STATUS_STYLE[payment.status] ?? 'bg-muted text-muted-foreground'
        } ${overdue ? 'ring-1 ring-rose-300 dark:ring-rose-800' : ''}`}
        title={`${payment.method.replace('_', ' ')} · ${payment.status}${payment.reference ? ` · ref ${payment.reference}` : ''}${
          payment.dueAt ? ` · due ${new Date(payment.dueAt).toLocaleDateString()}` : ''
        }${payment.paidAt ? ` · paid ${new Date(payment.paidAt).toLocaleDateString()}` : ''}`}
      >
        <Icon size={12} />
        {payment.method === 'BANK_TRANSFER' ? 'Bank' : payment.method === 'CARD' ? 'Card' : 'Invoice'}
        <span className="opacity-60">·</span>
        {payment.status.charAt(0) + payment.status.slice(1).toLowerCase()}
      </span>
      {payment.status === 'PENDING' && payment.dueAt && (
        <p className={`text-[11px] ${overdue ? 'font-semibold text-rose-600 dark:text-rose-400' : 'text-muted-foreground'}`}>
          Due {new Date(payment.dueAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          {overdue ? ' — overdue' : ''}
        </p>
      )}
      {payment.status === 'PENDING' && (
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Info size={11} className="shrink-0" /> Settle in Payments tab
          <ArrowRight size={10} className="shrink-0" />
        </p>
      )}
    </div>
  )
}
