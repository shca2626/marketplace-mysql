/**
 * Catalog validation — zod schemas for product input, driven by the
 * category attribute definitions. Used by POST/PUT /api/products and by
 * the bulk import endpoint so every entry point validates identically.
 */
import { z } from 'zod'
import { attributesForCategory } from './definitions'
import type { AttributeValue } from './definitions'

export const PRODUCT_CONDITIONS = [
  'NEW',
  'REFURBISHED',
  'USED_LIKE_NEW',
  'USED_GOOD',
  'USED_FAIR',
] as const

export type ProductCondition = (typeof PRODUCT_CONDITIONS)[number]

const CONDITION_LABELS: Record<ProductCondition, string> = {
  NEW: 'New',
  REFURBISHED: 'Refurbished',
  USED_LIKE_NEW: 'Used — like new',
  USED_GOOD: 'Used — good',
  USED_FAIR: 'Used — fair',
}

export function conditionLabel(value: string): string {
  return CONDITION_LABELS[value as ProductCondition] ?? value
}

// ── media URL validation ─────────────────────────────────────────
// Product images can be absolute http(s) URLs (seeds / external CDN) or
// RELATIVE "/api/media/…" references to renditions stored by our upload
// pipeline (day-1 storage core). z.string().url() rejects relative paths,
// so we validate with a refine that accepts exactly these two shapes —
// this keeps javascript:/data: schemes out while allowing local uploads.
export const mediaUrlSchema = z
  .string()
  .max(1000)
  .refine(
    (v) => {
      if (v.startsWith('/api/media/')) return true
      try {
        const u = new URL(v)
        return u.protocol === 'http:' || u.protocol === 'https:'
      } catch {
        return false
      }
    },
    'Image must be a valid http(s) URL or an uploaded media reference',
  )

// ── variant schema ───────────────────────────────────────────────────

export const variantInputSchema = z.object({
  name: z.string().min(1, 'Variant name is required').max(300),
  options: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  priceDelta: z.number().min(-1000000).max(1000000).default(0),
  sku: z.string().max(80).nullable().optional(),
  stock: z.number().int().min(0).max(1000000).default(0),
  image: mediaUrlSchema.nullable().optional(),
})

export type VariantInput = z.infer<typeof variantInputSchema>

// ── attribute value validation (per category) ─────────────────────────

// (AttributeValue type lives in definitions.ts — re-exported for convenience)
export type { AttributeValue } from './definitions'

/**
 * Validate an attributes object against a category's definitions.
 * Returns a cleaned copy (unknown keys dropped, values type-checked)
 * or a list of human-readable errors.
 */
