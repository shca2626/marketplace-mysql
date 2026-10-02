import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { findStoreCover } from '@/lib/store-covers'

// GET /api/sellers/[id] — public storefront profile for any seller.
// Read-only aggregation over existing tables (no new transaction surface).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const seller = await db.user.findFirst({
      where: { id, role: 'SELLER', status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        storeName: true,
        storeBio: true,
        storeCover: true,
        createdAt: true,
      },
    })
    if (!seller) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 })
    }

    // Active products power the storefront grid + category chips
    const products = await db.product.findMany({
      where: { sellerId: id, status: 'ACTIVE' },
      select: {
        id: true,
        soldCount: true,
        rating: true,
        reviewCount: true,
        category: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { soldCount: 'desc' },
    })

    const totalSold = products.reduce((sum, p) => sum + p.soldCount, 0)
    const reviewCount = products.reduce((sum, p) => sum + p.reviewCount, 0)
    const ratedProducts = products.filter((p) => p.reviewCount > 0)
    const avgRating =
      ratedProducts.length > 0
        ? ratedProducts.reduce((sum, p) => sum + p.rating, 0) / ratedProducts.length
        : 0

    // Category chips: only categories this seller actually lists in
    const categoryMap = products.reduce((map, p) => {
      const entry = map.get(p.category.id) ?? { ...p.category, count: 0 }
      entry.count += 1
      map.set(p.category.id, entry)
      return map
    }, new Map<string, { id: string; name: string; slug: string; count: number }>())
    const categories = [...categoryMap.values()]

    // STAB-8: resolve the persisted cover id to its url/label server-side
    // so buyers' clients never need the curated map. A stale/unknown id
    // resolves to null → the storefront falls back to the default gradient.
    const cover = findStoreCover(seller.storeCover)

    return NextResponse.json({
      seller: {
        id: seller.id,
        name: seller.name,
        storeName: seller.storeName,
        storeBio: seller.storeBio,
        storeCover: seller.storeCover,
        storeCoverUrl: cover?.url ?? null,
        storeCoverLabel: cover?.label ?? null,
        memberSince: seller.createdAt.toISOString(),
        activeListings: products.length,
        totalSold,
        avgRating: Math.round(avgRating * 10) / 10,
        reviewCount,
      },
      categories,
    })
  } catch (err) {
    console.error('seller public GET error', err)
    return NextResponse.json({ error: 'Failed to load store' }, { status: 500 })
  }
}
