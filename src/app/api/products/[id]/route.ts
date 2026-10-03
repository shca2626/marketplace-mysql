import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { favoriteIdsFor, productInclude, serializeProduct, serializeReview } from '@/lib/serialize'
import { ensureUniqueSlug, productFormSchema } from '@/server/modules/products/service'
import { assertSellerCanPublish } from '@/server/modules/kyc/service'
import { recordAudit } from '@/server/modules/audit/service'
import { userHasPlatformPermission } from '@/server/modules/rbac/service'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'

// GET /api/products/[id] — product detail with reviews. Products of
// suspended vendors are hidden from the public (404); the owner (via seller
// console) and platform admins can still open them.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const [product, viewer] = await Promise.all([
      db.product.findUnique({
        where: { id },
        include: {
          ...productInclude,
          // Phase 3 KYP — certifications ride along on the detail payload
          // (badge + list); list queries stay untouched.
          certifications: { where: { isActive: true }, orderBy: { createdAt: 'desc' } },
          seller: { select: { id: true, name: true, storeName: true, storeBio: true, status: true, createdAt: true, products: { where: { status: 'ACTIVE', seller: { status: 'ACTIVE' } }, select: { id: true } } } },
          reviews: {
            orderBy: { createdAt: 'desc' },
            include: { user: { select: { id: true, name: true } } },
          },
        },
      }),
      getSessionUser(),
    ])
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    const isOwner = viewer?.id === product.sellerId
    const isAdmin = viewer?.role === 'ADMIN'
    if (product.seller.status === 'SUSPENDED' && !isOwner && !isAdmin) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    // seller info already rides along on the product include
    const seller = product.seller
    const session = viewer
    const favIds = await favoriteIdsFor(session?.id, [product.id])

    const related = await db.product.findMany({
      where: { categoryId: product.categoryId, status: 'ACTIVE', seller: { status: 'ACTIVE' }, id: { not: product.id } },
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

// PATCH /api/products/[id] — ADMIN quick actions on any listing
// (takedown/restore, feature toggle). This is the platform-owner moderation
// surface; regular sellers keep using PUT for full edits of their own rows.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const csrf = assertSameOrigin(req)
    if (csrf) return csrf

    const { id } = await ctx.params
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Please sign in first' }, { status: 401 })
    // RBAC Phase 2: legacy admins bypass; staff need the catalog moderation
    // permission (e.g. the Catalog Moderator role).
    if (user.role !== 'ADMIN' && !(await userHasPlatformPermission(user.id, 'catalog.products.moderate')))
      return NextResponse.json(
        { error: 'Access denied — moderating products requires the "catalog.products.moderate" permission.' },
        { status: 403 }
      )

    const rl = enforceRateLimit(req, 'productWrite', RATE_LIMITS.productWrite, user.id)
    if (rl) return rl

    const parsed = z
      .object({
        status: z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']).optional(),
        featured: z.boolean().optional(),
      })
      .safeParse(await req.json())
    if (!parsed.success || (!parsed.data.status && parsed.data.featured === undefined)) {
      return NextResponse.json({ error: 'Provide status and/or featured' }, { status: 400 })
    }

    const product = await db.product.findUnique({ where: { id }, select: { id: true, title: true, status: true, featured: true } })
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

    const updated = await db.product.update({
      where: { id },
      data: {
        ...(parsed.data.status ? { status: parsed.data.status, featured: parsed.data.status !== 'ACTIVE' ? false : undefined } : {}),
        ...(parsed.data.featured !== undefined ? { featured: parsed.data.featured } : {}),
      },
    })

    await recordAudit({
      actorId: user.id,
      actorType: 'ADMIN',
      action: 'PRODUCT_MODERATED',
      entityType: 'Product',
      entityId: id,
      summary: `Admin moderated "${product.title}": ${JSON.stringify(parsed.data)}`,
      metadata: { before: { status: product.status, featured: product.featured }, after: parsed.data },
    })

    return NextResponse.json({ product: { id: updated.id, status: updated.status, featured: updated.featured } })
  } catch (err) {
    console.error('product PATCH error', err)
    return NextResponse.json({ error: 'Failed to moderate product' }, { status: 500 })
  }
}

// PUT /api/products/[id] — update (owner, or platform admin override).
// Variants are replaced atomically.
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const csrf = assertSameOrigin(req)
    if (csrf) return csrf

    const { id } = await ctx.params
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Please sign in first' }, { status: 401 })

    const rl = enforceRateLimit(req, 'productWrite', RATE_LIMITS.productWrite, user.id)
    if (rl) return rl

    const product = await db.product.findUnique({ where: { id } })
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    const isOwner = product.sellerId === user.id
    const isAdmin = user.role === 'ADMIN'
    if (!isOwner && !isAdmin)
      return NextResponse.json({ error: 'You can only edit your own products' }, { status: 403 })
    // Admins editing someone else's listing is a moderation event — audit it.
    if (isAdmin && !isOwner) {
      await recordAudit({
        actorId: user.id,
        actorType: 'ADMIN',
        action: 'PRODUCT_ADMIN_EDITED',
        entityType: 'Product',
        entityId: id,
        summary: `Admin edited vendor product "${product.title}"`,
      })
    }

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

    // KYC enforcement gate (Phase 3): moving a listing to ACTIVE (publishing,
    // including a draft's first publish) requires the seller to be identity
    // verified (L2). DRAFT saves stay open; admins are exempt.
    if (status === 'ACTIVE') {
      try {
        await assertSellerCanPublish(user)
      } catch (err) {
        const gateStatus = (err as { status?: number }).status
        if (gateStatus) return NextResponse.json({ error: (err as Error).message }, { status: gateStatus })
        throw err
      }
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
          moq: d.moq ?? null,
          priceTiers: d.priceTiers?.length ? JSON.stringify(d.priceTiers) : null,
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

// DELETE /api/products/[id] — delete or archive (owner, or platform admin
// override — admin takedown archives rows with order history, deletes the rest)
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const csrf = assertSameOrigin(req)
    if (csrf) return csrf

    const { id } = await ctx.params
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Please sign in first' }, { status: 401 })

    const rl = enforceRateLimit(req, 'productWrite', RATE_LIMITS.productWrite, user.id)
    if (rl) return rl

    const product = await db.product.findUnique({ where: { id } })
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    const isOwner = product.sellerId === user.id
    const isAdmin = user.role === 'ADMIN'
    if (!isOwner && !isAdmin)
      return NextResponse.json({ error: 'You can only delete your own products' }, { status: 403 })

    const orderItemCount = await db.orderItem.count({ where: { productId: id } })
    if (orderItemCount > 0) {
      // Products tied to orders are archived to preserve order history
      await db.product.update({ where: { id }, data: { status: 'ARCHIVED', featured: false } })
      if (isAdmin && !isOwner) {
        await recordAudit({
          actorId: user.id,
          actorType: 'ADMIN',
          action: 'PRODUCT_TAKEDOWN',
          entityType: 'Product',
          entityId: id,
          summary: `Admin took down "${product.title}" (archived — ${orderItemCount} order items)`,
        })
      }
      return NextResponse.json({ ok: true, archived: true })
    }

    await db.product.delete({ where: { id } })
    if (isAdmin && !isOwner) {
      await recordAudit({
        actorId: user.id,
        actorType: 'ADMIN',
        action: 'PRODUCT_TAKEDOWN',
        entityType: 'Product',
        entityId: id,
        summary: `Admin deleted vendor product "${product.title}"`,
      })
    }
    return NextResponse.json({ ok: true, archived: false })
  } catch (err) {
    console.error('product DELETE error', err)
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 })
  }
}
