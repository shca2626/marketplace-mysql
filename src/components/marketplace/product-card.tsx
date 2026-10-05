'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Heart, ShoppingCart, Store } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useMarketplace } from '@/store/marketplace'
import type { ProductDTO } from '@/lib/types'
import { discountPercent, formatNumber, formatUSD } from '@/lib/format'
import { StarRating } from './star-rating'
// Phase 7.2 — approximate display-currency conversion (YER / SAR)
import { Card, CardFooter, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export function ProductCard({ product, index = 0 }: { product: ProductDTO; index?: number }) {
  const navigate = useMarketplace((s) => s.navigate)
  const addToCart = useMarketplace((s) => s.addToCart)
  const user = useMarketplace((s) => s.user)
  const openAuth = useMarketplace((s) => s.openAuth)
  const spaActive = useMarketplace((s) => s.spaActive)
  const [favorited, setFavorited] = useState(Boolean(product.favorited))
  const discount = discountPercent(product.price, product.compareAtPrice)

  // Real public URLs (pagedesign Phase 2) — the href is the crawlable/shareable
  // target; inside the SPA we preventDefault and navigate instantly instead.
  const productHref = `/market/product/${product.id}`
  const storeHref = `/market/store/${product.sellerId}`

  const openProduct = () => {
    // Outside the SPA (homepage preview, real market pages): full navigation to
    // the real product page — no middleware hop needed.
    if (!spaActive) {
      window.location.assign(productHref)
      return
    }
    navigate('product', { productId: product.id })
  }

  // Keyboard access: the card behaves as a button (Enter/Space opens the product).
  // Inner interactive elements (favorite / add / store link) already stopPropagation
  // and are skipped here so they keep their own key handling.
  const onCardKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    const target = e.target as HTMLElement
    if (target.closest('button, a, input, textarea, select')) return
    e.preventDefault()
    openProduct()
  }

  const openStore = (e: React.MouseEvent) => {
    e.stopPropagation()
    // Modifier clicks keep native behavior (open in new tab/window).
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    if (!spaActive) return // outside the SPA — the href navigates natively
    e.preventDefault()
    navigate('store', { sellerId: product.sellerId })
  }

  // Product link (image + title): href → real page; plain clicks inside the
  // SPA navigate instantly, everything else (middle-click, open-in-new-tab,
  // crawlers, no-JS) follows the real URL.
  const onProductLinkClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    if (!spaActive) return
    e.preventDefault()
    navigate('product', { productId: product.id })
  }

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation()
    const res = addToCart(product, 1)
    if (res.ok) {
      toast({ title: 'Added to cart', description: product.title })
    } else {
      toast({ title: 'Cannot add to cart', description: res.message, variant: 'destructive' })
    }
  }

  const handleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!user) {
      openAuth('login', { view: 'catalog' })
      return
    }
    try {
      const res = await fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Error', description: json.error ?? 'Failed to update favorite', variant: 'destructive' })
        return
      }
      setFavorited(json.favorited)
      toast({
        title: json.favorited ? 'Saved to favorites' : 'Removed from favorites',
        description: product.title,
      })
      window.dispatchEvent(new CustomEvent('favorites-changed'))
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' })
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.05, 0.4) }}
    >
      <Card
        role="button"
        tabIndex={0}
        aria-label={`View ${product.title}`}
        className="group cursor-pointer overflow-hidden gap-0 py-0 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        onClick={openProduct}
        onKeyDown={onCardKeyDown}
      >
        <CardHeader className="relative z-10 p-0">
          <div className="relative aspect-square overflow-hidden bg-muted">
            {/* Stretched product link — real URL fallback under the image;
                badges and the favorite button sit above it in DOM order. */}
            <a
              href={productHref}
              onClick={onProductLinkClick}
              className="absolute inset-0 z-0 rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              aria-label={`View ${product.title}`}
            />
            {product.images[0] ? (
              <img
                src={product.images[0]}
                alt={product.title}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 dark:brightness-[0.96]"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                No image
              </div>
            )}
            {discount !== null && (
              <Badge className="absolute left-2.5 top-2.5 rounded-full bg-red-500/95 px-2 text-[11px] font-bold text-white shadow-sm hover:bg-red-500">
                -{discount}%
              </Badge>
            )}
            {product.stock <= 5 && product.stock > 0 && (
              <Badge variant="secondary" className="absolute right-2.5 top-2.5 rounded-full px-2 text-[11px] font-semibold shadow-sm">
                Only {product.stock} left
              </Badge>
            )}
            {product.stock === 0 && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-[2px]">
                <Badge variant="destructive" className="text-xs font-semibold">Sold out</Badge>
              </div>
            )}
            <Button
              size="icon"
              variant="secondary"
              className={cn(
                'absolute bottom-2.5 right-2.5 h-9 w-9 rounded-full shadow-md transition-all sm:opacity-0 sm:group-hover:opacity-100',
                favorited && 'sm:opacity-100'
              )}
              onClick={handleFavorite}
              aria-label={favorited ? 'Remove from favorites' : 'Add to favorites'}
            >
              <Heart
                size={16}
                className={cn(
                  'transition-colors',
                  favorited ? 'fill-red-500 text-red-500' : 'text-muted-foreground'
                )}
              />
            </Button>
          </div>
        </CardHeader>
        <CardFooter className="flex flex-col items-start gap-1.5 p-3.5 sm:p-4">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-primary/80">
            {product.category.name}
          </span>
          <h3 className="line-clamp-2 min-h-10 w-full text-sm font-medium leading-5 text-foreground/90">
            <a
              href={productHref}
              onClick={onProductLinkClick}
              className="rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
            >
              {product.title}
            </a>
          </h3>
          <a
            href={storeHref}
            className="flex w-full items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-primary"
            onClick={openStore}
            aria-label={`Visit ${(product.seller?.storeName ?? product.seller?.name) || 'seller'} store`}
          >
            <Store size={12} className="shrink-0" />
            <span className="truncate">
              {product.seller?.storeName ?? product.seller?.name ?? 'Vendora seller'}
            </span>
          </a>
          <div className="flex w-full items-baseline justify-between gap-2">
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex min-w-0 items-baseline gap-1.5">
                <span className="truncate text-base font-bold text-foreground">{formatUSD(product.price)}</span>
                {product.compareAtPrice && (
                  <span className="shrink-0 text-xs text-muted-foreground line-through">
                    {formatUSD(product.compareAtPrice)}
                  </span>
                )}
              </div>
            </div>
            <span className="shrink-0 text-[11px] text-muted-foreground">{formatNumber(product.soldCount)} sold</span>
          </div>
          {/* Rating + add-to-cart — stacks on narrow (2-col mobile) cards so the
              button can never overflow the card frame; joins one row ≥sm. */}
          <div className="flex w-full flex-col gap-2 pt-0.5 sm:flex-row sm:items-center sm:justify-between">
            <StarRating value={product.rating} size={12} showValue count={product.reviewCount} className="min-w-0" />
            <Button
              size="sm"
              className="h-9 w-full gap-1.5 rounded-full px-4 text-xs transition-transform active:scale-95 sm:h-8 sm:w-auto sm:px-3.5"
              disabled={product.stock === 0}
              onClick={handleAdd}
            >
              <ShoppingCart size={13} />
              Add to cart
            </Button>
          </div>
        </CardFooter>
      </Card>
    </motion.div>
  )
}

export function ProductCardSkeleton() {
  return (
    <Card className="overflow-hidden gap-0 py-0">
      <div className="skeleton-shimmer aspect-square animate-pulse bg-muted" />
      <div className="skeleton-shimmer flex flex-col gap-2 p-4">
        <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
        <div className="h-4 w-full animate-pulse rounded bg-muted" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-8 w-full animate-pulse rounded bg-muted" />
      </div>
    </Card>
  )
}
