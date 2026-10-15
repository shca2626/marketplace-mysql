'use client'

// ─────────────────────────────────────────────────────────────────────────────
// BUYER REFUND UI (Phase 5 — direct purchase flow).
//   • RefundRequestDialog — item-level refund request on an order the buyer
//     paid (CARD captured inline / BANK_TRANSFER captured by an operator):
//     quantity steppers, reason, optional shipping, POST /api/orders/[id]/refund
//     (Phase 7.7.3 contract).
//   • RefundStatusChip — live status of the order's refund requests.
//   • RefundDetailDialog — full request dossier: allocations, amounts, timeline.
// Render-prop pattern matches RaiseDisputeDialog so triggers stay flexible.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import {
  BadgeCheck,
  Ban,
  CalendarClock,
  CircleDollarSign,
  Loader2,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useMarketplace } from '@/store/marketplace'
import { formatDate, formatUSD } from '@/lib/format'
import type { OrderDTO } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

// ── Types (contract of GET /api/refunds — buyerRefunds serializer) ──────────

export interface BuyerRefundDTO {
  id: string
  number: string
  orderId: string
  status: 'REQUESTED' | 'APPROVED' | 'COMPLETED' | 'DENIED' | 'CANCELLED' | (string & {})
  reason: string
  amountTotal: number
  currency: string
  paymentReference: string | null
  createdAt: string
  approvedAt?: string | null
  completedAt?: string | null
  items: { orderItemId: string; title: string; quantity: number }[]
}

const REFUND_STATUS_STYLE: Record<string, string> = {
  REQUESTED: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  APPROVED: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  COMPLETED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  DENIED: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  CANCELLED: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
}

export function refundStatusStyle(status: string): string {
  return REFUND_STATUS_STYLE[status] ?? 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
}

/** Money moved through the platform? (CARD inline capture / operator-captured wire) */
export function orderRefundable(order: OrderDTO): boolean {
  if (order.status === 'CANCELLED') return false
  if (!['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'].includes(order.status)) return false
  return order.payment?.status === 'SUCCEEDED'
}

// ── Status chip (order card header) ─────────────────────────────────────────

export function RefundStatusChip({ refund, onOpen }: { refund: BuyerRefundDTO; onOpen: () => void }) {
  const live = refund.status === 'REQUESTED' || refund.status === 'APPROVED'
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onOpen()
      }}
      className={cn(
        'flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-transform hover:scale-[1.03]',
        refundStatusStyle(refund.status)
      )}
      title={`Refund ${refund.number} — ${refund.status.toLowerCase()}`}
    >
      <RotateCcw size={12} className="shrink-0" />
      Refund {refund.status.toLowerCase()}
    </button>
  )
}

// ── Request dialog ──────────────────────────────────────────────────────────

