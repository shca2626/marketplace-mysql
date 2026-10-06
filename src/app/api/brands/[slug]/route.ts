import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { favoriteIdsFor, productInclude, serializeProduct } from '@/lib/serialize'

// GET /api/brands/[slug] — Phase 12 brand detail + its live products.
//
// The brand hero (name, logo, description, provenance, verification) plus a
// standard product listing. Kept deliberately LIGHTER than the full catalog:
// search-within-brand (q), sort, price bounds and pagination — no spec facets
// or category hops (those live on the catalog surface).
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params
    const sp = req.nextUrl.searchParams
    const q = sp.get('q')?.trim() || ''
    const min = parseFloat(sp.get('min') || '')
    const max = parseFloat(sp.get('max') || '')
    const sort = sp.get('sort') || 'popular'
    const page = Math.max(1, parseInt(sp.get('page') || '1') || 1)
    const limit = Math.min(48, Math.max(1, parseInt(sp.get('limit') || '24') || 24))

    const brand = await db.brand.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        description: true,
        websiteUrl: true,
        originCountry: true,
        isVerified: true,
        createdAt: true,
      },
    })
    if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })

    const where: Record<string, unknown> = {
      status: 'ACTIVE',
      OR: [{ sellerId: null }, { seller: { status: 'ACTIVE' } }],
      brandId: brand.id,
    }
    if (!Number.isNaN(min) && min > 0) where.price = { gte: min }
    if (!Number.isNaN(max) && max > 0) where.price = { ...(where.price as object), lte: max }
    if (q) {
      const terms = q.split(/\s+/).map((t) => t.trim()).filter(Boolean).slice(0, 8)
      where.AND = terms.map((t) => ({
        OR: [
          { title: { contains: t } },
          { description: { contains: t } },
          { category: { name: { contains: t } } },
          { seller: { storeName: { contains: t } } },
        ],
      }))
    }

    const sorters: Record<string, Prisma.ProductOrderByWithRelationInput[]> = {
      'price-asc': [{ price: 'asc' }],
      'price-desc': [{ price: 'desc' }],
      rating: [{ rating: 'desc' }, { reviewCount: 'desc' }],
      newest: [{ createdAt: 'desc' }],
      popular: [{ soldCount: 'desc' }, { rating: 'desc' }],
    }

    const [total, items, user] = await Promise.all([
      db.product.count({ where }),
      db.product.findMany({
        where,
        include: productInclude,
        orderBy: sorters[sort] ?? sorters.popular,
        skip: (page - 1) * limit,
        take: limit,
      }),
      getSessionUser(),
    ])

    const favIds = await favoriteIdsFor(user?.id, items.map((p) => p.id))
    const pages = Math.max(1, Math.ceil(total / limit))

    return NextResponse.json({
      brand: {
        ...brand,
        createdAt: brand.createdAt.toISOString(),
        productCount: total,
      },
      items: items.map((p) => serializeProduct(p, favIds.has(p.id))),
      total,
      page,
      pages,
    })
  } catch (err) {
    console.error('brand detail GET error', err)
    return NextResponse.json({ error: 'Failed to load brand' }, { status: 500 })
  }
}
