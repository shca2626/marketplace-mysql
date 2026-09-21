import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { CACHE_TAGS, invalidateTags } from '@/lib/cache'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { productCreateSchema, validateAttributes } from '@/lib/catalog/validation'
import { slugifyTitle } from '@/lib/catalog/definitions'
import type { ImportRow } from '@/lib/product-io'

/**
 * POST /api/products/bulk — bulk operations for sellers.
 *
 * actions:
 *   import  { rows: ImportRow[] }              → create many (per-row validation + results)
 *   status  { ids: string[], status }           → set listing status
 *   price   { ids: string[], mode, value }      → adjust price (percent | fixed)
 *   delete  { ids: string[] }                   → delete (archive when order history exists)
 */
const bulkSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('import'),
    rows: z.array(z.record(z.string(), z.unknown())).min(1, 'No rows to import').max(200, 'Max 200 rows per import'),
  }),
  z.object({
    action: z.literal('status'),
    ids: z.array(z.string()).min(1).max(500),
    status: z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']),
  }),
  z.object({
    action: z.literal('price'),
    ids: z.array(z.string()).min(1).max(500),
    mode: z.enum(['percent', 'fixed']),
    value: z.number(),
  }),
  z.object({
    action: z.literal('delete'),
    ids: z.array(z.string()).min(1).max(500),
  }),
])

interface RowResult {
  index: number
  title: string
  ok: boolean
  error?: string
  productId?: string
}

async function createFromImportRow(
  sellerId: string,
  row: Record<string, unknown>
): Promise<{ ok: true; productId: string } | { ok: false; error: string }> {
  const importRow = row as unknown as ImportRow
  // category slug / name / id → category record
  const category = await db.category.findFirst({
    where: {
      OR: [
        { slug: importRow.categorySlug },
        { name: importRow.categorySlug },
        { id: importRow.categorySlug },
      ],
    },
  })
  if (!category) return { ok: false, error: `Unknown category "${importRow.categorySlug}"` }

  // normalize to the create schema shape
  const payload = {
    title: importRow.title,
    description: importRow.description,
    price: importRow.price,
    compareAtPrice: importRow.compareAtPrice ?? null,
    images: importRow.images,
    categoryId: category.id,
    stock: importRow.stock ?? 10,
    brand: importRow.brand ?? null,
    sku: importRow.sku ?? null,
    barcode: importRow.barcode ?? null,
    condition: importRow.condition ?? 'NEW',
    tags: importRow.tags ?? [],
    videoUrl: importRow.videoUrl ?? null,
    freeShipping: importRow.freeShipping ?? false,
    shippingNote: importRow.shippingNote ?? null,
    handlingDays: importRow.handlingDays ?? 2,
    weightKg: importRow.weightKg ?? null,
    lengthCm: importRow.lengthCm ?? null,
    widthCm: importRow.widthCm ?? null,
    heightCm: importRow.heightCm ?? null,
    minOrderQty: importRow.minOrderQty ?? 1,
    maxPerOrder: importRow.maxPerOrder ?? null,
    warrantyMonths: importRow.warrantyMonths ?? null,
    metaTitle: importRow.metaTitle ?? null,
    metaDescription: importRow.metaDescription ?? null,
    status: importRow.status ?? 'ACTIVE',
    attributes: importRow.attributes ?? {},
    variants: importRow.variants,
  }

  const parsed = productCreateSchema.safeParse(payload)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid row data' }
  }
  const attrCheck = validateAttributes(category.slug, parsed.data.attributes ?? {})
  if (!attrCheck.ok) return { ok: false, error: attrCheck.errors[0] }

  // slug uniqueness
  const base = slugifyTitle(parsed.data.title)
  let slug = base
  let i = 2
  for (;;) {
    const existing = await db.product.findFirst({ where: { slug }, select: { id: true } })
    if (!existing) break
    slug = `${base}-${i++}`
  }

  const product = await db.product.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      price: parsed.data.price,
      compareAtPrice: parsed.data.compareAtPrice ?? null,
      images: JSON.stringify(parsed.data.images),
      videoUrl: parsed.data.videoUrl ?? null,
      categoryId: category.id,
      slug,
      brand: parsed.data.brand || null,
      sku: parsed.data.sku || null,
      barcode: parsed.data.barcode || null,
      condition: parsed.data.condition ?? 'NEW',
      tags: JSON.stringify(parsed.data.tags ?? []),
      attributes: JSON.stringify(attrCheck.value),
      stock: parsed.data.stock,
      freeShipping: parsed.data.freeShipping ?? false,
      shippingNote: parsed.data.shippingNote || null,
      handlingDays: parsed.data.handlingDays ?? 2,
      weightKg: parsed.data.weightKg ?? null,
      lengthCm: parsed.data.lengthCm ?? null,
      widthCm: parsed.data.widthCm ?? null,
      heightCm: parsed.data.heightCm ?? null,
      minOrderQty: parsed.data.minOrderQty ?? 1,
      maxPerOrder: parsed.data.maxPerOrder ?? null,
      warrantyMonths: parsed.data.warrantyMonths ?? null,
      metaTitle: parsed.data.metaTitle || null,
      metaDescription: parsed.data.metaDescription || null,
      status: parsed.data.status ?? 'ACTIVE',
      sellerId,
      variants: parsed.data.variants?.length
        ? {
            create: parsed.data.variants.map((v) => ({
              name: v.name,
              options: JSON.stringify(v.options ?? {}),
              priceDelta: v.priceDelta ?? 0,
              sku: v.sku || null,
              stock: v.stock ?? 0,
              image: v.image || null,
            })),
          }
        : undefined,
    },
    select: { id: true },
  })
  return { ok: true, productId: product.id }
}

