'use client'

// ─────────────────────────────────────────────────────────────────────────────
// SELLER CONSOLE → MY OFFERS (Phase 4 multi-vendor).
// Every offer the signed-in seller has attached to other sellers' (or the
// platform's) catalog products: price/stock/MOQ, status (PENDING_REVIEW →
// ACTIVE/PAUSED/REJECTED), sold count, and inline management — edit, pause /
// resume, withdraw. Data lives in the parent (seller-view) so the nav badge
// (offers needing attention) stays in sync with mutations made here.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import {
  Boxes,
  Clock,
  Loader2,
  PackageSearch,
  Pause,
  Pencil,
  Play,
  Trash2,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useMarketplace } from '@/store/marketplace'
import type { ProductOfferDTO } from '@/lib/types'
import { formatNumber, formatUSD, timeAgo } from '@/lib/format'
import { SellOfferFormDialog, OfferStatusChip } from '../sell-offer-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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

/** GET /api/offers/mine row — the offer plus the catalog product it targets. */
export type MyOfferRow = ProductOfferDTO & {
  product: { id: string; title: string; status: string; slug: string | null; category: string; image: string | null }
}

export function SellerOffersTab({
  offers,
  loading,
  error,
  refetch,
}: {
  offers: MyOfferRow[]
  loading: boolean
  error: string | null
  /** Silent refetch — keeps the table mounted during mutations. */
  refetch: () => void
}) {
  const navigate = useMarketplace((s) => s.navigate)
  const [editing, setEditing] = useState<MyOfferRow | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  // ── Error state ──
  if (error) {
    return (
      <Card className="flex flex-col items-center border-dashed py-16 text-center">
        <Boxes size={40} className="text-muted-foreground/40" />
        <h2 className="mt-4 text-lg font-semibold">Couldn&rsquo;t load your offers</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" className="mt-5 rounded-full" onClick={refetch}>
          Try again
        </Button>
      </Card>
    )
  }

  const patchStatus = async (offer: MyOfferRow, status: 'ACTIVE' | 'PAUSED') => {
    setBusyId(offer.id)
    try {
      const res = await fetch(`/api/products/${offer.productId}/offers/${offer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Update failed', description: json.error, variant: 'destructive' })
        return
      }
      toast({
        title: status === 'PAUSED' ? 'Offer paused' : 'Offer resumed',
        description: status === 'PAUSED'
          ? 'Buyers no longer see this offer until you resume it.'
          : 'Your offer is visible to buyers again.',
      })
      refetch()
    } catch {
      toast({ title: 'Update failed', description: 'Network error', variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }

  const withdraw = async (offer: MyOfferRow) => {
    setBusyId(offer.id)
    try {
      const res = await fetch(`/api/products/${offer.productId}/offers/${offer.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Withdraw failed', description: json.error, variant: 'destructive' })
        return
      }
      toast({
        title: 'Offer withdrawn',
        description: 'You can re-attach it anytime from the product page.',
      })
      refetch()
    } catch {
      toast({ title: 'Withdraw failed', description: 'Network error', variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }

  // ── Loading skeletons ──
  if (loading && offers.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <div className="space-y-3 p-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  // ── Empty state ──
  if (offers.length === 0) {
    return (
      <Card className="flex flex-col items-center border-dashed py-16 text-center">
        <Boxes size={40} className="text-muted-foreground/40" />
        <p className="mt-4 font-semibold">No offers yet</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          You don&rsquo;t sell any other catalog products yet — open a product page and click
          &ldquo;Sell this product&rdquo;.
        </p>
        <Button className="mt-5 rounded-full" onClick={() => navigate('catalog')}>
          <PackageSearch size={15} className="mr-1.5" /> Browse the catalog
        </Button>
      </Card>
    )
  }

  const counts = {
    active: offers.filter((o) => o.status === 'ACTIVE').length,
    pending: offers.filter((o) => o.status === 'PENDING_REVIEW').length,
    paused: offers.filter((o) => o.status === 'PAUSED').length,
    rejected: offers.filter((o) => o.status === 'REJECTED').length,
  }

  return (
    <div className="space-y-4">
      {/* Attention summary */}
      {(counts.pending > 0 || counts.rejected > 0) && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950 dark:text-amber-200">
          <Clock size={16} className="shrink-0" aria-hidden />
          <p className="min-w-0 flex-1">
            {counts.pending > 0 && counts.rejected > 0
              ? `${counts.pending} offer${counts.pending === 1 ? '' : 's'} in review · ${counts.rejected} rejected`
              : counts.pending > 0
                ? `${counts.pending} offer${counts.pending === 1 ? ' is' : 's are'} awaiting platform review — they go live once approved.`
                : `${counts.rejected} offer${counts.rejected === 1 ? ' was' : 's were'} rejected by platform review.`}
          </p>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Product</th>
                  <th className="px-3 py-3 text-center font-medium">My price</th>
                  <th className="px-3 py-3 text-center font-medium">Stock</th>
                  <th className="px-3 py-3 text-center font-medium">MOQ</th>
                  <th className="px-3 py-3 text-center font-medium">Sold</th>
                  <th className="px-3 py-3 text-center font-medium">Status</th>
                  <th className="px-5 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {offers.map((o) => {
                  const busy = busyId === o.id
                  const canPause = o.status === 'ACTIVE' || o.status === 'PAUSED'
                  const canEdit = o.status !== 'REJECTED'
                  return (
                    <tr key={o.id} className="border-b transition-colors last:border-0 hover:bg-muted/30">
                      <td className="max-w-72 px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border bg-muted">
                            {o.product.image && (
                              <img src={o.product.image} alt="" loading="lazy" className="h-full w-full object-cover" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <button
                              className="line-clamp-2 text-left font-medium leading-4 hover:text-primary"
                              onClick={() => navigate('product', { productId: o.product.id })}
                            >
                              {o.product.title}
                            </button>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {o.product.category} · added {timeAgo(o.createdAt)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center font-semibold tabular-nums">{formatUSD(o.price)}</td>
                      <td className="px-3 py-3 text-center tabular-nums">
                        <span className={cn(o.stock === 0 ? 'font-bold text-destructive' : o.stock < 6 && 'font-semibold text-amber-600 dark:text-amber-400')}>
                          {formatNumber(o.stock)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center tabular-nums text-muted-foreground">
                        {o.moq != null ? formatNumber(o.moq) : '—'}
                      </td>
                      <td className="px-3 py-3 text-center tabular-nums text-muted-foreground">
                        {formatNumber(o.soldCount)}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <OfferStatusChip status={o.status} />
                          {o.status === 'REJECTED' && (
                            <span className="text-[10px] leading-tight text-muted-foreground">
                              Contact support for details
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1">
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              disabled={busy}
                              aria-label={`Edit offer on ${o.product.title}`}
                              onClick={() => {
                                setEditing(o)
                                setFormOpen(true)
                              }}
                            >
                              <Pencil size={14} />
                            </Button>
                          )}
                          {canPause && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              disabled={busy}
                              aria-label={o.status === 'ACTIVE' ? `Pause offer on ${o.product.title}` : `Resume offer on ${o.product.title}`}
                              onClick={() => void patchStatus(o, o.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE')}
                            >
                              {busy ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : o.status === 'ACTIVE' ? (
                                <Pause size={14} />
                              ) : (
                                <Play size={14} />
                              )}
                            </Button>
                          )}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                disabled={busy}
                                aria-label={`Withdraw offer on ${o.product.title}`}
                              >
                                <Trash2 size={14} />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Withdraw your offer on &ldquo;{o.product.title}&rdquo;?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Buyers will no longer see you as a seller of this product. You can
                                  re-attach an offer anytime from the product page.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Keep offer</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => void withdraw(o)}
                                >
                                  Withdraw
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t px-5 py-3 text-xs text-muted-foreground">
            {counts.active} active · {counts.pending} in review · {counts.paused} paused ·{' '}
            {counts.rejected} rejected — offers are your own price &amp; stock on another
            seller&rsquo;s catalog listing.
          </p>
        </CardContent>
      </Card>

      <SellOfferFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) setEditing(null)
        }}
        productId={editing?.productId ?? ''}
        productTitle={editing?.product.title}
        editing={editing}
        onSaved={refetch}
      />
    </div>
  )
}
