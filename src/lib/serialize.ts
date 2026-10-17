import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import type { CategoryDTO, OrderDTO, ProductDTO, ProductVariantDTO, ReviewDTO } from '@/lib/types'

export const productInclude: Prisma.ProductInclude = {
  category: true,
  seller: { select: { id: true, name: true, storeName: true } },
  variants: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
  offers: {
    where: { status: 'ACTIVE', OR: [{ sellerOrgId: null }, { sellerOrg: { status: 'ACTIVE' } }] },
    orderBy: { price: 'asc' },
    select: {
      id: true,
      price: true,
      stock: true,
      moq: true,
      processingDays: true,
      freeShipping: true,
      shippingFee: true,
      sellerOrgId: true,
      storeId: true,
      sellerOrg: { select: { id: true, name: true, slug: true } },
      store: { select: { name: true } },
    },
  },
}

export type ProductVariantRaw = {
  id: string
  name: string
  options: string
  price: number | null
  compareAtPrice: number | null
  stock: number
  sku: string | null
  position: number
  isActive: boolean
}

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
  // Commerce details (all optional — older rows / partial selects)
  sku?: string | null
  barcode?: string | null
  videoUrl?: string | null
  highlights?: string | null
  specs?: string | null
  materials?: string | null
  care?: string | null
  weightGrams?: number | null
  lengthCm?: number | null
  widthCm?: number | null
  heightCm?: number | null
  processingDays?: number | null
  freeShipping?: boolean
  shippingFee?: number | null
  shippingPolicy?: string | null
  slug?: string | null
  metaTitle?: string | null
  metaDescription?: string | null
  moq?: number | null
  priceTiers?: string | null
  variants?: ProductVariantRaw[]
  // ── Unified catalog identity (optional — partial selects may omit) ──
  brand?: { id: string; name: string; slug: string; isVerified: boolean } | null
  gtin?: string | null
  mpn?: string | null
  isCurated?: boolean
  popularRank?: number | null
  // ── SPONSOR-1: live sponsored placement flag (optional — the storefront
  //    list route decorates it; other queries omit it) ──
  sponsored?: boolean
  // ── Shared-catalog offer aggregation (optional — partial selects may omit) ──
  offers?: {
    id: string
    price: number
    stock: number
    moq: number | null
    processingDays: number | null
    freeShipping: boolean
    shippingFee: number | null
    sellerOrgId: string | null
    sellerOrg?: { id: string; name: string; slug: string } | null
    store?: { name: string } | null
  }[]
}

function parseJsonArray<T>(raw: string | null | undefined, guard: (x: unknown) => x is T): T[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(guard) : []
  } catch {
    return []
  }
}

const isString = (x: unknown): x is string => typeof x === 'string'
const isSpec = (x: unknown): x is { label: string; value: string } =>
  typeof x === 'object' && x !== null && typeof (x as { label?: unknown }).label === 'string' && typeof (x as { value?: unknown }).value === 'string'
const isTier = (x: unknown): x is { from: number; to: number | null; price: number } =>
  typeof x === 'object' && x !== null && typeof (x as { from?: unknown }).from === 'number' && typeof (x as { price?: unknown }).price === 'number' && ((x as { to?: unknown }).to === null || typeof (x as { to?: unknown }).to === 'number')

function serializeVariant(v: ProductVariantRaw): ProductVariantDTO {
  let options: Record<string, string> = {}
  try {
    const parsed = JSON.parse(v.options || '{}')
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      options = Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).filter(([, val]) => typeof val === 'string') as [string, string][]
      )
    }
  } catch {
    options = {}
  }
  return {
    id: v.id,
    name: v.name,
    options,
    price: v.price,
    compareAtPrice: v.compareAtPrice,
    stock: v.stock,
    sku: v.sku,
    position: v.position,
    isActive: v.isActive,
  }
}

export function serializeProduct(p: ProductRaw, favorited = false, sponsored = false): ProductDTO {
  let images: string[] = []
  try {
    const parsed = JSON.parse(p.images || '[]')
    if (Array.isArray(parsed)) images = parsed.filter((x) => typeof x === 'string')
  } catch {
    images = []
  }
  return {
    id: p.id,
    // unified catalog identity (optional pass-throughs — absent when the
    // query didn't select them)
    brand: p.brand ?? null,
    gtin: p.gtin ?? null,
    mpn: p.mpn ?? null,
    isCurated: p.isCurated ?? undefined,
    popularRank: p.popularRank ?? null,
    sponsored: sponsored || p.sponsored || undefined,
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
    sku: p.sku ?? null,
    barcode: p.barcode ?? null,
    videoUrl: p.videoUrl ?? null,
    highlights: parseJsonArray(p.highlights, isString),
    specs: parseJsonArray(p.specs, isSpec),
    materials: p.materials ?? null,
    care: p.care ?? null,
    weightGrams: p.weightGrams ?? null,
    lengthCm: p.lengthCm ?? null,
    widthCm: p.widthCm ?? null,
    heightCm: p.heightCm ?? null,
    processingDays: p.processingDays ?? null,
    freeShipping: p.freeShipping ?? false,
    shippingFee: p.shippingFee ?? null,
    shippingPolicy: p.shippingPolicy ?? null,
    slug: p.slug ?? null,
    metaTitle: p.metaTitle ?? null,
    metaDescription: p.metaDescription ?? null,
    moq: (p as { moq?: number | null }).moq ?? null,
    priceTiers: parseJsonArray((p as { priceTiers?: string | null }).priceTiers, isTier),
    variants: (p.variants ?? []).map(serializeVariant),
    // ── Shared-catalog offer aggregation (multi-vendor) ──
    offers: (p.offers ?? []).map((o) => ({
      id: o.id,
      price: o.price,
      stock: o.stock,
      moq: o.moq,
      processingDays: o.processingDays,
      freeShipping: o.freeShipping,
      shippingFee: o.shippingFee,
      sellerOrgId: o.sellerOrgId,
      sellerOrgName: o.sellerOrg?.name ?? null,
      sellerOrgSlug: o.sellerOrg?.slug ?? null,
      storeName: o.store?.name ?? null,
    })),
    minOfferPrice: (p.offers ?? []).length > 0 ? Math.min(...(p.offers ?? []).map((o) => o.price)) : null,
    offerCount: (p.offers ?? []).length,
    approvalState: (p as { approvalState?: string }).approvalState ?? 'APPROVED',
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
    paymentTerms?: string | null
    poNumber?: string | null
    sourceType?: string | null
    buyer?: { id: string; name: string; email: string }
    payment?: {
      method: string
      status: string
      reference?: string | null
      instructions?: string | null
      dueAt?: Date | null
      paidAt?: Date | null
      amount?: unknown
    } | null
    items: {
      id: string
      productId: string
      sellerId: string
      title: string
      image?: string | null
      price: number
      quantity: number
      variantId?: string | null
      variantName?: string | null
      sellerOrgId?: string | null
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
    paymentTerms: o.paymentTerms ?? null,
    poNumber: o.poNumber ?? null,
    sourceType: o.sourceType ?? null,
    payment: o.payment
      ? {
          method: o.payment.method,
          status: o.payment.status,
          reference: o.payment.reference ?? null,
          instructions: o.payment.instructions ?? null,
          dueAt: o.payment.dueAt?.toISOString() ?? null,
          paidAt: o.payment.paidAt?.toISOString() ?? null,
        }
      : null,
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
