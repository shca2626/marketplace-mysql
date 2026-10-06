'use client'

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  BadgeCheck,
  CalendarCheck2,
  Check,
  ChevronRight,
  Image as ImageIcon,
  Info,
  LayoutDashboard,
  Package,
  PackageCheck,
  Share2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Star,
  Store,
  TrendingUp,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useMarketplace } from '@/store/marketplace'
import { useApi } from '@/hooks/use-api'
import type { ProductDTO, StoreCategoryDTO, StoreDTO, StoreTrustDTO } from '@/lib/types'
import { formatDate, formatNumber, initials } from '@/lib/format'
import { viewToHref } from '@/lib/routing'
import { absoluteUrl, shareLink } from '@/lib/share'
import { getStoreCover } from '@/lib/store-covers'
import { ProductCard, ProductCardSkeleton } from './product-card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface StoreProfileResponse {
  seller: StoreDTO
  categories: StoreCategoryDTO[]
}

interface ProductsResponse {
  items: ProductDTO[]
  total: number
}

const SORTS = [
  { value: 'popular', label: 'Most popular' },
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'rating', label: 'Best rated' },
]

const PAGE_SIZE = 12

export function StoreView() {
  const sellerId = useMarketplace((s) => s.params.sellerId)
  const navigate = useMarketplace((s) => s.navigate)
  const user = useMarketplace((s) => s.user)

  const { data: profile, loading: profileLoading, error: profileError } = useApi<StoreProfileResponse>(
    sellerId ? `/api/sellers/${sellerId}` : null
  )
  const store = profile?.seller

  const [category, setCategory] = useState('')
  const [sort, setSort] = useState('popular')
  const [visible, setVisible] = useState(PAGE_SIZE)
  const [justShared, setJustShared] = useState(false)

  // Cover picked by the seller. Primary source is the server-persisted choice
  // on the seller profile (STAB-8); localStorage is the fallback for stores
  // whose choice predates server persistence. Read once per seller — the
  // legacy pick never changes while the view is mounted.
  const [localCover, setLocalCover] = useState(() => (sellerId ? getStoreCover(sellerId) : null))
  const cover = store?.storeCoverUrl
    ? { url: store.storeCoverUrl, label: store.storeCoverLabel ?? 'storefront cover' }
    : localCover

  const storeName = store?.storeName ?? store?.name ?? 'Store'

  const handleShareStore = async () => {
    if (!sellerId) return
    const url = absoluteUrl(viewToHref('store', { sellerId }))
    const outcome = await shareLink(url, `${storeName} on Vendora`, `Discover ${storeName} on Vendora`)
    if (outcome === 'shared') {
      toast({ title: 'Thanks for spreading the word!', description: storeName })
    } else if (outcome === 'copied') {
      setJustShared(true)
      setTimeout(() => setJustShared(false), 1800)
      toast({ title: 'Link copied to clipboard', description: 'Share it anywhere you like' })
    } else if (outcome === 'failed') {
      toast({ title: 'Could not share', description: 'Copy failed — try again in a moment', variant: 'destructive' })
    }
  }

  // Reset local filters when switching stores while the view stays mounted
  // (render-time sync — same pattern as CatalogView, avoids effect cascades)
  const [prevSeller, setPrevSeller] = useState(sellerId)
  if (prevSeller !== sellerId) {
    setPrevSeller(sellerId)
    setCategory('')
    setSort('popular')
    setVisible(PAGE_SIZE)
    setLocalCover(sellerId ? getStoreCover(sellerId) : null)
  }

  const productsQuery = useMemo(() => {
    const sp = new URLSearchParams({ sellerId: sellerId ?? '', limit: '48', sort })
    if (category) sp.set('category', category)
    return sellerId ? `/api/products?${sp.toString()}` : null
  }, [sellerId, category, sort])

  const { data: productsData, loading: productsLoading } = useApi<ProductsResponse>(productsQuery)
  const products = productsData?.items ?? []
  const isOwnStore = Boolean(user && store && user.id === store.id)
  /* ── 404 / error state ── */
  if (!sellerId || (profileError && !store)) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16">
        <Card className="flex flex-col items-center p-12 text-center">
          <Store size={40} className="text-muted-foreground/40" />
          <h1 className="mt-4 text-xl font-bold">Store not found</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            This store may have been removed or the link is incorrect.
          </p>
          <Button className="mt-6 rounded-xl" onClick={() => navigate('catalog')}>
            Browse the marketplace
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-1 text-sm text-muted-foreground" aria-label="Breadcrumb">
        <button className="hover:text-primary" onClick={() => navigate('home')}>
          Home
        </button>
        <ChevronRight size={13} />
        <span className="max-w-64 truncate font-medium text-foreground">{storeName}</span>
      </nav>

      {/* ── Store hero ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <Card className="overflow-hidden gap-0 py-0">
          {/* Cover — the seller's curated, profile-persisted image (STAB-8),
              or the default warm gradient */}
          <div className="relative h-32 overflow-hidden bg-gradient-to-br from-primary/85 via-primary/60 to-amber-400/70 sm:h-40">
            {cover ? (
              <>
                <img
                  src={cover.url}
                  alt={`${storeName} storefront cover — ${cover.label}`}
                  className="absolute inset-0 h-full w-full object-cover"
                />
                {/* warm wash keeps the card on-brand over photos */}
                <div
                  className="absolute inset-0 bg-gradient-to-r from-primary/55 via-primary/20 to-amber-500/25 mix-blend-multiply"
                  aria-hidden
                />
              </>
            ) : (
              <div
                className="absolute inset-0 opacity-25 mix-blend-overlay"
                style={{
                  backgroundImage:
                    'radial-gradient(circle at 20% 50%, rgba(255,255,255,0.5) 0, transparent 40%), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.35) 0, transparent 45%)',
                }}
                aria-hidden
              />
            )}
            <Store className="absolute bottom-4 right-5 h-16 w-16 text-white/25" aria-hidden />
            {isOwnStore && (
              <Button
                variant="secondary"
                size="sm"
                className="absolute bottom-3 left-4 h-8 rounded-full bg-background/85 px-3 text-xs backdrop-blur transition-colors hover:bg-background"
                onClick={() => navigate('seller', { sellerTab: 'overview' })}
              >
                <ImageIcon size={13} className="mr-1.5" /> Change cover
              </Button>
            )}
          </div>

          <div className="relative px-5 pb-5 sm:px-6">
            <div className="-mt-10 flex flex-wrap items-end justify-between gap-4">
              <div className="flex items-end gap-4">
                {profileLoading || !store ? (
                  <Skeleton className="h-20 w-20 rounded-full border-4 border-card" />
                ) : (
                  <Avatar className="h-20 w-20 border-4 border-card shadow-md">
                    <AvatarFallback className="bg-card text-xl font-bold text-primary">
                      {initials(storeName)}
                    </AvatarFallback>
                  </Avatar>
                )}
                <div className="min-w-0 pb-1">
                  {profileLoading || !store ? (
                    <Skeleton className="h-7 w-48" />
                  ) : (
                    <div className="flex items-center gap-2">
                      <h1 className="truncate text-2xl font-bold tracking-tight">{storeName}</h1>
                      {/* Phase 12-c: dynamic trust badge — only verified stores
                          carry the BadgeCheck; others get an honest shield. */}
                      <TrustBadgeIcon badge={store.trust?.badge} />
                    </div>
                  )}
                </div>
              </div>
              {isOwnStore && (
                <Button
                  variant="secondary"
                  className="rounded-xl"
                  onClick={() => navigate('seller')}
                >
                  <LayoutDashboard size={15} className="mr-1.5" /> Manage your store
                </Button>
              )}
              {sellerId && (
                <Button
                  variant="outline"
                  className={cn(
                    'rounded-xl bg-card/80 backdrop-blur transition-colors',
                    justShared && 'border-emerald-500/60 text-emerald-600 dark:text-emerald-400'
                  )}
                  onClick={handleShareStore}
                  aria-label="Share this store"
                >
                  {justShared ? <Check size={15} className="mr-1.5" /> : <Share2 size={15} className="mr-1.5" />}
                  {justShared ? 'Copied!' : 'Share'}
                </Button>
              )}
            </div>

            {/* Bio */}
            {store?.storeBio && (
              <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                {store.storeBio}
              </p>
            )}
          </div>
        </Card>
      </motion.div>

      {/* ── Trust panel (Phase 12-c) — every counter traces to a live query;
          absent history renders as em dashes, never invented metrics ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.08 }}
      >
        <Card className="gap-0 border-primary/15 py-0">
          <div className="p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-primary" aria-hidden />
                <h2 className="text-sm font-bold tracking-tight">Trust &amp; track record</h2>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex min-h-9 items-center gap-1 rounded-full px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="How is this calculated?"
                  >
                    <Info size={13} aria-hidden /> How is this calculated?
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-72 text-left font-normal leading-relaxed">
                  Counters are computed live from marketplace records: order items delivered, disputes
                  raised on this store&apos;s orders, product ratings, and time on the platform. An em dash
                  means there is not enough history yet — nothing here is estimated.
                </TooltipContent>
              </Tooltip>
            </div>

            {profileLoading || !store ? (
              <div className="mt-4 space-y-3">
                <Skeleton className="h-8 w-72 rounded-full" />
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-[78px] rounded-xl" />
                  ))}
                </div>
              </div>
            ) : (
              <StoreTrustPanel store={store} />
            )}
          </div>
        </Card>
      </motion.div>

      {/* ── Filters ── */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold tracking-tight">
          {category && profile
            ? `${profile.categories.find((c) => c.slug === category)?.name ?? 'Listings'} from this store`
            : 'Everything from this store'}
          {productsData && (
            <span className="ml-2 align-middle text-sm font-normal text-muted-foreground">
              {productsData.total} {productsData.total === 1 ? 'item' : 'items'}
            </span>
          )}
        </h2>
        <Select value={sort} onValueChange={(v) => { setSort(v); setVisible(PAGE_SIZE) }}>
          <SelectTrigger className="h-10 w-44 rounded-xl text-sm" aria-label="Sort products">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Category chips */}
      {profile && profile.categories.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            onClick={() => { setCategory(''); setVisible(PAGE_SIZE) }}
            className={cn(
              'shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all',
              !category
                ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                : 'bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground'
            )}
          >
            All
          </button>
          {profile.categories.map((c) => (
            <button
              key={c.id}
              onClick={() => { setCategory(c.slug); setVisible(PAGE_SIZE) }}
              className={cn(
                'shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all',
                category === c.slug
                  ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                  : 'bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground'
              )}
            >
              {c.name}
              <Badge variant="secondary" className="ml-1.5 h-4 rounded-full px-1.5 text-[10px]">
                {c.count}
              </Badge>
            </button>
          ))}
        </div>
      )}

      {/* ── Product grid ── */}
      <div className="mt-5">
        {productsLoading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        ) : products.length === 0 ? (
          <Card className="flex flex-col items-center p-12 text-center">
            <Package size={36} className="text-muted-foreground/40" />
            <p className="mt-3 font-semibold">No listings here yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              This seller hasn&apos;t published anything in this section.
            </p>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {products.slice(0, visible).map((p, i) => (
                <ProductCard key={p.id} product={p} index={i} />
              ))}
            </div>
            {visible < products.length && (
              <div className="mt-8 text-center">
                <Button
                  variant="outline"
                  className="rounded-xl px-8"
                  onClick={() => setVisible((v) => v + PAGE_SIZE)}
                >
                  Show more ({products.length - visible} remaining)
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Trust panel pieces (Phase 12-c) ─────────────────────────────────────────

/** Dynamic badge next to the store name — only verified businesses carry the
 *  BadgeCheck; identity-verified stores a shield-check; everyone else a
 *  neutral shield with an honest label (never a fake checkmark). */
function TrustBadgeIcon({ badge }: { badge?: StoreTrustDTO['badge'] }) {
  if (badge === 'VERIFIED_BUSINESS') {
    return <BadgeCheck size={19} className="shrink-0 text-primary" aria-label="Verified business" />
  }
  if (badge === 'IDENTITY_VERIFIED') {
    return (
      <ShieldCheck
        size={19}
        className="shrink-0 text-emerald-600 dark:text-emerald-400"
        aria-label="Identity verified"
      />
    )
  }
  if (badge === 'NEW_SELLER') {
    return <Shield size={19} className="shrink-0 text-muted-foreground/50" aria-label="New seller" />
  }
  return null // no trust data → no badge (never fabricate one)
}

const TRUST_TIERS: Record<
  NonNullable<StoreTrustDTO['badge']>,
  { icon: typeof BadgeCheck; label: string; note: string; chipClass: string; iconClass: string }
> = {
  VERIFIED_BUSINESS: {
    icon: BadgeCheck,
    label: 'Verified business',
    note: 'Business documentation verified by the platform',
    chipClass: 'border-primary/30 bg-primary/10 text-primary',
    iconClass: 'text-primary',
  },
  IDENTITY_VERIFIED: {
    icon: ShieldCheck,
    label: 'Identity verified',
    note: 'Government ID verified by the platform',
    chipClass: 'border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    iconClass: 'text-emerald-600 dark:text-emerald-400',
  },
  NEW_SELLER: {
    icon: Shield,
    label: 'New seller',
    note: 'Verification not completed yet',
    chipClass: 'border-border bg-muted/60 text-muted-foreground',
    iconClass: 'text-muted-foreground',
  },
}

/** Tenure with 1dp, honest for young stores ("<1 yr"). */
function formatTenure(years: number | undefined): string {
  if (years == null) return ''
  return years < 1 ? '<1 yr' : `${years.toFixed(1)} yrs`
}

/** The trust tile grid + the tier badge chip. `store` is loaded here. */
function StoreTrustPanel({ store }: { store: StoreDTO }) {
  const trust = store.trust
  const tier = trust ? TRUST_TIERS[trust.badge] : null
  const TierIcon = tier?.icon ?? Shield

  // Dispute state machine — "too early" is a muted em dash, never a fake 100%.
  const dispute =
    trust?.disputeFree === true
      ? {
          icon: ShieldCheck,
          value: '100%',
          label: 'Dispute-free',
          iconClass: 'text-emerald-600 dark:text-emerald-400',
        }
      : trust?.disputeFree === false
        ? {
            icon: ShieldAlert,
            value: trust.disputeRate != null ? `${trust.disputeRate}%` : '—',
            label: 'Dispute rate',
            iconClass: 'text-amber-600 dark:text-amber-400',
          }
        : {
            icon: Shield,
            value: '—',
            label: 'Dispute-free · too early',
            iconClass: 'text-muted-foreground/60',
          }

  const tiles = [
    {
      icon: Package,
      iconClass: 'text-primary',
      value: formatNumber(store.activeListings),
      label: 'Listings',
      hint: 'Products currently published and active in this store.',
    },
    {
      icon: TrendingUp,
      iconClass: 'text-primary',
      value: formatNumber(store.totalSold),
      label: 'Items sold',
      hint: 'Lifetime units sold across this store\u2019s products.',
    },
    {
      icon: PackageCheck,
      iconClass: 'text-primary',
      value: trust ? (trust.ordersTotal === 0 ? '—' : formatNumber(trust.ordersFulfilled)) : '—',
      label: trust?.ordersTotal === 0 ? 'Orders fulfilled · no orders yet' : 'Orders fulfilled',
      hint: 'Order items from this store whose delivery reached Delivered status, per the fulfillment record.',
    },
    {
      icon: dispute.icon,
      iconClass: dispute.iconClass,
      value: dispute.value,
      label: dispute.label,
      hint: 'Orders with a dispute raised ÷ all orders containing this store\u2019s items. The dispute-free status appears once the store has at least 5 orders — before that there is too little history to be meaningful.',
    },
    {
      icon: Star,
      iconClass: 'text-primary',
      value: store.reviewCount > 0 ? `${store.avgRating.toFixed(1)} ★` : '—',
      label:
        store.reviewCount > 0
          ? `Avg. rating · ${formatNumber(store.reviewCount)} reviews`
          : 'Avg. rating · no reviews',
      hint: 'Mean rating across this store\u2019s products that have reviews.',
    },
    {
      icon: CalendarCheck2,
      iconClass: 'text-primary',
      value: formatDate(store.memberSince),
      label: `Member since${trust ? ` · ${formatTenure(trust.memberYears)}` : ''}`,
      hint: 'Date this store joined Vendora, with tenure rounded to one decimal.',
    },
  ]

  return (
    <>
      {/* Trust tier badge */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold',
            tier?.chipClass ?? 'border-border bg-muted/60 text-muted-foreground'
          )}
        >
          <TierIcon size={14} className={tier?.iconClass ?? 'text-muted-foreground'} aria-hidden />
          {tier?.label ?? 'Trust status unavailable'}
        </span>
        <span className="text-xs text-muted-foreground">
          {tier?.note ?? 'No verification history to show yet'}
        </span>
      </div>

      {/* Counter tiles — each explains its own derivation on hover/focus */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((tile) => (
          <TrustTile key={tile.label} {...tile} />
        ))}
      </div>
    </>
  )
}

function TrustTile({
  icon: Icon,
  iconClass,
  value,
  label,
  hint,
}: {
  icon: typeof BadgeCheck
  iconClass: string
  value: string
  label: string
  hint: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          tabIndex={0}
          role="group"
          aria-label={`${label}: ${value}`}
          className="flex h-full cursor-default flex-col rounded-xl border bg-muted/40 px-3.5 py-3 transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <Icon size={15} className={cn('shrink-0', iconClass)} aria-hidden />
          <p className="mt-1.5 truncate text-base font-bold leading-none" title={value}>
            {value}
          </p>
          <p className="mt-1 text-[11px] leading-tight text-muted-foreground">{label}</p>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-64 text-left font-normal leading-relaxed">
        {hint}
      </TooltipContent>
    </Tooltip>
  )
}

