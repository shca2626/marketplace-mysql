import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  BadgeCheck,
  Calendar,
  ChevronRight,
  Package,
  Star,
  Store,
  TrendingUp,
} from 'lucide-react'
import { Breadcrumbs } from '@/components/site/breadcrumbs'
import { ProductCard } from '@/components/marketplace/product-card'
import { StarRating } from '@/components/marketplace/star-rating'
import { StoreFollowButton } from '@/components/marketplace/store-follow-button'
import { getPublicStore } from '@/app/market/(public)/queries'
import { siteBaseUrl, toAbsoluteUrl } from '@/lib/site-url'
import { formatDate, formatNumber, initials } from '@/lib/format'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

/**
 * /market/store/[id] — REAL seller storefront page (pagedesign.md Phase 2).
 *
 * Server-rendered public profile of one seller: navy hero band (monogram,
 * bio, stats), category chips, and the first 48 active products as a grid
 * of ProductCards that link to the real product pages. Organization JSON-LD
 * + BreadcrumbList. Data aggregation mirrors /api/sellers/[id] so the SPA
 * store view and this page tell the same story.
 */

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const data = await getPublicStore(id)
  if (!data) return { title: 'Store not found — Vendora Market' }

  const storeName = data.seller.storeName || data.seller.name
  const title = `${storeName} — Seller Storefront | Vendora Market`
  const description =
    (data.seller.storeBio?.replace(/\s+/g, ' ').trim().slice(0, 158) ?? '') ||
    `${storeName} sells on Vendora Marketplace — ${data.seller.activeListings} active solar listings.`
  const base = await siteBaseUrl()
  return {
    title,
    description,
    alternates: { canonical: toAbsoluteUrl(base, `/market/store/${data.seller.id}`) },
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: 'Vendora',
      ...(data.products[0]?.images[0] ? { images: [toAbsoluteUrl(base, data.products[0].images[0])] } : {}),
    },
  }
}

