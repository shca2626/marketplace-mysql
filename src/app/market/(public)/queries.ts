import { cache } from 'react'
import { db } from '@/lib/db'
import { productInclude, serializeProduct } from '@/lib/serialize'
import type { ProductDTO } from '@/lib/types'

/**
 * Server-side data access for the real public market routes
 * (pagedesign.md Phase 2). Server components call these directly —
 * no HTTP hop, one query per concern, React-cached so generateMetadata
 * and the page share a single fetch.
 *
 * Visibility rules mirror the public API surface:
 *   - products: status ACTIVE + seller status ACTIVE
 *   - stores:   role SELLER + status ACTIVE
 *   - categories: seeded slugs only (404 otherwise)
 */

// ── Products ─────────────────────────────────────────────────────────────────

/** Raw row shape used by the product detail query (productInclude + reviews). */
type ProductWithRelations = Awaited<ReturnType<typeof db.product.findFirst>> & { reviews?: unknown[] }

/** Public product detail by id (with category, seller, active variants + latest reviews). */
export const getPublicProduct = cache(async (id: string) => {
  try {
    const product = await db.product.findFirst({
      where: { id, status: 'ACTIVE', seller: { status: 'ACTIVE' } },
      include: {
        ...productInclude,
        variants: { where: { isActive: true }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
        reviews: {
          orderBy: { createdAt: 'desc' },
          take: 8,
          select: {
            id: true,
            productId: true,
            rating: true,
            comment: true,
            verified: true,
            createdAt: true,
            user: { select: { id: true, name: true } },
          },
        },
      },
    })
    return product ?? null
  } catch {
    return null
  }
})

/** Serialize the fetched product into the canonical ProductDTO used across the app. */
export function toProductDTO(product: NonNullable<ProductWithRelations>): ProductDTO {
  return serializeProduct(product)
}

/** Related products — same category, excluding the current one (featured/popular first). */
export async function getRelatedProducts(productId: string, categoryId: string, take = 4): Promise<ProductDTO[]> {
  const rows = await db.product.findMany({
    where: { status: 'ACTIVE', seller: { status: 'ACTIVE' }, categoryId, id: { not: productId } },
    include: productInclude,
    orderBy: [{ featured: 'desc' }, { soldCount: 'desc' }],
    take,
  })
  return rows.map((r) => serializeProduct(r))
}

// ── Stores ───────────────────────────────────────────────────────────────────

export interface PublicStoreData {
  seller: {
    id: string
    name: string
    storeName: string | null
    storeBio: string | null
    memberSince: string
    /** Active listings count. */
    activeListings: number
    totalSold: number
    avgRating: number
    reviewCount: number
  }
  /** Categories this seller actually lists in (for chips). */
  categories: { id: string; name: string; slug: string; count: number }[]
  /** First 48 active products (pagedesign §5.2 store grid cap). */
  products: ProductDTO[]
  totalProducts: number
}

/** Public seller storefront — same aggregation /api/sellers/[id] serves the SPA. */
export const getPublicStore = cache(async (id: string): Promise<PublicStoreData | null> => {
  try {
    const seller = await db.user.findFirst({
      where: { id, role: 'SELLER', status: 'ACTIVE' },
      select: { id: true, name: true, storeName: true, storeBio: true, createdAt: true },
    })
    if (!seller) return null

    // Product rows power the grid AND the stats (full active catalog, capped at 48).
    const [products, total] = await Promise.all([
      db.product.findMany({
        where: { sellerId: id, status: 'ACTIVE' },
        include: productInclude,
        orderBy: [{ featured: 'desc' }, { soldCount: 'desc' }],
        take: 48,
      }),
      db.product.count({ where: { sellerId: id, status: 'ACTIVE' } }),
    ])

    const totalSold = products.reduce((sum, p) => sum + p.soldCount, 0)
    const reviewCount = products.reduce((sum, p) => sum + p.reviewCount, 0)
    const rated = products.filter((p) => p.reviewCount > 0)
    const avgRating =
      rated.length > 0 ? Math.round((rated.reduce((sum, p) => sum + p.rating, 0) / rated.length) * 10) / 10 : 0

    const categoryMap = products.reduce(
      (map, p) => {
        const entry = map.get(p.category.id) ?? { ...p.category, count: 0 }
        entry.count += 1
        map.set(p.category.id, entry)
        return map
      },
      new Map<string, { id: string; name: string; slug: string; count: number }>()
    )

    return {
      seller: {
        id: seller.id,
        name: seller.name,
        storeName: seller.storeName,
        storeBio: seller.storeBio,
        memberSince: seller.createdAt.toISOString(),
        activeListings: total,
        totalSold,
        avgRating,
        reviewCount,
      },
      categories: [...categoryMap.values()],
      products: products.map((p) => serializeProduct(p)),
      totalProducts: total,
    }
  } catch {
    return null
  }
})

// ── Categories ───────────────────────────────────────────────────────────────

export interface PublicCategoryData {
  category: { id: string; name: string; slug: string; icon: string | null }
  /** Active products in this category (featured/popular first), capped for the landing grid. */
  products: ProductDTO[]
  totalProducts: number
  /** Number of distinct active sellers listing in this category. */
  sellerCount: number
  /** First product image — used as the hero/OG image when present. */
  coverImage: string | null
}

const CATEGORY_GRID_CAP = 48

export const getPublicCategory = cache(async (slug: string): Promise<PublicCategoryData | null> => {
  try {
    const category = await db.category.findUnique({ where: { slug } })
    if (!category) return null

    const [rows, total, sellerRows] = await Promise.all([
      db.product.findMany({
        where: { categoryId: category.id, status: 'ACTIVE', seller: { status: 'ACTIVE' } },
        include: productInclude,
        orderBy: [{ featured: 'desc' }, { soldCount: 'desc' }],
        take: CATEGORY_GRID_CAP,
      }),
      db.product.count({
        where: { categoryId: category.id, status: 'ACTIVE', seller: { status: 'ACTIVE' } },
      }),
      // distinct seller ids listing in this category (count() has no distinct arg)
      db.product.findMany({
        where: { categoryId: category.id, status: 'ACTIVE', seller: { status: 'ACTIVE' } },
        distinct: ['sellerId'],
        select: { sellerId: true },
      }),
    ])
    const sellerCount = sellerRows.length

    const cover = rows.find((r) => r.images)?.images
    let coverImage: string | null = null
    if (cover) {
      try {
        const parsed = JSON.parse(cover)
        if (Array.isArray(parsed) && typeof parsed[0] === 'string') coverImage = parsed[0]
      } catch {
        coverImage = null
      }
    }

    return {
      category: { id: category.id, name: category.name, slug: category.slug, icon: category.icon },
      products: rows.map((r) => serializeProduct(r)),
      totalProducts: total,
      sellerCount,
      coverImage,
    }
  } catch {
    return null
  }
})

/** All categories with their ACTIVE product counts (chips + sitemap). */
export const getCategoriesWithCounts = cache(async () => {
  try {
    const categories = await db.category.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: { where: { status: 'ACTIVE', seller: { status: 'ACTIVE' } } } } } },
    })
    return categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      icon: c.icon,
      productCount: c._count.products,
    }))
  } catch {
    return []
  }
})
