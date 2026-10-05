'use client'

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Ban,
  CalendarClock,
  Check,
  ClipboardList,
  CreditCard,
  Hourglass,
  Landmark,
  Loader2,
  PackageCheck,
  PackageOpen,
  ReceiptText,
  RotateCcw,
  Scale,
  Search,
  Star,
  Truck,
  Wallet,
  X,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useMarketplace } from '@/store/marketplace'
import { useApi } from '@/hooks/use-api'
import type { DisputeDTO, OrderDTO } from '@/lib/types'
import { formatDate, formatUSD } from '@/lib/format'
import { InvoiceDialog } from './invoice-dialog'
import {
  DisputeCard,
  DisputeDetailDialog,
  RaiseDisputeDialog,
  type DisputesPublicConfig,
} from './b2b/disputes'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { QuantityInput } from './quantity-input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { cn } from '@/lib/utils'

const STATUS_STEPS = [
  { key: 'PAID', label: 'Order placed', icon: ClipboardList },
  { key: 'PROCESSING', label: 'Processing', icon: PackageOpen },
  { key: 'SHIPPED', label: 'Shipped', icon: Truck },
  { key: 'DELIVERED', label: 'Delivered', icon: PackageCheck },
]

const STATUS_COLORS: Record<string, string> = {
  PAID: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  PENDING_APPROVAL: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300',
  PENDING_PAYMENT: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  PROCESSING: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  SHIPPED: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  DELIVERED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  CANCELLED: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
}

/** Friendly badge label for the two long pending statuses. */
function statusLabel(status: string): string {
  if (status === 'PENDING_APPROVAL') return 'AWAITING APPROVAL'
  if (status === 'PENDING_PAYMENT') return 'AWAITING PAYMENT'
  return status
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CARD: 'Card',
  BANK_TRANSFER: 'Bank transfer',
  INVOICE: 'Invoice',
}

const PAYMENT_STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  SUCCEEDED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  FAILED: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  CANCELLED: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
}

function paymentStatusLabel(status: string): string {
  if (status === 'SUCCEEDED') return 'paid'
  if (status === 'FAILED') return 'failed'
  if (status === 'CANCELLED') return 'payment cancelled'
  return 'payment pending'
}

// ── Phase 7.7 — dimension split: payment + fulfillment pills (7.7.1/7.7.2) ──
// The legacy status badge stays (read-only during migration); these compact
// pills surface the two AUTHORITATIVE dimensions wherever they carry
// information the legacy badge doesn't already show.

const PAYMENT_DIMENSION_STYLES: Record<string, string> = {
  PAID: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  FUNDED: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300',
  AWAITING_PAYMENT: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  OUTSTANDING: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  PARTIALLY_REFUNDED: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  REFUNDED: 'border border-rose-300 text-rose-700 dark:border-rose-900 dark:text-rose-300',
}

const FULFILLMENT_DIMENSION_STYLES: Record<string, string> = {
  FULFILLED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  SHIPPED: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300',
  PROCESSING: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  PARTIALLY_FULFILLED: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  PARTIALLY_CANCELLED: 'border border-rose-300 text-rose-700 dark:border-rose-900 dark:text-rose-300',
  CANCELLED: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
  UNFULFILLED: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
}

const REFUND_STATUS_STYLES: Record<string, string> = {
  REQUESTED: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  APPROVED: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  COMPLETED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  DENIED: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  CANCELLED: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
}

/** 'PARTIALLY_REFUNDED' → 'Partially refunded' — readable pill captions. */
function dimensionLabel(v: string): string {
  return v
    .toLowerCase()
    .split('_')
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ')
}

/** A pill earns its space only when it adds info the legacy badge lacks. */
function showPaymentDimension(order: OrderDTO): boolean {
  if (
    order.paymentStatus === 'AWAITING_PAYMENT' &&
    ['PENDING_PAYMENT', 'PENDING_APPROVAL'].includes(order.status)
  )
    return false
  if (order.paymentStatus === 'PAID' && order.status === 'PAID') return false
  return true
}

/** Legacy status → the fulfillment value that says the same thing. */
const LEGACY_FULFILLMENT_TWIN: Record<string, string> = {
  CANCELLED: 'CANCELLED',
  DELIVERED: 'FULFILLED',
  PROCESSING: 'PROCESSING',
  SHIPPED: 'SHIPPED',
  PAID: 'UNFULFILLED',
  PENDING_PAYMENT: 'UNFULFILLED',
  PENDING_APPROVAL: 'UNFULFILLED',
}

function showFulfillmentDimension(order: OrderDTO): boolean {
  return (LEGACY_FULFILLMENT_TWIN[order.status] ?? null) !== order.fulfillmentStatus
}

/** Money that actually moved can be asked back (7.7.3 — mirrors the API's
 *  paidStates gate so the UI never offers a request the server would 409). */
const REFUND_ELIGIBLE_PAYMENT = ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'FUNDED', 'OUTSTANDING']

function canRequestRefund(order: OrderDTO): boolean {
  return REFUND_ELIGIBLE_PAYMENT.includes(order.paymentStatus) && order.status !== 'CANCELLED'
}

