import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import { assertSellerCanPublish } from '@/server/modules/kyc/service'
import { sellerNeedsPublishReview } from './settings'

/**
 * PHASE 4 — multi-vendor offers ("who sells it" layer).
 *
 * Product keeps its single-seller listing semantics (Product.price/stock/
 * sellerId = the primary offer) so every existing cart / order / RFQ / quote
 * flow keeps working unchanged. A ProductOffer is an ADDITIONAL seller's
 * offer on someone else's (or the platform's) catalog listing — displayed
 * side-by-side on the product page (owner Q5), selectable in the cart and
 * targetable by RFQ lines.
 *
 * One offer per (product, seller) — the listing's own seller edits the
 * Product fields instead (guards reject them here).
 */

export type OfferRaw = Prisma.ProductOfferGetPayload<{
  include: { seller: { select: { id: true; name: true; storeName: true; status: true } } }
}>

export interface OfferDTO {
  id: string
  productId: string
  sellerId: string
  seller: { id: string; name: string; storeName: string | null }
  price: number
  compareAtPrice: number | null
  stock: number
  moq: number | null
  sku: string | null
  priceTiers?: { from: number; to: number | null; price: number }[] | null
  freeShipping: boolean
  shippingFee: number | null
  processingDays: number | null
  leadTimeNote: string | null
  status: string
  soldCount: number
  createdAt: string
}

export function serializeOffer(o: OfferRaw): OfferDTO {
  let tiers: OfferDTO['priceTiers'] = null
  if (o.priceTiers) {
    try {
      const parsed = JSON.parse(o.priceTiers)
      if (Array.isArray(parsed)) tiers = parsed
    } catch {
      tiers = null
    }
  }
  return {
    id: o.id,
    productId: o.productId,
    sellerId: o.sellerId,
    seller: { id: o.seller.id, name: o.seller.name, storeName: o.seller.storeName },
    price: o.price,
    compareAtPrice: o.compareAtPrice,
    stock: o.stock,
    moq: o.moq,
    sku: o.sku,
    priceTiers: tiers,
    freeShipping: o.freeShipping,
    shippingFee: o.shippingFee,
    processingDays: o.processingDays,
    leadTimeNote: o.leadTimeNote,
    status: o.status,
    soldCount: o.soldCount,
    createdAt: o.createdAt.toISOString(),
  }
}

const offerInclude = {
  seller: { select: { id: true, name: true, storeName: true, status: true } },
} satisfies Prisma.ProductOfferInclude

export class OfferError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

/** Public offers on a listing — only ACTIVE offers from ACTIVE sellers, cheapest first. */
export async function listPublicOffers(productId: string): Promise<OfferRaw[]> {
  return db.productOffer.findMany({
    where: { productId, status: 'ACTIVE', seller: { status: 'ACTIVE' } },
    include: offerInclude,
    orderBy: [{ price: 'asc' }, { createdAt: 'asc' }],
  })
}

/** Seller's own offers across the whole catalog (their console "My offers" tab). */
export async function listMyOffers(sellerId: string) {
  const rows = await db.productOffer.findMany({
    where: { sellerId, status: { not: 'ARCHIVED' } },
    include: {
      ...offerInclude,
      product: { select: { id: true, title: true, images: true, status: true, slug: true, categoryId: true, category: { select: { name: true } } } },
    },
    orderBy: { updatedAt: 'desc' },
  })
  return rows.map((r) => ({
    ...serializeOffer(r),
    product: {
      id: r.product.id,
      title: r.product.title,
      status: r.product.status,
      slug: r.product.slug,
      category: r.product.category.name,
      image: (() => {
        try {
          const imgs = JSON.parse(r.product.images || '[]')
          return Array.isArray(imgs) && imgs.length > 0 ? imgs[0] : null
        } catch {
          return null
        }
      })(),
    },
  }))
}

export const offerInputSchema = {
  price: { min: 0.01, max: 1_000_000 },
  stock: { min: 0, max: 100_000 },
  moq: { min: 1, max: 1_000_000 },
  shippingFee: { min: 0, max: 10_000 },
  processingDays: { min: 1, max: 60 },
}

export interface OfferInput {
  price: number
  compareAtPrice?: number | null
  stock: number
  moq?: number | null
  sku?: string | null
  priceTiers?: { from: number; to: number | null; price: number }[] | null
  freeShipping?: boolean
  shippingFee?: number | null
  processingDays?: number | null
  leadTimeNote?: string | null
}

/**
 * Attach an offer to an existing catalog listing (the "Sell this product"
 * action). Guards: signed-in seller, product live, not the listing owner,
 * KYC L2 (identity verified), vendor in good standing, no prior offer.
 * New sellers go through the publish-review queue; established ones go live.
 */
