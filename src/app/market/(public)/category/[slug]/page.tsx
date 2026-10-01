import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowRight,
  BatteryCharging,
  Cable,
  Droplets,
  Lightbulb,
  Package,
  SlidersHorizontal,
  Store,
  Sun,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { Breadcrumbs } from '@/components/site/breadcrumbs'
import { ProductCard } from '@/components/marketplace/product-card'
import { getCategoriesWithCounts, getPublicCategory } from '@/app/market/(public)/queries'
import { siteBaseUrl, toAbsoluteUrl } from '@/lib/site-url'
import { formatNumber } from '@/lib/format'

/**
 * /market/category/[slug] — REAL category landing page (pagedesign.md Phase 2).
 *
 * SEO entry for each of the seeded categories: navy hero band (icon, name,
 * description, counts) → product grid (first 48 active products, featured/
 * popular first) → cross-category chips. The SPA catalog remains the full
 * browsing surface (filters/search/pagination) — this page hands off to it
 * via "Browse with filters in marketplace". CollectionPage + ItemList +
 * BreadcrumbList JSON-LD.
 */

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Sun,
  BatteryCharging,
  Zap,
  Droplets,
  Lightbulb,
  Cable,
}

const GRID_CAP = 48

function categoryDescription(name: string, count: number, sellers: number): string {
  return (
    `Browse ${count} ${name.toLowerCase()} from ${sellers} vetted ${sellers === 1 ? 'seller' : 'sellers'} on Vendora — ` +
    'engineer-reviewed gear with live stock and honest specs, from panels that survive real heat to storage that lasts a decade.'
  )
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const data = await getPublicCategory(slug)
  if (!data) return { title: 'Category not found — Vendora Market' }

  const title = `${data.category.name} — Vendora Marketplace`
  const description = categoryDescription(data.category.name, data.totalProducts, data.sellerCount)
  const base = await siteBaseUrl()
  return {
    title,
    description,
    alternates: { canonical: toAbsoluteUrl(base, `/market/category/${data.category.slug}`) },
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: 'Vendora',
      ...(data.coverImage ? { images: [toAbsoluteUrl(base, data.coverImage)] } : {}),
    },
  }
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const data = await getPublicCategory(slug)
  if (!data) notFound()

  const [allCategories, base] = await Promise.all([getCategoriesWithCounts(), siteBaseUrl()])
  const categoryUrl = toAbsoluteUrl(base, `/market/category/${data.category.slug}`)
  const Icon = CATEGORY_ICONS[data.category.icon ?? ''] ?? Sun
  const description = categoryDescription(data.category.name, data.totalProducts, data.sellerCount)
  const spaCatalogHref = `/market?view=catalog&category=${encodeURIComponent(data.category.slug)}`

  // ── CollectionPage (+ ItemList) + BreadcrumbList JSON-LD ──
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': categoryUrl,
    name: `${data.category.name} — Vendora Marketplace`,
    description,
    url: categoryUrl,
    isPartOf: { '@type': 'WebSite', name: 'Vendora', url: toAbsoluteUrl(base, '/market') },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: data.totalProducts,
      itemListElement: data.products.slice(0, 24).map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: toAbsoluteUrl(base, `/market/product/${p.id}`),
        name: p.title,
      })),
    },
  }
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: toAbsoluteUrl(base, '/') },
      { '@type': 'ListItem', position: 2, name: 'Market', item: toAbsoluteUrl(base, '/market') },
      { '@type': 'ListItem', position: 3, name: data.category.name },
    ],
  }

  return (
    <>
      <Breadcrumbs items={[{ label: 'Market', href: '/market' }, { label: data.category.name }]} />

      {/* ── Category hero — navy band with gold icon tile ── */}
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
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-bh-gold sm:h-20 sm:w-20">
              <Icon size={34} strokeWidth={1.6} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-bh-gold">
                Vendora Marketplace · Category
              </p>
              <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">
                {data.category.name}
              </h1>
              <p className="mt-3 max-w-3xl text-pretty text-sm leading-relaxed text-white/75 sm:text-base">
                {description}
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
            <dl className="flex flex-wrap gap-x-8 gap-y-2">
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-white/60">Products</dt>
                <dd className="text-xl font-bold tabular-nums text-white">{formatNumber(data.totalProducts)}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-white/60">Sellers</dt>
                <dd className="text-xl font-bold tabular-nums text-white">{formatNumber(data.sellerCount)}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-white/60">Availability</dt>
                <dd className="text-xl font-bold text-white">In stock now</dd>
              </div>
            </dl>
            <a
              href={spaCatalogHref}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-bh-gold px-5 text-sm font-bold text-bh-navy-deep transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
            >
              <SlidersHorizontal size={16} /> Browse with filters
            </a>
          </div>
        </div>
      </section>

      {/* ── Cross-category chips (internal SEO linking) ── */}
      {allCategories.length > 1 && (
        <nav
          aria-label="Market categories"
          className="mx-auto w-full max-w-7xl px-4 pt-6 sm:px-6"
        >
          <ul className="flex flex-wrap items-center gap-2">
            {allCategories.map((c) => {
              const active = c.slug === data.category.slug
              return (
                <li key={c.id}>
                  <Link
                    href={`/market/category/${c.slug}`}
                    aria-current={active ? 'page' : undefined}
                    className={
                      active
                        ? 'inline-flex items-center gap-1.5 rounded-full border border-bh-gold/40 bg-bh-bg-gold px-3.5 py-1.5 text-xs font-bold text-bh-gold-dark'
                        : 'inline-flex items-center gap-1.5 rounded-full border border-bh-border bg-bh-card px-3.5 py-1.5 text-xs font-semibold text-bh-navy shadow-card transition-colors hover:border-bh-gold/40 hover:bg-bh-soft-blue'
                    }
                  >
                    {c.name}
                    <span
                      className={
                        active
                          ? 'rounded-full bg-bh-gold/20 px-1.5 py-px text-[10px] font-bold tabular-nums text-bh-gold-dark'
                          : 'rounded-full bg-bh-soft-blue px-1.5 py-px text-[10px] font-bold tabular-nums text-bh-action'
                      }
                    >
                      {c.productCount}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      )}

      {/* ── Product grid ── */}
      <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6" aria-labelledby="grid-heading">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-bh-gold-dark">Best sellers first</p>
            <h2 id="grid-heading" className="h2-practical text-bh-navy">
              Shop {data.category.name}
            </h2>
          </div>
          <a
            href={spaCatalogHref}
            className="inline-flex items-center gap-1 text-sm font-semibold text-bh-action transition-colors hover:text-bh-navy"
          >
            Open in marketplace catalog <ArrowRight size={15} />
          </a>
        </div>

        {data.products.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-bh-border bg-bh-card p-12 text-center">
            <Package size={36} className="mx-auto text-bh-faded" aria-hidden />
            <p className="mt-3 text-sm font-medium text-bh-subtle">
              No active listings in this category right now — check back soon.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {data.products.map((p, i) => (
                <ProductCard key={p.id} product={p} index={i} />
              ))}
            </div>
            {data.totalProducts > data.products.length && data.products.length === GRID_CAP && (
              <div className="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-bh-border bg-bh-soft-blue/60 px-6 py-6 text-center">
                <p className="text-sm text-bh-subtle">
                  Showing the first {GRID_CAP} of {data.totalProducts} listings — the marketplace catalog has
                  search, price filters, sorting and pagination.
                </p>
                <a
                  href={spaCatalogHref}
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-bh-navy px-5 text-sm font-bold text-white transition-transform hover:scale-[1.02]"
                >
                  <Store size={16} /> View all {data.category.name.toLowerCase()} in the marketplace
                </a>
              </div>
            )}
          </>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-bh-muted">
          <span className="inline-flex items-center gap-1.5">
            <Users size={13} className="text-bh-gold-dark" /> {data.sellerCount} vetted{' '}
            {data.sellerCount === 1 ? 'seller' : 'sellers'} in this category
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Package size={13} className="text-bh-gold-dark" /> {formatNumber(data.totalProducts)} active listings
          </span>
        </div>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
    </>
  )
}
