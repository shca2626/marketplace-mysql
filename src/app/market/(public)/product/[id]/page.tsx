import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  BadgeCheck,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Package,
  Ruler,
  ShieldCheck,
  Star,
  Store,
  Truck,
} from 'lucide-react'
import { Breadcrumbs } from '@/components/site/breadcrumbs'
import { Markdown } from '@/components/site/markdown'
import { ProductGallery } from '@/components/market/pages/product-gallery'
import { ProductBuyPanel } from '@/components/market/pages/product-buy-panel'
import { ProductCard } from '@/components/marketplace/product-card'
import { StarRating } from '@/components/marketplace/star-rating'
import { getPublicProduct, getRelatedProducts, toProductDTO } from '@/app/market/(public)/queries'
import { siteBaseUrl, toAbsoluteUrl } from '@/lib/site-url'
import { formatDate, formatNumber, initials } from '@/lib/format'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'

/**
 * /market/product/[id] — REAL product detail page (pagedesign.md Phase 2).
 *
 * Server-rendered, SEO-critical surface: Prisma fetch via React cache (shared
 * with generateMetadata), Product JSON-LD with offers + aggregateRating,
 * gallery + buy-panel client islands (same global cart store as the SPA).
 *
 * Layout follows the practical white detail pattern of /funding/programs/[id]:
 * white header band → 12-col grid (buy panel + seller sidebar | gallery,
 * about, specs, reviews) — bh tokens, white cards shadow-card, navy
 * headings, soft-blue rows.
 */

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const row = await getPublicProduct(id)
  if (!row) return { title: 'Product not found — Vendora Market' }

  const product = toProductDTO(row)
  const title = product.metaTitle?.trim() || `${product.title} — ${product.seller.storeName || product.seller.name} | Vendora Market`
  const description =
    product.metaDescription?.trim() ||
    product.description.replace(/\s+/g, ' ').trim().slice(0, 160) ||
    `${product.title} at Vendora Marketplace.`
  const base = await siteBaseUrl()
  return {
    title,
    description,
    alternates: { canonical: toAbsoluteUrl(base, `/market/product/${product.id}`) },
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: 'Vendora',
      ...(product.images[0] ? { images: [toAbsoluteUrl(base, product.images[0])] } : {}),
    },
  }
}

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const row = await getPublicProduct(id)
  if (!row) notFound()

  const product = toProductDTO(row)
  const variants = (product.variants ?? []).filter((v) => v.isActive)
  const reviews = row.reviews
  const related = await getRelatedProducts(product.id, product.categoryId)
  const base = await siteBaseUrl()
  const productUrl = toAbsoluteUrl(base, `/market/product/${product.id}`)
  const storeUrl = `/market/store/${product.sellerId}`
  const categoryUrl = `/market/category/${product.category.slug}`

  // ── Product JSON-LD (offers + aggregateRating when reviews exist) ──
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': productUrl,
    name: product.title,
    description: product.metaDescription?.trim() || product.description.replace(/\s+/g, ' ').slice(0, 400),
    ...(product.images.length > 0 ? { image: product.images.map((img) => toAbsoluteUrl(base, img)) } : {}),
    ...(product.sku ? { sku: product.sku } : {}),
    ...(product.barcode ? { gtin13: product.barcode } : {}),
    category: product.category.name,
    brand: { '@type': 'Brand', name: product.seller.storeName || product.seller.name },
    offers: {
      '@type': 'Offer',
      url: productUrl,
      priceCurrency: 'USD',
      price: product.price,
      availability: product.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: product.seller.storeName || product.seller.name },
    },
  }
  if (product.reviewCount > 0 && product.rating > 0) {
    jsonLd.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: Math.round(product.rating * 10) / 10,
      reviewCount: product.reviewCount,
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
      {
        '@type': 'ListItem',
        position: 3,
        name: product.category.name,
        item: toAbsoluteUrl(base, categoryUrl),
      },
      { '@type': 'ListItem', position: 4, name: product.title },
    ],
  }

  return (
    <>
      <Breadcrumbs
        items={[
          { label: 'Market', href: '/market' },
          { label: product.category.name, href: categoryUrl },
          { label: product.title },
        ]}
      />

      {/* ── White header band: category eyebrow + 30px H1 + rating row ── */}
      <header className="mx-auto w-full max-w-7xl px-4 pt-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-bh-gold-dark">
          <Link href={categoryUrl} className="rounded transition-colors hover:text-bh-navy">
            {product.category.name}
          </Link>
          {product.featured && (
            <Badge className="rounded-full border border-bh-gold/25 bg-bh-bg-gold px-2 text-[10px] font-bold uppercase tracking-[0.1em] text-bh-gold-dark hover:bg-bh-bg-gold">
              Featured
            </Badge>
          )}
        </div>
        <h1 className="h1-practical mt-2 text-bh-navy">{product.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-bh-muted">
          <StarRating value={product.rating} size={15} showValue count={product.reviewCount} />
          <span className="inline-flex items-center gap-1.5">
            <Package size={14} className="text-bh-faded" /> {formatNumber(product.soldCount)} sold
          </span>
          <a
            href={storeUrl}
            className="inline-flex items-center gap-1.5 font-medium text-bh-navy underline-offset-4 transition-colors hover:text-bh-action hover:underline"
          >
            <Store size={14} className="text-bh-gold-dark" />
            {product.seller.storeName || product.seller.name}
          </a>
        </div>
      </header>

      {/* ── 12-col grid: sidebar (buy panel + seller card) | gallery + content ── */}
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Sidebar */}
          <aside className="space-y-6 self-start lg:col-span-4" aria-label="Buy">
            <div className="lg:sticky lg:top-40 space-y-6">
              <ProductBuyPanel product={product} variants={variants} />

              {/* Seller card */}
              <div className="rounded-2xl border border-bh-border bg-bh-card p-5 shadow-card">
                <p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-bh-muted">Sold by</p>
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12 border">
                    <AvatarFallback className="bg-bh-navy-deep text-sm font-bold text-bh-gold">
                      {initials(product.seller.storeName || product.seller.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <a
                      href={storeUrl}
                      className="flex items-center gap-1.5 font-semibold text-bh-navy underline-offset-4 transition-colors hover:text-bh-action hover:underline"
                    >
                      <span className="truncate">{product.seller.storeName || product.seller.name}</span>
                      <BadgeCheck size={16} className="shrink-0 text-bh-gold-dark" aria-label="Active seller" />
                    </a>
                    <p className="text-xs text-bh-muted">Owner {product.seller.name}</p>
                  </div>
                </div>
                <Link
                  href={storeUrl}
                  className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-bh-border bg-bh-soft-blue/60 px-4 text-sm font-semibold text-bh-navy transition-colors hover:bg-bh-soft-blue"
                >
                  <Store size={15} className="text-bh-gold-dark" /> Visit store
                </Link>
              </div>

              {/* Assurance facts */}
              <div className="rounded-2xl border border-bh-border bg-bh-card p-5 shadow-card">
                <dl className="space-y-3 text-sm">
                  <div className="flex items-start gap-3">
                    <ShieldCheck size={16} className="mt-0.5 shrink-0 text-bh-gold-dark" />
                    <div>
                      <dt className="font-semibold text-bh-ink">Vetted seller</dt>
                      <dd className="text-bh-muted">Engineer-reviewed listing from an active store.</dd>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Truck size={16} className="mt-0.5 shrink-0 text-bh-gold-dark" />
                    <div>
                      <dt className="font-semibold text-bh-ink">
                        {product.freeShipping ? 'Free shipping' : 'Direct from seller'}
                      </dt>
                      <dd className="text-bh-muted">
                        {product.processingDays != null
                          ? `Dispatches in ${product.processingDays === 1 ? '1 day' : `${product.processingDays} days`}.`
                          : 'Dispatched by the seller after checkout.'}
                      </dd>
                    </div>
                  </div>
                  {product.moq != null && product.moq > 1 && (
                    <div className="flex items-start gap-3">
                      <Package size={16} className="mt-0.5 shrink-0 text-bh-gold-dark" />
                      <div>
                        <dt className="font-semibold text-bh-ink">B2B available</dt>
                        <dd className="text-bh-muted">Min. {product.moq} units — send an RFQ for volume pricing.</dd>
                      </div>
                    </div>
                  )}
                </dl>
                <a
                  href="/market"
                  className="mt-4 block text-center text-xs font-semibold text-bh-action underline-offset-4 transition-colors hover:underline"
                >
                  View full marketplace →
                </a>
              </div>
            </div>
          </aside>

          {/* Main column */}
          <div className="min-w-0 space-y-8 lg:col-span-8">
            <ProductGallery
              images={product.images}
              title={product.title}
              badge={
                product.stock === 0 ? (
                  <span className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-[2px]">
                    <Badge variant="destructive" className="text-xs font-semibold">Sold out</Badge>
                  </span>
                ) : undefined
              }
            />

            {/* About this item */}
            {product.description && (
              <section
                className="rounded-2xl border border-bh-border bg-bh-card p-6 shadow-card"
                aria-labelledby="about-heading"
              >
                <h2 id="about-heading" className="h2-practical mb-3 text-bh-navy">
                  About this item
                </h2>
                <Markdown body={product.description} className="text-sm leading-relaxed text-bh-subtle" />
              </section>
            )}

            {/* Highlights */}
            {product.highlights && product.highlights.length > 0 && (
              <section
                className="rounded-2xl border border-bh-border bg-bh-card p-6 shadow-card"
                aria-labelledby="highlights-heading"
              >
                <h2 id="highlights-heading" className="h2-practical mb-4 text-bh-navy">
                  Highlights
                </h2>
                <ul className="grid gap-2.5 sm:grid-cols-2">
                  {product.highlights.map((h, i) => (
                    <li key={`hl-${i}`} className="flex items-start gap-2.5 text-sm text-bh-subtle">
                      <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-bh-gold-dark" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Specifications */}
            {product.specs && product.specs.length > 0 && (
              <section
                className="rounded-2xl border border-bh-border bg-bh-card p-6 shadow-card"
                aria-labelledby="specs-heading"
              >
                <h2 id="specs-heading" className="h2-practical mb-4 flex items-center gap-2 text-bh-navy">
                  <Ruler size={17} className="text-bh-gold-dark" /> Specifications
                </h2>
                <dl className="divide-y divide-bh-border">
                  {product.specs.map((s, i) => (
                    <div
                      key={`spec-${i}`}
                      className="grid grid-cols-[minmax(96px,30%)_1fr] items-baseline gap-3 px-3 py-2.5 text-sm odd:bg-bh-soft-blue/60 sm:px-4"
                    >
                      <dt className="font-medium text-bh-ink">{s.label}</dt>
                      <dd className="text-bh-subtle">{s.value}</dd>
                    </div>
                  ))}
                  {(product.materials || product.care) && (
                    <>
                      {product.materials && (
                        <div className="grid grid-cols-[minmax(96px,30%)_1fr] gap-3 px-3 py-2.5 text-sm odd:bg-bh-soft-blue/60 sm:px-4">
                          <dt className="font-medium text-bh-ink">Materials</dt>
                          <dd className="text-bh-subtle">{product.materials}</dd>
                        </div>
                      )}
                      {product.care && (
                        <div className="grid grid-cols-[minmax(96px,30%)_1fr] gap-3 px-3 py-2.5 text-sm odd:bg-bh-soft-blue/60 sm:px-4">
                          <dt className="font-medium text-bh-ink">Care</dt>
                          <dd className="text-bh-subtle">{product.care}</dd>
                        </div>
                      )}
                    </>
                  )}
                </dl>
              </section>
            )}

            {/* Reviews */}
            <section
              className="rounded-2xl border border-bh-border bg-bh-card p-6 shadow-card"
              aria-labelledby="reviews-heading"
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 id="reviews-heading" className="h2-practical text-bh-navy">
                  Reviews
                </h2>
                <div className="flex items-center gap-2 text-sm text-bh-muted">
                  <Star size={15} className="fill-bh-gold text-bh-gold" aria-hidden />
                  <span className="font-semibold text-bh-ink">{product.rating.toFixed(1)}</span>
                  <span aria-hidden>·</span>
                  <span>{product.reviewCount} total</span>
                </div>
              </div>
              {reviews.length === 0 ? (
                <p className="text-sm text-bh-muted">
                  No reviews yet — be the first to review this product in the marketplace.
                </p>
              ) : (
                <ul className="divide-y divide-bh-border">
                  {reviews.map((r) => (
                    <li key={r.id} className="flex gap-3.5 py-4 first:pt-0 last:pb-0">
                      <Avatar className="h-9 w-9 border">
                        <AvatarFallback className="bg-bh-soft-blue text-[11px] font-bold text-bh-navy">
                          {initials(r.user.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <span className="text-sm font-semibold text-bh-ink">{r.user.name}</span>
                          {r.verified && (
                            <Badge className="rounded-full border border-bh-gold/25 bg-bh-bg-gold px-1.5 text-[10px] font-bold text-bh-gold-dark hover:bg-bh-bg-gold">
                              Verified purchase
                            </Badge>
                          )}
                          <span className="ml-auto inline-flex items-center gap-1 text-xs text-bh-faded">
                            <Calendar size={12} aria-hidden /> {formatDate(r.createdAt.toISOString())}
                          </span>
                        </div>
                        <div className="mt-1">
                          <StarRating value={r.rating} size={12} />
                        </div>
                        <p className="mt-1.5 text-sm leading-relaxed text-bh-subtle">{r.comment}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>

        {/* ── Related products ── */}
        {related.length > 0 && (
          <section className="mt-12" aria-labelledby="related-heading">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-bh-gold-dark">
                  More from {product.category.name}
                </p>
                <h2 id="related-heading" className="h2-practical text-bh-navy">
                  Related products
                </h2>
              </div>
              <Link
                href={categoryUrl}
                className="inline-flex items-center gap-1 text-sm font-semibold text-bh-action transition-colors hover:text-bh-navy"
              >
                Browse the category <ChevronRight size={15} />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {related.map((p, i) => (
                <ProductCard key={p.id} product={p} index={i} />
              ))}
            </div>
          </section>
        )}
      </div>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
    </>
  )
}
