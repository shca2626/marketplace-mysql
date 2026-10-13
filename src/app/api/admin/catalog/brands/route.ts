import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { listBrands, createBrand, CatalogError } from '@/server/modules/catalog/admin-catalog'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'

// GET /api/admin/catalog/brands?q= — the brand directory with product counts.
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin('catalog.products.moderate')
  if (error) return error
  try {
    const q = req.nextUrl.searchParams.get('q')?.trim() || ''
    const brands = await listBrands(q)
    return NextResponse.json({
      brands: brands.map((b) => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
        logoUrl: b.logoUrl,
        description: b.description,
        websiteUrl: b.websiteUrl,
        originCountry: b.originCountry,
        isVerified: b.isVerified,
        productCount: b._count.products,
        createdAt: b.createdAt.toISOString(),
      })),
    })
  } catch (err) {
    console.error('admin brands GET error', err)
    return NextResponse.json({ error: 'Failed to load brands' }, { status: 500 })
  }
}

const brandSchema = z.object({
  name: z.string().trim().min(2).max(80),
  logoUrl: z.string().trim().max(2048).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  websiteUrl: z.string().trim().max(512).nullable().optional(),
  originCountry: z.string().trim().max(60).nullable().optional(),
  isVerified: z.boolean().optional(),
})

// POST /api/admin/catalog/brands — create a brand.
export async function POST(req: NextRequest) {
  const { user, error } = await requireAdmin('catalog.products.moderate')
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'admin:brands', { limit: 60, windowMs: 60_000 }, user.id)
  if (rl) return rl

  try {
    const parsed = brandSchema.safeParse(await req.json())
    if (!parsed.success)
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid brand' }, { status: 400 })
    const brand = await createBrand(parsed.data)
    return NextResponse.json({ brand }, { status: 201 })
  } catch (err) {
    if (err instanceof CatalogError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('admin brands POST error', err)
    return NextResponse.json({ error: 'Failed to create brand' }, { status: 500 })
  }
}
