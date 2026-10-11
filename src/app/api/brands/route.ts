import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { cached, CACHE_TAGS } from '@/lib/cache'

// GET /api/brands — Phase 12 public brands directory.
//
// Every brand WITH live listings: name/slug/logo, productCount, topCategories
// (top 3 by product count) and a preview of up to 4 top products (by
// soldCount). Implementation is deliberately pragmatic: one bounded query for
// the live brand-linked products (take 2000) + one for the brand rows, then a
// JS aggregation — N+1 groupBy queries against MySQL buy nothing at this size.
// Cached 60s in-memory (tag: products).
export async function GET() {
  try {
    const payload = await cached('brands-directory:v1', loader, {
      ttlMs: 60_000,
      tags: [CACHE_TAGS.products],
    })
    return NextResponse.json(payload)
  } catch (err) {
    console.error('brands GET error', err)
    return NextResponse.json({ error: 'Failed to load brands' }, { status: 500 })
  }
}

interface DirectoryProductRow {
  id: string
  title: string
  price: number
  images: string | null
  soldCount: number
  /** Product.brandId is nullable — rows are bucketed under `if (!r.brandId) continue`. */
  brandId: string | null
  category: { slug: string; name: string }
}

async function loader() {
  const [brands, rows] = await Promise.all([
    db.brand.findMany({
      orderBy: [{ isVerified: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        description: true,
        originCountry: true,
        isVerified: true,
      },
      take: 200,
    }),
    db.product.findMany({
      where: {
        status: 'ACTIVE',
        OR: [{ sellerId: null }, { seller: { status: 'ACTIVE' } }],
        brandId: { not: null },
      },
      select: {
        id: true,
        title: true,
        price: true,
        images: true,
        soldCount: true,
        brandId: true,
        category: { select: { slug: true, name: true } },
      },
      orderBy: { soldCount: 'desc' },
      take: 2000,
    }),
  ])

  const byBrand = new Map<string, DirectoryProductRow[]>()
  for (const r of rows) {
    if (!r.brandId) continue
    const list = byBrand.get(r.brandId)
    if (list) list.push(r)
    else byBrand.set(r.brandId, [r])
  }

  const items = brands
    .map((b) => {
      const products = byBrand.get(b.id) ?? []
      // topCategories — top 3 by product count
      const catCounts = new Map<string, { slug: string; name: string; count: number }>()
      for (const p of products) {
        const hit = catCounts.get(p.category.slug)
        if (hit) hit.count++
        else catCounts.set(p.category.slug, { ...p.category, count: 1 })
      }
      const topCategories = [...catCounts.values()]
        .sort((a, b2) => b2.count - a.count || a.name.localeCompare(b2.name))
        .slice(0, 3)
        .map(({ slug, name, count }) => ({ slug, name, count }))

      // preview — up to 4 top products (rows arrive soldCount-desc already)
      const preview = products.slice(0, 4).map((p) => ({
        id: p.id,
        title: p.title,
        price: p.price,
        thumbnail: firstImage(p.images),
      }))

      return {
        id: b.id,
        name: b.name,
        slug: b.slug,
        logoUrl: b.logoUrl,
        description: b.description,
        originCountry: b.originCountry,
        isVerified: b.isVerified,
        productCount: products.length,
        topCategories,
        preview,
      }
    })
    .filter((b) => b.productCount > 0)
    .sort((a, b) => b.productCount - a.productCount || a.name.localeCompare(b.name))

  return { brands: items, total: items.length }
}

function firstImage(images: string | null): string | null {
  if (!images) return null
  try {
    const parsed = JSON.parse(images)
    if (Array.isArray(parsed)) {
      const first = parsed.find((x) => typeof x === 'string')
      return typeof first === 'string' ? first : null
    }
  } catch {
    /* fall through */
  }
  return null
}