/** Estimated delivery window: 3–6 days after the order was placed. */
function estDeliveryWindow(iso: string): { from: string; to: string; isPast: boolean } {
  const placed = new Date(iso)
  const from = new Date(placed)
  from.setDate(from.getDate() + 3)
  const to = new Date(placed)
  to.setDate(to.getDate() + 6)
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return { from: fmt(from), to: fmt(to), isPast: to.getTime() < Date.now() }
}

/**
 * Per-step date label. Step 0 uses the REAL placed-at date; later steps get
 * deterministic projections (+1d processing, +2d shipped, +4d delivered —
 * midpoint of the 3–6 day window). Completed steps show an approximate mark,
 * future steps an explicit estimate. No schema fields for step transitions
 * exist (frozen this phase), so honesty markers keep this transparent.
 */
const STEP_OFFSET_DAYS = [0, 1, 2, 4]

function stepDateLabel(iso: string, stepIdx: number, done: boolean): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + STEP_OFFSET_DAYS[stepIdx])
  const text = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (stepIdx === 0) return text
  return done ? `~${text}` : `est. ${text}`
}

export function OrdersView() {
  const user = useMarketplace((s) => s.user)
  const openAuth = useMarketplace((s) => s.openAuth)
  const navigate = useMarketplace((s) => s.navigate)
  const { data, loading, refetch } = useApi<{ orders: OrderDTO[] }>(user ? '/api/orders' : null, {
    skip: !user,
  })
  // Disputes the buyer raised (order cards show their live status)
  const { data: disputesData, refetch: refetchDisputes } = useApi<{ raised: DisputeDTO[] }>(
    user ? '/api/disputes' : null,
    { skip: !user }
  )
  const { data: rfqConfig } = useApi<{ disputes?: DisputesPublicConfig }>(
    user ? '/api/rfq-config' : null,
    { skip: !user }
  )
  const [disputeDetail, setDisputeDetail] = useState<DisputeDTO | null>(null)
  const [showAllDisputes, setShowAllDisputes] = useState(false)
  const disputes = disputesData?.raised ?? []
  const disputesConfig = rfqConfig?.disputes ?? null
  const openDisputeByOrder = useMemo(
    () => new Map(disputes.filter((d) => ['OPEN', 'SELLER_RESPONDED', 'ESCALATED'].includes(d.status)).map((d) => [d.orderId, d])),
    [disputes]
  )
  const [expanded, setExpanded] = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [search, setSearch] = useState('')

  const cancelOrder = async (orderId: string) => {
    setCancellingId(orderId)
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Cannot cancel order', description: json.error ?? 'Something went wrong', variant: 'destructive' })
        return
      }
      toast({
        title: 'Order cancelled',
        description: `#${orderId.slice(-8).toUpperCase()} — items were returned to stock`,
      })
      void refetch()
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' })
    } finally {
      setCancellingId(null)
    }
  }

  // ── Pay-later dialog (PENDING_PAYMENT orders) ──
  const [payDialogOrder, setPayDialogOrder] = useState<OrderDTO | null>(null)
  const [payMethod, setPayMethod] = useState<'card' | 'bank'>('card')
  const [payReference, setPayReference] = useState('')
  const [paying, setPaying] = useState(false)
  // Set after a bank-transfer submit — the fresh instructions from the pay
  // response stay visible so the buyer can complete the wire.
  const [paySubmitted, setPaySubmitted] = useState<{ instructions: string | null; reference: string | null } | null>(null)

  const openPayDialog = (order: OrderDTO) => {
    setPayMethod('card')
    setPayReference('')
    setPaying(false)
    setPaySubmitted(null)
    setPayDialogOrder(order)
  }

  const closePayDialog = () => {
    if (paying) return
    setPayDialogOrder(null)
    setPaySubmitted(null)
  }

  const confirmPayment = async () => {
    if (!payDialogOrder) return
    setPaying(true)
    try {
      const res = await fetch(`/api/orders/${payDialogOrder.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: payMethod === 'card' ? 'CARD' : 'BANK_TRANSFER',
          ...(payMethod === 'bank' && payReference.trim() ? { reference: payReference.trim() } : {}),
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Payment failed', description: json.error ?? 'Something went wrong', variant: 'destructive' })
        return
      }
      void refetch()
      if (json.paid) {
        setPayDialogOrder(null)
        toast({
          title: 'Payment confirmed',
          description: `#${payDialogOrder.id.slice(-8).toUpperCase()} is paid and moves to the seller`,
        })
      } else {
        // Bank transfer — keep the instructions from the response on screen
        setPaySubmitted({
          instructions: json.payment?.instructions ?? null,
          reference: json.payment?.reference ?? null,
        })
        toast({
          title: 'Transfer details submitted — awaiting confirmation',
          description: 'An operator confirms receipt on business days. You can track the order below.',
        })
      }
    } catch {
      toast({ title: 'Payment failed', description: 'Network error — please try again', variant: 'destructive' })
    } finally {
      setPaying(false)
    }
  }

  const orders = data?.orders ?? []

  // ── Refund request dialog (Phase 7.7.3 — item-level refund requests) ──
  const [refundDialogOrder, setRefundDialogOrder] = useState<OrderDTO | null>(null)
  /** orderItemId → quantity to refund (0 = not selected). */
  const [refundQtys, setRefundQtys] = useState<Record<string, number>>({})
  const [refundReason, setRefundReason] = useState('')
  const [refundShipping, setRefundShipping] = useState('')
  const [refundError, setRefundError] = useState<string | null>(null)
  const [refundSubmitting, setRefundSubmitting] = useState(false)
  const [cancellingRefundId, setCancellingRefundId] = useState<string | null>(null)

  const openRefundDialog = (order: OrderDTO) => {
    setRefundQtys({})
    setRefundReason('')
    setRefundShipping('')
    setRefundError(null)
    setRefundSubmitting(false)
    setRefundDialogOrder(order)
  }

  /** Live estimate of what the request asks back (items + optional shipping). */
  const refundSelectedTotal = useMemo(() => {
    if (!refundDialogOrder) return 0
    const items = refundDialogOrder.items.reduce(
      (sum, it) => sum + (refundQtys[it.id] ? it.price * refundQtys[it.id] : 0),
      0
    )
    const shipping = Math.max(0, Number(refundShipping) || 0)
    return Math.round((items + shipping) * 100) / 100
  }, [refundDialogOrder, refundQtys, refundShipping])

  const submitRefund = async () => {
    if (!refundDialogOrder) return
    const lines = Object.entries(refundQtys)
      .filter(([, q]) => q >= 1)
      .map(([orderItemId, quantity]) => ({ orderItemId, quantity }))
    if (lines.length === 0) {
      setRefundError('Select at least one item to refund')
      return
    }
    if (refundReason.trim().length < 10) {
      setRefundError('Please describe the reason (at least 10 characters)')
      return
    }
    setRefundSubmitting(true)
    setRefundError(null)
    try {
      const res = await fetch(`/api/orders/${refundDialogOrder.id}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: refundReason.trim(),
          items: lines,
          ...(Math.max(0, Number(refundShipping) || 0) > 0
            ? { shipping: Math.max(0, Number(refundShipping) || 0) }
            : {}),
        }),
      })
      const json = (await res.json()) as { refund?: { amountTotal?: number }; error?: string }
      if (!res.ok) {
        setRefundError(json.error ?? 'Failed to request refund')
        return
      }
      setRefundDialogOrder(null)
      toast({
        title: 'Refund requested',
        description: `#${refundDialogOrder.id.slice(-8).toUpperCase()} — ${formatUSD(
          json.refund?.amountTotal ?? refundSelectedTotal
        )} pending review`,
      })
      void refetch()
    } catch {
      setRefundError('Network error — please try again')
    } finally {
      setRefundSubmitting(false)
    }
  }

  /** Buyer cancels their own REQUESTED/APPROVED refund request. */
  const cancelRefundRequest = async (refundId: string) => {
    setCancellingRefundId(refundId)
    try {
      const res = await fetch(`/api/refunds/${refundId}/cancel`, { method: 'POST' })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) {
        toast({
          title: 'Cannot cancel refund request',
          description: json.error ?? 'Something went wrong',
          variant: 'destructive',
        })
        return
      }
      toast({ title: 'Refund request cancelled' })
      void refetch()
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' })
    } finally {
      setCancellingRefundId(null)
    }
  }

  // Status chips: ALL + every status present in the order list (canonical order)
  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const o of orders) counts.set(o.status, (counts.get(o.status) ?? 0) + 1)
    const order = ['PENDING_APPROVAL', 'PENDING_PAYMENT', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED']
    return order.filter((s) => counts.has(s)).map((s) => ({ status: s, count: counts.get(s)! }))
  }, [orders])

  // Filter by status chip + free-text search (order id suffix, item titles, name/city)
  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase()
    return orders.filter((o) => {
      if (statusFilter !== 'ALL' && o.status !== statusFilter) return false
      if (!q) return true
      const idSuffix = o.id.slice(-8).toLowerCase()
      const haystack = [
        o.id.toLowerCase(),
        idSuffix,
        `#${idSuffix}`,
        o.fullName.toLowerCase(),
        o.city.toLowerCase(),
        ...o.items.map((it) => it.title.toLowerCase()),
      ]
      return haystack.some((h) => h.includes(q))
    })
  }, [orders, statusFilter, search])

  const clearOrderFilters = () => {
    setStatusFilter('ALL')
    setSearch('')
  }

  if (!user) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <ClipboardList size={44} className="text-muted-foreground/40" />
        <h1 className="mt-4 text-xl font-bold">Sign in to see your orders</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your purchase history lives here.</p>
        <Button className="mt-6 rounded-xl" onClick={() => openAuth('login', { view: 'orders' })}>
          Sign in
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">My orders</h1>
      <p className="mt-1 text-sm text-muted-foreground">Track and review your purchases.</p>

      {/* Open disputes (buyer raised) — always visible while any are live */}
      {disputes.length > 0 && (
        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
              <Scale size={14} className="text-rose-600" /> Disputes
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                {disputes.filter((d) => ['OPEN', 'SELLER_RESPONDED', 'ESCALATED'].includes(d.status)).length} open
              </span>
            </h2>
            {disputes.length > 2 && (
              <button
                className="text-xs font-medium text-primary hover:underline"
                onClick={() => setShowAllDisputes((v) => !v)}
              >
                {showAllDisputes ? 'Show less' : `View all (${disputes.length})`}
              </button>
            )}
          </div>
          <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
            {(showAllDisputes ? disputes : disputes.slice(0, 2)).map((d) => (
              <DisputeCard key={d.id} dispute={d} onOpen={setDisputeDetail} />
            ))}
          </div>
        </div>
      )}

      {/* Status filter chips + search */}
      {!loading && orders.length > 0 && (
        <div className="mt-5 space-y-3">
          {statusCounts.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Filter orders by status">
              <button
                role="tab"
                aria-selected={statusFilter === 'ALL'}
                onClick={() => setStatusFilter('ALL')}
                className={cn(
                  'shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors',
                  statusFilter === 'ALL'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
                )}
              >
                All <span className="ml-0.5 opacity-70">{orders.length}</span>
              </button>
              {statusCounts.map(({ status, count }) => (
                <button
                  key={status}
                  role="tab"
                  aria-selected={statusFilter === status}
                  onClick={() => setStatusFilter(statusFilter === status ? 'ALL' : status)}
                  className={cn(
                    'shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold capitalize transition-colors',
                    statusFilter === status
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
                  )}
                >
                  {status.toLowerCase()} <span className="ml-0.5 opacity-70">{count}</span>
                </button>
              ))}
            </div>
          )}
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search orders — product or #ID…"
              className="h-10 rounded-full pl-10 pr-9 text-sm"
              aria-label="Search orders"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mt-6 space-y-5">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48 w-full rounded-2xl" />)
        ) : orders.length === 0 ? (
          <Card className="flex flex-col items-center border-dashed py-16 text-center">
            <PackageCheck size={44} className="text-muted-foreground/40" />
            <h2 className="mt-4 text-lg font-semibold">No orders yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">When you place an order it will show up here.</p>
            <Button className="mt-5 rounded-full" onClick={() => navigate('catalog')}>
              Start shopping
            </Button>
          </Card>
        ) : filteredOrders.length === 0 ? (
          <Card className="flex flex-col items-center border-dashed py-14 text-center">
            <Search size={40} className="text-muted-foreground/40" />
            <h2 className="mt-4 text-lg font-semibold">No matching orders</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Nothing matches {statusFilter !== 'ALL' ? statusFilter.toLowerCase() : ''}{statusFilter !== 'ALL' && search.trim() ? ' + ' : ''}{search.trim() ? `“${search.trim()}”` : ''}.
            </p>
            <Button variant="outline" className="mt-5 rounded-full" onClick={clearOrderFilters}>
              <X size={14} className="mr-1.5" /> Clear filters
            </Button>
          </Card>
        ) : (
          filteredOrders.map((order) => {
            const currentIdx = STATUS_STEPS.findIndex((s) => s.key === order.status)
            const isOpen = expanded === order.id
            return (
              <Card key={order.id} className="overflow-hidden">
                <button
                  className="flex w-full flex-wrap items-center justify-between gap-3 bg-muted/50 px-5 py-3.5 text-left transition hover:bg-muted"
                  onClick={() => setExpanded(isOpen ? null : order.id)}
                  aria-expanded={isOpen}
                >
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="font-mono text-xs font-bold tracking-wide text-muted-foreground">
                      #${order.id.slice(-8).toUpperCase()}
                    </span>
                    <span className="text-xs text-muted-foreground">{formatDate(order.createdAt)}</span>
                    {order.payment && (
                      <span
                        className={cn(
                          'flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                          PAYMENT_STATUS_STYLES[order.payment.status] ??
                            'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                        )}
                        title={
                          order.payment.status === 'FAILED'
                            ? 'The last payment attempt failed — try Pay now again'
                            : `Payment via ${PAYMENT_METHOD_LABELS[order.payment.method] ?? order.payment.method}`
                        }
                      >
                        {order.payment.method === 'BANK_TRANSFER' ? (
                          <Landmark size={12} className="shrink-0" />
                        ) : (
                          <CreditCard size={12} className="shrink-0" />
                        )}
                        {PAYMENT_METHOD_LABELS[order.payment.method] ?? order.payment.method} ·{' '}
                        {paymentStatusLabel(order.payment.status)}
                      </span>
                    )}
                    {order.hasPendingRefunds && (
                      <span
                        className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                        title="A refund request on this order is awaiting review or payout — the order keeps its current payment state until the refund completes"
                      >
                        <RotateCcw size={12} className="shrink-0" /> Refund pending
                      </span>
                    )}
                    {openDisputeByOrder.has(order.id) && (
                      <span
                        className="flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                        title="This order has an open dispute"
                      >
                        <Scale size={12} className="shrink-0" /> Dispute
                      </span>
                    )}
                    {['PAID', 'PROCESSING', 'SHIPPED'].includes(order.status) && (
                      (() => {
                        const est = estDeliveryWindow(order.createdAt)
                        return (
                          <span
                            className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary"
                            title="Estimated delivery window — 3–6 days after purchase"
                          >
                            <CalendarClock size={12} className="shrink-0" />
                            {est.isPast ? `Due since ${est.to}` : `Est. ${est.from} – ${est.to}`}
                          </span>
                        )
                      })()
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <span className="text-sm font-bold">{formatUSD(order.total)}</span>
                    {/* Phase 7.7 — authoritative dimension pills (shown only
                        when they add information the legacy badge lacks). */}
                    {showPaymentDimension(order) && (
                      <span
                        className={cn(
                          'flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                          PAYMENT_DIMENSION_STYLES[order.paymentStatus] ??
                            'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                        )}
                        title="Payment status — the money dimension (paid, refunded, outstanding…)"
                      >
                        <Wallet size={11} className="shrink-0" />
                        {dimensionLabel(order.paymentStatus)}
                      </span>
                    )}
                    {showFulfillmentDimension(order) && (
                      <span
                        className={cn(
                          'flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                          FULFILLMENT_DIMENSION_STYLES[order.fulfillmentStatus] ??
                            'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                        )}
                        title="Fulfillment status — the delivery dimension (rolled up per seller group)"
                      >
                        <Truck size={11} className="shrink-0" />
                        {dimensionLabel(order.fulfillmentStatus)}
                      </span>
                    )}
                    <Badge className={cn('rounded-full text-[11px] font-semibold', STATUS_COLORS[order.status])}>
                      {statusLabel(order.status)}
                    </Badge>
                  </div>
                </button>

                <CardContent className="space-y-5 p-5">
                  {/* Progress timeline (or cancellation/approval notices) */}
                  {order.status === 'CANCELLED' ? (
                    <div className="flex items-center gap-3 rounded-xl border border-dashed bg-muted/40 px-4 py-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                        <Ban size={14} />
                      </span>
                      <div>
                        <p className="text-sm font-semibold">Order cancelled</p>
                        <p className="text-xs text-muted-foreground">
                          You cancelled this order before it was processed — items were returned to stock.
                        </p>
                      </div>
                    </div>
                  ) : order.status === 'PENDING_APPROVAL' ? (
                    <div className="flex items-center gap-3 rounded-xl border border-dashed border-teal-500/40 bg-teal-500/5 px-4 py-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300">
                        <Hourglass size={14} />
                      </span>
                      <div>
                        <p className="text-sm font-semibold">Awaiting approval from your organization</p>
                        <p className="text-xs text-muted-foreground">
                          This order is on hold — an approver in your business needs to approve it before it is
                          sent to the seller. You can still withdraw it below.
                        </p>
                      </div>
                    </div>
                  ) : order.status === 'PENDING_PAYMENT' ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                          <Wallet size={14} />
                        </span>
                        <div>
                          <p className="text-sm font-semibold">Awaiting your payment</p>
                          <p className="text-xs text-muted-foreground">
                            {order.payment?.status === 'FAILED'
                              ? 'Your last payment attempt failed — try again below.'
                              : order.payment?.method === 'BANK_TRANSFER'
                                ? 'Complete the bank transfer, or pay by card for instant confirmation.'
                                : 'Pay by card for instant confirmation, or by bank transfer.'}
                          </p>
                        </div>
                      </div>
                      <Button size="sm" className="h-9 rounded-full px-4" onClick={() => openPayDialog(order)}>
                        <Wallet size={13} className="mr-1.5" /> Pay now
                      </Button>
                    </div>
                  ) : (
                  <div className="flex items-start">
                    {STATUS_STEPS.map((step, i) => {
                      const done = i <= currentIdx
                      const active = i === currentIdx
                      return (
                        <div key={step.key} className="relative flex flex-1 flex-col items-center">
                          {i > 0 && (
                            <motion.span
                              className={cn(
                                'absolute right-1/2 top-4 -z-0 h-0.5 w-full origin-left',
                                i <= currentIdx ? 'bg-primary' : 'bg-border'
                              )}
                              initial={{ scaleX: 0 }}
                              animate={{ scaleX: 1 }}
                              transition={{ duration: 0.45, delay: 0.15 + i * 0.09, ease: 'easeOut' }}
                            />
                          )}
                          <motion.span
                            className={cn(
                              'z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 bg-background',
                              done ? 'border-primary text-primary' : 'border-border text-muted-foreground/70',
                              active && 'step-pulse'
                            )}
                            initial={{ scale: 0.4, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{
                              type: 'spring',
                              stiffness: 500,
                              damping: 22,
                              delay: i * 0.09,
                            }}
                          >
                            {done && i < currentIdx ? <Check size={13} /> : <step.icon size={13} />}
                          </motion.span>
                          <motion.span
                            className={cn(
                              'mt-1.5 text-center text-[10px] font-medium leading-tight sm:text-xs',
                              done ? 'text-foreground' : 'text-muted-foreground/70'
                            )}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, delay: 0.1 + i * 0.09 }}
                          >
                            {step.label}
                            <span
                              className={cn(
                                'mt-0.5 block text-[9px] font-normal tabular-nums leading-none sm:text-[10px]',
                                i === 0
                                  ? 'text-muted-foreground'
                                  : done
                                    ? 'text-muted-foreground/80'
                                    : 'text-muted-foreground/50'
                              )}
                              title={
                                i === 0
                                  ? 'Date the order was placed'
                                  : done
                                    ? 'Approximate date (step transitions are not tracked)'
                                    : 'Projected date'
                              }
                            >
                              {stepDateLabel(order.createdAt, i, done)}
                            </span>
                          </motion.span>
                        </div>
                      )
                    })}
                  </div>
                  )}

                  {/* Items */}
                  <div className="space-y-3">
                    {(isOpen ? order.items : order.items.slice(0, 2)).map((item) => (
                      <div key={item.id} className="flex items-center gap-3">
                        <button
                          className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border bg-muted"
                          onClick={() => navigate('product', { productId: item.productId })}
                          aria-label={`View ${item.title}`}
                        >
                          {item.image && <img src={item.image} alt="" className="h-full w-full object-cover" />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-1 text-sm font-medium">{item.title}</p>
                          <p className="text-xs text-muted-foreground">
                            Qty {item.quantity} · {formatUSD(item.price)} each
                          </p>
                        </div>
                        {order.status === 'DELIVERED' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 rounded-full gap-1.5 text-xs"
                            onClick={() => navigate('product', { productId: item.productId })}
                          >
                            <Star size={12} /> Write review
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                  {order.items.length > 2 && (
                    <button
                      className="text-xs font-medium text-primary hover:underline"
                      onClick={() => setExpanded(isOpen ? null : order.id)}
                    >
                      {isOpen ? 'Show less' : `+ ${order.items.length - 2} more item(s)`}
                    </button>
                  )}

                  {/* Phase 7.7.3 — refund ledger for this order: chips with
                      number + status + amount, and a buyer-side cancel while
                      the request is still pending (REQUESTED/APPROVED). */}
                  {order.refunds.length > 0 && (
                    <div className="space-y-2 rounded-xl border border-dashed bg-muted/30 px-3.5 py-3">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                        Refunds
                      </p>
                      {order.refunds.map((r) => (
                        <div key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <span
                              className={cn(
                                'rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                                REFUND_STATUS_STYLES[r.status] ??
                                  'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                              )}
                              title={`Refund ${r.number} — ${dimensionLabel(r.status)}${
                                r.status === 'APPROVED'
                                  ? ' (obligation established — awaiting payment)'
                                  : r.status === 'REQUESTED'
                                    ? ' (awaiting review)'
                                    : ''
                              }`}
                            >
                              {r.number} · {dimensionLabel(r.status)}
                            </span>
                            <span className="text-xs font-semibold tabular-nums">{formatUSD(r.amountTotal)}</span>
                            <span className="text-[11px] text-muted-foreground">{formatDate(r.createdAt)}</span>
                          </div>
                          {(r.status === 'REQUESTED' || r.status === 'APPROVED') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 rounded-full px-2.5 text-[11px] text-muted-foreground hover:text-foreground"
                              disabled={cancellingRefundId === r.id}
                              onClick={() => void cancelRefundRequest(r.id)}
                            >
                              {cancellingRefundId === r.id ? 'Cancelling…' : 'Cancel request'}
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-xs text-muted-foreground">
                    <span>
                      Ship to: {order.fullName}, {order.address}, {order.city} {order.zip}
                    </span>
                    <div className="flex items-center gap-2">
                      {['PAID', 'PENDING_APPROVAL', 'PENDING_PAYMENT'].includes(order.status) && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={cancellingId === order.id}
                              className="h-7 rounded-full text-xs text-destructive hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Ban size={12} className="mr-1" />
                              {cancellingId === order.id
                                ? 'Cancelling…'
                                : order.status === 'PENDING_APPROVAL'
                                  ? 'Withdraw request'
                                  : 'Cancel order'}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {order.status === 'PENDING_APPROVAL'
                                  ? 'Withdraw this order request?'
                                  : 'Cancel this order?'}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                Order #{order.id.slice(-8).toUpperCase()} ({formatUSD(order.total)}) will be
                                {order.status === 'PENDING_APPROVAL'
                                  ? ' withdrawn from the approval queue and the items returned to stock.'
                                  : ' cancelled and the items returned to stock.'}{' '}
                                This can't be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Keep order</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-white hover:bg-destructive/90"
                                onClick={() => void cancelOrder(order.id)}
                              >
                                Yes, cancel order
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                      <InvoiceDialog order={order}>
                        <Button variant="outline" size="sm" className="h-7 rounded-full text-xs">
                          <ReceiptText size={12} className="mr-1" />
                          Invoice
                        </Button>
                      </InvoiceDialog>
                      {/* Phase 7.7.3 — item-level refund request (money that
                          actually moved can be asked back). */}
                      {canRequestRefund(order) && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 rounded-full text-xs"
                          onClick={() => openRefundDialog(order)}
                        >
                          <RotateCcw size={12} className="mr-1" />
                          Request refund
                        </Button>
                      )}
                      {disputesConfig?.enabled &&
                        order.status !== 'CANCELLED' &&
                        !openDisputeByOrder.has(order.id) && (
                          <RaiseDisputeDialog
                            order={order}
                            config={disputesConfig}
                            onCreated={() => void refetchDisputes()}
                          >
                            {(open) => (
                              <Button variant="outline" size="sm" className="h-7 rounded-full text-xs" onClick={open}>
                                <Scale size={12} className="mr-1" />
                                Dispute
                              </Button>
                            )}
                          </RaiseDisputeDialog>
                        )}
                      {openDisputeByOrder.has(order.id) && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 rounded-full border-rose-300 text-xs text-rose-700 hover:bg-rose-50 hover:text-rose-800 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950"
                          onClick={() => setDisputeDetail(openDisputeByOrder.get(order.id) ?? null)}
                        >
                          <Scale size={12} className="mr-1" />
                          View dispute
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 rounded-full text-xs"
                        onClick={() => {
                          navigator.clipboard?.writeText(order.id).then(() =>
                            toast({ title: 'Order ID copied', description: order.id })
                          )
                        }}
                      >
                        Copy order ID
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      {/* Dispute detail (opened from any dispute card / order chip) */}
      {disputeDetail && (
        <DisputeDetailDialog
          dispute={disputeDetail}
          autoOpen
          onChanged={(d) => {
            setDisputeDetail(d)
            void refetchDisputes()
          }}
        >
          {() => <span />}
        </DisputeDetailDialog>
      )}

      {/* Pay-later dialog for PENDING_PAYMENT orders */}
      <Dialog open={!!payDialogOrder} onOpenChange={(open) => (open ? undefined : closePayDialog())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet size={16} className="text-primary" /> Pay order
              {payDialogOrder && (
                <span className="font-mono text-sm font-bold">#{payDialogOrder.id.slice(-8).toUpperCase()}</span>
              )}
            </DialogTitle>
            <DialogDescription>
              Settle this order — card payments confirm instantly, bank transfers are confirmed by an operator.
            </DialogDescription>
          </DialogHeader>

          {payDialogOrder && (
            <div className="space-y-4">
              {/* Order summary */}
              <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/40 px-3.5 py-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {payDialogOrder.items.length} item{payDialogOrder.items.length === 1 ? '' : 's'} ·{' '}
                    {formatDate(payDialogOrder.createdAt)}
                  </p>
                  <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
                    {payDialogOrder.items[0]?.title}
                    {payDialogOrder.items.length > 1
                      ? ` +${payDialogOrder.items.length - 1} more`
                      : ''}
                  </p>
                </div>
                <p className="shrink-0 text-lg font-bold tabular-nums">{formatUSD(payDialogOrder.total)}</p>
              </div>

              {paySubmitted ? (
                /* Bank transfer submitted — fresh instructions stay on screen */
                <div className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
                  <div className="flex items-center gap-2">
                    <Hourglass size={15} className="shrink-0 text-amber-600 dark:text-amber-400" />
                    <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                      Transfer details submitted — awaiting confirmation
                    </p>
                  </div>
                  <pre className="whitespace-pre-wrap rounded-lg border bg-background/60 p-3 font-mono text-[11px] leading-relaxed">
                    {paySubmitted.instructions ??
                      'The platform bank account details will be sent to your email.'}
                  </pre>
                  {paySubmitted.reference && (
                    <p className="text-xs text-muted-foreground">
                      Your transfer reference on file:{' '}
                      <span className="font-mono font-semibold text-foreground">{paySubmitted.reference}</span>
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Wire the total above — an operator confirms receipt on business days, then the order
                    moves to the seller.
                  </p>
                </div>
              ) : (
                <>
                  {/* Method selection */}
                  <RadioGroup
                    value={payMethod}
                    onValueChange={(v) => setPayMethod(v as 'card' | 'bank')}
                    className="gap-3"
                  >
                    <Label
                      htmlFor="pay-now-card"
                      className="flex cursor-pointer items-center gap-3 rounded-xl border-2 p-3.5 transition-colors has-[[data-state=checked]]:border-primary"
                    >
                      <RadioGroupItem value="card" id="pay-now-card" />
                      <CreditCard size={17} className="text-muted-foreground" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">Card</p>
                        <p className="text-xs text-muted-foreground">Confirmed instantly (demo gateway)</p>
                      </div>
                    </Label>
                    <Label
                      htmlFor="pay-now-bank"
                      className="flex cursor-pointer items-center gap-3 rounded-xl border-2 p-3.5 transition-colors has-[[data-state=checked]]:border-primary"
                    >
                      <RadioGroupItem value="bank" id="pay-now-bank" />
                      <Landmark size={17} className="text-muted-foreground" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">Bank transfer</p>
                        <p className="text-xs text-muted-foreground">
                          Wire the total — confirmed by an operator
                        </p>
                      </div>
                    </Label>
                  </RadioGroup>

                  {/* Bank transfer — instructions + optional wire reference */}
                  {payMethod === 'bank' && (
                    <div className="space-y-3">
                      {payDialogOrder.payment?.instructions ? (
                        <pre className="whitespace-pre-wrap rounded-xl border bg-muted/40 p-3.5 font-mono text-[11px] leading-relaxed">
                          {payDialogOrder.payment.instructions}
                        </pre>
                      ) : (
                        <p className="rounded-xl border border-dashed bg-muted/40 px-3.5 py-3 text-xs text-muted-foreground">
                          The platform bank account details appear here once you submit — you&apos;ll wire the
                          total and an operator confirms receipt.
                        </p>
                      )}
                      <div className="space-y-1.5">
                        <Label htmlFor="pay-reference">
                          Transfer reference{' '}
                          <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                        </Label>
                        <Input
                          id="pay-reference"
                          value={payReference}
                          onChange={(e) => setPayReference(e.target.value)}
                          placeholder="e.g. TRF-88213 — helps us match your wire"
                          className="h-10 rounded-xl uppercase placeholder:normal-case"
                          maxLength={160}
                          disabled={paying}
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="rounded-xl" onClick={closePayDialog} disabled={paying}>
              {paySubmitted ? 'Done' : 'Cancel'}
            </Button>
            {!paySubmitted && (
              <Button className="rounded-xl" onClick={() => void confirmPayment()} disabled={paying}>
                {paying ? (
                  <>
                    <Loader2 size={14} className="mr-1.5 animate-spin" /> Processing…
                  </>
                ) : payMethod === 'card' ? (
                  'Confirm payment'
                ) : (
                  'Submit transfer details'
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Phase 7.7.3 — refund request dialog: item-level checkboxes with qty
          steppers, a reason (min 10 chars) and an optional shipping bucket.
          Nothing is charged or moved — the request lands as REQUESTED and an
          operator reviews it before approval. */}
      <Dialog
        open={!!refundDialogOrder}
        onOpenChange={(open) => {
          if (!open && !refundSubmitting) setRefundDialogOrder(null)
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw size={16} className="text-primary" /> Request refund
              {refundDialogOrder && (
                <span className="font-mono text-sm font-bold">
                  #{refundDialogOrder.id.slice(-8).toUpperCase()}
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              Choose the items to return and describe why — the request goes to the platform for
              review before any money moves.
            </DialogDescription>
          </DialogHeader>

          {refundDialogOrder && (
            <div className="space-y-4">
              {/* Items — checkbox + quantity stepper (clamped 1..ordered qty) */}
              <div className="space-y-2">
                {refundDialogOrder.items.map((item) => {
                  const qty = refundQtys[item.id] ?? 0
                  const checked = qty >= 1
                  return (
                    <Label
                      key={item.id}
                      htmlFor={`refund-item-${item.id}`}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors',
                        checked ? 'border-primary/50 bg-primary/5' : 'hover:border-primary/30'
                      )}
                    >
                      <Checkbox
                        id={`refund-item-${item.id}`}
                        checked={checked}
                        onCheckedChange={(v) =>
                          setRefundQtys((prev) => ({ ...prev, [item.id]: v === true ? 1 : 0 }))
                        }
                        disabled={refundSubmitting}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-1 text-sm font-medium">{item.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.variantName ? `${item.variantName} · ` : ''}
                          {formatUSD(item.price)} each · ordered {item.quantity}
                        </p>
                      </div>
                      {checked && (
                        /* Stepper swallows its clicks so the row label never
                           toggles the checkbox when adjusting the quantity. */
                        <div
                          className="flex shrink-0 items-center gap-2"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                          }}
                        >
                          <span className="hidden text-[10px] font-medium text-muted-foreground sm:inline">
                            Qty
                          </span>
                          <QuantityInput
                            compact
                            value={qty}
                            min={1}
                            max={item.quantity}
                            onChange={(v) => setRefundQtys((prev) => ({ ...prev, [item.id]: v }))}
                          />
                        </div>
                      )}
                    </Label>
                  )
                })}
              </div>

              {/* Reason — the reviewer needs at least a sentence */}
              <div className="space-y-1.5">
                <Label htmlFor="refund-reason">Reason</Label>
                <Textarea
                  id="refund-reason"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="What went wrong with the selected items?"
                  className="min-h-24"
                  maxLength={2000}
                  disabled={refundSubmitting}
                />
                <p className="text-xs text-muted-foreground">
                  {refundReason.trim().length < 10
                    ? `At least ${10 - refundReason.trim().length} more character${
                        10 - refundReason.trim().length === 1 ? '' : 's'
                      }…`
                    : 'Good — the reviewer sees this reason.'}
                </p>
              </div>

              {/* Optional shipping bucket */}
              <div className="space-y-1.5">
                <Label htmlFor="refund-shipping">
                  Include shipping{' '}
                  <span className="text-xs font-normal text-muted-foreground">(optional, USD)</span>
                </Label>
                <Input
                  id="refund-shipping"
                  type="number"
                  min={0}
                  step="0.01"
                  value={refundShipping}
                  onChange={(e) => setRefundShipping(e.target.value)}
                  placeholder="0.00"
                  className="h-10"
                  disabled={refundSubmitting}
                />
              </div>

              {/* Live estimate + inline error */}
              <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/40 px-3.5 py-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Refund total (estimate)
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Reviewed before approval — amounts may adjust.
                  </p>
                </div>
                <p className="shrink-0 text-lg font-bold tabular-nums">{formatUSD(refundSelectedTotal)}</p>
              </div>
              {refundError && <p className="text-sm font-medium text-destructive">{refundError}</p>}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => setRefundDialogOrder(null)}
              disabled={refundSubmitting}
            >
              Cancel
            </Button>
            <Button className="rounded-xl" onClick={() => void submitRefund()} disabled={refundSubmitting}>
              {refundSubmitting ? (
                <>
                  <Loader2 size={14} className="mr-1.5 animate-spin" /> Submitting…
                </>
              ) : (
                'Submit request'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
