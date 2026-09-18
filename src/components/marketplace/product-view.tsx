'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  BadgeCheck,
  ChevronRight,
  Heart,
  MapPin,
  RotateCcw,
  ShieldCheck,
  ShoppingCart,
  Star,
  Truck,
  Zap,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useMarketplace } from '@/store/marketplace'
import { useApi } from '@/hooks/use-api'
import type { ProductDTO, ReviewDTO } from '@/lib/types'
import { discountPercent, formatDate, formatNumber, formatUSD, initials, timeAgo } from '@/lib/format'
import { StarPicker } from './star-rating'
import { QuantityInput } from './quantity-input'
import { ProductCard } from './product-card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

interface ProductDetailResponse {
  product: ProductDTO
  reviews: ReviewDTO[]
  seller: {
    id: string
    name: string
    storeName: string | null
    storeBio: string | null
    memberSince: string
    activeListings: number
  } | null
  related: ProductDTO[]
}

export function ProductView() {
  const productId = useMarketplace((s) => s.params.productId)
  const navigate = useMarketplace((s) => s.navigate)
  const addToCart = useMarketplace((s) => s.addToCart)
  const setCartOpen = useMarketplace((s) => s.setCartOpen)
  const user = useMarketplace((s) => s.user)
  const openAuth = useMarketplace((s) => s.openAuth)
  const trackView = useMarketplace((s) => s.trackView)

  const { data, loading, setData } = useApi<ProductDetailResponse>(
    productId ? `/api/products/${productId}` : null
  )

  const [activeImage, setActiveImage] = useState(0)
  const [quantity, setQuantity] = useState(1)
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewComment, setReviewComment] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)

  const product = data?.product

  // Record the visit for the "Recently viewed" row on home
  useEffect(() => {
    if (productId) trackView(productId)
  }, [productId, trackView])

  const discount = useMemo(
    () => (product ? discountPercent(product.price, product.compareAtPrice) : null),
    [product]
  )

  const handleAddToCart = (openDrawer = false) => {
    if (!product) return
    const res = addToCart(product, quantity)
    if (res.ok) {
      toast({ title: 'Added to cart', description: `${quantity} × ${product.title}` })
      if (openDrawer) setCartOpen(true)
    } else {
      toast({ title: 'Cannot add to cart', description: res.message, variant: 'destructive' })
    }
  }

  const handleBuyNow = () => {
    if (!product) return
    const res = addToCart(product, quantity)
    if (res.ok) navigate('checkout')
    else toast({ title: 'Cannot add to cart', description: res.message, variant: 'destructive' })
  }

  const handleFavorite = async () => {
    if (!product) return
    if (!user) {
      openAuth('login', { view: 'product', productId: product.id })
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
        toast({ title: 'Error', description: json.error, variant: 'destructive' })
        return
      }
      setData(
        data ? { ...data, product: { ...product, favorited: json.favorited } } : data,
      )
      toast({
        title: json.favorited ? 'Saved to favorites' : 'Removed from favorites',
        description: product.title,
      })
      window.dispatchEvent(new CustomEvent('favorites-changed'))
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' })
    }
  }

  const submitReview = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!product) return
    if (!user) {
      openAuth('login', { view: 'product', productId: product.id })
      return
    }
    if (reviewComment.trim().length < 3) {
      toast({ title: 'Review too short', description: 'Please write at least a few words', variant: 'destructive' })
      return
    }
    setSubmittingReview(true)
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id, rating: reviewRating, comment: reviewComment.trim() }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Error', description: json.error, variant: 'destructive' })
        return
      }
      // Update local state: refresh from server
      const fresh = await fetch(`/api/products/${product.id}`, { cache: 'no-store' })
      if (fresh.ok) setData(await fresh.json())
      setReviewComment('')
      setReviewRating(5)
      toast({ title: 'Review submitted', description: 'Thanks for sharing your thoughts!' })
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' })
    } finally {
      setSubmittingReview(false)
    }
  }

  if (loading || !product) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid gap-8 lg:grid-cols-2">
          <Skeleton className="aspect-square w-full rounded-2xl" />
          <div className="space-y-4">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </div>
      </div>
    )
  }

  const ratingBuckets = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: data.reviews.filter((r) => r.rating === star).length,
  }))
  const totalReviews = data.reviews.length
  const myReview = user ? data.reviews.find((r) => r.user.id === user.id) : undefined

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Breadcrumb */}
      <nav className="mb-6 flex flex-wrap items-center gap-1 text-sm text-muted-foreground" aria-label="Breadcrumb">
        <button className="hover:text-primary" onClick={() => navigate('home')}>
          Home
        </button>
        <ChevronRight size={13} />
        <button className="hover:text-primary" onClick={() => navigate('catalog', { category: product.category.slug })}>
          {product.category.name}
        </button>
        <ChevronRight size={13} />
        <span className="line-clamp-1 max-w-64 font-medium text-foreground">{product.title}</span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-2">
        {/* ── Gallery ── */}
        <div>
          <motion.div
            key={activeImage}
            initial={{ opacity: 0.4, scale: 0.99 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25 }}
            className="relative overflow-hidden rounded-2xl border bg-muted"
          >
            {product.images[activeImage] ? (
              <img
                src={product.images[activeImage]}
                alt={`${product.title} — image ${activeImage + 1}`}
                className="aspect-square w-full object-cover"
              />
            ) : (
              <div className="flex aspect-square items-center justify-center text-muted-foreground">No image</div>
            )}
            {discount !== null && (
              <Badge className="absolute left-3 top-3 bg-red-500/95 text-sm font-bold text-white hover:bg-red-500">
                -{discount}%
              </Badge>
            )}
          </motion.div>
          {product.images.length > 1 && (
            <div className="mt-3 flex gap-2.5">
              {product.images.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setActiveImage(i)}
                  className={cn(
                    'h-20 w-20 shrink-0 overflow-hidden rounded-xl border-2 transition-all',
                    i === activeImage ? 'border-primary' : 'border-transparent opacity-60 hover:opacity-100'
                  )}
                  aria-label={`Show image ${i + 1}`}
                >
                  <img src={img} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Info ── */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <Badge variant="secondary" className="rounded-full text-xs font-medium">
            {product.category.name}
          </Badge>
          <h1 className="mt-3 text-2xl font-bold leading-snug tracking-tight sm:text-3xl">{product.title}</h1>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <div className="flex items-center gap-1.5">
              <Star size={15} className="fill-amber-400 text-amber-400" />
              <span className="font-semibold">{product.rating.toFixed(1)}</span>
              <button
                className="text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => document.getElementById('reviews-tab')?.click()}
              >
                {product.reviewCount} reviews
              </button>
            </div>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{formatNumber(product.soldCount)} sold</span>
          </div>

          <div className="mt-5 flex items-end gap-3">
            <span className="text-4xl font-extrabold tracking-tight">{formatUSD(product.price)}</span>
            {product.compareAtPrice && (
              <span className="pb-1 text-lg text-muted-foreground line-through">
                {formatUSD(product.compareAtPrice)}
              </span>
            )}
            {discount !== null && (
              <Badge variant="destructive" className="mb-1.5">
                Save {discount}%
              </Badge>
            )}
          </div>

          <p className="mt-4 leading-relaxed text-muted-foreground">{product.description}</p>

          {/* Stock */}
          <div className="mt-5 flex items-center gap-2 text-sm">
            <span
              className={cn(
                'h-2 w-2 rounded-full',
                product.stock === 0 ? 'bg-destructive' : product.stock <= 5 ? 'bg-amber-500' : 'bg-emerald-500'
              )}
            />
            {product.stock === 0 ? (
              <span className="font-medium text-destructive">Out of stock</span>
            ) : product.stock <= 5 ? (
              <span className="font-medium text-amber-600 dark:text-amber-400">
                Selling fast — only {product.stock} left
              </span>
            ) : (
              <span className="text-muted-foreground">{product.stock} in stock</span>
            )}
          </div>

          {/* Quantity + actions */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <QuantityInput value={quantity} onChange={setQuantity} max={Math.max(1, product.stock)} />
            <Button
              size="lg"
              className="h-12 flex-1 rounded-xl text-base sm:flex-none sm:px-8"
              disabled={product.stock === 0}
              onClick={() => handleAddToCart(false)}
            >
              <ShoppingCart size={17} className="mr-2" /> Add to cart
            </Button>
            <Button
              size="lg"
              variant="secondary"
              className="h-12 rounded-xl border text-base sm:px-8"
              disabled={product.stock === 0}
              onClick={handleBuyNow}
            >
              <Zap size={16} className="mr-2" /> Buy now
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 w-12 rounded-xl p-0"
              onClick={handleFavorite}
              aria-label="Toggle favorite"
            >
              <Heart
                size={19}
                className={cn('transition-colors', product.favorited && 'fill-red-500 text-red-500')}
              />
            </Button>
          </div>

          {/* Perks */}
          <div className="mt-7 grid grid-cols-3 gap-3">
            {[
              { icon: Truck, title: 'Fast shipping', text: 'Free over $75' },
              { icon: RotateCcw, title: 'Easy returns', text: 'Within 30 days' },
              { icon: ShieldCheck, title: 'Warranty', text: '1-year coverage' },
            ].map((perk) => (
              <div key={perk.title} className="rounded-xl border bg-card p-3.5 text-center">
                <perk.icon size={18} className="mx-auto text-primary" />
                <p className="mt-2 text-xs font-semibold leading-tight">{perk.title}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{perk.text}</p>
              </div>
            ))}
          </div>

          {/* Seller card */}
          {data.seller && (
            <Card className="mt-7 flex items-center gap-4 p-5">
              <Avatar className="h-13 w-13 border">
                <AvatarFallback className="bg-primary/10 font-bold text-primary">
                  {initials(data.seller.storeName ?? data.seller.name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate font-semibold">{data.seller.storeName ?? data.seller.name}</p>
                  <BadgeCheck size={15} className="shrink-0 text-primary" />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Member since {formatDate(data.seller.memberSince)} · {data.seller.activeListings} listings
                </p>
                {data.seller.storeBio && (
                  <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {data.seller.storeBio}
                  </p>
                )}
              </div>
              <MapPin size={16} className="hidden text-muted-foreground sm:block" />
            </Card>
          )}
        </motion.div>
      </div>

      {/* ── Tabs: description / reviews ── */}
      <Tabs defaultValue="description" className="mt-14">
        <TabsList className="h-11 w-full justify-start gap-1 overflow-x-auto rounded-xl bg-muted/60 p-1 sm:w-auto">
          <TabsTrigger value="description" className="rounded-lg px-5 text-sm">
            Description
          </TabsTrigger>
          <TabsTrigger value="reviews" id="reviews-tab" className="rounded-lg px-5 text-sm">
            Reviews ({product.reviewCount})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="description" className="mt-6">
          <Card className="p-6">
            <h2 className="text-lg font-bold">About this item</h2>
            <p className="mt-3 leading-relaxed text-muted-foreground">{product.description}</p>
            <Separator className="my-5" />
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="flex justify-between rounded-lg bg-muted/50 px-4 py-2.5">
                <span className="text-muted-foreground">Category</span>
                <span className="font-medium">{product.category.name}</span>
              </div>
              <div className="flex justify-between rounded-lg bg-muted/50 px-4 py-2.5">
                <span className="text-muted-foreground">Listed</span>
                <span className="font-medium">{formatDate(product.createdAt)}</span>
              </div>
              <div className="flex justify-between rounded-lg bg-muted/50 px-4 py-2.5">
                <span className="text-muted-foreground">Units sold</span>
                <span className="font-medium">{formatNumber(product.soldCount)}</span>
              </div>
              <div className="flex justify-between rounded-lg bg-muted/50 px-4 py-2.5">
                <span className="text-muted-foreground">Ships from</span>
                <span className="font-medium">Vendora fulfillment</span>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="reviews" className="mt-6">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Summary */}
            <Card className="h-fit p-6">
              <div className="flex items-end gap-2">
                <span className="text-5xl font-extrabold leading-none">{product.rating.toFixed(1)}</span>
                <div className="pb-1">
                  <div className="flex">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star
                        key={i}
                        size={16}
                        className={
                          product.rating >= i - 0.25
                            ? 'fill-amber-400 text-amber-400'
                            : 'fill-muted text-muted-foreground/30'
                        }
                      />
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{totalReviews} reviews</p>
                </div>
              </div>
              <div className="mt-5 space-y-2">
                {ratingBuckets.map((b) => (
                  <div key={b.star} className="flex items-center gap-2 text-xs">
                    <span className="w-7 shrink-0 text-muted-foreground">{b.star}★</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-amber-400 transition-all"
                        style={{ width: `${totalReviews ? (b.count / totalReviews) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="w-6 shrink-0 text-right text-muted-foreground">{b.count}</span>
                  </div>
                ))}
              </div>

              <Separator className="my-5" />

              {/* Review form */}
              <form onSubmit={submitReview} className="space-y-3">
                <p className="text-sm font-semibold">
                  {myReview ? 'Update your review' : 'Write a review'}
                </p>
                <StarPicker value={reviewRating} onChange={setReviewRating} size={22} />
                <Textarea
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder={
                    myReview
                      ? myReview.comment
                      : 'What did you like or dislike? How was the quality?'
                  }
                  className="min-h-24 text-sm"
                  aria-label="Your review"
                />
                <Button type="submit" className="w-full rounded-xl" disabled={submittingReview}>
                  {submittingReview ? 'Submitting…' : myReview ? 'Update review' : 'Submit review'}
                </Button>
                {!user && (
                  <p className="text-center text-xs text-muted-foreground">Sign in to leave a review</p>
                )}
              </form>
            </Card>

            {/* Review list */}
            <div className="space-y-4 lg:col-span-2">
              {data.reviews.length === 0 ? (
                <Card className="flex flex-col items-center p-10 text-center">
                  <Star size={36} className="text-muted-foreground/40" />
                  <p className="mt-3 font-semibold">No reviews yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">Be the first to review this product</p>
                </Card>
              ) : (
                data.reviews.map((review) => (
                  <Card key={review.id} className="p-5">
                    <div className="flex items-start gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
                          {initials(review.user.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold">{review.user.name}</p>
                          {review.verified && (
                            <Badge variant="secondary" className="h-5 gap-1 rounded-full px-2 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                              <BadgeCheck size={11} /> Verified purchase
                            </Badge>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <div className="flex">
                            {[1, 2, 3, 4, 5].map((i) => (
                              <Star
                                key={i}
                                size={13}
                                className={
                                  review.rating >= i
                                    ? 'fill-amber-400 text-amber-400'
                                    : 'fill-muted text-muted-foreground/30'
                                }
                              />
                            ))}
                          </div>
                          <span className="text-xs text-muted-foreground">{timeAgo(review.createdAt)}</span>
                        </div>
                        <p className="mt-2.5 text-sm leading-relaxed text-foreground/90">{review.comment}</p>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Related ── */}
      {data.related.length > 0 && (
        <section className="mt-16" aria-labelledby="related-heading">
          <h2 id="related-heading" className="mb-5 text-xl font-bold tracking-tight">
            You might also like
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {data.related.map((p, i) => (
              <ProductCard key={p.id} product={p} index={i} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
