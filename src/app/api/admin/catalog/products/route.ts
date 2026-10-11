import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAdmin } from '@/server/guards'
import { createCuratedProduct, CatalogError } from '@/server/modules/catalog/service'
import { productInclude, serializeProduct } from '@/lib/serialize'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'

// GET /api/admin/catalog/products?isCurated=1 — curated listings browser
// (lightweight; full catalog browsing stays on /api/products?scope=all).
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin('catalog.products.moderate')
  if (error) return error
  try {
    const curatedOnly = req.nextUrl.searchParams.get('isCurated') !== '0'
    const rows = await db.product.findMany({
      where: curatedOnly ? { isCurated: true, status: { not: 'ARCHIVED' } } : { status: { not: 'ARCHIVED' } },
      include: productInclude,
      orderBy: { createdAt: 'desc' },
      take: 60,
    })
    return NextResponse.json({ products: rows.map((p) => serializeProduct(p)) })
  } catch (err) {
    console.error('admin catalog products GET error', err)
    return NextResponse.json({ error: 'Failed to load curated products' }, { status: 500 })
  }
}

const curatedSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(4000),
  price: z.number().positive('Price must be positive'),
  compareAtPrice: z.number().positive().nullable().optional(),
  images: z.array(z.string().max(2048)).max(6).default([]),
  categoryId: z.string().min(1),
  stock: z.number().int().min(0).max(100_000).optional(),
  status: z.enum(['ACTIVE', 'DRAFT']).optional(),
  brandId: z.string().nullable().optional(),
  brandName: z.string().trim().max(80).nullable().optional(),
  gtin: z.string().trim().max(20).nullable().optional(),
  mpn: z.string().trim().max(64).nullable().optional(),
  moq: z.number().int().min(1).max(1_000_000).nullable().optional(),
  sku: z.string().trim().max(64).nullable().optional(),
  popularRank: z.number().int().min(1).max(999).nullable().optional(),
})

// POST /api/admin/catalog/products — create a CURATED platform listing
// (owned by the Vendora Catalog system account; sellers attach offers to it).
export async function POST(req: NextRequest) {
  const { user, error } = await requireAdmin('catalog.products.moderate')
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'admin:catalog-products', { limit: 30, windowMs: 60_000 }, user.id)
  if (rl) return rl

  try {
    const parsed = curatedSchema.safeParse(await req.json())
    if (!parsed.success)
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid product' }, { status: 400 })
    const created = await createCuratedProduct(user.id, parsed.data)
    const row = await db.product.findUnique({ where: { id: created.id }, include: productInclude })
    return NextResponse.json({ product: serializeProduct(row!) }, { status: 201 })
  } catch (err) {
    if (err instanceof CatalogError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('admin catalog products POST error', err)
    return NextResponse.json({ error: 'Failed to create curated product' }, { status: 500 })
  }
}