export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Please sign in first' }, { status: 401 })
    if (user.role !== 'SELLER' && user.role !== 'ADMIN')
      return NextResponse.json({ error: 'Only sellers can manage products in bulk' }, { status: 403 })

    const limited = enforceRateLimit(req, 'productWrite', RATE_LIMITS.productWrite, user.id)
    if (limited) return limited

    const body = await req.json()
    const parsed = bulkSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
        { status: 400 }
      )
    }
    const input = parsed.data

    // ── import ──
    if (input.action === 'import') {
      const results: RowResult[] = []
      for (let i = 0; i < input.rows.length; i++) {
        const row = input.rows[i]
        const title = typeof row.title === 'string' ? row.title : `Row ${i + 2}`
        try {
          const r = await createFromImportRow(user.id, row)
          if (r.ok) results.push({ index: i, title, ok: true, productId: r.productId })
          else results.push({ index: i, title, ok: false, error: r.error })
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error'
          results.push({ index: i, title, ok: false, error: msg })
        }
      }
      const created = results.filter((r) => r.ok).length
      invalidateTags(CACHE_TAGS.products)
      return NextResponse.json({
        results,
        summary: { total: results.length, created, failed: results.length - created },
      })
    }

    // ── shared: fetch owned products only ──
    const products = await db.product.findMany({
      where: { id: { in: input.ids }, sellerId: user.id },
      select: { id: true, price: true, status: true, slug: true },
    })
    const owned = new Map(products.map((p) => [p.id, p]))
    const ownedIds = input.ids.filter((id) => owned.has(id))
    if (ownedIds.length === 0)
      return NextResponse.json({ error: 'No matching products you own' }, { status: 400 })

    if (input.action === 'status') {
      await db.product.updateMany({
        where: { id: { in: ownedIds } },
        data: {
          status: input.status,
          ...(input.status !== 'ACTIVE' ? { featured: false } : {}),
        },
      })
      invalidateTags(CACHE_TAGS.products)
      return NextResponse.json({ updated: ownedIds.length })
    }

    if (input.action === 'price') {
      const { mode, value } = input
      if (mode === 'percent' && (value < -90 || value > 500))
        return NextResponse.json({ error: 'Percent adjustment must be between -90 and 500' }, { status: 400 })
      if (mode === 'fixed' && Math.abs(value) > 100000)
        return NextResponse.json({ error: 'Fixed adjustment too large' }, { status: 400 })

      const updated: string[] = []
      for (const p of products) {
        const next =
          mode === 'percent'
            ? Math.max(0.01, Math.round(p.price * (1 + value / 100) * 100) / 100)
            : Math.max(0.01, Math.round((p.price + value) * 100) / 100)
        if (next !== p.price) {
          await db.product.update({ where: { id: p.id }, data: { price: next } })
          updated.push(p.id)
        }
      }
      invalidateTags(CACHE_TAGS.products)
      return NextResponse.json({ updated: updated.length })
    }

    if (input.action === 'delete') {
      // archive when order history exists, hard delete otherwise
      let archived = 0
      let deleted = 0
      for (const id of ownedIds) {
        const orderCount = await db.orderItem.count({ where: { productId: id } })
        if (orderCount > 0) {
          await db.product.update({ where: { id }, data: { status: 'ARCHIVED', featured: false } })
          archived++
        } else {
          await db.product.delete({ where: { id } })
          deleted++
        }
      }
      invalidateTags(CACHE_TAGS.products)
      return NextResponse.json({ deleted, archived })
    }
  } catch (err) {
    console.error('products bulk error', err)
    return NextResponse.json({ error: 'Bulk operation failed' }, { status: 500 })
  }
}

// GET /api/products/bulk — not used; exists for route clarity only
export async function GET() {
  return NextResponse.json({ error: 'Use POST' }, { status: 405 })
}
