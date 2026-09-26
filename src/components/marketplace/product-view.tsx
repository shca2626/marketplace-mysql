'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  BadgeCheck,
  BadgePercent,
  Check,
  ChevronRight,
  FileText,
  Heart,
  Package,
  PackageSearch,
  RotateCcw,
  Ruler,
  Share2,
  ShieldCheck,
  ShoppingCart,
  Star,
  Truck,
  X,
  Zap,
  ZoomIn,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useMarketplace } from '@/store/marketplace'
import { useApi } from '@/hooks/use-api'
import type { OrganizationDTO, ProductDTO, ResolvedPriceDTO, ReviewDTO } from '@/lib/types'
import { discountPercent, formatDate, formatNumber, formatUSD, initials, timeAgo } from '@/lib/format'
import { StarPicker } from './star-rating'
import { QuantityInput } from './quantity-input'
import { ProductCard } from './product-card'
import { viewToHref } from '@/lib/routing'
import { absoluteUrl, shareLink } from '@/lib/share'
import { defaultActiveOrg, rememberActiveOrg, RFQ_PREFILL_KEY } from './b2b/b2b-shared'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
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

/** Convert a product video URL into an embeddable player (YouTube / Vimeo / direct file). */
function videoEmbedFor(url?: string | null): { kind: 'iframe' | 'video'; src: string } | null {
  if (!url) return null
  try {
    const u = new URL(url)
    if (u.hostname === 'youtu.be')
      return { kind: 'iframe', src: `https://www.youtube.com/embed/${u.pathname.slice(1)}` }
    if (u.hostname.includes('youtube.com')) {
      if (u.pathname.startsWith('/embed/')) return { kind: 'iframe', src: url }
      const v = u.searchParams.get('v')
      if (v) return { kind: 'iframe', src: `https://www.youtube.com/embed/${v}` }
    }
    if (u.hostname.includes('vimeo.com')) {
      const id = u.pathname.replace(/\D/g, '')
      if (id) return { kind: 'iframe', src: `https://player.vimeo.com/video/${id}` }
    }
    if (/\.(mp4|webm|ogg|mov)$/i.test(u.pathname)) return { kind: 'video', src: url }
    return null
  } catch {
    return null
  }
}