export function RefundRequestDialog({
  order,
  onCreated,
  children,
}: {
  order: OrderDTO
  onCreated?: () => void
  children: (open: () => void) => React.ReactNode
}) {
  const navigate = useMarketplace((s) => s.navigate)
  const [open, setOpen] = useState(false)
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [reason, setReason] = useState('')
  const [includeShipping, setIncludeShipping] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const selected = useMemo(
    () =>
      order.items
        .map((item) => ({ item, qty: quantities[item.id] ?? 0 }))
        .filter((s) => s.qty > 0),
    [order.items, quantities]
  )
  const itemsTotal = selected.reduce((sum, s) => sum + s.item.price * s.qty, 0)
  const shippingEstimate = Math.max(0, Math.min(order.total - itemsTotalOrder(order), 10000))
  const total = Math.round((itemsTotal + (includeShipping ? shippingEstimate : 0)) * 100) / 100

  const openDialog = () => {
    setQuantities({})
    setReason('')
    setIncludeShipping(false)
    setOpen(true)
  }

  const setQty = (id: string, max: number, delta: number) => {
    setQuantities((q) => {
      const next = Math.max(0, Math.min(max, (q[id] ?? 0) + delta))
      return { ...q, [id]: next }
    })
  }

  const submit = async () => {
    if (submitting) return
    if (selected.length === 0) {
      toast({ title: 'Select at least one item', description: 'Choose the items you want refunded.', variant: 'destructive' })
      return
    }
    if (reason.trim().length < 10) {
      toast({
        title: 'Describe the reason',
        description: 'At least 10 characters — helps the platform review your request.',
        variant: 'destructive',
      })
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/orders/${order.id}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: reason.trim(),
          items: selected.map((s) => ({ orderItemId: s.item.id, quantity: s.qty })),
          ...(includeShipping ? { shipping: shippingEstimate } : {}),
        }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string; refund?: { number?: string } }
      if (!res.ok) {
        toast({ title: 'Refund request failed', description: json.error ?? 'Please try again.', variant: 'destructive' })
        return
      }
      setOpen(false)
      toast({
        title: `Refund request ${json.refund?.number ?? ''} submitted`.trim(),
        description: `${formatUSD(total)} — the platform reviews it and you'll be notified of the outcome.`,
      })
      onCreated?.()
    } catch {
      toast({ title: 'Error', description: 'Network error — please try again', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {children(openDialog)}

      <Dialog open={open} onOpenChange={(v) => !v && !submitting && setOpen(false)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw size={16} className="text-primary" /> Request a refund
            </DialogTitle>
            <DialogDescription>
              Order #{order.id.slice(-8).toUpperCase()} — pick the items to return. The platform reviews every
              request before money moves.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Item selection with quantity steppers */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Items to refund
              </Label>
              <ul className="divide-y rounded-xl border">
                {order.items.map((item) => {
                  const qty = quantities[item.id] ?? 0
                  return (
                    <li key={item.id} className="flex items-center gap-3 px-3.5 py-3">
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          className="line-clamp-1 text-left text-sm font-medium hover:text-primary"
                          onClick={() => navigate('product', { productId: item.productId })}
                        >
                          {item.title}
                        </button>
                        <p className="text-xs text-muted-foreground">
                          {formatUSD(item.price)} each · ordered {item.quantity}
                        </p>
                      </div>
                      <div className="flex items-center gap-1" role="group" aria-label={`Refund quantity for ${item.title}`}>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-7 w-7 rounded-full"
                          onClick={() => setQty(item.id, item.quantity, -1)}
                          disabled={qty === 0}
                          aria-label={`Remove one ${item.title}`}
                        >
                          −
                        </Button>
                        <span className="w-7 text-center text-sm font-bold tabular-nums">{qty}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-7 w-7 rounded-full"
                          onClick={() => setQty(item.id, item.quantity, 1)}
                          disabled={qty >= item.quantity}
                          aria-label={`Add one ${item.title}`}
                        >
                          +
                        </Button>
                      </div>
                      <span
                        className={cn(
                          'w-16 shrink-0 text-right text-sm font-semibold tabular-nums',
                          qty > 0 ? 'text-foreground' : 'text-muted-foreground/50'
                        )}
                      >
                        {qty > 0 ? formatUSD(item.price * qty) : '—'}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>

            {/* Optional shipping */}
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border bg-muted/40 px-3.5 py-3">
              <span className="flex items-center gap-2.5 text-sm">
                <CircleDollarSign size={15} className="text-muted-foreground" />
                <span>
                  Also request shipping back
                  <span className="block text-xs text-muted-foreground">
                    Estimated unspent shipping: {formatUSD(shippingEstimate)}
                  </span>
                </span>
              </span>
              <input
                type="checkbox"
                checked={includeShipping}
                onChange={(e) => setIncludeShipping(e.target.checked)}
                className="size-4 accent-primary"
              />
            </label>

            {/* Reason */}
            <div className="space-y-1.5">
              <Label htmlFor="refund-reason">
                Reason <span className="text-xs font-normal text-muted-foreground">(min 10 characters)</span>
              </Label>
              <Textarea
                id="refund-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value.slice(0, 2000))}
                placeholder="e.g. Panels arrived with a cracked frame — photos attached in the dispute thread."
                className="min-h-[88px]"
                aria-invalid={reason.trim().length > 0 && reason.trim().length < 10}
                disabled={submitting}
              />
            </div>

            {/* Summary */}
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3.5">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Refund request total
                </span>
                <span className="text-lg font-bold tabular-nums">{formatUSD(total)}</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {selected.length === 0
                  ? 'Select at least one item above to continue.'
                  : `${selected.reduce((n, s) => n + s.qty, 0)} unit(s) across ${selected.length} line(s)` +
                    (includeShipping ? ' + shipping' : '') +
                    ' — an operator reviews this before any money moves.'}
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="rounded-xl" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button className="rounded-xl" onClick={() => void submit()} disabled={submitting || selected.length === 0}>
              {submitting ? (
                <>
                  <Loader2 size={14} className="mr-1.5 animate-spin" /> Submitting…
                </>
              ) : (
                <>
                  <RotateCcw size={14} className="mr-1.5" /> Submit request
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ── Detail dialog ────────────────────────────────────────────────────────────

export function RefundDetailDialog({
  refund,
  onClosed,
}: {
  refund: BuyerRefundDTO | null
  onClosed?: () => void
}) {
  const user = useMarketplace((s) => s.user)
  const [cancelling, setCancelling] = useState(false)

  const cancel = async () => {
    if (!refund || cancelling) return
    setCancelling(true)
    try {
      const res = await fetch(`/api/refunds/${refund.id}/cancel`, { method: 'POST' })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast({ title: 'Could not withdraw', description: json.error ?? 'Please try again.', variant: 'destructive' })
        return
      }
      toast({ title: 'Refund request withdrawn', description: `${refund.number} was cancelled.` })
      onClosed?.()
    } catch {
      toast({ title: 'Error', description: 'Network error — please try again', variant: 'destructive' })
    } finally {
      setCancelling(false)
    }
  }

  return (
    <Dialog open={!!refund} onOpenChange={(open) => !open && !cancelling && onClosed?.()}>
      <DialogContent className="sm:max-w-md">
        {refund && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <RotateCcw size={16} className="text-primary" /> Refund {refund.number}
              </DialogTitle>
              <DialogDescription>
                Submitted {formatDate(refund.createdAt)} on order #{refund.orderId.slice(-8).toUpperCase()}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/40 px-3.5 py-3">
                <span className="text-sm font-semibold">Status</span>
                <Badge className={cn('rounded-full text-[11px] font-semibold', refundStatusStyle(refund.status))}>
                  {refund.status}
                </Badge>
              </div>

              <div className="rounded-xl border px-3.5 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reason</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{refund.reason}</p>
              </div>

              <div className="rounded-xl border px-3.5 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Items</p>
                <ul className="mt-1.5 space-y-1.5">
                  {refund.items.map((item) => (
                    <li key={item.orderItemId} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate">{item.title}</span>
                      <span className="shrink-0 font-semibold">×{item.quantity}</span>
                    </li>
                  ))}
                </ul>
                <Separator className="my-2.5" />
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Requested total</span>
                  <span className="text-base font-bold tabular-nums">{formatUSD(refund.amountTotal)}</span>
                </div>
              </div>

              {/* Outcome timeline */}
              <ol className="space-y-2 text-sm">
                {[
                  { label: 'Requested', at: refund.createdAt, icon: CalendarClock, done: true },
                  { label: 'Approved by platform', at: refund.approvedAt ?? null, icon: BadgeCheck, done: !!refund.approvedAt || ['COMPLETED'].includes(refund.status) },
                  {
                    label: refund.status === 'DENIED' ? 'Denied' : 'Money returned',
                    at: refund.completedAt ?? null,
                    icon: refund.status === 'DENIED' ? ShieldAlert : CircleDollarSign,
                    done: ['COMPLETED', 'DENIED'].includes(refund.status),
                    denied: refund.status === 'DENIED',
                  },
                ].map((step) => (
                  <li key={step.label} className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        'flex h-7 w-7 items-center justify-center rounded-full border',
                        step.denied
                          ? 'border-rose-300 bg-rose-50 text-rose-600 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300'
                          : step.done
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border text-muted-foreground/60'
                      )}
                    >
                      <step.icon size={13} />
                    </span>
                    <span className={step.done ? 'font-medium' : 'text-muted-foreground'}>
                      {step.label}
                      {step.at && <span className="ml-1.5 text-xs text-muted-foreground">{formatDate(step.at)}</span>}
                    </span>
                  </li>
                ))}
              </ol>

              {refund.paymentReference && (
                <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  Payment reference: <span className="font-mono font-semibold text-foreground">{refund.paymentReference}</span>
                </p>
              )}

              {/* Buyer can withdraw while still REQUESTED */}
              {user && refund.status === 'REQUESTED' && (
                <>
                  <Separator />
                  <Button
                    variant="outline"
                    className="w-full rounded-xl text-destructive hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => void cancel()}
                    disabled={cancelling}
                  >
                    {cancelling ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Ban size={14} className="mr-1.5" />}
                    Withdraw this request
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Items subtotal of the order (without shipping/coupon effects). */
function itemsTotalOrder(order: OrderDTO): number {
  return order.items.reduce((sum, i) => sum + i.price * i.quantity, 0)
}
