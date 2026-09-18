import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { favoriteIdsFor, productInclude, serializeProduct } from '@/lib/serialize'

// GET /api/products — list with filters/search/sort/pagination
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const q = sp.get('q')?.trim().toLowerCase() || ''
    const categorySlug = sp.get('category') || ''
    const min = parseFloat(sp.get('min') || '')
    const max = parseFloat(sp.get('max') || '')
    const sort = sp.get('sort') || 'popular'
    const featured = sp.get('featured') === '1'
    const sellerId = sp.get('sellerId') || ''
    const mine = sp.get('mine') === '1'
    const idsParam = sp.get('ids') || ''
    const ids = idsParam
      ? idsParam.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20)
      : []
    const page = Math.max(1, parseInt(sp.get('page') || '1') || 1)
    const limit = Math.min(48, Math.max(1, parseInt(sp.get('limit') || '24') || 24))

    let sessionUserId: string | null = null
    if (mine) {
      const user = await getSessionUser()
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      sessionUserId = user.id
    }

    const where: Record<string, unknown> = {}
    if (mine) {
      where.sellerId = sessionUserId
    } else {
      where.status = 'ACTIVE'
    }
    if (featured) where.featured = true
    if (sellerId) where.sellerId = sellerId
    if (categorySlug) where.category = { slug: categorySlug }
    if (ids.length > 0) where.id = { in: ids }
    if (!Number.isNaN(min) && min > 0) where.price = { ...(where.price as object), gte: min }
    if (!Number.isNaN(max) && max > 0) where.price = { ...(where.price as object), lte: max }

    let products = await db.product.findMany({
      where,
      include: productInclude,
    })

    // Case-insensitive search across title/description/category/store (SQLite-safe, in-memory)
    if (q) {
      products = products.filter((p) => {
        const hay = `${p.title} ${p.description} ${p.category.name} ${p.seller.storeName ?? ''} ${p.seller.name}`.toLowerCase()
        return q.split(/\s+/).every((term) => hay.includes(term))
      })
    }

    const sorters: Record<string, (a: (typeof products)[number], b: (typeof products)[number]) => number> = {
      'price-asc': (a, b) => a.price - b.price,
      'price-desc': (a, b) => b.price - a.price,
      rating: (a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount,
      newest: (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      popular: (a, b) => b.soldCount - a.soldCount || b.rating - a.rating,
    }
    if (ids.length > 0) {
      // Preserve the caller's id order (used by "recently viewed")
      const order = new Map(ids.map((id, i) => [id, i]))
      products.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    } else {
      products.sort(sorters[sort] ?? sorters.popular)
    }

    const total = products.length
    const pages = Math.max(1, Math.ceil(total / limit))
    const items = products.slice((page - 1) * limit, page * limit)

    const session = mine ? { id: sessionUserId! } : await getSessionUser()
    const favIds = await favoriteIdsFor(session?.id, items.map((p) => p.id))

    return NextResponse.json({
      items: items.map((p) => serializeProduct(p, favIds.has(p.id))),
      total,
      page,
      pages,
    })
  } catch (err) {
    console.error('products GET error', err)
    return NextResponse.json({ error: 'Failed to load products' }, { status: 500 })
  }
}

const productSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(120),
  description: z.string().min(10, 'Description must be at least 10 characters').max(4000),
  price: z.number().positive('Price must be positive'),
  compareAtPrice: z.number().positive().nullable().optional(),
  images: z.array(z.string().url()).min(1, 'At least one image is required').max(6),
  categoryId: z.string().min(1, 'Category is required'),
  stock: z.number().int().min(0).max(100000),
})

// POST /api/products — create (seller only)
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Please sign in first' }, { status: 401 })
    if (user.role !== 'SELLER')
      return NextResponse.json({ error: 'Only sellers can create products' }, { status: 403 })

    const body = await req.json()
    const parsed = productSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const category = await db.category.findUnique({ where: { id: parsed.data.categoryId } })
    if (!category) return NextResponse.json({ error: 'Category not found' }, { status: 400 })

    const product = await db.product.create({
      data: {
        ...parsed.data,
        compareAtPrice: parsed.data.compareAtPrice ?? null,
        images: JSON.stringify(parsed.data.images),
        sellerId: user.id,
      },
      include: productInclude,
    })

    return NextResponse.json({ product: serializeProduct(product) }, { status: 201 })
  } catch (err) {
    console.error('products POST error', err)
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 })
  }
}
