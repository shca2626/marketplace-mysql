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

/** Image refs are either absolute http(s) URLs or files uploaded via /api/upload. */
export function isValidImageRef(value: string): boolean {
  if (!value) return false
  if (value.startsWith('/uploads/') && !value.includes('..')) return true
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
  variants: z.array(variantSchema).max(100, 'Too many variants (max 100)').optional(),
})
