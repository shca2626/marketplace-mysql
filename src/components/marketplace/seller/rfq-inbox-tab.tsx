'use client'

import { useMemo, useState } from 'react'
import {
  ArrowRight,
  Clock3,
  FileDown,
  FileText,
  Inbox,
  Loader2,
  MessageSquareText,
  PackageSearch,
  Send,
  ShieldQuestion,
  Store,
  Undo2,
  User,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import type { ProductDTO, QuoteDTO, RfqDTO } from '@/lib/types'
import { formatDate, formatUSD, timeAgo } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { localInputToIso, toastApiError } from '@/components/marketplace/admin/shared'
import {
  apiRequest,
  EmptyState,
  QUOTE_STATUS_MAP,
  RFQ_STATUS_MAP,
  RfqThread,
  StatusBadge,
  validityLeft,
} from '@/components/marketplace/b2b/b2b-shared'

/**
 * Seller "Quote requests" tab — the seller-facing half of the RFQ module.
 *
 * Shows open RFQs that reference MY catalog products (from /api/rfqs/inbox),
 * lets me study the full request (buyer, org, all lines — mine highlighted),
 * negotiate on the shared message thread, and respond with a quote for my
 * own products only (competitor lines and open items stay read-only context).
 */
export function SellerRfqInboxTab({ myProducts }: { myProducts: ProductDTO[] }) {
  const {
    data,
    loading,
    refetch: refetchInbox,
  } = useApi<{ rfqs: RfqDTO[] }>('/api/rfqs/inbox')

  const [detailId, setDetailId] = useState<string | null>(null)
  const [detail, setDetail] = useState<RfqDTO | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [quoteOpen, setQuoteOpen] = useState(false)

  const rfqs = data?.rfqs ?? []
  const myStockById = useMemo(
    () => new Map(myProducts.map((p) => [p.id, p])),
    [myProducts]
  )

  const openDetail = async (id: string, quote?: boolean) => {
    setDetailId(id)
    setQuoteOpen(!!quote)
    setDetailLoading(true)
    const res = await apiRequest<{ rfq: RfqDTO }>(`/api/rfqs/${id}`)
    setDetailLoading(false)
    if (!res.ok || !res.data) {
      toastApiError(res.error, 'Could not load request')
      return
    }
    setDetail(res.data.rfq)
  }

  const closeDetail = () => {
    setDetailId(null)
    setDetail(null)
    setQuoteOpen(false)
  }

  const refreshAll = () => {
    void refetchInbox()
    if (detailId) void openDetail(detailId)
  }

  const awaitingMyQuote = rfqs.filter((r) => (r.myQuoteCount ?? 0) === 0).length
  const alreadyQuoted = rfqs.filter((r) => (r.myQuoteCount ?? 0) > 0).length

  return (
    <div className="space-y-5">
      {/* Summary strip */}
      <div className="grid gap-3 sm:grid-cols-3">
        <CardStat icon={Inbox} label="Open requests" value={rfqs.length} sub="reference your products" />
        <CardStat icon={ShieldQuestion} label="Awaiting your quote" value={awaitingMyQuote} sub="you haven't responded yet" highlight={awaitingMyQuote > 0} />
        <CardStat icon={FileText} label="Quotes you sent" value={alreadyQuoted} sub="on these requests" />
      </div>

      {/* Inbox list */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : rfqs.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No quote requests yet"
          description="When buyers request pricing on products you sell, their RFQs land here. Keep your catalog stocked and active to get matched."
        />
      ) : (
        <ul className="space-y-2.5" aria-label="Quote requests">
          {rfqs.map((rfq) => {
            const mine = (rfq.myQuoteCount ?? 0) > 0
            return (
              <li
                key={rfq.id}
                className="group rounded-xl border bg-card p-4 transition-colors hover:border-primary/50"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openDetail(rfq.id)}
                        className="font-mono text-sm font-bold tracking-tight text-primary hover:underline"
                      >
                        {rfq.number}
                      </button>
                      <StatusBadge status={rfq.status} map={RFQ_STATUS_MAP} />
                      {mine && (
                        <Badge className="rounded-full border-0 bg-emerald-100 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          You quoted
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 truncate text-sm font-medium">{rfq.title || 'Untitled request'}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <User size={11} aria-hidden /> {rfq.requester.name}
                      </span>
                      {rfq.organizationName && (
                        <span className="inline-flex items-center gap-1">
                          <Store size={11} aria-hidden /> {rfq.organizationName}
                        </span>
                      )}
                      <span>
                        {rfq.lineCount} line{rfq.lineCount === 1 ? '' : 's'} · your products on{' '}
                        {rfq.myLineCount}
                      </span>
                      <span>{timeAgo(rfq.createdAt)}</span>
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-lg"
                      onClick={() => openDetail(rfq.id)}
                    >
                      <MessageSquareText size={13} className="mr-1" /> View
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="rounded-lg"
                      onClick={() => openDetail(rfq.id, true)}
                    >
                      <Send size={13} className="mr-1" /> {mine ? 'Quote again' : 'Quote'}
                    </Button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* Detail dialog */}
      {detailId && (
        <SellerRfqDetailDialog
          rfqId={detailId}
          rfq={detail}
          loading={detailLoading}
          myStockById={myStockById}
          onClose={closeDetail}
          onChanged={refreshAll}
          quoteOpen={quoteOpen}
          onQuoteOpenChange={setQuoteOpen}
        />
      )}
    </div>
  )
}

// ── Stat card ────────────────────────────────────────────────────────────────

function CardStat({
  icon: Icon,
  label,
  value,
  sub,
  highlight,
}: {
  icon: typeof Inbox
  label: string
  value: number
  sub: string
  highlight?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-card p-4',
        highlight && 'border-primary/60 bg-primary/5'
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <Icon size={15} className={highlight ? 'text-primary' : 'text-muted-foreground'} aria-hidden />
      </div>
      <p className="mt-1.5 text-2xl font-extrabold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  )
}

// ── Detail dialog (seller view of one RFQ) ───────────────────────────────────

function SellerRfqDetailDialog({
  rfqId,
  rfq,
  loading,
  myStockById,
  onClose,
  onChanged,
  quoteOpen,
  onQuoteOpenChange,
}: {
  rfqId: string
  rfq: RfqDTO | null
  loading: boolean
  myStockById: Map<string, ProductDTO>
  onClose: () => void
  onChanged: () => void
  quoteOpen: boolean
  onQuoteOpenChange: (v: boolean) => void
}) {
  return (
    <Dialog open onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        {loading || !rfq ? (
          <div className="space-y-3">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-80" />
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        ) : (
          <div className="space-y-5">
            <DialogHeader className="space-y-1">
              <DialogTitle className="flex flex-wrap items-center gap-2.5">
                <span className="font-mono">{rfq.number}</span>
                <StatusBadge status={rfq.status} map={RFQ_STATUS_MAP} />
              </DialogTitle>
              <DialogDescription>
                {rfq.title || 'Untitled request'} · from {rfq.requester.name}
                {rfq.organizationName ? ` (${rfq.organizationName})` : ''} ·{' '}
                {formatDate(rfq.createdAt)}
              </DialogDescription>
            </DialogHeader>

            {rfq.description && (
              <p className="whitespace-pre-line rounded-xl bg-muted/50 p-3.5 text-sm leading-relaxed">
                {rfq.description}
              </p>
            )}

            {/* Lines — mine highlighted, others read-only context */}
            <section aria-label="Requested items">
              <h3 className="mb-2 text-sm font-semibold">
                Requested items
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  your products can be quoted
                </span>
              </h3>
              <div className="space-y-2">
                {rfq.lines.map((l) => {
                  const isMine = !!l.productId && myStockById.has(l.productId)
                  return (
                    <div
                      key={l.id}
                      className={cn(
                        'flex items-center gap-3 rounded-xl border p-2.5',
                        isMine ? 'border-primary/50 bg-primary/5' : 'bg-card'
                      )}
                    >
                      <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border bg-muted">
                        {l.product?.image ? (
                          <img
                            src={l.product.image}
                            alt=""
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <PackageSearch size={15} className="m-auto block text-muted-foreground" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-1.5 truncate text-sm font-medium">
                          <span className="truncate">{l.product?.title ?? l.productName}</span>
                          {l.variantName && (
                            <Badge
                              variant="outline"
                              className="shrink-0 rounded-full border-primary/40 px-1.5 text-[10px] text-primary"
                            >
                              {l.variantName}
                            </Badge>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Qty {l.quantity}
                          {l.targetPrice != null && <> · target {formatUSD(l.targetPrice)}/unit</>}
                          {l.sku && <> · SKU {l.sku}</>}
                        </p>
                      </div>
                      {isMine ? (
                        <Badge className="shrink-0 rounded-full border-0 bg-primary/15 text-[10px] font-semibold text-primary">
                          Your product
                        </Badge>
                      ) : l.productId ? (
                        <Badge className="shrink-0 rounded-full border-0 bg-muted text-[10px] font-medium text-muted-foreground">
                          Another seller
                        </Badge>
                      ) : (
                        <Badge className="shrink-0 rounded-full border-0 bg-muted text-[10px] font-medium text-muted-foreground">
                          Open item
                        </Badge>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>

            {/* My quotes on this RFQ (seller sees only own) */}
            <section aria-label="Your quotes">
              <h3 className="mb-2 text-sm font-semibold">
                Your quotes
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  competitors&apos; offers stay private
                </span>
              </h3>
              {(rfq.quotes ?? []).length === 0 ? (
                <p className="rounded-xl border border-dashed px-4 py-4 text-center text-xs text-muted-foreground">
                  You haven&apos;t quoted this request yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {(rfq.quotes ?? []).map((q) => (
                    <SellerQuoteCard key={q.id} quote={q} onChanged={onChanged} />
                  ))}
                </div>
              )}
            </section>

            {/* Negotiation thread */}
            <RfqThread rfqId={rfqId} rfqStatus={rfq.status} />

            {/* Actions */}
            {['SUBMITTED', 'UNDER_REVIEW', 'QUOTED'].includes(rfq.status) && (
              <div className="flex justify-end border-t pt-4">
                <Button type="button" className="rounded-xl" onClick={() => onQuoteOpenChange(true)}>
                  <Send size={14} className="mr-1.5" />
                  {(rfq.quotes ?? []).length > 0 ? 'Send another quote' : 'Send quote'}
                </Button>
              </div>
            )}
          </div>
        )}

        {quoteOpen && rfq && (
          <SellerQuoteDialog
            rfq={rfq}
            myStockById={myStockById}
            onClose={() => onQuoteOpenChange(false)}
            onIssued={() => {
              onQuoteOpenChange(false)
              onChanged()
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── My quote card with withdraw ──────────────────────────────────────────────

function SellerQuoteCard({ quote, onChanged }: { quote: QuoteDTO; onChanged: () => void }) {
  const [withdrawing, setWithdrawing] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const withdraw = async () => {
    setWithdrawing(true)
    const res = await apiRequest(`/api/quotes/${quote.id}/withdraw`, { method: 'POST' })
    setWithdrawing(false)
    setConfirmOpen(false)
    if (!res.ok) {
      toastApiError(res.error, 'Could not withdraw')
      return
    }
    toast({ title: 'Quote withdrawn', description: `${quote.number} is no longer visible to the buyer.` })
    onChanged()
  }

  const validity = validityLeft(quote.validUntil)
  return (
    <div className="rounded-xl border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold tabular-nums">
            {quote.number}
            <StatusBadge status={quote.status} map={QUOTE_STATUS_MAP} />
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            sent {quote.sentAt ? timeAgo(quote.sentAt) : timeAgo(quote.createdAt)}
            {quote.paymentTerms ? ` · ${quote.paymentTerms}` : ''}
            {validity && quote.status === 'SENT' && (
              <span className={validity.urgent ? ' font-semibold text-destructive' : ''}>
                {' '}
                · {validity.label}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <p className="text-sm font-bold tabular-nums">{formatUSD(quote.total)}</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 rounded-lg px-2 text-xs text-muted-foreground"
            onClick={() => window.open(`/api/quotes/${quote.id}/pdf`, '_blank', 'noopener')}
            aria-label={`Download quote ${quote.number} as PDF`}
          >
            <FileDown size={12} /> PDF
          </Button>
          {quote.status === 'SENT' && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 rounded-lg text-xs text-muted-foreground hover:text-destructive"
              disabled={withdrawing}
              onClick={() => setConfirmOpen(true)}
            >
              <Undo2 size={12} className="mr-1" /> Withdraw
            </Button>
          )}
        </div>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {quote.lines.length} line{quote.lines.length === 1 ? '' : 's'}
        {quote.discountTotal > 0 && ` · discount −${formatUSD(quote.discountTotal)}`}
        {quote.shippingTotal > 0 && ` · shipping ${formatUSD(quote.shippingTotal)}`}
      </p>
      {quote.notes && <p className="mt-1 text-xs italic text-muted-foreground">{quote.notes}</p>}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Withdraw quote {quote.number}?</AlertDialogTitle>
            <AlertDialogDescription>
              The buyer will no longer be able to accept it. This cannot be undone — you can send
              a revised quote afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep quote</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault()
                void withdraw()
              }}
            >
              {withdrawing ? <Loader2 size={14} className="animate-spin" /> : 'Withdraw quote'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ── Quote composer (seller: own products only) ───────────────────────────────

interface EditableLine {
  key: string
  rfqLineId: string
  productId: string
  productTitle: string
  variantName?: string | null
  image?: string | null
  quantity: string
  unitPrice: string
  stock?: number | null
  targetPrice?: number | null
}

const PAYMENT_TERMS = ['Prepaid', 'NET-15', 'NET-30', 'NET-45', 'NET-60']

/** Highest matching quantity tier for a quantity (bands: from ≤ qty ≤ to|null). */
function matchingTierPrice(
  tiers: { from: number; to: number | null; price: number }[] | null | undefined,
  quantity: number
): number | null {
  if (!tiers || tiers.length === 0) return null
  const q = Number(quantity) || 0
  const hit = tiers.find((t) => q >= t.from && (t.to == null || q <= t.to))
  return hit ? hit.price : null
}

function SellerQuoteDialog({
  rfq,
  myStockById,
  onClose,
  onIssued,
}: {
  rfq: RfqDTO
  myStockById: Map<string, ProductDTO>
  onClose: () => void
  onIssued: () => void
}) {
  // Prefill ONLY with the buyer's lines that reference my catalog products.
  const [lines, setLines] = useState<EditableLine[]>(() =>
    rfq.lines
      .filter((l) => l.productId && myStockById.has(l.productId))
      .map((l) => ({
        key: l.id,
        rfqLineId: l.id,
        productId: l.productId!,
        productTitle: l.product?.title ?? l.productName,
        variantName: l.variantName ?? null,
        image: l.product?.image ?? null,
        quantity: String(l.quantity),
        // Tier ladder wins when the quantity lands in a band (target → tier → base)
        unitPrice: (
          l.targetPrice ??
          matchingTierPrice(l.product?.priceTiers, l.quantity) ??
          l.product?.price ??
          0
        ).toFixed(2),
        stock: myStockById.get(l.productId!)?.stock ?? null,
        targetPrice: l.targetPrice ?? null,
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (lines.length === 0) {
      toast({
        title: 'Nothing to quote',
        description: 'None of your products are referenced in this request.',
        variant: 'destructive',
      })
      return
    }
    if (lines.some((l) => (Number(l.quantity) || 0) < 1)) {
      toast({
        title: 'Check quantities',
        description: 'Every line needs a quantity of at least 1.',
        variant: 'destructive',
      })
      return
    }
    const overStock = lines.find((l) => l.stock != null && Number(l.quantity) > l.stock)
    if (overStock) {
      toast({
        title: 'Over available stock',
        description: `${overStock.productTitle}: only ${overStock.stock} in stock (you quoted ${overStock.quantity}). Restock or adjust the quantity.`,
        variant: 'destructive',
      })
      return
    }
    const validUntilIso = localInputToIso(extras.validUntil)
    if (validUntilIso && new Date(validUntilIso).getTime() <= Date.now()) {
      toast({
        title: 'Invalid validity',
        description: '“Valid until” must be in the future.',
        variant: 'destructive',
      })
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
      toastApiError(res.error, 'Could not send quote')
      return
    }
    toast({
      title: 'Quote sent',
      description: `${rfq.number} — the buyer can now review your offer.`,
    })
    onIssued()
  }

  const contextLines = rfq.lines.filter(
    (l) => !l.productId || !myStockById.has(l.productId)
  )

  return (
    <Dialog open onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Quote {rfq.number}</DialogTitle>
          <DialogDescription>
            Only your products from the request are quoted. The buyer sees your offer next to their
            other quotes.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {/* Read-only context: what the buyer asked for beyond my catalog */}
          {contextLines.length > 0 && (
            <div className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
              <p className="mb-1 font-semibold">Also requested (not quotable by you):</p>
              <ul className="list-inside list-disc space-y-0.5">
                {contextLines.map((l) => (
                  <li key={l.id} className="truncate">
                    {l.product?.title ?? l.productName} — qty {l.quantity}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* My quote lines */}
          <div className="space-y-2">
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
                    <p className="flex flex-wrap items-center gap-1.5 truncate text-sm font-medium">
                      <span className="truncate">{l.productTitle}</span>
                      {l.variantName && (
                        <Badge
                          variant="outline"
                          className="shrink-0 rounded-full border-primary/40 px-1.5 text-[10px] text-primary"
                        >
                          {l.variantName}
                        </Badge>
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatUSD(Number(l.unitPrice) || 0)} × {l.quantity || 0} ={' '}
                      <span className="font-semibold text-foreground">
                        {formatUSD((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0))}
                      </span>
                      {l.stock != null && l.targetPrice != null && (
                        <span className="ml-1">
                          · target {formatUSD(l.targetPrice)} · stock {l.stock}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 pl-[46px]">
                  <div className="space-y-1">
                    <Label htmlFor={`sql-qty-${i}`} className="text-[11px]">
                      Quantity
                    </Label>
                    <Input
                      id={`sql-qty-${i}`}
                      type="number"
                      min={1}
                      step={1}
                      value={l.quantity}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((x, idx) => (idx === i ? { ...x, quantity: e.target.value } : x))
                        )
                      }
                      className="h-8 rounded-lg text-sm"
                      aria-label={`Quantity for ${l.productTitle}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`sql-price-${i}`} className="text-[11px]">
                      Unit price (USD)
                    </Label>
                    <Input
                      id={`sql-price-${i}`}
                      type="number"
                      min={0}
                      step="0.01"
                      value={l.unitPrice}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((x, idx) => (idx === i ? { ...x, unitPrice: e.target.value } : x))
                        )
                      }
                      className="h-8 rounded-lg text-sm"
                      aria-label={`Unit price for ${l.productTitle}`}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <Separator />

          {/* Terms */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sql-valid" className="text-xs">
                Valid until
              </Label>
              <Input
                id="sql-valid"
                type="datetime-local"
                value={extras.validUntil}
                onChange={(e) => setExtras((x) => ({ ...x, validUntil: e.target.value }))}
                className="h-9 rounded-lg text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Payment terms</Label>
              <Select
                value={extras.paymentTerms}
                onValueChange={(v) => setExtras((x) => ({ ...x, paymentTerms: v }))}
              >
                <SelectTrigger className="h-9 rounded-lg text-sm" aria-label="Payment terms">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_TERMS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="sql-disc" className="text-[11px]">
                Discount ($)
              </Label>
              <Input
                id="sql-disc"
                type="number"
                min={0}
                step="0.01"
                value={extras.discountTotal}
                onChange={(e) => setExtras((x) => ({ ...x, discountTotal: e.target.value }))}
                className="h-9 rounded-lg text-sm"
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sql-ship" className="text-[11px]">
                Shipping ($)
              </Label>
              <Input
                id="sql-ship"
                type="number"
                min={0}
                step="0.01"
                value={extras.shippingTotal}
                onChange={(e) => setExtras((x) => ({ ...x, shippingTotal: e.target.value }))}
                className="h-9 rounded-lg text-sm"
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sql-tax" className="text-[11px]">
                Tax ($)
              </Label>
              <Input
                id="sql-tax"
                type="number"
                min={0}
                step="0.01"
                value={extras.taxTotal}
                onChange={(e) => setExtras((x) => ({ ...x, taxTotal: e.target.value }))}
                className="h-9 rounded-lg text-sm"
                placeholder="0"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sql-notes" className="text-xs">
              Notes to the buyer (optional)
            </Label>
            <Textarea
              id="sql-notes"
              value={extras.notes}
              onChange={(e) => setExtras((x) => ({ ...x, notes: e.target.value }))}
              rows={2}
              maxLength={5000}
              className="rounded-lg text-sm"
              placeholder="Lead times, bulk tiers, substitutions…"
            />
          </div>

          {/* Totals */}
          <div className="rounded-xl border bg-muted/40 p-3 text-sm">
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
                <span className="tabular-nums">{formatUSD(shipping)}</span>
              </div>
            )}
            {tax > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Tax</span>
                <span className="tabular-nums">{formatUSD(tax)}</span>
              </div>
            )}
            <Separator className="my-2" />
            <div className="flex justify-between font-bold">
              <span>Quote total</span>
              <span className="tabular-nums">{formatUSD(total)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock3 size={11} aria-hidden /> Quotes are binding offers — withdraw anytime before
              acceptance.
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="rounded-lg" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" className="rounded-lg" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 size={14} className="mr-1 animate-spin" /> Sending…
                  </>
                ) : (
                  <>
                    <ArrowRight size={14} className="mr-1" /> Send quote
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
