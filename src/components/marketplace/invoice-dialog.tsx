'use client'

import { CalendarDays, Printer, ReceiptText } from 'lucide-react'
import type { OrderDTO } from '@/lib/types'
import { formatDate, formatUSD } from '@/lib/format'
import { FREE_SHIPPING_THRESHOLD, SHIPPING_FEE } from '@/lib/pricing'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

const STATUS_BADGE: Record<string, string> = {
  PAID: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  PROCESSING: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  SHIPPED: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  DELIVERED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  CANCELLED: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
}

/**
 * Derives the order pricing breakdown from the stored total.
 * The API stores one authoritative `total`; shipping follows the platform
 * rules (free ≥ threshold, flat fee below) and the discount is whatever
 * remains between subtotal + shipping and the stored total.
 */
export function invoiceTotals(order: OrderDTO) {
  const subtotal = Math.round(order.items.reduce((s, it) => s + it.price * it.quantity, 0) * 100) / 100
  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE
  const discount = Math.max(0, Math.round((subtotal + shipping - order.total) * 100) / 100)
  return { subtotal, shipping, discount, total: order.total }
}

export function InvoiceDialog({ order, children }: { order: OrderDTO; children: React.ReactNode }) {
  const { subtotal, shipping, discount, total } = invoiceTotals(order)
  const cancelled = order.status === 'CANCELLED'
  const invoiceNo = `INV-${order.id.slice(-8).toUpperCase()}`

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[85vh] gap-0 overflow-y-auto p-0 sm:max-w-lg">
        {/* Dialog chrome (hidden when printing) */}
        <DialogHeader className="no-print border-b p-5 pb-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ReceiptText size={16} className="text-primary" /> Invoice {invoiceNo}
          </DialogTitle>
          <DialogDescription>
            Itemized receipt for order #{order.id.slice(-8).toUpperCase()}.
          </DialogDescription>
        </DialogHeader>

        {/* Printable receipt */}
        <div className="print-area bg-card p-6 text-card-foreground">
          {/* Brand + meta */}
          <div className="flex items-start justify-between gap-4 border-b pb-5">
            <div>
              <p className="text-lg font-extrabold tracking-tight">
                Vendora<span className="text-primary">.</span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">Multi-vendor marketplace</p>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <p className="font-mono text-sm font-semibold text-foreground">{invoiceNo}</p>
              <p className="mt-1 flex items-center justify-end gap-1">
                <CalendarDays size={11} /> {formatDate(order.createdAt)}
              </p>
              <Badge className={cn('mt-2 rounded-full text-[10px] font-bold', STATUS_BADGE[order.status])}>
                {order.status}
              </Badge>
            </div>
          </div>

          {/* Bill to */}
          <div className="border-b py-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Bill / ship to</p>
            <p className="mt-1.5 text-sm font-semibold">{order.fullName}</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {order.address}
              <br />
              {order.city} {order.zip}
              <br />
              {order.country}
              {order.phone ? (
                <>
                  <br />
                  {order.phone}
                </>
              ) : null}
            </p>
          </div>

          {/* Line items */}
          <table className="w-full border-b py-2 text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="py-3 font-semibold">Item</th>
                <th className="py-3 text-center font-semibold">Qty</th>
                <th className="py-3 text-right font-semibold">Unit</th>
                <th className="py-3 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((it) => (
                <tr key={it.id} className="border-t border-dashed align-top">
                  <td className="max-w-[220px] py-2.5 pr-2 font-medium leading-snug">{it.title}</td>
                  <td className="py-2.5 text-center tabular-nums">{it.quantity}</td>
                  <td className="py-2.5 text-right tabular-nums">{formatUSD(it.price)}</td>
                  <td className="py-2.5 text-right font-semibold tabular-nums">
                    {formatUSD(Math.round(it.price * it.quantity * 100) / 100)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="space-y-1.5 border-b py-4 text-xs">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatUSD(subtotal)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Shipping</span>
              <span className="tabular-nums">{shipping === 0 ? 'Free' : formatUSD(shipping)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                <span>Discount</span>
                <span className="tabular-nums">−{formatUSD(discount)}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-2 text-sm font-bold">
              <span>Total</span>
              <span className="tabular-nums">{formatUSD(total)}</span>
            </div>
          </div>

          {/* Footer notes */}
          <div className="pt-4 text-[10px] leading-relaxed text-muted-foreground">
            {cancelled ? (
              <p className="font-semibold text-destructive">
                This order was cancelled — the full amount of {formatUSD(total)} was refunded to the original payment
                method.
              </p>
            ) : (
              <p>Payment captured at checkout. Contact support@vendora.com for questions about this invoice.</p>
            )}
            <p className="mt-2">Thank you for shopping on Vendora.</p>
          </div>
        </div>

        {/* Actions (hidden when printing) */}
        <div className="no-print flex justify-end gap-2 border-t bg-muted/40 p-4">
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => window.print()}>
            <Printer size={13} className="mr-1.5" /> Print / save as PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
