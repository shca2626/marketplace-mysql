import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { CACHE_TAGS, invalidateTags } from '@/lib/cache'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { createProduct, productFormSchema } from '@/server/modules/products/service'
import { userHasAnyPlatformPermission } from '@/server/modules/rbac/service'
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

/**
 * Map a raw import row onto the shared product form schema, resolve the
 * category, then create through the SAME service the single-create route
 * uses (createProduct). This keeps bulk and manual creates schema-identical
 * — the old inline create had drifted from the live schema and crashed.
 */
async function createFromImportRow(
  sellerId: string,
  row: Record<string, unknown>
): Promise<{ ok: true; productId: string } | { ok: false; error: string }> {
  const r = row as unknown as ImportRow

  // category slug / name / id → category record
  const category = await db.category.findFirst({
    where: {
      OR: [{ slug: r.categorySlug }, { name: r.categorySlug }, { id: r.categorySlug }],
    },
  })
  if (!category) return { ok: false, error: `Unknown category "${r.categorySlug}"` }

  const parsed = productFormSchema.safeParse({
    title: r.title,
    description: r.description,
    price: r.price,
    compareAtPrice: r.compareAtPrice ?? null,
    images: Array.isArray(r.images) ? r.images : [],
    categoryId: category.id,
    stock: r.stock ?? 10,
    status: r.status === 'DRAFT' ? 'DRAFT' : 'ACTIVE',
    sku: r.sku ?? null,
    barcode: r.barcode ?? null,
    videoUrl: r.videoUrl ?? null,
    freeShipping: r.freeShipping ?? false,
    shippingFee: r.freeShipping ? null : null,
    weightGrams: r.weightKg != null ? Math.round(r.weightKg * 1000) : null,
    lengthCm: r.lengthCm ?? null,
    widthCm: r.widthCm ?? null,
    heightCm: r.heightCm ?? null,
    processingDays: r.handlingDays ?? null,
    metaTitle: r.metaTitle ?? null,
    metaDescription: r.metaDescription ?? null,
    moq: r.minOrderQty && r.minOrderQty > 1 ? r.minOrderQty : null,
    variants: Array.isArray(r.variants)
      ? r.variants.map((v) => ({
          name: v.name,
          options: (v.options ?? {}) as Record<string, string>,
          price: v.priceDelta != null ? Math.round((r.price + v.priceDelta) * 100) / 100 : null,
          compareAtPrice: null,
          stock: v.stock ?? 0,
          sku: v.sku || null,
          isActive: true,
        }))
      : undefined,
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid row data' }
  }

  // Publishing requires ≥1 image; imports without images land as drafts
  if (parsed.data.status === 'ACTIVE' && parsed.data.images.length === 0) {
    ;(parsed.data as { status?: string }).status = 'DRAFT'
  }

  try {
    const product = await createProduct(sellerId, parsed.data)
    return { ok: true, productId: product!.id }
  } catch (err) {
    const status = (err as { status?: number }).status
    if (status) return { ok: false, error: (err as Error).message }
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Please sign in first' }, { status: 401 })
    // Sellers manage their own rows; platform staff with catalog.products.update
    // may operate on the catalog (canonical check; legacy ADMIN bypass retired).
    const isPlatformBulk = await userHasAnyPlatformPermission(user.id, [
      'catalog.products.update',
      'catalog.products.create',
    ])
    if (user.role !== 'SELLER' && !isPlatformBulk)
      return NextResponse.json({ error: 'Only sellers can manage products in bulk' }, { status: 403 })
    if (user.role === 'SELLER' && user.status === 'SUSPENDED')
      return NextResponse.json({ error: 'Your vendor account is suspended' }, { status: 403 })

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

    // Exhaustiveness fallback — keeps the inferred return type exactly
    // Promise<NextResponse> (no undefined) for route-typed test callers.
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('products bulk error', err)
    return NextResponse.json({ error: 'Bulk operation failed' }, { status: 500 })
  }
}

// GET /api/products/bulk — not used; exists for route clarity only
export async function GET() {
  return NextResponse.json({ error: 'Use POST' }, { status: 405 })
}
