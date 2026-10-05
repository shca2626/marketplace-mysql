import { db } from '@/lib/db'
import { z } from 'zod'

/**
 * Shared helpers for the product form pipeline (create / update).
 * Server-authoritative coercion lives here so POST and PUT stay identical.
 */

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

/** Ensure a slug is globally unique; appends -2, -3… when taken. Returns null for empty input. */
export async function ensureUniqueSlug(
  raw: string | null | undefined,
  excludeProductId?: string
): Promise<string | null> {
  const base = slugify(raw ?? '')
  if (!base) return null
  let candidate = base
  for (let n = 2; n < 60; n++) {
    const clash = await db.product.findFirst({
      where: { slug: candidate, ...(excludeProductId ? { id: { not: excludeProductId } } : {}) },
      select: { id: true },
    })
    if (!clash) return candidate
    candidate = `${base}-${n}`
  }
  return `${base}-${Date.now().toString(36)}` // practical exhaustion fallback
}

export function isValidHttpUrl(value: string | null | undefined): boolean {
  if (!value) return true // empty is fine
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/** Image refs are absolute http(s) URLs or files served by the local media
 *  pipeline (/uploads/... legacy paths and /api/media/... rendition URLs —
 *  the uploads endpoint returns the latter, and seeded rows store them). */
export function isValidImageRef(value: string): boolean {
  if (!value) return false
  if ((value.startsWith('/uploads/') || value.startsWith('/api/media/')) && !value.includes('..'))
    return true
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

// ── Shared product-form schema (create + update) ─────────────────────────────

export const variantSchema = z.object({
  name: z.string().min(1, 'Variant name is required').max(200),
  options: z.record(z.string(), z.string()),
  price: z.number().positive('Variant price must be positive').nullable().optional(),
  compareAtPrice: z.number().positive().nullable().optional(),
  stock: z.number().int().min(0, 'Variant stock cannot be negative').max(100000),
  sku: z.string().max(64).optional().nullable(),
  isActive: z.boolean().optional(),
})

export const productFormSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(120),
  description: z.string().min(10, 'Description must be at least 10 characters').max(4000),
  price: z.number().positive('Price must be positive'),
  compareAtPrice: z.number().positive().nullable().optional(),
  images: z
    .array(
      z
        .string()
        .max(2048)
        .refine(isValidImageRef, 'Image must be a valid http(s) URL or an uploaded file')
    )
    .max(6)
    .default([]), // drafts may have 0; publish enforces ≥1 in the route
  categoryId: z.string().min(1, 'Category is required'),
  stock: z.number().int().min(0).max(100000),
  status: z.enum(['ACTIVE', 'DRAFT']).optional(), // absent = ACTIVE (legacy callers)

  // ── Commerce details ──
  sku: z.string().max(64).optional().nullable(),
  barcode: z.string().max(64).optional().nullable(),
  videoUrl: z
    .string()
    .max(512)
    .refine(isValidHttpUrl, 'Video URL must be a valid http(s) link')
    .optional()
    .nullable(),
  highlights: z.array(z.string().max(160)).max(10).optional(),
  specs: z
    .array(z.object({ label: z.string().max(60), value: z.string().max(200) }))
    .max(12)
    .optional(),
  materials: z.string().max(500).optional().nullable(),
  care: z.string().max(500).optional().nullable(),
  weightGrams: z.number().int().min(1).max(2000000).optional().nullable(),
  lengthCm: z.number().min(0).max(500).optional().nullable(),
  widthCm: z.number().min(0).max(500).optional().nullable(),
  heightCm: z.number().min(0).max(500).optional().nullable(),
  processingDays: z.number().int().min(1).max(30).optional().nullable(),
  freeShipping: z.boolean().optional(),
  shippingFee: z.number().min(0).max(10000).optional().nullable(),
  shippingPolicy: z.string().max(1000).optional().nullable(),
  slug: z.string().max(180).optional().nullable(),
  metaTitle: z.string().max(150).optional().nullable(),
  metaDescription: z.string().max(320).optional().nullable(),
  moq: z.number().int().min(1).max(1_000_000).optional().nullable(),
  priceTiers: z
    .array(
      z.object({
        from: z.number().int().min(1).max(1_000_000),
        to: z.number().int().min(1).max(1_000_000).nullable(),
        price: z.number().min(0.01).max(1_000_000),
      })
    )
    .max(20, 'Too many price tiers (max 20)')
    .optional(),
  variants: z.array(variantSchema).max(100, 'Too many variants (max 100)').optional(),

  // ── Phase 4: unified catalog identity (sellers may supply GTIN/MPN as dedup
  // keys; brand linkage is set by admins in the Catalog console) ──
  gtin: z.string().trim().max(20).regex(/^[0-9Xx]*$/, 'GTIN must be digits (EAN/UPC)').optional().nullable(),
  mpn: z.string().trim().max(64).optional().nullable(),

  // ── Phase 4: publish-approval workflow ──
  publicationAgreed: z.boolean().optional(), // seller accepted the Publication Agreement (this publish)
})

