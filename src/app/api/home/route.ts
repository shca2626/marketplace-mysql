import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { cached, CACHE_TAGS } from '@/lib/cache'
import { favoriteIdsFor, productInclude, serializeCategory, serializeProduct } from '@/lib/serialize'

// GET /api/home — aggregated landing page feed.
// PERF-2 (10k-concurrent criterion): the public aggregate below was 8 DB
// queries on EVERY hit with zero caching — the hottest unauthenticated path
// in the app. It is now memory-cached for 60s (same freshness tradeoff the
// facets/brands endpoints already make); the only per-user work left is the
// favorites lookup (1 cheap query, logged-in only).
type HomeAggregate = {
  featured: Awaited<ReturnType<typeof db.product.findMany>>
  trending: Awaited<ReturnType<typeof db.product.findMany>>
  newArrivals: Awaited<ReturnType<typeof db.product.findMany>>
  categories: { id: string; slug: string; name: string; image: string | null; productCount: number; cover: string | null }[]
  stats: { productCount: number; sellerCount: number; reviewCount: number; orderCount: number }
}

async function loadHomeAggregate(): Promise<HomeAggregate> {
  const [featured, trending, newArrivals, categories, productCount, sellerCount, reviewCount, orderCount] =
    await Promise.all([
      db.product.findMany({
        where: { status: 'ACTIVE', featured: true, OR: [{ sellerId: null }, { seller: { status: 'ACTIVE' } }] }, // 9.1: curated included
        include: productInclude,
        orderBy: [{ rating: 'desc' }, { soldCount: 'desc' }],
        take: 8,
      }),
      db.product.findMany({
        where: { status: 'ACTIVE', OR: [{ sellerId: null }, { seller: { status: 'ACTIVE' } }] }, // 9.1: curated included
        include: productInclude,
        orderBy: { soldCount: 'desc' },
        take: 8,
      }),
      db.product.findMany({
        where: { status: 'ACTIVE', OR: [{ sellerId: null }, { seller: { status: 'ACTIVE' } }] }, // 9.1: curated included
        include: productInclude,
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
      db.category.findMany({
        orderBy: { name: 'asc' },
        include: { products: { where: { status: 'ACTIVE', OR: [{ sellerId: null }, { seller: { status: 'ACTIVE' } }] }, select: { images: true } } }, // 9.1: curated included
      }),
      db.product.count({ where: { status: 'ACTIVE', OR: [{ sellerId: null }, { seller: { status: 'ACTIVE' } }] } }), // 9.1: curated counted
      db.user.count({ where: { role: 'SELLER', status: 'ACTIVE' } }),
      db.review.count(),
      db.order.count(),
    ])

  const coverFor = (products: { images: string }[]) => {
    for (const p of products) {
      try {
        const imgs = JSON.parse(p.images || '[]')
        if (Array.isArray(imgs) && imgs.length > 0) return imgs[0] as string
      } catch {
        continue
      }
    }
    return null
  }

  return {
    featured,
    trending,
    newArrivals,
    categories: categories.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      image: c.image,
      productCount: c.products.length,
      cover: coverFor(c.products),
    })),
    stats: { productCount, sellerCount, reviewCount, orderCount },
  }
}

export async function GET() {
  try {
    const aggregate = await cached('home:v2', loadHomeAggregate, {
      ttlMs: 60_000,
      tags: [CACHE_TAGS.home, CACHE_TAGS.products, CACHE_TAGS.categories],
    })

    const session = await getSessionUser()
    const allIds = [
      ...aggregate.featured,
      ...aggregate.trending,
      ...aggregate.newArrivals,
    ].map((p) => p.id)
    const favIds = await favoriteIdsFor(session?.id, allIds)

    return NextResponse.json({
      featured: aggregate.featured.map((p) => serializeProduct(p, favIds.has(p.id))),
      trending: aggregate.trending.map((p) => serializeProduct(p, favIds.has(p.id))),
      newArrivals: aggregate.newArrivals.map((p) => serializeProduct(p, favIds.has(p.id))),
      categories: aggregate.categories.map((c) => serializeCategory(c, c.productCount, c.cover)),
      stats: aggregate.stats,
    })
  } catch (err) {
    console.error('home GET error', err)
    return NextResponse.json({ error: 'Failed to load home feed' }, { status: 500 })
  }
}