export function validateAttributes(
  categorySlug: string,
  input: unknown
): { ok: true; value: Record<string, AttributeValue> } | { ok: false; errors: string[] } {
  if (input === null || input === undefined) return { ok: true, value: {} }
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: ['Attributes must be an object'] }
  }
  const defs = attributesForCategory(categorySlug)
  const errors: string[] = []
  const value: Record<string, AttributeValue> = {}

  for (const def of defs) {
    const raw = (input as Record<string, unknown>)[def.key]
    if (raw === undefined || raw === null || raw === '') continue // optional

    switch (def.type) {
      case 'text':
      case 'textarea': {
        if (typeof raw !== 'string') {
          errors.push(`${def.label} must be text`)
        } else {
          value[def.key] = raw.slice(0, def.type === 'text' ? 300 : 2000)
        }
        break
      }
      case 'number': {
        const n = typeof raw === 'number' ? raw : parseFloat(String(raw))
        if (!Number.isFinite(n)) {
          errors.push(`${def.label} must be a number`)
        } else if (def.min !== undefined && n < def.min) {
          errors.push(`${def.label} must be ≥ ${def.min}`)
        } else if (def.max !== undefined && n > def.max) {
          errors.push(`${def.label} must be ≤ ${def.max}`)
        } else {
          value[def.key] = n
        }
        break
      }
      case 'boolean': {
        if (typeof raw === 'boolean') value[def.key] = raw
        else if (raw === 'true' || raw === 'false') value[def.key] = raw === 'true'
        else errors.push(`${def.label} must be true/false`)
        break
      }
      case 'select': {
        const s = String(raw)
        const allowed = (def.options ?? []).map((o) => o.value)
        if (allowed.length === 0 || allowed.includes(s)) value[def.key] = s
        else errors.push(`${def.label} must be one of: ${allowed.slice(0, 5).join(', ')}${allowed.length > 5 ? '…' : ''}`)
        break
      }
      case 'multiselect': {
        const arr = Array.isArray(raw)
          ? raw.map(String)
          : typeof raw === 'string'
            ? raw.split('|').map((x) => x.trim()).filter(Boolean)
            : null
        if (!arr) {
          errors.push(`${def.label} must be a list`)
          break
        }
        const allowed = (def.options ?? []).map((o) => o.value)
        const bad = arr.filter((x) => allowed.length > 0 && !allowed.includes(x))
        if (bad.length > 0) {
          errors.push(`${def.label}: invalid option${bad.length > 1 ? 's' : ''} ${bad.slice(0, 3).join(', ')}`)
        } else if (arr.length > 0) {
          value[def.key] = arr.slice(0, 20)
        }
        break
      }
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, value }
}

// ── full product input schema ────────────────────────────────────────

const baseProductFields = {
  title: z.string().min(3, 'Title must be at least 3 characters').max(120),
  description: z.string().min(10, 'Description must be at least 10 characters').max(4000),
  price: z.number().positive('Price must be positive').max(10000000),
  compareAtPrice: z.number().positive().nullable().optional(),
  images: z.array(mediaUrlSchema).min(1, 'At least one image is required').max(6),
  categoryId: z.string().min(1, 'Category is required'),
  stock: z.number().int().min(0).max(1000000),

  // extended detail fields (all optional — backward compatible)
  slug: z
    .string()
    .max(300)
    .regex(/^[a-z0-9-]*$/, 'Slug can only contain lowercase letters, numbers and dashes')
    .nullable()
    .optional(),
  brand: z.string().max(120).nullable().optional(),
  sku: z.string().max(80).nullable().optional(),
  barcode: z.string().max(64).nullable().optional(),
  condition: z.enum(PRODUCT_CONDITIONS).optional(),
  tags: z.array(z.string().min(1).max(40)).max(15).optional(),
  videoUrl: mediaUrlSchema.nullable().optional(),
  freeShipping: z.boolean().optional(),
  shippingNote: z.string().max(300).nullable().optional(),
  handlingDays: z.number().int().min(0).max(60).optional(),
  weightKg: z.number().min(0).max(100000).nullable().optional(),
  lengthCm: z.number().min(0).max(100000).nullable().optional(),
  widthCm: z.number().min(0).max(100000).nullable().optional(),
  heightCm: z.number().min(0).max(100000).nullable().optional(),
  minOrderQty: z.number().int().min(1).max(1000).optional(),
  maxPerOrder: z.number().int().min(1).max(1000).nullable().optional(),
  warrantyMonths: z.number().int().min(0).max(120).nullable().optional(),
  metaTitle: z.string().max(300).nullable().optional(),
  metaDescription: z.string().max(500).nullable().optional(),
  status: z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']).optional(),
  featured: z.boolean().optional(),
}

export const productCreateSchema = z.object({
  ...baseProductFields,
  attributes: z.record(z.string(), z.unknown()).optional(),
  variants: z.array(variantInputSchema).max(50).optional(),
})

export const productUpdateSchema = z.object({
  ...baseProductFields,
  attributes: z.record(z.string(), z.unknown()).optional(),
  variants: z.array(variantInputSchema).max(50).optional(),
})

export type ProductCreateInput = z.infer<typeof productCreateSchema>
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>
