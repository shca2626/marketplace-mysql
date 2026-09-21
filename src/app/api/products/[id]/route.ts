import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { favoriteIdsFor, productInclude, serializeProduct, serializeReview } from '@/lib/serialize'
import { ensureUniqueSlug, productFormSchema } from '@/server/modules/products/service'

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

// PUT /api/products/[id] — update (owner only). Variants are replaced atomically.
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
    const parsed = productFormSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const d = parsed.data

    const category = await db.category.findUnique({ where: { id: d.categoryId } })
    if (!category) return NextResponse.json({ error: 'Category not found' }, { status: 400 })

    const status = d.status ?? 'ACTIVE'
    if (status === 'ACTIVE' && d.images.length === 0) {
      return NextResponse.json(
        { error: 'Add at least one image before publishing (or save as draft)' },
        { status: 400 }
      )
    }

    // Slug: explicit edit wins; otherwise keep existing; otherwise derive from title
    const slug = d.slug?.trim()
      ? await ensureUniqueSlug(d.slug, id)
      : (product.slug ?? (await ensureUniqueSlug(d.title, id)))

    // With variants, per-combo stock is authoritative → product.stock is their sum
    const variants = d.variants ?? []
    const stock = variants.length ? variants.reduce((s, v) => s + v.stock, 0) : d.stock

    const updated = await db.$transaction(async (tx) => {
      const row = await tx.product.update({
        where: { id },
        data: {
          title: d.title.trim(),
          description: d.description.trim(),
          price: d.price,
          compareAtPrice: d.compareAtPrice ?? null,
          images: JSON.stringify(d.images),
          categoryId: d.categoryId,
          stock,
          status,
          sku: d.sku?.trim() || null,
          barcode: d.barcode?.trim() || null,
          videoUrl: d.videoUrl?.trim() || null,
          highlights: d.highlights?.length ? JSON.stringify(d.highlights) : null,
          specs: d.specs?.length ? JSON.stringify(d.specs) : null,
          materials: d.materials?.trim() || null,
          care: d.care?.trim() || null,
          weightGrams: d.weightGrams ?? null,
          lengthCm: d.lengthCm ?? null,
          widthCm: d.widthCm ?? null,
          heightCm: d.heightCm ?? null,
          processingDays: d.processingDays ?? null,
          freeShipping: d.freeShipping ?? false,
          shippingFee: d.freeShipping ? null : (d.shippingFee ?? null),
          shippingPolicy: d.shippingPolicy?.trim() || null,
          slug,
          metaTitle: d.metaTitle?.trim() || null,
          metaDescription: d.metaDescription?.trim() || null,
        },
      })
      // Replace-all strategy keeps the grid in the form as the single source of truth
      await tx.productVariant.deleteMany({ where: { productId: id } })
      if (variants.length > 0) {
        await tx.productVariant.createMany({
          data: variants.map((v, i) => ({
            productId: id,
            name: v.name,
            options: JSON.stringify(v.options ?? {}),
            price: v.price ?? null,
            compareAtPrice: v.compareAtPrice ?? null,
            stock: v.stock,
            sku: v.sku?.trim() || null,
            position: i,
            isActive: v.isActive ?? true,
          })),
        })
      }
      return tx.product.findUnique({ where: { id: row.id }, include: productInclude })
    })

    return NextResponse.json({ product: serializeProduct(updated!) })
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
