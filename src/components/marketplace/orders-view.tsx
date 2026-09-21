'use client'

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Ban, CalendarClock, Check, ClipboardList, Hourglass, PackageCheck, PackageOpen, ReceiptText, Search, Star, Truck, X } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useMarketplace } from '@/store/marketplace'
import { useApi } from '@/hooks/use-api'
import type { OrderDTO } from '@/lib/types'
import { formatDate, formatUSD } from '@/lib/format'
import { InvoiceDialog } from './invoice-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
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
  PROCESSING: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  SHIPPED: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  DELIVERED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  CANCELLED: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
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

  const orders = data?.orders ?? []

  // Status chips: ALL + every status present in the order list (canonical order)
  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const o of orders) counts.set(o.status, (counts.get(o.status) ?? 0) + 1)
    const order = ['PENDING_APPROVAL', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED']
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
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">My orders</h1>
      <p className="mt-1 text-sm text-muted-foreground">Track and review your purchases.</p>

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
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold">{formatUSD(order.total)}</span>
                    <Badge className={cn('rounded-full text-[11px] font-semibold', STATUS_COLORS[order.status])}>
                      {order.status === 'PENDING_APPROVAL' ? 'AWAITING APPROVAL' : order.status}
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

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-xs text-muted-foreground">
                    <span>
                      Ship to: {order.fullName}, {order.address}, {order.city} {order.zip}
                    </span>
                    <div className="flex items-center gap-2">
                      {(order.status === 'PAID' || order.status === 'PENDING_APPROVAL') && (
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
    </div>
  )
}
