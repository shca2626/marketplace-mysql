/**
 * Product import/export contract — the shared mapping between CSV/JSON
 * files and the API product-create payload. Used by:
 *   • seller import dialog (client: parse + map + preview)
 *   • /api/products/bulk  (server: revalidates identically)
 *   • /api/products/export (server: rows for CSV / objects for JSON)
 *
 * CSV conventions:
 *   • images and tags are pipe-separated:  "url1|url2"
 *   • category is a SLUG (e.g. "electronics") or exact category name
 *   • booleans are true/false (case-insensitive)
 *   • numbers may be empty (→ null / default)
 *   • attr.<key> columns carry category-specific attributes (validated
 *     against src/lib/catalog definitions server-side)
 *   • variants are NOT expressible in CSV — use the JSON tab or edit the
 *     product after import.
 */
import { CATEGORY_CATALOG, attributesForCategory } from '@/lib/catalog/definitions'
import { validateAttributes } from '@/lib/catalog/validation'
import type { AttributeValue } from '@/lib/catalog/validation'

export const CSV_BASE_COLUMNS = [
  'title',
  'description',
  'price',
  'compareAtPrice',
  'category',
  'stock',
  'images',
  'brand',
  'sku',
  'barcode',
  'condition',
  'tags',
  'videoUrl',
  'freeShipping',
  'shippingNote',
  'handlingDays',
  'weightKg',
  'lengthCm',
  'widthCm',
  'heightCm',
  'minOrderQty',
  'maxPerOrder',
  'warrantyMonths',
  'metaTitle',
  'metaDescription',
  'status',
] as const

/** Union of all attr.* columns across every category (flat export header). */
export function allAttributeColumns(): string[] {
  const keys = new Set<string>()
  for (const cat of CATEGORY_CATALOG) for (const a of cat.attributes) keys.add(a.key)
  // common attributes
  for (const a of attributesForCategory('__none__')) keys.add(a.key)
  return [...keys].map((k) => `attr.${k}`)
}

export function csvExportColumns(): string[] {
  return [...CSV_BASE_COLUMNS, ...allAttributeColumns()]
}

// ── import mapping ───────────────────────────────────────────────────

export interface ImportRow {
  /** mapped, validated create-payload (no categoryId yet — resolved server-side) */
  title: string
  description: string
  price: number
  compareAtPrice?: number | null
  categorySlug: string
  stock?: number
  images: string[]
  brand?: string | null
  sku?: string | null
  barcode?: string | null
  condition?: string
  tags: string[]
  videoUrl?: string | null
  freeShipping?: boolean
  shippingNote?: string | null
  handlingDays?: number
  weightKg?: number | null
  lengthCm?: number | null
  widthCm?: number | null
  heightCm?: number | null
  minOrderQty?: number
  maxPerOrder?: number | null
  warrantyMonths?: number | null
  metaTitle?: string | null
  metaDescription?: string | null
  status?: string
  attributes: Record<string, AttributeValue>
  /** variants (JSON import only) */
  variants?: {
    name: string
    options: Record<string, string | number | boolean>
    priceDelta?: number
    sku?: string | null
    stock?: number
    image?: string | null
  }[]
}

const CONDITIONS = ['NEW', 'REFURBISHED', 'USED_LIKE_NEW', 'USED_GOOD', 'USED_FAIR']

function splitList(v: string): string[] {
  return v.split('|').map((x) => x.trim()).filter(Boolean)
}

function toBool(v: string): boolean | undefined {
  const s = v.trim().toLowerCase()
  if (s === 'true' || s === 'yes' || s === '1') return true
  if (s === 'false' || s === 'no' || s === '0') return false
  return undefined
}

function toNum(v: string): number | null | undefined {
  const s = v.trim()
  if (!s) return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : null // null = invalid
}

/**
 * Map one CSV row (object keyed by header) into an ImportRow.
 * Returns errors instead of throwing; caller decides how to show them.
 */
