import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { CACHE_TAGS, cached, peekCache } from '@/lib/cache'

// GET /api/products/brands — distinct brands with ACTIVE listings (filter data).
// Cached 5 min, invalidated with the `products` tag.
const CACHE_KEY = 'brands:v1'

export async function GET() {
  try {
    const rows = await cached(
      CACHE_KEY,
      () =>
        db.product.findMany({
          where: { status: 'ACTIVE', brand: { not: null } },
          select: { brand: true },
          distinct: ['brand'],
          orderBy: { brand: 'asc' },
        }),
      { ttlMs: 5 * 60_000, tags: [CACHE_TAGS.products] },
    )
    const brands = rows.map((r) => r.brand).filter((b): b is string => Boolean(b))
    return NextResponse.json({ brands }, { headers: { 'X-Cache': peekCache(CACHE_KEY) ? 'HIT' : 'MISS' } })
  } catch (err) {
    console.error('brands GET error', err)
    return NextResponse.json({ error: 'Failed to load brands' }, { status: 500 })
  }
}
