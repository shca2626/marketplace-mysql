'use client'

import { useEffect, useMemo, useState } from 'react'
import { PackageCheck, ShoppingCart, Store, Truck, Zap } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useMarketplace } from '@/store/marketplace'
import type { CartOfferInput, ProductDTO, ProductVariantDTO } from '@/lib/types'
import { discountPercent, formatUSD } from '@/lib/format'
import { QuantityInput } from '@/components/marketplace/quantity-input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

/** 9.1: vendor offers render in the buy panel for curated records —
 * CartOfferInput accepts both ProductOfferDTO (SPA) and the server-rendered
 * PublicOfferRow (public page). */
export type BuyPanelOffer = CartOfferInput & { status?: string }

/**
 * Buy panel island for the real /market/product/[id] page
 * (pagedesign.md Phase 2). This is the add-to-cart client island:
 * it imports the SAME global zustand store the SPA cart uses, so items
 * added here land in the cart the market header badge / cart drawer /
 * SPA checkout all read (cart persists in localStorage — works on any
 * route). Ports the SPA product-view buy logic (variant resolution,
 * stock guard, toast feedback) and tracks the product as recently viewed.
 *
 * 9.1 — curated catalog records (product.sellerId null) are purchasable ONLY
 * via a vendor's ACTIVE offer: the panel renders a vendor picker instead of
 * the listing price/stock, and add-to-cart always carries the chosen offer.
 */