/** Current Publication Agreement version — bump when the text changes. */
export const PUBLICATION_AGREEMENT_VERSION = '1.0'

import type { Prisma } from '@prisma/client'
import { productInclude } from '@/lib/serialize'

/**
 * Shared product creation (POST /api/products + bulk import).
 * Validates nothing itself — callers parse with productFormSchema first.
 * Phase 4: callers may pass status PENDING_REVIEW (publish-review routing).
 * Returns the created row with the standard list include.
 */
export async function createProduct(
  sellerId: string,
  d: Omit<z.infer<typeof productFormSchema>, 'status'> & { status?: 'ACTIVE' | 'DRAFT' | 'PENDING_REVIEW' }
) {
  const status = d.status ?? 'ACTIVE'
  if (status === 'ACTIVE' && d.images.length === 0) {
    throw Object.assign(new Error('Add at least one image before publishing (or save as draft)'), { status: 400 })
  }

  // With variants, per-combo stock is authoritative → product.stock is their sum
  const variants = d.variants ?? []
  const stock = variants.length ? variants.reduce((s, v) => s + v.stock, 0) : d.stock
  const slug = await ensureUniqueSlug(d.slug?.trim() || slugify(d.title))

  return db.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        title: d.title.trim(),
        description: d.description.trim(),
        price: d.price,
        compareAtPrice: d.compareAtPrice ?? null,
        images: JSON.stringify(d.images),
        categoryId: d.categoryId,
        sellerId,
        stock,
        status,
        sku: d.sku?.trim() || null,
        barcode: d.barcode?.trim() || null,
        videoUrl: d.videoUrl?.trim() || null,
        highlights: d.highlights?.length ? JSON.stringify(d.highlights) : null,
        specs: d.specs?.length ? JSON.stringify(d.specs) : null,
        materials: d.materials?.trim() || null,
        care: d.care?.trim() || null,
        weightGrams: d.weightGrams ?? null,
        lengthCm: d.lengthCm ?? null,
        widthCm: d.widthCm ?? null,
        heightCm: d.heightCm ?? null,
        processingDays: d.processingDays ?? null,
        freeShipping: d.freeShipping ?? false,
        shippingFee: d.freeShipping ? null : (d.shippingFee ?? null),
        shippingPolicy: d.shippingPolicy?.trim() || null,
        slug,
        metaTitle: d.metaTitle?.trim() || null,
        metaDescription: d.metaDescription?.trim() || null,
        moq: d.moq ?? null,
        priceTiers: d.priceTiers?.length ? JSON.stringify(d.priceTiers) : null,
        gtin: d.gtin?.trim() || null,
        mpn: d.mpn?.trim() || null,
        ...(d.publicationAgreed
          ? { publicationAgreedAt: new Date(), publicationAgreementVersion: PUBLICATION_AGREEMENT_VERSION }
          : {}),
      },
    })
    if (variants.length > 0) {
      await tx.productVariant.createMany({
        data: variants.map((v, i) => ({
          productId: created.id,
          name: v.name,
          options: JSON.stringify(v.options ?? {}),
          price: v.price ?? null,
          compareAtPrice: v.compareAtPrice ?? null,
          stock: v.stock,
          sku: v.sku?.trim() || null,
          position: i,
          isActive: v.isActive ?? true,
        })),
      })
    }
    return tx.product.findUnique({ where: { id: created.id }, include: productInclude })
  })
}

/** Validate a create payload through the shared form schema (bulk import path). */
export function parseProductForm(body: unknown) {
  return productFormSchema.safeParse(body)
}

// keep Prisma type import used for future typed tx helpers
export type ProductTx = Prisma.TransactionClient