export default async function StorePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await getPublicStore(id)
  if (!data) notFound()

  const storeName = data.seller.storeName || data.seller.name
  const base = await siteBaseUrl()
  const storeUrl = toAbsoluteUrl(base, `/market/store/${data.seller.id}`)

  // ── Organization JSON-LD + BreadcrumbList ──
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': storeUrl,
    name: storeName,
    ...(data.seller.storeBio ? { description: data.seller.storeBio } : {}),
    url: storeUrl,
    foundingDate: data.seller.memberSince.slice(0, 10),
    memberOf: { '@type': 'Organization', name: 'Vendora Marketplace', url: toAbsoluteUrl(base, '/market') },
  }
  if (data.seller.reviewCount > 0 && data.seller.avgRating > 0) {
    jsonLd.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: data.seller.avgRating,
      reviewCount: data.seller.reviewCount,
      bestRating: 5,
      worstRating: 1,
    }
  }
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: toAbsoluteUrl(base, '/') },
      { '@type': 'ListItem', position: 2, name: 'Market', item: toAbsoluteUrl(base, '/market') },
      { '@type': 'ListItem', position: 3, name: storeName },
    ],
  }

  return (
    <>
      <Breadcrumbs items={[{ label: 'Market', href: '/market' }, { label: storeName }]} />

      {/* ── Storefront hero — navy band, gold accents (bh dark reserved for heroes) ── */}
      <section className="relative mt-4 overflow-hidden bg-gradient-to-br from-[#052e56] via-[#06396c] to-[#0a4a8c] text-white">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-bh-gold/20 blur-[120px]" />
          <div className="absolute -right-24 top-10 h-80 w-80 rounded-full bg-bh-gold/10 blur-[100px]" />
          <div
            className="absolute inset-0 opacity-[0.13]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(211,175,60,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(211,175,60,0.14) 1px, transparent 1px)',
              backgroundSize: '44px 44px',
              maskImage: 'radial-gradient(ellipse 85% 70% at 50% 0%, black, transparent)',
            }}
          />
        </div>
        <div className="relative mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <Avatar className="h-20 w-20 shrink-0 border-2 border-bh-gold/50 sm:h-24 sm:w-24">
              <AvatarFallback className="bg-white/10 text-xl font-bold text-bh-gold sm:text-2xl">
                {initials(storeName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-bh-gold">
                Seller storefront
              </p>
              <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">
                {storeName}
              </h1>
              {data.seller.storeBio && (
                <p className="mt-3 max-w-3xl text-pretty text-sm leading-relaxed text-white/75 sm:text-base">
                  {data.seller.storeBio}
                </p>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white/70">
                <span className="inline-flex items-center gap-1.5">
                  <BadgeCheck size={15} className="text-bh-gold" /> Active seller
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Calendar size={15} className="text-bh-gold" /> Selling since {formatDate(data.seller.memberSince)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Star size={15} className="fill-bh-gold text-bh-gold" />
                  {data.seller.avgRating > 0 ? `${data.seller.avgRating} store rating` : 'No ratings yet'}
                </span>
              </div>
            </div>
            {/* NETW-1: follow the company behind this storefront */}
            <div className="shrink-0 sm:pt-9">
              <StoreFollowButton sellerId={data.seller.id} storeName={storeName} />
            </div>
          </div>

          {/* Stats row */}
          <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:max-w-3xl">
            {[
              { label: 'Active listings', value: formatNumber(data.seller.activeListings) },
              { label: 'Units sold', value: formatNumber(data.seller.totalSold) },
              { label: 'Store rating', value: data.seller.avgRating > 0 ? `${data.seller.avgRating} / 5` : '—' },
              { label: 'Reviews', value: formatNumber(data.seller.reviewCount) },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-white/10 bg-white/[0.07] px-4 py-3 backdrop-blur-sm"
              >
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-white/60">{s.label}</dt>
                <dd className="mt-1 text-xl font-bold tabular-nums text-white">{s.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── Category chips (only categories this seller lists in) ── */}
      {data.categories.length > 0 && (
        <nav
          aria-label={`${storeName} categories`}
          className="mx-auto w-full max-w-7xl px-4 pt-6 sm:px-6"
        >
          <ul className="flex flex-wrap items-center gap-2">
            {data.categories.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/market/category/${c.slug}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-bh-border bg-bh-card px-3.5 py-1.5 text-xs font-semibold text-bh-navy shadow-card transition-colors hover:border-bh-gold/40 hover:bg-bh-soft-blue"
                >
                  {c.name}
                  <span className="rounded-full bg-bh-soft-blue px-1.5 py-px text-[10px] font-bold tabular-nums text-bh-action">
                    {c.count}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {/* ── Product grid (first 48 active listings) ── */}
      <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6" aria-labelledby="listings-heading">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-bh-gold-dark">Storefront</p>
            <h2 id="listings-heading" className="h2-practical text-bh-navy">
              Products from {storeName}
            </h2>
            <p className="mt-1 text-sm text-bh-muted">
              {data.totalProducts} active {data.totalProducts === 1 ? 'listing' : 'listings'}
              {data.totalProducts > data.products.length && ' — showing top 48'}
            </p>
          </div>
          <a
            href="/market"
            className="inline-flex items-center gap-1 text-sm font-semibold text-bh-action transition-colors hover:text-bh-navy"
          >
            View full marketplace <ChevronRight size={15} />
          </a>
        </div>

        {data.products.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-bh-border bg-bh-card p-12 text-center">
            <Package size={36} className="mx-auto text-bh-faded" aria-hidden />
            <p className="mt-3 text-sm font-medium text-bh-subtle">
              This store has no active listings right now — check back soon.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {data.products.map((p, i) => (
              <ProductCard key={p.id} product={p} index={i} />
            ))}
          </div>
        )}
      </section>

      {/* ── Trust band ── */}
      <section className="border-t border-bh-border bg-bh-card">
        <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-8 sm:grid-cols-3 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-bh-bg-gold text-bh-gold-dark">
              <Store size={19} />
            </span>
            <div>
              <h3 className="text-sm font-bold text-bh-navy">One store, one owner</h3>
              <p className="mt-1 text-sm leading-relaxed text-bh-muted">
                Every listing ships from {storeName} — ask seller-specific questions once.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-bh-bg-gold text-bh-gold-dark">
              <TrendingUp size={19} />
            </span>
            <div>
              <h3 className="text-sm font-bold text-bh-navy">{formatNumber(data.seller.totalSold)} units sold</h3>
              <p className="mt-1 text-sm leading-relaxed text-bh-muted">
                Track record across the marketplace — rated {data.seller.avgRating > 0 ? `${data.seller.avgRating}/5` : 'new'} by buyers.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-bh-bg-gold text-bh-gold-dark">
              <Star size={19} />
            </span>
            <div>
              <h3 className="text-sm font-bold text-bh-navy">Rate your purchase</h3>
              <p className="mt-1 text-sm leading-relaxed text-bh-muted">
                Verified reviews keep solar sellers honest — leave yours after delivery.
              </p>
            </div>
          </div>
        </div>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
    </>
  )
}
