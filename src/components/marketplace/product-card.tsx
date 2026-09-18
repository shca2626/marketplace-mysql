'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Heart, ShoppingCart } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useMarketplace } from '@/store/marketplace'
import type { ProductDTO } from '@/lib/types'
import { discountPercent, formatNumber, formatUSD } from '@/lib/format'
import { StarRating } from './star-rating'
import { Card, CardFooter, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export function ProductCard({ product, index = 0 }: { product: ProductDTO; index?: number }) {
  const navigate = useMarketplace((s) => s.navigate)
  const addToCart = useMarketplace((s) => s.addToCart)
  const user = useMarketplace((s) => s.user)
  const openAuth = useMarketplace((s) => s.openAuth)
  const [favorited, setFavorited] = useState(Boolean(product.favorited))
  const discount = discountPercent(product.price, product.compareAtPrice)

  const openProduct = () => navigate('product', { productId: product.id })

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
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.05, 0.4) }}
    >
      <Card
        className="group cursor-pointer overflow-hidden gap-0 py-0 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
        onClick={openProduct}
      >
        <CardHeader className="relative z-10 p-0">
          <div className="relative aspect-square overflow-hidden bg-muted">
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
              <Badge className="absolute left-2.5 top-2.5 bg-red-500/95 text-[11px] font-bold text-white hover:bg-red-500">
                -{discount}%
              </Badge>
            )}
            {product.stock <= 5 && product.stock > 0 && (
              <Badge variant="secondary" className="absolute right-2.5 top-2.5 text-[11px] font-semibold shadow-sm">
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
        <CardFooter className="flex flex-col items-start gap-1.5 p-3.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-primary/80">
            {product.category.name}
          </span>
          <h3 className="line-clamp-2 min-h-10 w-full text-sm font-medium leading-5 text-foreground/90">
            {product.title}
          </h3>
          <div className="flex w-full items-center justify-between">
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-bold text-foreground">{formatUSD(product.price)}</span>
              {product.compareAtPrice && (
                <span className="text-xs text-muted-foreground line-through">
                  {formatUSD(product.compareAtPrice)}
                </span>
              )}
            </div>
            <span className="text-[11px] text-muted-foreground">{formatNumber(product.soldCount)} sold</span>
          </div>
          <div className="flex w-full items-center justify-between">
            <StarRating value={product.rating} showValue count={product.reviewCount} />
            <Button
              size="sm"
              className="h-8 gap-1.5 rounded-full px-3 text-xs"
              disabled={product.stock === 0}
              onClick={handleAdd}
            >
              <ShoppingCart size={13} />
              Add
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
      <div className="aspect-square animate-pulse bg-muted" />
      <div className="flex flex-col gap-2 p-3.5">
        <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
        <div className="h-4 w-full animate-pulse rounded bg-muted" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-8 w-full animate-pulse rounded bg-muted" />
      </div>
    </Card>
  )
}
