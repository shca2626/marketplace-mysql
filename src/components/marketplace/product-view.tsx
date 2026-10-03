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
  FlaskConical,
  Globe,
  Heart,
  Package,
  PackageSearch,
  RotateCcw,
  Ruler,
  Share2,
  ShieldCheck,
  ShoppingCart,
  Star,
  Store,
  Truck,
  Users,
  X,
  Zap,
  ZoomIn,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useMarketplace } from '@/store/marketplace'
import { useApi } from '@/hooks/use-api'
import type { OrganizationDTO, ProductDTO, ProductOfferDTO, ResolvedPriceDTO, ReviewDTO } from '@/lib/types'
import { discountPercent, formatDate, formatNumber, formatUSD, initials, timeAgo } from '@/lib/format'
import { StarPicker } from './star-rating'
import { QuantityInput } from './quantity-input'
import { ProductCard } from './product-card'
import { SellOfferPanel } from './sell-offer-dialog'
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
  /** Phase 4 — ACTIVE offers from additional sellers (listing owner excluded). */
  offers: ProductOfferDTO[]
  /** Phase 4 — the viewer's own offer on this product (any non-archived status). */
  myOffer?: ProductOfferDTO | null
  /** Phase 4 — publication agreement version in force. */
  agreement?: { version: string }
}

/** One row of the "Compare offers" panel: the primary listing + each vendor offer. */
interface CompareRow {
  key: string
  isPrimary: boolean
  sellerId: string
  /** Store (business) name — falls back to the member name. */
  storeName: string
  price: number
  compareAt: number | null
  stock: number
  moq: number | null
  freeShipping: boolean
  shippingFee: number | null
  processingDays: number | null
  leadTimeNote: string | null
  soldCount: number
  /** The backing vendor offer — null for the primary listing row. */
  offer: ProductOfferDTO | null
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

  // ── Phase 4 multi-vendor offers (hooks live above the early returns) ──
  // The listing's own seller IS the primary offer (product.price/stock); the
  // offers[] payload carries every additional vendor. Primary row first,
  // then cheapest — mirroring the API ordering defensively.
  const vendorOffers = useMemo(
    () =>
      [...(data?.offers ?? [])]
        .filter((o) => o.status === 'ACTIVE')
        .sort((a, b) => a.price - b.price || a.createdAt.localeCompare(b.createdAt)),
    [data?.offers]
  )
  const offerSellerCount = useMemo(() => new Set(vendorOffers.map((o) => o.sellerId)).size, [vendorOffers])

  const compareRows: CompareRow[] = useMemo(() => {
    const p = data?.product
    const s = data?.seller
    if (!p || !s) return []
    const rows: CompareRow[] = [
      {
        key: `primary-${s.id}`,
        isPrimary: true,
        sellerId: s.id,
        storeName: s.storeName ?? s.name,
        price: p.price,
        compareAt: p.compareAtPrice ?? null,
        stock: p.stock,
        moq: p.moq ?? null,
        freeShipping: p.freeShipping ?? false,
        shippingFee: p.shippingFee ?? null,
        processingDays: p.processingDays ?? null,
        leadTimeNote: p.shippingPolicy ?? null,
        soldCount: p.soldCount,
        offer: null,
      },
    ]
    for (const o of vendorOffers) {
      rows.push({
        key: `offer-${o.id}`,
        isPrimary: false,
        sellerId: o.sellerId,
        storeName: o.seller.storeName ?? o.seller.name,
        price: o.price,
        compareAt: o.compareAtPrice ?? null,
        stock: o.stock,
        moq: o.moq ?? null,
        freeShipping: o.freeShipping,
        shippingFee: o.shippingFee ?? null,
        processingDays: o.processingDays ?? null,
        leadTimeNote: o.leadTimeNote ?? null,
        soldCount: o.soldCount,
        offer: o,
      })
    }
    return rows
  }, [data, vendorOffers])

  const bestPrice = compareRows.length > 1 ? Math.min(...compareRows.map((r) => r.price)) : null

