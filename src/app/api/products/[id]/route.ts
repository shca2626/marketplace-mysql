import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { favoriteIdsFor, productInclude, serializeProduct, serializeReview } from '@/lib/serialize'

const productUpdateSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().min(10).max(4000),
  price: z.number().positive(),
  compareAtPrice: z.number().positive().nullable().optional(),
  images: z.array(z.string().url()).min(1).max(6),
  categoryId: z.string().min(1),
  stock: z.number().int().min(0).max(100000),
  status: z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']).optional(),
  featured: z.boolean().optional(),
})

// GET /api/products/[id] — product detail with reviews
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const product = await db.product.findUnique({
      where: { id },
      include: {
        ...productInclude,
        reviews: {
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { id: true, name: true } } },
        },
      },
    })
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

    const seller = await db.user.findUnique({
      where: { id: product.sellerId },
      select: {
        id: true,
        name: true,
        storeName: true,
        storeBio: true,
        createdAt: true,
        products: { where: { status: 'ACTIVE' }, select: { id: true } },
      },
    })

    const session = await getSessionUser()
    const favIds = await favoriteIdsFor(session?.id, [product.id])

    const related = await db.product.findMany({
      where: { categoryId: product.categoryId, status: 'ACTIVE', id: { not: product.id } },
      include: productInclude,
      orderBy: { soldCount: 'desc' },
      take: 4,
    })
    const relatedFavIds = await favoriteIdsFor(session?.id, related.map((r) => r.id))

    return NextResponse.json({
      product: serializeProduct(product, favIds.has(product.id)),
      reviews: product.reviews.map((r) => serializeReview(r)),
      seller: seller
        ? {
            id: seller.id,
            name: seller.name,
            storeName: seller.storeName,
            storeBio: seller.storeBio,
            memberSince: seller.createdAt.toISOString(),
            activeListings: seller.products.length,
          }
        : null,
      related: related.map((r) => serializeProduct(r, relatedFavIds.has(r.id))),
    })
  } catch (err) {
    console.error('product GET error', err)
    return NextResponse.json({ error: 'Failed to load product' }, { status: 500 })
  }
}

// PUT /api/products/[id] — update (owner only)
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Please sign in first' }, { status: 401 })

    const product = await db.product.findUnique({ where: { id } })
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    if (product.sellerId !== user.id)
      return NextResponse.json({ error: 'You can only edit your own products' }, { status: 403 })

    const body = await req.json()
    const parsed = productUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const category = await db.category.findUnique({ where: { id: parsed.data.categoryId } })
    if (!category) return NextResponse.json({ error: 'Category not found' }, { status: 400 })

    const updated = await db.product.update({
      where: { id },
      data: {
        ...parsed.data,
        compareAtPrice: parsed.data.compareAtPrice ?? null,
        images: JSON.stringify(parsed.data.images),
        status: parsed.data.status ?? product.status,
        featured: parsed.data.featured ?? product.featured,
      },
      include: productInclude,
    })

    return NextResponse.json({ product: serializeProduct(updated) })
  } catch (err) {
    console.error('product PUT error', err)
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 })
  }
}

// DELETE /api/products/[id] — delete or archive (owner only)
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Please sign in first' }, { status: 401 })

    const product = await db.product.findUnique({ where: { id } })
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    if (product.sellerId !== user.id)
      return NextResponse.json({ error: 'You can only delete your own products' }, { status: 403 })

    const orderItemCount = await db.orderItem.count({ where: { productId: id } })
    if (orderItemCount > 0) {
      // Products tied to orders are archived to preserve order history
      await db.product.update({ where: { id }, data: { status: 'ARCHIVED', featured: false } })
      return NextResponse.json({ ok: true, archived: true })
    }

    await db.product.delete({ where: { id } })
    return NextResponse.json({ ok: true, archived: false })
  } catch (err) {
    console.error('product DELETE error', err)
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 })
  }
}