export async function attachOffer(user: { id: string; role: string; status: string; kycLevel: number }, productId: string, input: OfferInput): Promise<OfferRaw> {
  if (user.role !== 'SELLER' && user.role !== 'ADMIN')
    throw new OfferError('Only sellers can attach offers to catalog products', 403)
  if (user.status === 'SUSPENDED')
    throw new OfferError('Your vendor account is suspended — offers cannot be published', 403)

  const product = await db.product.findUnique({ where: { id: productId }, select: { id: true, sellerId: true, status: true, title: true } })
  if (!product) throw new OfferError('Product not found', 404)
  if (product.status !== 'ACTIVE') throw new OfferError('Offers can only target live listings', 400)
  if (product.sellerId === user.id)
    throw new OfferError('You already own this listing — edit it in your product form instead', 400)

  // KYC enforcement: same identity gate as publishing a listing (L2)
  await assertSellerCanPublish(user)

  const existing = await db.productOffer.findUnique({
    where: { productId_sellerId: { productId, sellerId: user.id } },
    select: { id: true, status: true },
  })
  if (existing && existing.status !== 'ARCHIVED')
    throw new OfferError('You already sell this product — edit your existing offer instead', 409)
  // Archived offer → re-attach replaces it (delete + recreate keeps history in audit)

  const needsReview = await sellerNeedsPublishReview(user.id)
  const status = needsReview ? 'PENDING_REVIEW' : 'ACTIVE'

  if (existing) {
    // revive an archived offer
    const revived = await db.productOffer.update({
      where: { id: existing.id },
      data: {
        price: input.price,
        compareAtPrice: input.compareAtPrice ?? null,
        stock: input.stock,
        moq: input.moq ?? null,
        sku: input.sku?.trim() || null,
        priceTiers: input.priceTiers?.length ? JSON.stringify(input.priceTiers) : null,
        freeShipping: input.freeShipping ?? false,
        shippingFee: input.freeShipping ? null : (input.shippingFee ?? null),
        processingDays: input.processingDays ?? null,
        leadTimeNote: input.leadTimeNote?.trim() || null,
        status,
      },
      include: offerInclude,
    })
    return revived
  }

  return db.productOffer.create({
    data: {
      productId,
      sellerId: user.id,
      price: input.price,
      compareAtPrice: input.compareAtPrice ?? null,
      stock: input.stock,
      moq: input.moq ?? null,
      sku: input.sku?.trim() || null,
      priceTiers: input.priceTiers?.length ? JSON.stringify(input.priceTiers) : null,
      freeShipping: input.freeShipping ?? false,
      shippingFee: input.freeShipping ? null : (input.shippingFee ?? null),
      processingDays: input.processingDays ?? null,
      leadTimeNote: input.leadTimeNote?.trim() || null,
      status,
    },
    include: offerInclude,
  })
}

/** Seller edits their own offer (price/stock/terms). A PENDING_REVIEW offer stays pending. */
export async function updateOffer(userId: string, offerId: string, input: Partial<OfferInput> & { status?: 'ACTIVE' | 'PAUSED' }): Promise<OfferRaw> {
  const offer = await db.productOffer.findUnique({ where: { id: offerId }, select: { id: true, sellerId: true, status: true } })
  if (!offer) throw new OfferError('Offer not found', 404)
  if (offer.sellerId !== userId) throw new OfferError('You can only edit your own offer', 403)

  const nextStatus = input.status ?? undefined
  if (nextStatus === 'ACTIVE' && offer.status === 'PENDING_REVIEW')
    throw new OfferError('This offer is awaiting platform review — it will go live once approved', 400)
  if (offer.status === 'REJECTED')
    throw new OfferError('This offer was rejected by platform review — contact support', 400)

  return db.productOffer.update({
    where: { id: offerId },
    data: {
      ...(input.price !== undefined ? { price: input.price } : {}),
      ...(input.compareAtPrice !== undefined ? { compareAtPrice: input.compareAtPrice ?? null } : {}),
      ...(input.stock !== undefined ? { stock: input.stock } : {}),
      ...(input.moq !== undefined ? { moq: input.moq ?? null } : {}),
      ...(input.sku !== undefined ? { sku: input.sku?.trim() || null } : {}),
      ...(input.priceTiers !== undefined ? { priceTiers: input.priceTiers?.length ? JSON.stringify(input.priceTiers) : null } : {}),
      ...(input.freeShipping !== undefined ? { freeShipping: input.freeShipping } : {}),
      ...(input.shippingFee !== undefined ? { shippingFee: input.freeShipping ? null : (input.shippingFee ?? null) } : {}),
      ...(input.processingDays !== undefined ? { processingDays: input.processingDays ?? null } : {}),
      ...(input.leadTimeNote !== undefined ? { leadTimeNote: input.leadTimeNote?.trim() || null } : {}),
      ...(nextStatus ? { status: nextStatus } : {}),
    },
    include: offerInclude,
  })
}

/** Seller archives (withdraws) their offer. Offer rows are kept — audit trail. */
export async function archiveOffer(userId: string, offerId: string): Promise<OfferRaw> {
  const offer = await db.productOffer.findUnique({ where: { id: offerId }, select: { sellerId: true } })
  if (!offer) throw new OfferError('Offer not found', 404)
  if (offer.sellerId !== userId) throw new OfferError('You can only withdraw your own offer', 403)
  return db.productOffer.update({ where: { id: offerId }, data: { status: 'ARCHIVED' }, include: offerInclude })
}
