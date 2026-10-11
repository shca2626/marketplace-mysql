'use client'

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 4 (SELLER) — "Sell this product" on a product page.
// The multi-vendor offer layer: any verified seller can attach their own
// price/stock/terms to another seller's (or the platform's) catalog listing.
// This file owns every seller-side offer surface so the product page stays
// a thin integration (single <SellOfferPanel /> block):
//   • SellOfferFormDialog — create/edit an offer (POST/PATCH, review routing)
//   • SellOfferPanel     — "Sell this product" CTA or the "Your offer" card
// The seller console's "My Offers" tab (seller/offers-tab.tsx) reuses the
// same form dialog for edits.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import {
  Clock,
  Loader2,
  Pause,
  Pencil,
  Play,
  ShieldAlert,
  Store,
  Trash2,
  Truck,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useMarketplace } from '@/store/marketplace'
import type { ProductDTO, ProductOfferDTO } from '@/lib/types'
import { formatNumber, formatUSD } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

// ── Status chips (warm palette — amber pending, emerald active, rose rejected) ──

export const OFFER_STATUS_META: Record<string, { label: string; chip: string }> = {
  PENDING_REVIEW: {
    label: 'In review',
    chip: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  },
  ACTIVE: {
    label: 'Active',
    chip: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  },
  PAUSED: {
    label: 'Paused',
    chip: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
  },
  REJECTED: {
    label: 'Rejected',
    chip: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  },
}

export function OfferStatusChip({ status, className }: { status: string; className?: string }) {
  const meta = OFFER_STATUS_META[status]
  return (
    <Badge
      variant="secondary"
      className={cn(
        'shrink-0 rounded-full border-0 text-[11px] font-semibold',
        meta?.chip ?? 'bg-muted text-muted-foreground',
        className
      )}
    >
      {status === 'PENDING_REVIEW' && <Clock size={11} className="mr-1" aria-hidden />}
      {meta?.label ?? status}
    </Badge>
  )
}

// ── Offer form state ─────────────────────────────────────────────────────────

interface OfferFormValues {
  price: string
  stock: string
  moq: string
  sku: string
  freeShipping: boolean
  shippingFee: string
  processingDays: string
  leadTimeNote: string
}

const emptyOfferForm: OfferFormValues = {
  price: '',
  stock: '10',
  moq: '',
  sku: '',
  freeShipping: false,
  shippingFee: '',
  processingDays: '',
  leadTimeNote: '',
}

/** Parse the shared form fields into the JSON the offer API expects. */
function offerPayload(f: OfferFormValues) {
  return {
    price: parseFloat(f.price),
    stock: parseInt(f.stock || '0', 10) || 0,
    moq: f.moq ? parseInt(f.moq, 10) : null,
    sku: f.sku.trim() || null,
    freeShipping: f.freeShipping,
    shippingFee: f.freeShipping || !f.shippingFee ? null : parseFloat(f.shippingFee),
    processingDays: f.processingDays ? parseInt(f.processingDays, 10) : null,
    leadTimeNote: f.leadTimeNote.trim() || null,
  }
}

// ── Offer create/edit dialog ─────────────────────────────────────────────────

/**
 * Create or edit the seller's offer on a catalog product.
 * Create → POST /api/products/[id]/offers (KYC L2 guarded, one per product).
 * Edit   → PATCH /api/products/[id]/offers/[offerId] (PENDING_REVIEW/REJECTED
 *          offers are protected server-side — errors surface verbatim).
 */