export function csvRowToImport(
  row: Record<string, string>,
  knownSlugs: Set<string>
): { ok: true; data: ImportRow } | { ok: false; errors: string[] } {
  const errors: string[] = []

  const title = (row.title ?? '').trim()
  const description = (row.description ?? '').trim()
  const price = toNum(row.price ?? '')
  const categorySlug = (row.category ?? '').trim().toLowerCase().replace(/&/g, 'and').replace(/\s+/g, '-')
  const images = splitList(row.images ?? '')

  if (title.length < 3) errors.push('title: must be at least 3 characters')
  if (description.length < 10) errors.push('description: must be at least 10 characters')
  if (price === undefined || price === null || price <= 0) errors.push('price: must be a positive number')
  if (!knownSlugs.has(categorySlug)) errors.push(`category: unknown category "${row.category ?? ''}"`)
  if (images.length === 0) errors.push('images: at least one URL required')
  // Accept absolute http(s) URLs and local /api/media/ references (what our
  // CSV export writes for uploaded images — keeps export→import lossless).
  else if (images.some((u) => !/^(https?:\/\/|\/api\/media\/)/.test(u)))
    errors.push('images: all must be http(s) URLs or /api/media/ references')

  const condition = (row.condition ?? '').trim().toUpperCase()
  if (condition && !CONDITIONS.includes(condition)) {
    errors.push(`condition: must be one of ${CONDITIONS.join(', ')}`)
  }
  const status = (row.status ?? '').trim().toUpperCase()
  if (status && !['ACTIVE', 'DRAFT', 'ARCHIVED'].includes(status)) {
    errors.push('status: must be ACTIVE, DRAFT or ARCHIVED')
  }

  // numeric fields
  const numericChecks: [string, string | undefined, number | undefined, number | undefined][] = [
    ['compareAtPrice', row.compareAtPrice, 0, undefined],
    ['stock', row.stock, 0, 1000000],
    ['handlingDays', row.handlingDays, 0, 60],
    ['weightKg', row.weightKg, 0, 100000],
    ['lengthCm', row.lengthCm, 0, 100000],
    ['widthCm', row.widthCm, 0, 100000],
    ['heightCm', row.heightCm, 0, 100000],
    ['minOrderQty', row.minOrderQty, 1, 1000],
    ['maxPerOrder', row.maxPerOrder, 1, 1000],
    ['warrantyMonths', row.warrantyMonths, 0, 120],
  ]
  const nums: Record<string, number | null | undefined> = {}
  for (const [name, raw, min, max] of numericChecks) {
    if (raw === undefined || raw.trim() === '') continue
    const n = toNum(raw)
    if (n == null) errors.push(`${name}: not a number`)
    else if (n < (min ?? 0)) errors.push(`${name}: must be ≥ ${min ?? 0}`)
    else if (max !== undefined && n > max) errors.push(`${name}: must be ≤ ${max}`)
    else nums[name] = n
  }

  // boolean fields
  const freeShipping = toBool(row.freeShipping ?? '')

  // attr.* columns
  const attributes: Record<string, AttributeValue> = {}
  const attrDefs = attributesForCategory(knownSlugs.has(categorySlug) ? categorySlug : '__none__')
  const allowedKeys = new Set(attrDefs.map((a) => a.key))
  for (const [k, v] of Object.entries(row)) {
    if (!k.startsWith('attr.')) continue
    const key = k.slice(5)
    if (!v || !v.trim()) continue
    if (!allowedKeys.has(key)) {
      errors.push(`${k}: not valid for category "${categorySlug}"`)
      continue
    }
    const def = attrDefs.find((a) => a.key === key)!
    if (def.type === 'multiselect') attributes[key] = splitList(v)
    else if (def.type === 'boolean') {
      const b = toBool(v)
      if (b === undefined) errors.push(`${k}: must be true/false`)
      else attributes[key] = b
    } else if (def.type === 'number') {
      const n = toNum(v)
      if (n == null) errors.push(`${k}: not a number`)
      else attributes[key] = n
    } else {
      attributes[key] = v.trim()
    }
  }

  // validate attribute values against category definitions (selects etc.)
  if (knownSlugs.has(categorySlug)) {
    const check = validateAttributes(categorySlug, attributes)
    if (!check.ok) errors.push(...check.errors.map((e) => `attr — ${e}`))
  }

  if (errors.length > 0 || price === null || price === undefined) {
    return { ok: false, errors }
  }

  return {
    ok: true,
    data: {
      title,
      description,
      price,
      compareAtPrice: nums.compareAtPrice ?? null,
      categorySlug,
      stock: (nums.stock ?? 10) as number,
      images,
      brand: (row.brand ?? '').trim() || null,
      sku: (row.sku ?? '').trim() || null,
      barcode: (row.barcode ?? '').trim() || null,
      condition: condition || 'NEW',
      tags: splitList(row.tags ?? ''),
      videoUrl: (row.videoUrl ?? '').trim() || null,
      freeShipping: freeShipping ?? false,
      shippingNote: (row.shippingNote ?? '').trim() || null,
      handlingDays: (nums.handlingDays ?? 2) as number,
      weightKg: nums.weightKg ?? null,
      lengthCm: nums.lengthCm ?? null,
      widthCm: nums.widthCm ?? null,
      heightCm: nums.heightCm ?? null,
      minOrderQty: (nums.minOrderQty ?? 1) as number,
      maxPerOrder: nums.maxPerOrder ?? null,
      warrantyMonths: nums.warrantyMonths ?? null,
      metaTitle: (row.metaTitle ?? '').trim() || null,
      metaDescription: (row.metaDescription ?? '').trim() || null,
      status: status || 'ACTIVE',
      attributes,
    },
  }
}

/** Format a Boolean for a CSV cell. */
export function csvBool(v: boolean | null | undefined): string {
  return v ? 'true' : 'false'
}