export function ProductBuyPanel({
  product,
  variants,
  offers = [],
}: {
  product: ProductDTO
  variants: ProductVariantDTO[]
  offers?: BuyPanelOffer[]
}) {
  const addToCart = useMarketplace((s) => s.addToCart)
  const setCartOpen = useMarketplace((s) => s.setCartOpen)
  const trackView = useMarketplace((s) => s.trackView)
  const [quantity, setQuantity] = useState(1)
  const [variantId, setVariantId] = useState<string>(variants.length === 1 ? variants[0]!.id : '')
  const isCurated = product.sellerId == null
  const liveOffers = useMemo(
    () => offers.filter((o) => (o.status ? o.status === 'ACTIVE' : true) && o.stock > 0),
    [offers]
  )
  const [offerId, setOfferId] = useState<string>(liveOffers.length === 1 ? liveOffers[0]!.id : '')
  const selectedOffer = useMemo(() => liveOffers.find((o) => o.id === offerId) ?? null, [liveOffers, offerId])

  // Recently viewed (global store — same list the SPA home page shows).
  // IMPORTANT: wait for the persisted state to rehydrate first. Effects run
  // children-first, so firing this set() before the shell's rehydrate() would
  // make zustand-persist write the DEFAULT (empty) state over the stored
  // cart — the SPA avoids this by tracking only after its API fetch resolves.
  useEffect(() => {
    const track = () => trackView(product.id)
    if (useMarketplace.persist.hasHydrated()) {
      track()
      return
    }
    return useMarketplace.persist.onFinishHydration(track)
  }, [product.id, trackView])

  const selectedVariant = useMemo(
    () => variants.find((v) => v.id === variantId) ?? null,
    [variants, variantId]
  )
  const hasVariants = variants.length > 0
  const variantPending = hasVariants && !selectedVariant
  // 9.1: curated — the chosen vendor offer is the price/stock authority.
  const offerPending = isCurated && !selectedOffer

  const effectivePrice = selectedOffer?.price ?? selectedVariant?.price ?? product.price
  const effectiveCompareAt = selectedOffer ? null : selectedVariant?.compareAtPrice ?? product.compareAtPrice
  const effectiveStock = selectedOffer ? selectedOffer.stock : selectedVariant ? selectedVariant.stock : product.stock
  const effectiveSku = selectedOffer?.sku ?? selectedVariant?.sku ?? product.sku ?? null
  const discount = discountPercent(effectivePrice, effectiveCompareAt)

  const handleAddToCart = (openDrawer: boolean) => {
    const res = addToCart(product, quantity, selectedVariant, selectedOffer)
    if (res.ok) {
      toast({
        title: 'Added to cart',
        description: `${quantity} × ${product.title}${selectedOffer ? ` (${selectedOffer.seller?.storeName || selectedOffer.seller?.name || 'vendor offer'})` : selectedVariant ? ` (${selectedVariant.name})` : ''}`,
      })
      if (openDrawer) setCartOpen(true)
    } else {
      toast({ title: 'Cannot add to cart', description: res.message, variant: 'destructive' })
    }
  }

  const handleBuyNow = () => {
    // Outside the SPA a full navigation boots /market on the checkout view —
    // the middleware leaves ?view=checkout untouched by design.
    const res = addToCart(product, quantity, selectedVariant, selectedOffer)
    if (res.ok) window.location.assign('/market?view=checkout')
    else toast({ title: 'Cannot add to cart', description: res.message, variant: 'destructive' })
  }

  return (
    <div className="rounded-2xl border border-bh-border bg-bh-card p-5 shadow-card sm:p-6">
      {/* Price — 9.1: curated shows "From <cheapest offer>" (reference list
          price is display-only; the vendor offer is the buy price) */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {isCurated ? (
          <>
            <span className="text-3xl font-bold tracking-tight text-bh-navy">
              {liveOffers.length > 0 ? `From ${formatUSD(Math.min(...liveOffers.map((o) => o.price)))}` : formatUSD(product.price)}
            </span>
            <span className="text-xs font-medium uppercase tracking-wide text-bh-muted">catalog list price</span>
          </>
        ) : (
          <span className="text-3xl font-bold tracking-tight text-bh-navy">{formatUSD(effectivePrice)}</span>
        )}
        {!isCurated && effectiveCompareAt && (
          <span className="text-sm text-bh-muted line-through">{formatUSD(effectiveCompareAt)}</span>
        )}
        {!isCurated && discount !== null && (
          <Badge className="rounded-full bg-red-500/95 px-2 text-[11px] font-bold text-white hover:bg-red-500">
            -{discount}%
          </Badge>
        )}
      </div>

      {/* 9.1: curated — vendor offer picker replaces the listing price/stock */}
      {isCurated && (
        <div className="mt-3 rounded-xl border border-bh-gold/30 bg-bh-bg-gold/60 p-3">
          <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-bh-gold-dark">
            <Store size={13} /> Vendora catalog record — buy from a vendor
          </p>
          {liveOffers.length > 0 ? (
            <Select value={offerId} onValueChange={setOfferId}>
              <SelectTrigger aria-label="Choose a vendor offer" className="w-full bg-background">
                <SelectValue placeholder="Choose a vendor…" />
              </SelectTrigger>
              <SelectContent>
                {liveOffers.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.seller?.storeName || o.seller?.name || 'Vendor'} — {formatUSD(o.price)}
                    {o.stock <= 5 ? ` (only ${o.stock} left)` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm leading-relaxed text-bh-muted">
              No vendor offer is live yet — this record is being sourced. Check back soon or request a quote.
            </p>
          )}
        </div>
      )}

      {/* Stock / SKU */}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        {effectiveStock === 0 ? (
          <span className="font-medium text-destructive">Sold out</span>
        ) : effectiveStock <= 5 ? (
          <span className="font-medium text-bh-gold-dark">
            Selling fast — only {effectiveStock} left
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-bh-subtle">
            <PackageCheck size={14} className="text-bh-gold-dark" /> In stock ({effectiveStock})
          </span>
        )}
        {effectiveSku && (
          <>
            <span aria-hidden className="text-bh-faded">·</span>
            <span className="text-bh-muted">
              SKU <span className="font-mono text-xs">{effectiveSku}</span>
            </span>
          </>
        )}
      </div>

      {/* Variant selector */}
      {hasVariants && (
        <div className="mt-4">
          <label
            id="variant-label"
            className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-bh-muted"
          >
            Option
          </label>
          <Select value={variantId} onValueChange={setVariantId}>
            <SelectTrigger aria-labelledby="variant-label" className="w-full">
              <SelectValue placeholder="Choose an option…" />
            </SelectTrigger>
            <SelectContent>
              {variants.map((v) => (
                <SelectItem key={v.id} value={v.id} disabled={v.stock === 0}>
                  {v.name}
                  {v.price != null ? ` — ${formatUSD(v.price)}` : ''}
                  {v.stock === 0 ? ' (sold out)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Quantity + actions */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <QuantityInput value={quantity} onChange={setQuantity} max={Math.max(1, effectiveStock)} />
        <Button
          size="lg"
          className="h-12 flex-1 rounded-xl text-base sm:flex-none sm:px-8"
          disabled={effectiveStock === 0 || variantPending || offerPending}
          onClick={() => handleAddToCart(false)}
        >
          <ShoppingCart size={17} className="mr-2" /> Add to cart
        </Button>
        <Button
          size="lg"
          variant="secondary"
          className="h-12 rounded-xl border text-base sm:px-8"
          disabled={effectiveStock === 0 || variantPending || offerPending}
          onClick={handleBuyNow}
        >
          <Zap size={16} className="mr-2" /> Buy now
        </Button>
      </div>
      {variantPending && (
        <p className="mt-2 text-xs font-medium text-bh-gold-dark">
          Choose an option to add this item to your cart.
        </p>
      )}
      {offerPending && (
        <p className="mt-2 text-xs font-medium text-bh-gold-dark">
          Choose a vendor offer to purchase this catalog item.
        </p>
      )}

      {/* Shipping / fulfilment facts */}
      <div className="mt-5 space-y-2 border-t border-bh-border pt-4 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-bh-subtle">
            <Truck size={15} className="text-bh-gold-dark" /> Shipping
          </span>
          <span className={cn('text-right font-medium', product.freeShipping && 'text-bh-gold-dark')}>
            {product.freeShipping
              ? 'Free shipping'
              : product.shippingFee != null
                ? `${formatUSD(product.shippingFee)} flat rate`
                : 'Calculated at checkout'}
          </span>
        </div>
        {product.processingDays != null && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-bh-subtle">Handling time</span>
            <span className="font-medium">
              {product.processingDays === 1 ? '1 business day' : `${product.processingDays} business days`}
            </span>
          </div>
        )}
        {product.moq != null && product.moq > 1 && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-bh-subtle">Minimum order (B2B)</span>
            <span className="font-medium">{product.moq} units</span>
          </div>
        )}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-bh-muted">
        Secure checkout · Cart follows you across Vendora (saved on this device)
      </p>
    </div>
  )
}
