import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { CACHE_TAGS, cached, peekCache } from '@/lib/cache'

// GET /api/products/brands — distinct brands with ACTIVE listings (filter data).
// Cached 5 min, invalidated with the `products` tag.
const CACHE_KEY = 'brands:v1'

export async function GET() {
  try {
    // brand is a RELATION in this schema — distinct brands with ACTIVE
    // listings resolve through brandId → Brand.name (bounded: one join query).
    const rows = await cached(
      CACHE_KEY,
      async () => {
        const products = await db.product.findMany({
          where: { status: 'ACTIVE', brandId: { not: null } },
          select: { brandId: true },
          distinct: ['brandId'],
          take: 500,
        })
        const ids = [...new Set(products.map((p) => p.brandId).filter((b): b is string => b !== null))]
        if (ids.length === 0) return [] as { id: string; name: string }[]
        return db.brand.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        })
      },
      { ttlMs: 5 * 60_000, tags: [CACHE_TAGS.products] },
    )
    const brands = rows.map((r) => r.name).filter((b): b is string => Boolean(b))
    return NextResponse.json({ brands }, { headers: { 'X-Cache': peekCache(CACHE_KEY) ? 'HIT' : 'MISS' } })
  } catch (err) {
    console.error('brands GET error', err)
    return NextResponse.json({ error: 'Failed to load brands' }, { status: 500 })
  }
}
