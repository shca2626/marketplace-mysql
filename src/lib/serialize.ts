import { db } from '@/lib/db'
import type { CategoryDTO, OrderDTO, ProductDTO, ReviewDTO } from '@/lib/types'

export const productInclude = {
  category: true,
  seller: { select: { id: true, name: true, storeName: true } },
} as const

type ProductRaw = {
  id: string
  title: string
  description: string
  price: number
  compareAtPrice: number | null
  images: string
  categoryId: string
  category: { id: string; name: string; slug: string; icon?: string | null }
  sellerId: string
  seller: { id: string; name: string; storeName?: string | null }
  stock: number
  soldCount: number
  rating: number
  reviewCount: number
  featured: boolean
  status: string
  createdAt: Date
}

export function serializeProduct(p: ProductRaw, favorited = false): ProductDTO {
  let images: string[] = []
  try {
    const parsed = JSON.parse(p.images || '[]')
    if (Array.isArray(parsed)) images = parsed.filter((x) => typeof x === 'string')
  } catch {
    images = []
  }
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    price: p.price,
    compareAtPrice: p.compareAtPrice,
    images,
    categoryId: p.categoryId,
    category: p.category,
    sellerId: p.sellerId,
    seller: p.seller,
    stock: p.stock,
    soldCount: p.soldCount,
    rating: p.rating,
    reviewCount: p.reviewCount,
    featured: p.featured,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
    favorited,
  }
}

export function serializeReview(r: {
  id: string
  productId: string
  rating: number
  comment: string
  verified: boolean
  createdAt: Date
  user: { id: string; name: string }
}): ReviewDTO {
  return {
    id: r.id,
    productId: r.productId,
    rating: r.rating,
    comment: r.comment,
    verified: r.verified,
    createdAt: r.createdAt.toISOString(),
    user: r.user,
  }
}

export function serializeOrder(
  o: {
    id: string
    total: number
    status: string
    fullName: string
    address: string
    city: string
    country: string
    zip: string
    phone?: string | null
    createdAt: Date
    buyer?: { id: string; name: string; email: string }
    items: {
      id: string
      productId: string
      sellerId: string
      title: string
      image?: string | null
      price: number
      quantity: number
    }[]
  },
  sellerId?: string
): OrderDTO {
  return {
    id: o.id,
    total: o.total,
    status: o.status,
    fullName: o.fullName,
    address: o.address,
    city: o.city,
    country: o.country,
    zip: o.zip,
    phone: o.phone ?? null,
    createdAt: o.createdAt.toISOString(),
    buyer: o.buyer,
    items: o.items.map((i) => ({ ...i, mine: sellerId ? i.sellerId === sellerId : undefined })),
  }
}

export async function favoriteIdsFor(userId: string | null | undefined, productIds: string[]) {
  if (!userId || productIds.length === 0) return new Set<string>()
  const favs = await db.favorite.findMany({
    where: { userId, productId: { in: productIds } },
    select: { productId: true },
  })
  return new Set(favs.map((f) => f.productId))
}

export function serializeCategory(
  c: { id: string; name: string; slug: string; icon?: string | null },
  productCount = 0,
  coverImage: string | null = null
): CategoryDTO {
  return { ...c, productCount, coverImage }
}

export function formatUSD(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}