export function SellOfferFormDialog({
  open,
  onOpenChange,
  productId,
  productTitle,
  editing,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  productId: string
  productTitle?: string | null
  /** null = create mode (attach a new offer). */
  editing: ProductOfferDTO | null
  /** Called after a successful save — the parent refreshes its data. */
  onSaved: () => void
}) {
  const navigate = useMarketplace((s) => s.navigate)
  const [form, setForm] = useState<OfferFormValues>(emptyOfferForm)
  const [saving, setSaving] = useState(false)
  // KYC gate (403 "Verify your identity…") — persistent inline callout with a
  // way out, same pattern as the product form's publish gate.
  const [kycBlocked, setKycBlocked] = useState<string | null>(null)

  // Hydrate on open — Radix unmounts closed dialogs, so state resets per open.
  useEffect(() => {
    if (!open) return
    setKycBlocked(null)
    if (editing) {
      setForm({
        price: String(editing.price),
        stock: String(editing.stock),
        moq: editing.moq != null ? String(editing.moq) : '',
        sku: editing.sku ?? '',
        freeShipping: editing.freeShipping,
        shippingFee: editing.shippingFee != null ? String(editing.shippingFee) : '',
        processingDays: editing.processingDays != null ? String(editing.processingDays) : '',
        leadTimeNote: editing.leadTimeNote ?? '',
      })
    } else {
      setForm(emptyOfferForm)
    }
  }, [open, editing])

  const set =
    (key: keyof OfferFormValues) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }))

  const validate = (): string | null => {
    const price = parseFloat(form.price)
    if (!price || price <= 0) return 'Enter a valid price per unit'
    const stock = parseInt(form.stock || '0', 10)
    if (Number.isNaN(stock) || stock < 0) return 'Enter a valid stock quantity'
    if (form.moq && (Number.isNaN(parseInt(form.moq, 10)) || parseInt(form.moq, 10) < 1))
      return 'Minimum order quantity must be a whole number ≥ 1'
    if (!form.freeShipping && form.shippingFee) {
      const fee = parseFloat(form.shippingFee)
      if (Number.isNaN(fee) || fee < 0) return 'Enter a valid shipping fee (or switch to free shipping)'
    }
    if (form.processingDays) {
      const days = parseInt(form.processingDays, 10)
      if (Number.isNaN(days) || days < 1 || days > 60) return 'Processing time must be 1–60 business days'
    }
    if (form.leadTimeNote.length > 200) return 'Lead time note must be 200 characters or fewer'
    return null
  }

  const submit = async () => {
    const error = validate()
    if (error) {
      toast({ title: 'Cannot save yet', description: error, variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const res = await fetch(
        editing ? `/api/products/${productId}/offers/${editing.id}` : `/api/products/${productId}/offers`,
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(offerPayload(form)),
        }
      )
      const json = await res.json()
      if (!res.ok) {
        // KYC gate — keep the reason on screen with a way out.
        if (
          res.status === 403 &&
          typeof json.error === 'string' &&
          json.error.toLowerCase().includes('verify your identity')
        ) {
          setKycBlocked(json.error)
          toast({
            title: 'Verification required',
            description: 'Finish identity verification (KYC level 2) to sell catalog products — details below.',
            variant: 'destructive',
          })
          return
        }
        toast({ title: 'Could not save offer', description: json.error, variant: 'destructive' })
        return
      }
      // reviewQueued → the amber path, never the generic success toast.
      if (json.reviewQueued) {
        toast({
          title: 'Submitted for platform review',
          description: json.message ?? 'Your offer goes live once approved.',
        })
      } else {
        toast({
          title: editing ? 'Offer updated' : 'Offer published',
          description: json.offer ? `${formatUSD(json.offer.price)} · ${formatNumber(json.offer.stock)} in stock` : undefined,
        })
      }
      onOpenChange(false)
      onSaved()
    } catch {
      toast({ title: 'Could not save offer', description: 'Network error', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto scrollbar-thin sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit your offer' : 'Sell this product'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Update your price, stock and selling terms on this catalog product.'
              : 'Set your price, stock and selling terms — buyers see your offer alongside the listing.'}
            {productTitle ? (
              <>
                {' '}
                <span className="font-medium text-foreground">“{productTitle}”</span>
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="o-price">
                Price ($)<span className="text-rose-600"> *</span>
              </Label>
              <Input
                id="o-price"
                type="number"
                min="0.01"
                step="0.01"
                value={form.price}
                onChange={set('price')}
                placeholder="e.g. 24.50"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="o-stock">
                Stock<span className="text-rose-600"> *</span>
              </Label>
              <Input
                id="o-stock"
                type="number"
                min="0"
                value={form.stock}
                onChange={set('stock')}
                placeholder="e.g. 40"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="o-moq">
                Min. order <span className="text-xs text-muted-foreground">(opt.)</span>
              </Label>
              <Input
                id="o-moq"
                type="number"
                min="1"
                value={form.moq}
                onChange={set('moq')}
                placeholder="e.g. 5"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="o-sku">
              SKU <span className="text-xs text-muted-foreground">(opt.)</span>
            </Label>
            <Input
              id="o-sku"
              value={form.sku}
              onChange={set('sku')}
              maxLength={64}
              placeholder="Your internal SKU for this offer"
            />
          </div>

          <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-muted/30 px-4 py-3">
            <div className="flex items-center gap-2">
              <Switch
                id="o-free"
                checked={form.freeShipping}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, freeShipping: checked }))}
                aria-label="Free shipping"
              />
              <Label htmlFor="o-free" className="cursor-pointer">
                Free shipping
              </Label>
            </div>
            <div className={cn('flex items-center gap-2', form.freeShipping && 'opacity-50')}>
              <Label htmlFor="o-fee">Shipping fee ($)</Label>
              <Input
                id="o-fee"
                type="number"
                min="0"
                step="0.01"
                value={form.shippingFee}
                onChange={set('shippingFee')}
                disabled={form.freeShipping}
                placeholder="3.50"
                className="h-9 w-24"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="o-processing">
                Processing time <span className="text-xs text-muted-foreground">(business days)</span>
              </Label>
              <Input
                id="o-processing"
                type="number"
                min="1"
                max="60"
                value={form.processingDays}
                onChange={set('processingDays')}
                placeholder="e.g. 2"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="o-lead">
                Lead time note <span className="text-xs text-muted-foreground">(opt.)</span>
              </Label>
              <Input
                id="o-lead"
                value={form.leadTimeNote}
                onChange={set('leadTimeNote')}
                maxLength={200}
                placeholder="e.g. Ships from Sana'a warehouse"
              />
            </div>
          </div>

          <p className="rounded-lg bg-muted/40 px-3.5 py-2.5 text-xs leading-relaxed text-muted-foreground">
            One offer per product — you can edit, pause or withdraw it anytime from your seller
            console. New sellers&rsquo; offers go through a quick platform review before going live.
          </p>
        </div>

        {/* KYC gate — persistent inline callout with a way out */}
        {kycBlocked && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950 dark:text-amber-200"
          >
            <ShieldAlert size={18} className="shrink-0" aria-hidden />
            <p className="min-w-0 flex-1 text-sm font-medium">{kycBlocked}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-lg border-amber-400 bg-transparent text-amber-900 hover:bg-amber-100 hover:text-amber-900 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900"
              onClick={() => {
                onOpenChange(false)
                navigate('account', { accountTab: 'verification' })
              }}
            >
              Go to verification
            </Button>
          </div>
        )}

        <DialogFooter className="gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" className="min-w-28" disabled={saving} onClick={() => void submit()}>
            {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}
            {editing ? 'Save offer' : 'Publish my offer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Product page panel ────────────────────────────────────────────────────────

/**
 * The seller-side block on a product page. Renders nothing when the viewer
 * can't offer and has no offer. Otherwise either the "Sell this product"
 * CTA or the "Your offer" management card (status, terms, edit / pause /
 * resume / withdraw).
 */
export function SellOfferPanel({
  product,
  myOffer,
  viewerCanOffer,
  onChanged,
}: {
  product: ProductDTO
  myOffer: ProductOfferDTO | null
  viewerCanOffer: boolean
  /** Refresh the page detail payload after any offer mutation. */
  onChanged: () => void
}) {
  const [formOpen, setFormOpen] = useState(false)
  const [busy, setBusy] = useState<'pause' | 'resume' | 'withdraw' | null>(null)

  if (!viewerCanOffer && !myOffer) return null

  const patchStatus = async (offer: ProductOfferDTO, status: 'ACTIVE' | 'PAUSED') => {
    setBusy(status === 'ACTIVE' ? 'resume' : 'pause')
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
          ? 'Buyers no longer see your offer until you resume it.'
          : 'Your offer is visible to buyers again.',
      })
      onChanged()
    } catch {
      toast({ title: 'Update failed', description: 'Network error', variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }

  const withdraw = async (offer: ProductOfferDTO) => {
    setBusy('withdraw')
    try {
      const res = await fetch(`/api/products/${offer.productId}/offers/${offer.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Withdraw failed', description: json.error, variant: 'destructive' })
        return
      }
      toast({ title: 'Offer withdrawn', description: 'You can re-attach it anytime with “Sell this product”.' })
      onChanged()
    } catch {
      toast({ title: 'Withdraw failed', description: 'Network error', variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mt-7">
      {/* ── CTA: no offer yet ── */}
      {viewerCanOffer && !myOffer && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-emerald-300 bg-emerald-50/60 p-5 dark:border-emerald-900/60 dark:bg-emerald-950/30">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
            <Store size={18} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-bh-navy dark:text-emerald-100">Do you sell this product?</p>
            <p className="mt-0.5 text-xs leading-relaxed text-bh-muted dark:text-emerald-200/70">
              Attach your price, stock and terms — buyers see your offer alongside this listing.
            </p>
          </div>
          <Button
            type="button"
            className="ml-auto shrink-0 rounded-xl bg-emerald-600 font-bold text-white hover:bg-emerald-700"
            onClick={() => setFormOpen(true)}
          >
            <Store size={15} className="mr-1.5" /> Sell this product
          </Button>
        </div>
      )}

      {/* ── "Your offer" management card ── */}
      {myOffer && (
        <div className="rounded-2xl border border-bh-border bg-bh-card p-5 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                <Store size={16} aria-hidden />
              </span>
              <div>
                <p className="text-sm font-bold text-bh-navy">Your offer on this product</p>
                <div className="mt-0.5">
                  <OfferStatusChip status={myOffer.status} />
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-extrabold tabular-nums tracking-tight text-bh-navy">
                {formatUSD(myOffer.price)}
              </p>
              <p className="text-[11px] text-bh-muted">per unit</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Stock', value: formatNumber(myOffer.stock) },
              { label: 'Min. order', value: myOffer.moq ? formatNumber(myOffer.moq) : '—' },
              {
                label: 'Shipping',
                value: myOffer.freeShipping
                  ? 'Free'
                  : myOffer.shippingFee != null
                    ? formatUSD(myOffer.shippingFee)
                    : '—',
              },
              {
                label: 'Processing',
                value: myOffer.processingDays != null ? `${myOffer.processingDays}d` : '—',
              },
            ].map((cell) => (
              <div key={cell.label} className="rounded-lg bg-bh-soft-blue/60 px-3 py-2.5 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-bh-muted">{cell.label}</p>
                <p className="mt-0.5 text-sm font-bold tabular-nums text-bh-ink">{cell.value}</p>
              </div>
            ))}
          </div>

          {myOffer.leadTimeNote && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-bh-muted">
              <Truck size={13} className="shrink-0" aria-hidden /> {myOffer.leadTimeNote}
            </p>
          )}

          {myOffer.status === 'PENDING_REVIEW' && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              Awaiting platform review — your offer goes live once approved. You can keep editing it here.
            </p>
          )}
          {myOffer.status === 'REJECTED' && (
            <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:bg-rose-950 dark:text-rose-300">
              This offer was rejected by platform review — contact support for details.
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {myOffer.status !== 'REJECTED' && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 rounded-lg text-xs"
                onClick={() => setFormOpen(true)}
              >
                <Pencil size={13} className="mr-1.5" /> Edit
              </Button>
            )}
            {(myOffer.status === 'ACTIVE' || myOffer.status === 'PAUSED') && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 rounded-lg text-xs"
                disabled={busy !== null}
                onClick={() => void patchStatus(myOffer, myOffer.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE')}
              >
                {busy === (myOffer.status === 'ACTIVE' ? 'pause' : 'resume') ? (
                  <Loader2 size={13} className="mr-1.5 animate-spin" />
                ) : myOffer.status === 'ACTIVE' ? (
                  <Pause size={13} className="mr-1.5" />
                ) : (
                  <Play size={13} className="mr-1.5" />
                )}
                {myOffer.status === 'ACTIVE' ? 'Pause' : 'Resume'}
              </Button>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-lg text-xs text-muted-foreground hover:text-destructive"
                  disabled={busy !== null}
                >
                  {busy === 'withdraw' ? (
                    <Loader2 size={13} className="mr-1.5 animate-spin" />
                  ) : (
                    <Trash2 size={13} className="mr-1.5" />
                  )}
                  Withdraw
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Withdraw your offer?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Buyers will no longer see you as a seller of this product. You can re-attach
                    an offer anytime — your offer history stays in the platform audit trail.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep offer</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => void withdraw(myOffer)}
                  >
                    Withdraw
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      )}

      <SellOfferFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        productId={product.id}
        productTitle={product.title}
        editing={myOffer ?? null}
        onSaved={onChanged}
      />
    </div>
  )
}

/** Small loading placeholder for the panel while the detail payload loads. */
export function SellOfferPanelSkeleton() {
  return <Skeleton className="mt-7 h-32 w-full rounded-2xl" />
}