  /** Add an offer row to the cart — MOQ-aware starting quantity. */
  const addOfferRowToCart = (row: CompareRow) => {
    if (!product || !row.offer) return
    const qty = Math.max(1, Math.min(row.moq ?? 1, row.stock))
    const res = addToCart(product, qty, null, row.offer)
    if (res.ok) {
      toast({
        title: 'Added to cart',
        description: `${qty} × ${product.title} — via ${row.storeName}`,
      })
    } else {
      toast({ title: 'Cannot add to cart', description: res.message, variant: 'destructive' })
    }
  }

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
  // Phase 4: an optional offer targets that specific vendor's offer.
  const handleRequestQuote = (offer?: ProductOfferDTO | null) => {
    if (!product) return
    try {
      window.sessionStorage.setItem(
        RFQ_PREFILL_KEY,
        JSON.stringify({
          productId: product.id,
          title: product.title,
          price: offer?.price ?? product.price,
          offerId: offer?.id ?? null,
        })
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

  /** Refresh the detail payload in place — used by the seller-side offer panel
   *  (myOffer / viewerCanOffer live on the same GET) after any offer mutation. */
  const refreshDetail = async () => {
    if (!productId) return
    try {
      const res = await fetch(`/api/products/${productId}`, { cache: 'no-store' })
      if (res.ok) setData(await res.json())
    } catch {
      /* keep the current payload on transient failures */
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
        <div className="rounded-2xl bg-bh-bg-gold p-5 text-bh-gold-dark shadow-card">
          <PackageSearch size={36} aria-hidden />
        </div>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-bh-navy">
          Product not found
        </h1>
        <p className="mt-2 max-w-sm text-balance text-bh-muted">
          {error ?? "This listing is no longer available — it may have been removed or the link is out of date."}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => navigate('catalog')}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-bh-navy px-5 text-sm font-semibold text-white transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <ArrowLeft size={16} aria-hidden />
            Browse the catalog
          </button>
          <button
            onClick={() => navigate('home')}
            className="inline-flex h-11 items-center rounded-xl border border-bh-border bg-bh-card px-5 text-sm font-medium text-bh-subtle transition-colors hover:border-bh-gold/50 hover:text-bh-navy"
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

  // Phase 3 KYP — public trust block shows VERIFIED rows plus pending ones
  // ("In review"); rejected/inactive rows stay hidden.
  const visibleCertifications = (product.certifications ?? []).filter(
    (c) => c.status === 'VERIFIED' || c.status === 'PENDING'
  )

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Breadcrumb */}
      <nav className="mb-6 flex flex-wrap items-center gap-1 text-xs text-bh-muted" aria-label="Breadcrumb">
        <button className="hover:text-bh-navy" onClick={() => navigate('home')}>
          Home
        </button>
        <ChevronRight size={13} className="text-bh-faded" />
        <button className="hover:text-bh-navy" onClick={() => navigate('catalog', { category: product.category.slug })}>
          {product.category.name}
        </button>
        <ChevronRight size={13} className="text-bh-faded" />
        <span className="line-clamp-1 max-w-64 font-semibold text-bh-navy">{product.title}</span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-2">
        {/* ── Gallery ── */}
        <div>
          <motion.div
            key={activeImage}
            initial={{ opacity: 0.4, scale: 0.99 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25 }}
            className="group relative overflow-hidden rounded-2xl border border-bh-border bg-bh-card shadow-card"
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
                <span className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-bh-card/90 text-bh-navy opacity-0 shadow-sm backdrop-blur transition-opacity duration-200 group-hover:opacity-100">
                  <ZoomIn size={16} />
                </span>
              </button>
            ) : (
              <div className="flex aspect-square items-center justify-center text-bh-muted">No image</div>
            )}
            {discount !== null && (
              <Badge className="absolute left-3 top-3 bg-destructive/95 text-sm font-bold text-white hover:bg-destructive">
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
                    i === activeImage
                      ? 'border-bh-gold'
                      : 'border-transparent opacity-60 hover:opacity-100'
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
          <Badge className="rounded-full border border-bh-gold/25 bg-bh-bg-gold text-xs font-semibold text-bh-gold-dark hover:bg-bh-bg-gold">
            {product.category.name}
          </Badge>
          <h1 className="mt-3 text-2xl font-bold leading-snug tracking-tight text-bh-navy sm:text-3xl">{product.title}</h1>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <div className="flex items-center gap-1.5">
              <Star size={15} className="fill-bh-gold text-bh-gold" />
              <span className="font-semibold text-bh-navy">{product.rating.toFixed(1)}</span>
              <button
                className="text-bh-muted underline-offset-2 hover:text-bh-navy hover:underline"
                onClick={() => document.getElementById('reviews-tab')?.click()}
              >
                {product.reviewCount} reviews
              </button>
            </div>
            <span className="text-bh-faded">·</span>
            <span className="text-bh-muted">{formatNumber(product.soldCount)} sold</span>
          </div>

          {/* Price — contract pricing for verified businesses, retail otherwise */}
          {contract ? (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="mt-5 rounded-2xl border border-bh-gold/40 bg-bh-gold-pale p-4"
              data-testid="contract-price"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-bh-gold-dark">
                  <BadgePercent size={13} /> Your price
                </span>
                <span className="rounded-full bg-bh-navy/10 px-2 py-0.5 text-[10px] font-semibold text-bh-navy">
                  {contract.source === 'CONTRACT' ? 'Contract pricing' : 'Group pricing'}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-end gap-x-3 gap-y-1">
                <span className="text-4xl font-extrabold tracking-tight text-bh-navy" data-testid="contract-unit-price">
                  {formatUSD(contract.unitPrice)}
                </span>
                <span className="pb-1 text-lg text-bh-muted line-through">
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
              <p className="mt-1.5 text-xs text-bh-muted">
                {contract.priceListName ? `${contract.priceListName} · ` : ''}at qty {quantity}
                {activeOrg ? ` · for ${activeOrg.name}` : ''}
              </p>
            </motion.div>
          ) : (
            <div className="mt-5 flex items-end gap-3">
              <span className="text-4xl font-extrabold tracking-tight text-bh-navy">{formatUSD(effectivePrice)}</span>
              {effectiveCompareAt && (
                <span className="pb-1 text-lg text-bh-muted line-through">
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

          {/* Phase 4 — multi-vendor teaser chip (only when other sellers sell this too) */}
          {vendorOffers.length > 0 && (
            <button
              type="button"
              onClick={() =>
                document.getElementById('offers-section')?.scrollIntoView({ block: 'start', behavior: 'smooth' })
              }
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-500/20 dark:text-emerald-300"
            >
              <Users size={13} aria-hidden />
              {vendorOffers.length} {vendorOffers.length === 1 ? 'offer' : 'offers'} from {offerSellerCount}{' '}
              {offerSellerCount === 1 ? 'other seller' : 'other sellers'}
              <ChevronRight size={12} aria-hidden className="transition-transform group-hover:translate-x-0.5" />
            </button>
          )}

          <p className="mt-4 leading-relaxed text-bh-subtle">{product.description}</p>

          {/* ── Variant selector (seller-defined options) ── */}
          {variantGroups.length > 0 && (
            <div className="mt-6 space-y-4">
              {variantGroups.map((g) => (
                <div key={g.name}>
                  <p className="mb-2 text-sm font-semibold text-bh-navy">
                    {g.name}
                    {selectedOptions[g.name] && (
                      <span className="ml-1 font-normal text-bh-muted">: {selectedOptions[g.name]}</span>
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
                              ? 'border-bh-navy bg-bh-navy text-white'
                              : 'border-bh-border-dark bg-bh-card text-bh-subtle hover:border-bh-gold/50 hover:text-bh-navy',
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
                effectiveStock === 0 ? 'bg-destructive' : effectiveStock <= 5 ? 'bg-bh-gold' : 'bg-emerald-500'
              )}
            />
            {effectiveStock === 0 ? (
              <span className="font-medium text-destructive">Out of stock</span>
            ) : effectiveStock <= 5 ? (
              <span className="font-medium text-bh-gold-dark">
                Selling fast — only {effectiveStock} left
              </span>
            ) : (
              <span className="text-bh-muted">{effectiveStock} in stock</span>
            )}
            {effectiveSku && (
              <>
                <span className="text-bh-faded">·</span>
                <span className="text-bh-muted">
                  SKU <span className="font-mono text-xs">{effectiveSku}</span>
                </span>
              </>
            )}
          </div>

          {/* Quantity + actions */}
          <div ref={buyActionsRef} className="mt-6 flex flex-wrap items-center gap-3">
            <QuantityInput value={quantity} onChange={setQuantity} max={Math.max(1, effectiveStock)} className="border-bh-border-dark shadow-card" />
            <Button
              size="lg"
              className="h-12 flex-1 rounded-xl bg-bh-gold text-base font-bold text-bh-navy-deep shadow-card hover:bg-bh-gold-light sm:flex-none sm:px-8"
              disabled={effectiveStock === 0 || hasVariantSelectionPending}
              onClick={() => handleAddToCart(false)}
            >
              <ShoppingCart size={17} className="mr-2" /> Add to cart
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 rounded-xl border-bh-border-dark text-base sm:px-8"
              disabled={effectiveStock === 0 || hasVariantSelectionPending}
              onClick={handleBuyNow}
            >
              <Zap size={16} className="mr-2" /> Buy now
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 flex-1 rounded-xl border-bh-border-dark text-base sm:flex-none sm:px-8"
              onClick={() => handleRequestQuote(null)}
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
          <p className="mt-3 text-xs text-bh-muted">
            Buying in bulk?{' '}
            <button
              onClick={() => handleRequestQuote(null)}
              className="font-semibold text-bh-action underline-offset-2 hover:text-bh-navy hover:underline"
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
              <div key={perk.title} className="rounded-xl border border-bh-border bg-bh-card p-3.5 text-center shadow-card">
                <perk.icon size={18} className="mx-auto text-bh-gold" />
                <p className="mt-2 text-xs font-semibold leading-tight text-bh-navy">{perk.title}</p>
                <p className="mt-0.5 text-[11px] text-bh-muted">{perk.text}</p>
              </div>
            ))}
          </div>

          {/* Seller card — links to the public storefront */}
          {data.seller && (
            <Card
              className="group mt-7 cursor-pointer border-bh-border bg-bh-card p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-bh-gold/40 hover:shadow-hover"
              onClick={() => navigate('store', { sellerId: data.seller!.id })}
              role="link"
              aria-label={`Visit ${data.seller.storeName ?? data.seller.name} store`}
            >
              <div className="flex items-center gap-4">
                <Avatar className="h-13 w-13 border">
                  <AvatarFallback className="bg-bh-bg-gold font-bold text-bh-gold-dark">
                    {initials(data.seller.storeName ?? data.seller.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate font-semibold text-bh-navy group-hover:text-bh-action">
                      {data.seller.storeName ?? data.seller.name}
                    </p>
                    <BadgeCheck size={15} className="shrink-0 text-bh-gold" />
                  </div>
                  <p className="mt-0.5 text-xs text-bh-muted">
                    Member since {formatDate(data.seller.memberSince)} · {data.seller.activeListings} listings
                  </p>
                  {data.seller.storeBio && (
                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-bh-muted">
                      {data.seller.storeBio}
                    </p>
                  )}
                </div>
                <span className="hidden shrink-0 items-center gap-1 text-xs font-semibold text-bh-action sm:flex">
                  View store
                  <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </Card>
          )}
        </motion.div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
         Phase 4 — "Compare offers" (multi-vendor).
         ── 4-c INTEGRATION POINT ──
         The seller-side "Sell this product" panel (product.viewerCanOffer /
         myOffer) should mount in this file right AFTER this offers section —
         buyer surface first, seller surface below it. Keep buyer logic in
         this block untouched; see agent-ctx notes in worklog 4-d.
         ───────────────────────────────────────────────────────────────────── */}
      {compareRows.length > 1 && (
        <section id="offers-section" className="mt-14 scroll-mt-24" aria-labelledby="offers-heading">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-bh-gold/25 bg-bh-bg-gold px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-bh-gold-dark">
                <Users size={12} aria-hidden /> Multi-vendor
              </span>
              <h2
                id="offers-heading"
                className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xl font-bold tracking-tight text-bh-navy"
              >
                Compare offers
                <span className="text-sm font-semibold text-bh-muted">
                  {compareRows.length} sellers on this listing
                </span>
              </h2>
            </div>
            <p className="max-w-xs text-xs leading-relaxed text-bh-muted">
              Same product, sold and fulfilled by each vendor — price, stock, minimums and lead times can differ.
            </p>
          </div>

          <div className="space-y-3">
            {compareRows.map((row) => {
              const out = row.stock === 0
              const isBest = bestPrice !== null && row.price === bestPrice
              return (
                <Card
                  key={row.key}
                  className={cn(
                    'border-bh-border bg-bh-card p-4 shadow-card sm:p-5',
                    out && 'opacity-70'
                  )}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                    {/* Vendor */}
                    <div className="min-w-0 lg:w-64">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10 border">
                          <AvatarFallback className="bg-bh-bg-gold text-xs font-bold text-bh-gold-dark">
                            {initials(row.storeName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              className="truncate font-semibold text-bh-navy transition-colors hover:text-bh-action"
                              onClick={() => navigate('store', { sellerId: row.sellerId })}
                              aria-label={`Visit ${row.storeName} store`}
                            >
                              {row.storeName}
                            </button>
                            {row.isPrimary && (
                              <Badge
                                variant="secondary"
                                className="h-5 rounded-full px-1.5 text-[10px] font-semibold text-bh-navy"
                              >
                                <Store size={10} className="mr-1" /> Primary listing
                              </Badge>
                            )}
                            {isBest && (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                <Zap size={10} aria-hidden /> Best price
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-bh-muted">
                            <span>Sold by {row.storeName}</span>
                            <span className="text-bh-faded">·</span>
                            <span>{formatNumber(row.soldCount)} sold</span>
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Price + terms */}
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-6 gap-y-2">
                      <div className="flex items-end gap-2">
                        <span className="text-2xl font-extrabold tracking-tight text-bh-navy">
                          {formatUSD(row.price)}
                        </span>
                        {row.compareAt && (
                          <span className="pb-0.5 text-xs text-bh-muted line-through">
                            {formatUSD(row.compareAt)}
                          </span>
                        )}
                      </div>
                      <dl className="grid flex-1 grid-cols-2 gap-x-5 gap-y-1 text-[11px] sm:grid-cols-3 lg:max-w-md">
                        <div className="flex items-center gap-1">
                          <dt className="text-bh-muted">Stock:</dt>
                          <dd
                            className={cn(
                              'font-semibold',
                              out ? 'text-destructive' : row.stock <= 5 ? 'text-bh-gold-dark' : 'text-bh-ink'
                            )}
                          >
                            {out ? 'Out of stock' : `${formatNumber(row.stock)} units`}
                          </dd>
                        </div>
                        {row.moq != null && row.moq > 1 && (
                          <div className="flex items-center gap-1">
                            <dt className="text-bh-muted">MOQ:</dt>
                            <dd className="font-semibold text-bh-ink">{formatNumber(row.moq)}</dd>
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <dt className="text-bh-muted">Shipping:</dt>
                          <dd className="font-semibold text-bh-ink">
                            {row.freeShipping
                              ? 'Free'
                              : row.shippingFee != null
                                ? `${formatUSD(row.shippingFee)} fee`
                                : 'At checkout'}
                          </dd>
                        </div>
                        <div className="col-span-2 flex items-center gap-1 sm:col-span-1">
                          <dt className="text-bh-muted">Lead time:</dt>
                          <dd className="font-semibold text-bh-ink">
                            {row.processingDays != null
                              ? `${row.processingDays} ${row.processingDays === 1 ? 'day' : 'days'}`
                              : 'Standard'}
                          </dd>
                        </div>
                      </dl>
                    </div>

                    {/* CTAs */}
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {row.leadTimeNote && (
                        <p className="w-full text-[11px] leading-snug text-bh-muted lg:hidden">{row.leadTimeNote}</p>
                      )}
                      <Button
                        size="lg"
                        className="h-11 flex-1 rounded-xl bg-bh-gold font-bold text-bh-navy-deep shadow-card hover:bg-bh-gold-light sm:flex-none"
                        disabled={out}
                        onClick={() =>
                          row.offer ? addOfferRowToCart(row) : handleAddToCart(false)
                        }
                      >
                        <ShoppingCart size={16} className="mr-1.5" /> Add to cart
                      </Button>
                      <Button
                        size="lg"
                        variant="outline"
                        className="h-11 flex-1 rounded-xl border-bh-border-dark sm:flex-none"
                        disabled={out}
                        onClick={() => handleRequestQuote(row.offer)}
                      >
                        <FileText size={15} className="mr-1.5" /> Request quote
                      </Button>
                    </div>
                  </div>
                  {row.leadTimeNote && (
                    <p className="mt-2 hidden items-center gap-1 text-[11px] text-bh-muted lg:flex">
                      <Truck size={12} className="shrink-0" aria-hidden /> {row.leadTimeNote}
                    </p>
                  )}
                </Card>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Phase 4 — seller-side “Sell this product” / “Your offer” panel.
          4-c integration: everything seller-facing lives in sell-offer-dialog.tsx
          (renders null for buyers / listing owners with no offer). ── */}
      <SellOfferPanel
        product={product}
        myOffer={data.myOffer ?? null}
        viewerCanOffer={product.viewerCanOffer ?? false}
        onChanged={() => void refreshDetail()}
      />

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
        <TabsList className="h-11 w-full justify-start gap-1 overflow-x-auto rounded-xl bg-bh-soft-blue/70 p-1 sm:w-auto">
          <TabsTrigger value="description" className="rounded-lg px-5 text-sm">
            Description
          </TabsTrigger>
          <TabsTrigger value="reviews" id="reviews-tab" className="rounded-lg px-5 text-sm">
            Reviews ({product.reviewCount})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="description" className="mt-6">
          <Card className="border-bh-border bg-bh-card p-6 shadow-card">
            <h2 className="text-lg font-bold text-bh-navy">About this item</h2>
            <p className="mt-3 leading-relaxed text-bh-subtle">{product.description}</p>

            {/* Seller-defined highlights (product form → Details tab) */}
            {product.highlights && product.highlights.length > 0 && (
              <>
                <Separator className="my-5" />
                <h3 className="text-sm font-bold text-bh-navy">Highlights</h3>
                <ul className="mt-3 space-y-2">
                  {product.highlights.map((h, i) => (
                    <li key={`${i}-${h.slice(0, 20)}`} className="flex items-start gap-2 text-sm text-bh-subtle">
                      <Check size={15} className="mt-0.5 shrink-0 text-bh-gold" />
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
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-bh-navy">Specifications</h3>
                  {(product.hasVerifiedSpecs ||
                    (product.certifications ?? []).some((c) => c.status === 'VERIFIED')) && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      <BadgeCheck size={12} aria-hidden /> Verified specs
                    </span>
                  )}
                </div>
                <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  <div className="flex justify-between rounded-lg bg-bh-soft-blue/60 px-4 py-2.5">
                    <span className="text-bh-muted">Category</span>
                    <span className="font-medium text-bh-ink">{product.category.name}</span>
                  </div>
                  <div className="flex justify-between rounded-lg bg-bh-soft-blue/60 px-4 py-2.5">
                    <span className="text-bh-muted">Listed</span>
                    <span className="font-medium text-bh-ink">{formatDate(product.createdAt)}</span>
                  </div>
                  <div className="flex justify-between rounded-lg bg-bh-soft-blue/60 px-4 py-2.5">
                    <span className="text-bh-muted">Units sold</span>
                    <span className="font-medium text-bh-ink">{formatNumber(product.soldCount)}</span>
                  </div>
                  <div className="flex justify-between rounded-lg bg-bh-soft-blue/60 px-4 py-2.5">
                    <span className="text-bh-muted">Ships from</span>
                    <span className="font-medium text-bh-ink">Vendora fulfillment</span>
                  </div>
                  {(product.specs ?? []).map((s, i) => (
                    <div key={`${i}-${s.label}`} className="flex justify-between gap-4 rounded-lg bg-bh-soft-blue/60 px-4 py-2.5">
                      <span className="shrink-0 text-bh-muted">{s.label}</span>
                      <span className="text-right font-medium text-bh-ink">{s.value}</span>
                    </div>
                  ))}
                  {detailRows.map((row) => (
                    <div key={row.label} className="flex justify-between gap-4 rounded-lg bg-bh-soft-blue/60 px-4 py-2.5">
                      <span className="shrink-0 text-bh-muted">{row.label}</span>
                      <span className="text-right font-medium text-bh-ink">{row.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Certifications & compliance (Phase 3 KYP) — VERIFIED rows earn the
                trust block; PENDING shows as “In review”; rejected stays hidden */}
            {visibleCertifications.length > 0 && (
              <>
                <Separator className="my-5" />
                <h3 className="text-sm font-bold text-bh-navy">Certifications &amp; compliance</h3>
                <div className="mt-3 space-y-2">
                  {visibleCertifications.map((cert) => {
                    const Icon =
                      cert.kind === 'DATASHEET'
                        ? FileText
                        : cert.kind === 'WARRANTY'
                          ? ShieldCheck
                          : cert.kind === 'ORIGIN'
                            ? Globe
                            : cert.kind === 'TEST_REPORT'
                              ? FlaskConical
                              : cert.kind === 'CERTIFICATE'
                                ? BadgeCheck
                                : FileText
                    return (
                      <div
                        key={cert.id}
                        className="flex flex-wrap items-center gap-3 rounded-lg border bg-bh-card px-4 py-3"
                      >
                        <Icon size={16} className="shrink-0 text-bh-gold-dark" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-bh-ink">{cert.title}</p>
                          <p className="mt-0.5 text-xs text-bh-muted">
                            {[
                              cert.issuedBy,
                              cert.issuedAt ? `Issued ${formatDate(cert.issuedAt)}` : null,
                              cert.expiresAt ? `Valid until ${formatDate(cert.expiresAt)}` : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        </div>
                        {cert.url && (
                          <a
                            href={cert.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold text-bh-ink transition-colors hover:border-primary/50 hover:text-primary"
                          >
                            View <ChevronRight size={12} aria-hidden />
                          </a>
                        )}
                        {cert.status === 'VERIFIED' ? (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            <BadgeCheck size={11} aria-hidden /> Verified
                          </span>
                        ) : (
                          <span className="inline-flex shrink-0 items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            In review
                          </span>
                        )}
                      </div>
                    )
                  })}
                  <p className="text-[11px] text-bh-muted">
                    Documentation on this listing is reviewed by Vendora.
                  </p>
                </div>
              </>
            )}
          </Card>

          {/* Shipping & fulfillment (product form → Shipping tab) */}
          {hasShippingInfo && (
            <Card className="mt-4 border-bh-border bg-bh-card p-6 shadow-card">
              <h2 className="flex items-center gap-2 text-lg font-bold text-bh-navy">
                <Truck size={18} className="text-bh-gold-dark" /> Shipping &amp; fulfillment
              </h2>
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                {product.processingDays != null && (
                  <div className="flex items-center justify-between rounded-lg bg-bh-soft-blue/60 px-4 py-2.5">
                    <span className="flex items-center gap-1.5 text-bh-muted">
                      <Package size={14} /> Processing time
                    </span>
                    <span className="font-medium text-bh-ink">
                      {product.processingDays} business {product.processingDays === 1 ? 'day' : 'days'}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between rounded-lg bg-bh-soft-blue/60 px-4 py-2.5">
                  <span className="flex items-center gap-1.5 text-bh-muted">
                    <Truck size={14} /> Shipping cost
                  </span>
                  <span className="font-medium text-bh-ink">
                    {product.freeShipping
                      ? 'Free shipping'
                      : product.shippingFee != null
                        ? `${formatUSD(product.shippingFee)} flat rate`
                        : 'Calculated at checkout'}
                  </span>
                </div>
                {(product.lengthCm || product.widthCm || product.heightCm || product.weightGrams) && (
                  <div className="flex items-center justify-between rounded-lg bg-bh-soft-blue/60 px-4 py-2.5">
                    <span className="flex items-center gap-1.5 text-bh-muted">
                      <Ruler size={14} /> Package
                    </span>
                    <span className="font-medium text-bh-ink">
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
                <p className="mt-4 rounded-lg bg-bh-soft-blue/40 px-4 py-3 text-sm leading-relaxed text-bh-subtle">
                  {product.shippingPolicy}
                </p>
              )}
            </Card>
          )}
        </TabsContent>

        <TabsContent value="reviews" className="mt-6">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Summary */}
            <Card className="h-fit border-bh-border bg-bh-card p-6 shadow-card">
              <div className="flex items-end gap-2">
                <span className="text-5xl font-extrabold leading-none text-bh-navy">{product.rating.toFixed(1)}</span>
                <div className="pb-1">
                  <div className="flex">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star
                        key={i}
                        size={16}
                        className={
                          product.rating >= i - 0.25
                            ? 'fill-bh-gold text-bh-gold'
                            : 'fill-muted text-muted-foreground/30'
                        }
                      />
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-bh-muted">{totalReviews} reviews</p>
                </div>
              </div>
              <div className="mt-5 space-y-2">
                {ratingBuckets.map((b) => (
                  <div key={b.star} className="flex items-center gap-2 text-xs">
                    <span className="w-7 shrink-0 text-bh-muted">{b.star}★</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-bh-soft-blue">
                      <div
                        className="h-full rounded-full bg-bh-gold transition-all"
                        style={{ width: `${totalReviews ? (b.count / totalReviews) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="w-6 shrink-0 text-right text-bh-muted">{b.count}</span>
                  </div>
                ))}
              </div>

              <Separator className="my-5" />

              {/* Review form */}
              <form onSubmit={submitReview} className="space-y-3">
                <p className="text-sm font-semibold text-bh-navy">
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
                  <p className="text-center text-xs text-bh-muted">Sign in to leave a review</p>
                )}
              </form>
            </Card>

            {/* Review list */}
            <div className="space-y-4 lg:col-span-2">
              {data.reviews.length === 0 ? (
                <Card className="flex flex-col items-center border-bh-border bg-bh-card p-10 text-center shadow-card">
                  <Star size={36} className="text-bh-gold/50" />
                  <p className="mt-3 font-semibold text-bh-navy">No reviews yet</p>
                  <p className="mt-1 text-sm text-bh-muted">Be the first to review this product</p>
                </Card>
              ) : (
                data.reviews.map((review) => (
                  <Card key={review.id} className="border-bh-border bg-bh-card p-5 shadow-card">
                    <div className="flex items-start gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarFallback className="bg-bh-bg-gold text-xs font-bold text-bh-gold-dark">
                          {initials(review.user.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-bh-navy">{review.user.name}</p>
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
                                    ? 'fill-bh-gold text-bh-gold'
                                    : 'fill-muted text-muted-foreground/30'
                                }
                              />
                            ))}
                          </div>
                          <span className="text-xs text-bh-muted">{timeAgo(review.createdAt)}</span>
                        </div>
                        <p className="mt-2.5 text-sm leading-relaxed text-bh-subtle">{review.comment}</p>
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
          <div className="mb-5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-bh-gold/25 bg-bh-bg-gold px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-bh-gold-dark">
              Related
            </span>
            <h2 id="related-heading" className="mt-3 text-xl font-bold tracking-tight text-bh-navy">
              You might also like
            </h2>
          </div>
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
          className="fixed inset-x-0 bottom-0 z-40 border-t border-bh-border bg-bh-card/95 shadow-[0_-4px_20px_rgb(6_57_108/0.08)] backdrop-blur sm:hidden"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          role="complementary"
          aria-label="Quick purchase bar"
        >
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] leading-tight text-bh-muted">
                {product.title}
                {selectedVariant ? ` · ${selectedVariant.name}` : ''}
              </p>
              <p className="mt-0.5 flex items-baseline gap-1.5 leading-tight">
                <span className="text-lg font-extrabold tracking-tight text-bh-navy">{formatUSD(effectivePrice)}</span>
                {effectiveCompareAt && (
                  <span className="text-xs font-normal text-bh-muted line-through">
                    {formatUSD(effectiveCompareAt)}
                  </span>
                )}
              </p>
            </div>
            <Button
              className="h-11 shrink-0 rounded-xl bg-bh-gold font-bold text-bh-navy-deep hover:bg-bh-gold-light px-5"
              disabled={effectiveStock === 0 || hasVariantSelectionPending}
              onClick={() => handleAddToCart(false)}
            >
              <ShoppingCart size={16} className="mr-1.5" /> Add
            </Button>
            <Button
              variant="outline"
              className="h-11 shrink-0 rounded-xl border-bh-border-dark px-5"
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