export function ProductView() {
  const productId = useMarketplace((s) => s.params.productId)
  const navigate = useMarketplace((s) => s.navigate)
  const addToCart = useMarketplace((s) => s.addToCart)
  const setCartOpen = useMarketplace((s) => s.setCartOpen)
  const user = useMarketplace((s) => s.user)
  const openAuth = useMarketplace((s) => s.openAuth)
  const trackView = useMarketplace((s) => s.trackView)

  const { data, loading, error, setData } = useApi<ProductDetailResponse>(
    productId ? `/api/products/${productId}` : null
  )

  const [activeImage, setActiveImage] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [quantity, setQuantity] = useState(1)
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewComment, setReviewComment] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)
  const [showBuyBar, setShowBuyBar] = useState(false)
  const [justShared, setJustShared] = useState(false)
  // B2B: active organization + contract price for the current quantity
  const [activeOrg, setActiveOrg] = useState<{ id: string; name: string } | null>(null)
  const [contract, setContract] = useState<ResolvedPriceDTO | null>(null)
  // Variants: currently selected combination (e.g. { Size: 'M', Color: 'Black' })
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({})
  const shareTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const buyActionsRef = useRef<HTMLDivElement>(null)

  // Discover the buyer's ACTIVE organization (needed for contract pricing).
  // Retail-only buyers (no org / not ACTIVE) see the classic price unchanged.
  useEffect(() => {
    if (!user) {
      setActiveOrg(null)
      return
    }
    let cancelled = false
    fetch('/api/organizations', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { organizations?: OrganizationDTO[] } | null) => {
        if (cancelled || !json?.organizations?.length) return
        const active = defaultActiveOrg(json.organizations)
        if (active?.status === 'ACTIVE') {
          rememberActiveOrg(active.id)
          setActiveOrg({ id: active.id, name: active.name })
        }
      })
      .catch(() => {
        /* offline — stay retail */
      })
    return () => {
      cancelled = true
    }
  }, [user])

  // Re-resolve contract pricing whenever the product or quantity changes
  useEffect(() => {
    if (!user || !productId || !activeOrg) {
      setContract(null)
      return
    }
    let cancelled = false
    const ctrl = new AbortController()
    fetch('/api/pricing/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ productId, quantity }], organizationId: activeOrg.id }),
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { prices?: ResolvedPriceDTO[] } | null) => {
        if (cancelled || !json?.prices?.length) return
        const resolved = json.prices[0]
        // RETAIL means no contract/group list applies — show the classic price
        setContract(resolved.source === 'RETAIL' ? null : resolved)
      })
      .catch(() => {
        /* aborted or offline — keep retail */
      })
    return () => {
      cancelled = true
      ctrl.abort()
    }
  }, [user, productId, quantity, activeOrg])

  useEffect(() => () => {
    if (shareTimer.current) clearTimeout(shareTimer.current)
  }, [])

  // Mobile sticky buy bar: reveal once the main action buttons scroll out of view
  useEffect(() => {
    const onScroll = () => {
      const el = buyActionsRef.current
      if (!el) return
      setShowBuyBar(el.getBoundingClientRect().bottom < 72)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [productId, data])

  // Reserve space at the document bottom on phones so the fixed bar never covers the footer
  useEffect(() => {
    document.body.classList.toggle('has-buy-bar', showBuyBar)
    return () => document.body.classList.remove('has-buy-bar')
  }, [showBuyBar])

  const product = data?.product

  // Record the visit for the "Recently viewed" row on home
  useEffect(() => {
    if (productId) trackView(productId)
  }, [productId, trackView])

  // ── Variant machinery ────────────────────────────────────────────────────────
  const activeVariants = useMemo(
    () => (product?.variants ?? []).filter((v) => v.isActive),
    [product]
  )

  // Option groups in first-seen order (e.g. [{ name: 'Size', values: ['S','M'] }, …])
  const variantGroups = useMemo(() => {
    const groups: { name: string; values: string[] }[] = []
    for (const v of activeVariants) {
      for (const [name, val] of Object.entries(v.options)) {
        let g = groups.find((x) => x.name === name)
        if (!g) {
          g = { name, values: [] }
          groups.push(g)
        }
        if (!g.values.includes(val)) g.values.push(val)
      }
    }
    return groups
  }, [activeVariants])

  // Default to the first variant's combination whenever the product changes
  useEffect(() => {
    const first = (data?.product?.variants ?? []).find((v) => v.isActive)
    setSelectedOptions(first ? { ...first.options } : {})
  }, [productId, data?.product?.id])

  const selectedVariant = useMemo(() => {
    if (!activeVariants.length || variantGroups.length === 0) return null
    return (
      activeVariants.find((v) =>
        variantGroups.every((g) => v.options[g.name] === selectedOptions[g.name])
      ) ?? null
    )
  }, [activeVariants, variantGroups, selectedOptions])

  const effectivePrice = selectedVariant?.price ?? product?.price ?? 0
  const effectiveCompareAt = selectedVariant?.compareAtPrice ?? product?.compareAtPrice ?? null
  const effectiveStock = selectedVariant ? selectedVariant.stock : (product?.stock ?? 0)
  const effectiveSku = selectedVariant?.sku ?? product?.sku ?? null
  const videoEmbed = useMemo(() => videoEmbedFor(product?.videoUrl), [product?.videoUrl])

  // SEO: keep the browser tab + meta description in sync with the seller's SEO fields
  useEffect(() => {
    if (!product) return
    const prevTitle = document.title
    document.title = product.metaTitle?.trim() || `${product.title} — Vendora`
    const metaEl = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    const prevDesc = metaEl?.content ?? ''
    const desc = product.metaDescription?.trim()
    if (desc) {
      if (metaEl) metaEl.content = desc
      else {
        const el = document.createElement('meta')
        el.name = 'description'
        el.content = desc
        document.head.appendChild(el)
      }
    }
    return () => {
      document.title = prevTitle
      if (metaEl && prevDesc) metaEl.content = prevDesc
    }
  }, [product])

  const discount = useMemo(
    () => (product ? discountPercent(effectivePrice, effectiveCompareAt) : null),
    [product, effectivePrice, effectiveCompareAt]
  )

  const handleAddToCart = (openDrawer = false) => {
    if (!product) return
    const res = addToCart(product, quantity, selectedVariant)
    if (res.ok) {
      toast({
        title: 'Added to cart',
        description: `${quantity} × ${product.title}${selectedVariant ? ` (${selectedVariant.name})` : ''}`,
      })
      if (openDrawer) setCartOpen(true)
    } else {
      toast({ title: 'Cannot add to cart', description: res.message, variant: 'destructive' })
    }
  }

  const handleBuyNow = () => {
    if (!product) return
    const res = addToCart(product, quantity, selectedVariant)
    if (res.ok) navigate('checkout')
    else toast({ title: 'Cannot add to cart', description: res.message, variant: 'destructive' })
  }

  // B2B handoff: prefill a new RFQ line and jump to the RFQ workspace.
  // sessionStorage (not the store) carries the payload — see b2b/rfq-view.
  const handleRequestQuote = () => {
    if (!product) return
    try {
      window.sessionStorage.setItem(
        RFQ_PREFILL_KEY,
        JSON.stringify({ productId: product.id, title: product.title, price: product.price })
      )
    } catch {
      /* storage unavailable — still navigate */
    }
    if (!user) {
      openAuth('login', { view: 'rfqs' })
      return
    }
    navigate('rfqs')
  }

  const handleFavorite = async () => {
    if (!product) return
    if (!user) {
      openAuth('login', { view: 'product', params: { productId: product.id } })
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

  const handleShare = async () => {
    if (!product) return
    const url = absoluteUrl(viewToHref('product', { productId: product.id }))
    const outcome = await shareLink(url, product.title, `Check out ${product.title} on Vendora`)
    if (outcome === 'shared') {
      toast({ title: 'Thanks for spreading the word!', description: product.title })
    } else if (outcome === 'copied') {
      setJustShared(true)
      if (shareTimer.current) clearTimeout(shareTimer.current)
      shareTimer.current = setTimeout(() => setJustShared(false), 1800)
      toast({ title: 'Link copied to clipboard', description: 'Share it anywhere you like' })
    } else if (outcome === 'failed') {
      toast({ title: 'Could not share', description: 'Copy failed — try again in a moment', variant: 'destructive' })
    }
  }

  const submitReview = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!product) return
    if (!user) {
      openAuth('login', { view: 'product', params: { productId: product.id } })
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

  // Not-found state: the fetch finished but there is no product (deleted,
  // archived by a suspended vendor, or a stale link). Previously this showed
  // the skeleton forever (parked backlog: "Product 404 infinite skeleton").
  if (!loading && !product) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-20 text-center">
        <div className="rounded-full bg-muted p-5">
          <PackageSearch size={36} className="text-primary/70" aria-hidden />
        </div>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">
          Product not found
        </h1>
        <p className="mt-2 max-w-sm text-balance text-muted-foreground">
          {error ?? "This listing is no longer available — it may have been removed or the link is out of date."}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => navigate('catalog')}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <ArrowLeft size={16} aria-hidden />
            Browse the catalog
          </button>
          <button
            onClick={() => navigate('home')}
            className="inline-flex h-11 items-center rounded-xl border bg-background px-5 text-sm font-medium transition-colors hover:bg-muted"
          >
            Back to home
          </button>
        </div>
      </div>
    )
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
  const hasVariantSelectionPending = variantGroups.length > 0 && !selectedVariant

  // Seller-provided spec rows (Details tab) beyond the fixed marketplace rows
  const detailRows: { label: string; value: string }[] = []
  if (effectiveSku) detailRows.push({ label: 'SKU', value: effectiveSku })
  if (product.materials) detailRows.push({ label: 'Materials', value: product.materials })
  if (product.care) detailRows.push({ label: 'Care', value: product.care })
  if (product.weightGrams) detailRows.push({ label: 'Weight', value: `${product.weightGrams} g` })
  if (product.lengthCm || product.widthCm || product.heightCm) {
    const dims = [product.lengthCm, product.widthCm, product.heightCm].filter((d) => d != null)
    detailRows.push({ label: 'Dimensions (L×W×H)', value: `${dims.join(' × ')} cm` })
  }
  if (selectedVariant) detailRows.push({ label: 'Selected option', value: selectedVariant.name })

  const hasShippingInfo =
    product.processingDays != null ||
    product.freeShipping ||
    product.shippingFee != null ||
    !!product.shippingPolicy

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
            className="group relative overflow-hidden rounded-2xl border bg-muted"
          >
            {product.images[activeImage] ? (
              <button
                className="block w-full cursor-zoom-in"
                onClick={() => setLightboxOpen(true)}
                aria-label="Enlarge image"
              >
                <img
                  src={product.images[activeImage]}
                  alt={`${product.title} — image ${activeImage + 1}`}
                  className="aspect-square w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
                <span className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-background/80 text-foreground opacity-0 shadow-sm backdrop-blur transition-opacity duration-200 group-hover:opacity-100">
                  <ZoomIn size={16} />
                </span>
              </button>
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

          {/* Seller-provided product video (Media tab) */}
          {videoEmbed && (
            <div className="mt-4 overflow-hidden rounded-2xl border bg-black">
              {videoEmbed.kind === 'iframe' ? (
                <iframe
                  src={videoEmbed.src}
                  title={`${product.title} — product video`}
                  className="aspect-video w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  loading="lazy"
                />
              ) : (
                <video src={videoEmbed.src} controls preload="metadata" className="aspect-video w-full">
                  <track kind="captions" />
                </video>
              )}
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

          {/* Price — contract pricing for verified businesses, retail otherwise */}
          {contract ? (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="mt-5 rounded-2xl border border-primary/30 bg-primary/5 p-4"
              data-testid="contract-price"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-primary">
                  <BadgePercent size={13} /> Your price
                </span>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  {contract.source === 'CONTRACT' ? 'Contract pricing' : 'Group pricing'}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-end gap-x-3 gap-y-1">
                <span className="text-4xl font-extrabold tracking-tight" data-testid="contract-unit-price">
                  {formatUSD(contract.unitPrice)}
                </span>
                <span className="pb-1 text-lg text-muted-foreground line-through">
                  {formatUSD(contract.listPrice)}
                </span>
                {contract.savingsPercent > 0 && (
                  <span
                    className="mb-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                    data-testid="contract-savings"
                  >
                    Save {Math.round(contract.savingsPercent)}% vs retail
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {contract.priceListName ? `${contract.priceListName} · ` : ''}at qty {quantity}
                {activeOrg ? ` · for ${activeOrg.name}` : ''}
              </p>
            </motion.div>
          ) : (
            <div className="mt-5 flex items-end gap-3">
              <span className="text-4xl font-extrabold tracking-tight">{formatUSD(effectivePrice)}</span>
              {effectiveCompareAt && (
                <span className="pb-1 text-lg text-muted-foreground line-through">
                  {formatUSD(effectiveCompareAt)}
                </span>
              )}
              {discount !== null && (
                <Badge variant="destructive" className="mb-1.5">
                  Save {discount}%
                </Badge>
              )}
            </div>
          )}

          <p className="mt-4 leading-relaxed text-muted-foreground">{product.description}</p>

          {/* ── Variant selector (seller-defined options) ── */}
          {variantGroups.length > 0 && (
            <div className="mt-6 space-y-4">
              {variantGroups.map((g) => (
                <div key={g.name}>
                  <p className="mb-2 text-sm font-semibold">
                    {g.name}
                    {selectedOptions[g.name] && (
                      <span className="ml-1 font-normal text-muted-foreground">: {selectedOptions[g.name]}</span>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-2" role="group" aria-label={`Choose ${g.name}`}>
                    {g.values.map((val) => {
                      const active = selectedOptions[g.name] === val
                      return (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setSelectedOptions((s) => ({ ...s, [g.name]: val }))}
                          className={cn(
                            'h-9 min-w-11 rounded-lg border px-3 text-sm font-medium transition-colors',
                            active
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border text-foreground hover:border-primary/50 hover:bg-muted/50',
                            hasVariantSelectionPending && !active && 'opacity-60'
                          )}
                          aria-pressed={active}
                        >
                          {val}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
              {hasVariantSelectionPending && (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                  This combination is not available — pick another option.
                </p>
              )}
            </div>
          )}

          {/* Stock */}
          <div className="mt-5 flex flex-wrap items-center gap-2 text-sm">
            <span
              className={cn(
                'h-2 w-2 rounded-full',
                effectiveStock === 0 ? 'bg-destructive' : effectiveStock <= 5 ? 'bg-amber-500' : 'bg-emerald-500'
              )}
            />
            {effectiveStock === 0 ? (
              <span className="font-medium text-destructive">Out of stock</span>
            ) : effectiveStock <= 5 ? (
              <span className="font-medium text-amber-600 dark:text-amber-400">
                Selling fast — only {effectiveStock} left
              </span>
            ) : (
              <span className="text-muted-foreground">{effectiveStock} in stock</span>
            )}
            {effectiveSku && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">
                  SKU <span className="font-mono text-xs">{effectiveSku}</span>
                </span>
              </>
            )}
          </div>

          {/* Quantity + actions */}
          <div ref={buyActionsRef} className="mt-6 flex flex-wrap items-center gap-3">
            <QuantityInput value={quantity} onChange={setQuantity} max={Math.max(1, effectiveStock)} />
            <Button
              size="lg"
              className="h-12 flex-1 rounded-xl text-base sm:flex-none sm:px-8"
              disabled={effectiveStock === 0 || hasVariantSelectionPending}
              onClick={() => handleAddToCart(false)}
            >
              <ShoppingCart size={17} className="mr-2" /> Add to cart
            </Button>
            <Button
              size="lg"
              variant="secondary"
              className="h-12 rounded-xl border text-base sm:px-8"
              disabled={effectiveStock === 0 || hasVariantSelectionPending}
              onClick={handleBuyNow}
            >
              <Zap size={16} className="mr-2" /> Buy now
            </Button>
            <Button
              size="lg"
              variant="secondary"
              className="h-12 flex-1 rounded-xl border text-base sm:flex-none sm:px-8"
              onClick={handleRequestQuote}
            >
              <FileText size={16} className="mr-2" /> Request a quote
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
            <Button
              size="lg"
              variant="outline"
              className={cn(
                'h-12 w-12 rounded-xl p-0 transition-colors',
                justShared && 'border-emerald-500/60 text-emerald-600 dark:text-emerald-400'
              )}
              onClick={handleShare}
              aria-label="Share this product"
            >
              {justShared ? <Check size={19} /> : <Share2 size={19} />}
            </Button>
          </div>

          {/* Bulk-buy hint under the actions */}
          <p className="mt-3 text-xs text-muted-foreground">
            Buying in bulk?{' '}
            <button
              onClick={handleRequestQuote}
              className="font-semibold text-primary underline-offset-2 hover:underline"
            >
              Request a quote
            </button>{' '}
            for volume pricing, quantity breaks and NET payment terms.
          </p>

          {/* Perks */}
          <div className="mt-7 grid grid-cols-3 gap-3">
            {[
              {
                icon: Truck,
                title: product.freeShipping ? 'Free shipping' : 'Fast shipping',
                text: product.freeShipping ? 'On this item' : 'Free over $75',
              },
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

          {/* Seller card — links to the public storefront */}
          {data.seller && (
            <Card
              className="group mt-7 cursor-pointer p-5 transition-all hover:border-primary/40 hover:shadow-md"
              onClick={() => navigate('store', { sellerId: data.seller!.id })}
              role="link"
              aria-label={`Visit ${data.seller.storeName ?? data.seller.name} store`}
            >
              <div className="flex items-center gap-4">
                <Avatar className="h-13 w-13 border">
                  <AvatarFallback className="bg-primary/10 font-bold text-primary">
                    {initials(data.seller.storeName ?? data.seller.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate font-semibold group-hover:text-primary">
                      {data.seller.storeName ?? data.seller.name}
                    </p>
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
                <span className="hidden shrink-0 items-center gap-1 text-xs font-semibold text-primary sm:flex">
                  View store
                  <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </Card>
          )}
        </motion.div>
      </div>

      {/* ── Image lightbox ── */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent
          className="max-w-4xl overflow-hidden rounded-2xl border-none bg-background/95 p-0 shadow-2xl backdrop-blur sm:rounded-3xl [&>button]:hidden"
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' && activeImage < product.images.length - 1) setActiveImage(activeImage + 1)
            if (e.key === 'ArrowLeft' && activeImage > 0) setActiveImage(activeImage - 1)
          }}
        >
          <DialogTitle className="sr-only">{product.title} — image gallery</DialogTitle>
          <div className="relative">
            <img
              src={product.images[activeImage]}
              alt={`${product.title} — image ${activeImage + 1} enlarged`}
              className="max-h-[75vh] w-full object-contain"
            />
            <Button
              variant="secondary"
              size="icon"
              className="absolute right-3 top-3 h-10 w-10 rounded-full bg-background/80 shadow-md backdrop-blur"
              onClick={() => setLightboxOpen(false)}
              aria-label="Close image viewer"
            >
              <X size={18} />
            </Button>
            {product.images.length > 1 && (
              <>
                <Button
                  variant="secondary"
                  size="icon"
                  className="absolute left-3 top-1/2 h-11 w-11 -translate-y-1/2 rounded-full bg-background/80 shadow-md backdrop-blur transition-transform hover:scale-105 disabled:opacity-30"
                  disabled={activeImage === 0}
                  onClick={() => setActiveImage((i) => Math.max(0, i - 1))}
                  aria-label="Previous image"
                >
                  <ChevronRight size={20} className="rotate-180" />
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  className="absolute right-3 top-1/2 h-11 w-11 -translate-y-1/2 rounded-full bg-background/80 shadow-md backdrop-blur transition-transform hover:scale-105 disabled:opacity-30"
                  disabled={activeImage === product.images.length - 1}
                  onClick={() => setActiveImage((i) => Math.min(product.images.length - 1, i + 1))}
                  aria-label="Next image"
                >
                  <ChevronRight size={20} />
                </Button>
                <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5 rounded-full bg-background/80 px-3 py-1.5 shadow-sm backdrop-blur">
                  {product.images.map((img, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveImage(i)}
                      aria-label={`Show image ${i + 1}`}
                      className={cn(
                        'h-2 rounded-full transition-all',
                        i === activeImage ? 'w-6 bg-primary' : 'w-2 bg-muted-foreground/40 hover:bg-muted-foreground/70'
                      )}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

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

            {/* Seller-defined highlights (product form → Details tab) */}
            {product.highlights && product.highlights.length > 0 && (
              <>
                <Separator className="my-5" />
                <h3 className="text-sm font-bold">Highlights</h3>
                <ul className="mt-3 space-y-2">
                  {product.highlights.map((h, i) => (
                    <li key={`${i}-${h.slice(0, 20)}`} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Check size={15} className="mt-0.5 shrink-0 text-primary" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {/* Seller-defined specifications (product form → Details tab) */}
            {(detailRows.length > 0 || (product.specs && product.specs.length > 0)) && (
              <>
                <Separator className="my-5" />
                <h3 className="text-sm font-bold">Specifications</h3>
                <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
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
                  {(product.specs ?? []).map((s, i) => (
                    <div key={`${i}-${s.label}`} className="flex justify-between gap-4 rounded-lg bg-muted/50 px-4 py-2.5">
                      <span className="shrink-0 text-muted-foreground">{s.label}</span>
                      <span className="text-right font-medium">{s.value}</span>
                    </div>
                  ))}
                  {detailRows.map((row) => (
                    <div key={row.label} className="flex justify-between gap-4 rounded-lg bg-muted/50 px-4 py-2.5">
                      <span className="shrink-0 text-muted-foreground">{row.label}</span>
                      <span className="text-right font-medium">{row.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>

          {/* Shipping & fulfillment (product form → Shipping tab) */}
          {hasShippingInfo && (
            <Card className="mt-4 p-6">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <Truck size={18} className="text-primary" /> Shipping &amp; fulfillment
              </h2>
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                {product.processingDays != null && (
                  <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-2.5">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Package size={14} /> Processing time
                    </span>
                    <span className="font-medium">
                      {product.processingDays} business {product.processingDays === 1 ? 'day' : 'days'}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-2.5">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Truck size={14} /> Shipping cost
                  </span>
                  <span className="font-medium">
                    {product.freeShipping
                      ? 'Free shipping'
                      : product.shippingFee != null
                        ? `${formatUSD(product.shippingFee)} flat rate`
                        : 'Calculated at checkout'}
                  </span>
                </div>
                {(product.lengthCm || product.widthCm || product.heightCm || product.weightGrams) && (
                  <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-2.5">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Ruler size={14} /> Package
                    </span>
                    <span className="font-medium">
                      {[
                        product.weightGrams ? `${product.weightGrams} g` : null,
                        [product.lengthCm, product.widthCm, product.heightCm].some((d) => d != null)
                          ? `${[product.lengthCm, product.widthCm, product.heightCm]
                              .map((d) => d ?? '—')
                              .join(' × ')} cm`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </div>
                )}
              </div>
              {product.shippingPolicy && (
                <p className="mt-4 rounded-lg bg-muted/30 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
                  {product.shippingPolicy}
                </p>
              )}
            </Card>
          )}
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

      {/* ── Mobile sticky buy bar (revealed after the action buttons scroll away) ── */}
      {showBuyBar && !lightboxOpen && (
        <motion.div
          initial={{ y: 88, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 shadow-[0_-4px_20px_rgb(0_0_0/0.06)] backdrop-blur sm:hidden"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          role="complementary"
          aria-label="Quick purchase bar"
        >
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] leading-tight text-muted-foreground">
                {product.title}
                {selectedVariant ? ` · ${selectedVariant.name}` : ''}
              </p>
              <p className="mt-0.5 flex items-baseline gap-1.5 leading-tight">
                <span className="text-lg font-extrabold tracking-tight">{formatUSD(effectivePrice)}</span>
                {effectiveCompareAt && (
                  <span className="text-xs font-normal text-muted-foreground line-through">
                    {formatUSD(effectiveCompareAt)}
                  </span>
                )}
              </p>
            </div>
            <Button
              className="h-11 shrink-0 rounded-xl px-5"
              disabled={effectiveStock === 0 || hasVariantSelectionPending}
              onClick={() => handleAddToCart(false)}
            >
              <ShoppingCart size={16} className="mr-1.5" /> Add
            </Button>
            <Button
              variant="secondary"
              className="h-11 shrink-0 rounded-xl border px-5"
              disabled={effectiveStock === 0 || hasVariantSelectionPending}
              onClick={handleBuyNow}
            >
              <Zap size={15} className="mr-1.5" /> Buy
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  )
}
