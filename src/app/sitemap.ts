import type { MetadataRoute } from 'next'
import { db } from '@/lib/db'
import { getFundingEntities, getFundingPrograms } from '@/lib/site-content'
import { siteBaseUrl } from '@/lib/site-url'

/**
 * /sitemap.xml — all real public URLs (pagedesign.md §7.4).
 *
 * Static surfaces + the market's real URLs (Phase 2: products, stores,
 * categories) + the funding surfaces (entities, programs). The request host
 * (proxy-aware via siteBaseUrl) builds absolute URLs so the sitemap is valid
 * in every environment.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = await siteBaseUrl()
  const now = new Date()

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/market`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/funding`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${base}/about`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/contact`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/how-it-works`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/solutions`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/sell`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/insights`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${base}/faq`, changeFrequency: 'monthly', priority: 0.5 },
  ].map((entry) => ({ ...entry, lastModified: now }))

  // ── Market: categories, products, stores (real URLs, Phase 2) ──
  const [categories, products, stores] = await Promise.all([
    db.category.findMany({
      select: { slug: true, id: true },
      orderBy: { name: 'asc' },
    }),
    db.product.findMany({
      where: { status: 'ACTIVE', seller: { status: 'ACTIVE' } },
      select: { id: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    }),
    db.user.findMany({
      where: { role: 'SELLER', status: 'ACTIVE' },
      select: { id: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    }),
  ])

  const marketCategoryRoutes: MetadataRoute.Sitemap = categories.map((c) => ({
    url: `${base}/market/category/${c.slug}`,
    changeFrequency: 'weekly',
    priority: 0.8,
    lastModified: now,
  }))

  const marketProductRoutes: MetadataRoute.Sitemap = products.map((p) => ({
    url: `${base}/market/product/${p.id}`,
    changeFrequency: 'weekly',
    priority: 0.7,
    lastModified: p.updatedAt,
  }))

  const marketStoreRoutes: MetadataRoute.Sitemap = stores.map((s) => ({
    url: `${base}/market/store/${s.id}`,
    changeFrequency: 'weekly',
    priority: 0.6,
    lastModified: s.updatedAt,
  }))

  // ── Funding: entity profiles + program detail pages ──
  const [entities, programs] = await Promise.all([
    getFundingEntities().catch(() => []),
    getFundingPrograms().catch(() => []),
  ])
  const fundingRoutes: MetadataRoute.Sitemap = [
    ...entities.map((e) => ({
      url: `${base}/funding/entities/${e.id}`,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
      lastModified: now,
    })),
    ...programs.map((p) => ({
      url: `${base}/funding/programs/${p.id}`,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
      lastModified: now,
    })),
  ]

  return [
    ...staticRoutes,
    ...marketCategoryRoutes,
    ...marketProductRoutes,
    ...marketStoreRoutes,
    ...fundingRoutes,
  ]
}
