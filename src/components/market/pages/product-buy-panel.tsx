'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Building2, Check, PackageCheck, ShoppingCart, Truck, Zap } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useMarketplace } from '@/store/marketplace'
import type { ProductDTO, ProductOfferSummaryDTO, ProductVariantDTO } from '@/lib/types'
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

/**
 * Buy panel island for the real /market/product/[id] page
 * (pagedesign.md Phase 2). This is the add-to-cart client island:
 * it imports the SAME global zustand store the SPA cart uses, so items
 * added here land in the cart the market header badge / cart drawer /
 * SPA checkout all read (cart persists in localStorage — works on any
 * route). Ports the SPA product-view buy logic (variant resolution,
 * stock guard, toast feedback) and tracks the product as recently viewed.
 */
export function ProductBuyPanel({ product, variants }: { product: ProductDTO; variants: ProductVariantDTO[] }) {
  const addToCart = useMarketplace((s) => s.addToCart)
  const setCartOpen = useMarketplace((s) => s.setCartOpen)
  const trackView = useMarketplace((s) => s.trackView)
  const [quantity, setQuantity] = useState(1)
  const [variantId, setVariantId] = useState<string>(variants.length === 1 ? variants[0]!.id : '')

  // ── Multi-vendor offers (B2B2C shared catalog) ──────────────────────────
  // Company offers ride on the product DTO (cheapest first); the selected one
  // drives price/stock/MOQ here and scopes the cart line to that company.
  const offers = useMemo(() => product.offers ?? [], [product])
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null)
  const selectedOffer: ProductOfferSummaryDTO | null = useMemo(
    () => offers.find((o) => o.id === selectedOfferId) ?? offers[0] ?? null,
    [offers, selectedOfferId]
  )
  const activeOfferId = selectedOffer?.id ?? null

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

  const effectivePrice = selectedOffer ? selectedOffer.price : (selectedVariant?.price ?? product.price)
  const effectiveCompareAt = selectedOffer ? null : (selectedVariant?.compareAtPrice ?? product.compareAtPrice)
  const effectiveStock = selectedOffer ? selectedOffer.stock : (selectedVariant ? selectedVariant.stock : product.stock)
  const effectiveSku = selectedVariant?.sku ?? product.sku ?? null
  const discount = discountPercent(effectivePrice, effectiveCompareAt)

  const handleAddToCart = (openDrawer: boolean) => {
    const res = addToCart(product, quantity, selectedVariant, selectedOffer)
    if (res.ok) {
      toast({
        title: 'Added to cart',
        description: `${quantity} × ${product.title}${selectedVariant ? ` (${selectedVariant.name})` : ''}${
          selectedOffer ? ` — from ${selectedOffer.sellerOrgName ?? selectedOffer.storeName ?? 'the selected seller'}` : ''
        }`,
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
      {/* Price */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-3xl font-bold tracking-tight text-bh-navy">{formatUSD(effectivePrice)}</span>
        {effectiveCompareAt && (
          <span className="text-sm text-bh-muted line-through">{formatUSD(effectiveCompareAt)}</span>
        )}
        {discount !== null && (
          <Badge className="rounded-full bg-red-500/95 px-2 text-[11px] font-bold text-white hover:bg-red-500">
            -{discount}%
          </Badge>
        )}
      </div>

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

      {/* ── Multi-vendor offers selector (B2B2C shared catalog) ──
          Company offers on this product, cheapest first; the chosen one drives
          the price/stock above and scopes the cart line to that company. */}
      {offers.length > 0 && (
        <div className="mt-4" data-testid="offers-panel">
          <p className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-bh-muted">
            <span className="flex items-center gap-1.5">
              <Building2 size={13} className="text-bh-gold-dark" /> Offers from {offers.length} seller
              {offers.length === 1 ? '' : 's'}
            </span>
            {product.minOfferPrice != null && (
              <span className="font-normal normal-case tracking-normal">from {formatUSD(product.minOfferPrice)}</span>
            )}
          </p>
          <div className="mt-2 space-y-2" role="radiogroup" aria-label="Choose a seller">
            {offers.map((o) => {
              const active = o.id === activeOfferId
              const sellerName = o.sellerOrgName ?? o.storeName ?? 'Marketplace seller'
              return (
                <motion.button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setSelectedOfferId(o.id)}
                  initial={false}
                  animate={{ scale: active ? 1 : 0.995 }}
                  transition={{ duration: 0.15 }}
                  className={cn(
                    'block w-full rounded-xl border p-3 text-left transition-all',
                    active
                      ? 'border-bh-gold bg-bh-gold-pale/70 ring-1 ring-bh-gold/40'
                      : 'border-bh-border-dark bg-bh-card hover:border-bh-gold/50 hover:bg-bh-soft-blue/40'
                  )}
                >
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                          active ? 'bg-bh-navy text-bh-gold' : 'bg-bh-soft-blue text-bh-navy'
                        )}
                      >
                        <Building2 size={16} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-bh-navy" title={sellerName}>
                          {sellerName}
                          {active && <Check size={13} className="ml-1.5 inline text-bh-gold-dark" aria-hidden />}
                        </span>
                        <span className="block truncate text-xs text-bh-muted">
                          {o.storeName ? `Ships from ${o.storeName}` : 'Verified company'}
                          {o.processingDays != null ? ` · ships in ${o.processingDays}d` : ''}
                        </span>
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-bold text-bh-navy" data-testid="offer-price">
                        {formatUSD(o.price)}
                      </span>
                      <span
                        className={cn(
                          'block text-[11px]',
                          o.stock <= 0 ? 'font-semibold text-destructive' : o.stock <= 5 ? 'font-semibold text-bh-gold-dark' : 'text-bh-muted'
                        )}
                      >
                        {o.stock <= 0 ? 'Out of stock' : `${o.stock} in stock`}
                      </span>
                    </span>
                  </span>
                  {(o.freeShipping || (o.moq != null && o.moq > 1) || (o.shippingFee != null && o.shippingFee > 0)) && (
                    <span className="mt-2 flex flex-wrap gap-1.5">
                      {o.freeShipping && (
                        <Badge className="rounded-full border-0 bg-emerald-100 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          Free shipping
                        </Badge>
                      )}
                      {!o.freeShipping && o.shippingFee != null && o.shippingFee > 0 && (
                        <Badge className="rounded-full border-0 bg-bh-soft-blue text-[10px] font-bold text-bh-navy">
                          {formatUSD(o.shippingFee)} shipping
                        </Badge>
                      )}
                      {o.moq != null && o.moq > 1 && (
                        <Badge className="rounded-full border-0 bg-bh-bg-gold text-[10px] font-bold text-bh-gold-dark">
                          Min. {o.moq} units
                        </Badge>
                      )}
                    </span>
                  )}
                </motion.button>
              )
            })}
          </div>
        </div>
      )}

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
          disabled={effectiveStock === 0 || variantPending}
          onClick={() => handleAddToCart(false)}
        >
          <ShoppingCart size={17} className="mr-2" /> Add to cart
        </Button>
        <Button
          size="lg"
          variant="secondary"
          className="h-12 rounded-xl border text-base sm:px-8"
          disabled={effectiveStock === 0 || variantPending}
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

      {/* Shipping / fulfilment facts — offer-aware while a company offer is selected */}
      <div className="mt-5 space-y-2 border-t border-bh-border pt-4 text-sm">
        {selectedOffer && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-bh-subtle">Sold &amp; shipped by</span>
            <span className="text-right font-medium">
              {selectedOffer.sellerOrgName ?? selectedOffer.storeName ?? 'Marketplace seller'}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-bh-subtle">
            <Truck size={15} className="text-bh-gold-dark" /> Shipping
          </span>
          <span
            className={cn(
              'text-right font-medium',
              (selectedOffer ? selectedOffer.freeShipping : product.freeShipping) && 'text-bh-gold-dark'
            )}
          >
            {selectedOffer
              ? selectedOffer.freeShipping
                ? 'Free shipping'
                : selectedOffer.shippingFee != null
                  ? `${formatUSD(selectedOffer.shippingFee)} flat rate`
                  : 'Calculated at checkout'
              : product.freeShipping
                ? 'Free shipping'
                : product.shippingFee != null
                  ? `${formatUSD(product.shippingFee)} flat rate`
                  : 'Calculated at checkout'}
          </span>
        </div>
        {(selectedOffer ? selectedOffer.processingDays : product.processingDays) != null && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-bh-subtle">{selectedOffer ? 'Lead time' : 'Handling time'}</span>
            <span className="font-medium">
              {(selectedOffer ? selectedOffer.processingDays : product.processingDays) === 1
                ? '1 business day'
                : `${selectedOffer ? selectedOffer.processingDays : product.processingDays} business days`}
            </span>
          </div>
        )}
        {(selectedOffer ? selectedOffer.moq : product.moq) != null && (selectedOffer ? selectedOffer.moq : product.moq)! > 1 && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-bh-subtle">Minimum order (B2B)</span>
            <span className="font-medium">{selectedOffer ? selectedOffer.moq : product.moq} units</span>
          </div>
        )}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-bh-muted">
        Secure checkout · Cart follows you across Vendora (saved on this device)
      </p>
    </div>
  )
}
