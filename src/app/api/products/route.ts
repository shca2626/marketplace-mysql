import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { favoriteIdsFor, productInclude, serializeProduct } from '@/lib/serialize'
import { ensureUniqueSlug, productFormSchema, slugify, createProduct, PUBLICATION_AGREEMENT_VERSION } from '@/server/modules/products/service'
import { assertSellerCanPublish } from '@/server/modules/kyc/service'
import { sellerNeedsPublishReview } from '@/server/modules/catalog/settings'
import { recordPublicationConsent } from '@/server/modules/catalog/review'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { userHasPlatformPermission } from '@/server/modules/rbac/service'

// GET /api/products — list with filters/search/sort/pagination.
// All filtering, search, sorting and pagination happen in SQL (TD-03 resolved);
// search terms are ANDed, each matching title/description/category/store/owner
// (MySQL ci collation makes LIKE case-insensitive). Public feeds only include
// ACTIVE products of ACTIVE sellers; sellers see their own rows via mine=1;
// admins can browse the full catalog via scope=all (+ optional status filter).
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const q = sp.get('q')?.trim() || ''
    const categorySlug = sp.get('category') || ''
    const min = parseFloat(sp.get('min') || '')
    const max = parseFloat(sp.get('max') || '')
    const sort = sp.get('sort') || 'popular'
    const featured = sp.get('featured') === '1'
    const sellerId = sp.get('sellerId') || ''
    const mine = sp.get('mine') === '1'
    const allScope = sp.get('scope') === 'all'
    const statusFilter = sp.get('status') || ''
    const idsParam = sp.get('ids') || ''
    const ids = idsParam
      ? idsParam.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20)
      : []
    const page = Math.max(1, parseInt(sp.get('page') || '1') || 1)
    const limit = Math.min(48, Math.max(1, parseInt(sp.get('limit') || '24') || 24))

    let sessionUserId: string | null = null
    let isAdmin = false
    const user = await getSessionUser()
    if (user) isAdmin = await userHasPlatformPermission(user.id, 'catalog.products.view')
    if (mine) {
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      sessionUserId = user.id
    }
    if (allScope && !isAdmin)
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

    const where: Record<string, unknown> = {}
    if (mine) {
      where.sellerId = sessionUserId
    } else if (allScope) {
      // Admin catalog browser — every row, any seller status, optional status filter
      if (statusFilter && ['ACTIVE', 'DRAFT', 'ARCHIVED', 'PENDING_REVIEW', 'REJECTED'].includes(statusFilter))
        where.status = statusFilter
    } else {
      // Public storefront: only live products from vendors in good standing
      // 9.1: curated catalog records (sellerId null) are public by themselves.
      where.status = 'ACTIVE'
      where.OR = [{ sellerId: null }, { seller: { status: 'ACTIVE' } }]
    }
    if (featured) where.featured = true
    if (sellerId) where.sellerId = sellerId // store pages — coexists with the seller-status filter
    if (categorySlug) where.category = { slug: categorySlug }
    if (ids.length > 0) where.id = { in: ids }
    if (!Number.isNaN(min) && min > 0) where.price = { ...(where.price as object), gte: min }
    if (!Number.isNaN(max) && max > 0) where.price = { ...(where.price as object), lte: max }

    // Multi-term AND search — every term must match somewhere (SQL, ci-collation)
    const terms = q ? q.split(/\s+/).map((t) => t.trim()).filter(Boolean).slice(0, 8) : []
    if (terms.length > 0) {
      where.AND = terms.map((t) => ({
        OR: [
          { title: { contains: t } },
          { description: { contains: t } },
          { category: { name: { contains: t } } },
          { seller: { storeName: { contains: t } } },
          { seller: { name: { contains: t } } },
          // 9.1: match curated records by their own title when seller-less
          ...(t ? [{ title: { contains: t } }] : []),
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

    // "recently viewed" ids: small bounded set — keep caller order, paginate in memory
    if (ids.length > 0) {
      const rows = await db.product.findMany({ where, include: productInclude })
      const order = new Map(ids.map((id, i) => [id, i]))
      rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
      const total = rows.length
      const pages = Math.max(1, Math.ceil(total / limit))
      const items = rows.slice((page - 1) * limit, page * limit)
      const favIds = await favoriteIdsFor(user?.id, items.map((p) => p.id))
      return NextResponse.json({
        items: items.map((p) => serializeProduct(p, favIds.has(p.id))),
        total,
        page,
        pages,
      })
    }

    const [total, items] = await Promise.all([
      db.product.count({ where }),
      db.product.findMany({
        where,
        include: productInclude,
        orderBy: sorters[sort] ?? sorters.popular,
        skip: (page - 1) * limit,
        take: limit,
      }),
    ])
    const pages = Math.max(1, Math.ceil(total / limit))

    const favIds = await favoriteIdsFor(user?.id, items.map((p) => p.id))

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

// ── Shared product-form schema lives in src/server/modules/products/service.ts ──

// POST /api/products — create (seller or platform admin). Sellers must be
// in good standing (not suspended) to publish.
export async function POST(req: NextRequest) {
  try {
    const csrf = assertSameOrigin(req)
    if (csrf) return csrf

    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Please sign in first' }, { status: 401 })
    if (user.role !== 'SELLER' && !(await userHasPlatformPermission(user.id, 'catalog.products.create')))
      return NextResponse.json({ error: 'Only sellers can create products' }, { status: 403 })
    if (user.role === 'SELLER' && user.status === 'SUSPENDED')
      return NextResponse.json(
        { error: 'Your vendor account is suspended — products cannot be published' },
        { status: 403 }
      )

    const rl = enforceRateLimit(req, 'productWrite', RATE_LIMITS.productWrite, user.id)
    if (rl) return rl

    const body = await req.json()
    const parsed = productFormSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const category = await db.category.findUnique({ where: { id: parsed.data.categoryId } })
    if (!category) return NextResponse.json({ error: 'Category not found' }, { status: 400 })

    // KYC enforcement gate (Phase 3): publishing requires identity verification
    // (L2). Drafts stay open to every seller — the gate only guards visibility.
    // Admins are exempt (platform moderation).
    const wantsPublish = (parsed.data.status ?? 'ACTIVE') === 'ACTIVE'
    const isAdmin = await userHasPlatformPermission(user.id, 'catalog.products.moderate')
    if (wantsPublish && !isAdmin) {
      try {
        await assertSellerCanPublish(user)
      } catch (err) {
        const status = (err as { status?: number }).status
        if (status) return NextResponse.json({ error: (err as Error).message }, { status })
        throw err
      }
    }

    // Phase 4 — Publication Agreement (owner Q6): first publish of a listing
    // requires explicit seller consent, stamped on the row + audit-logged.
    if (wantsPublish && !isAdmin && !parsed.data.publicationAgreed) {
      return NextResponse.json(
        { error: 'Accept the Vendora Publication Agreement to publish (required once per listing)' },
        { status: 400 }
      )
    }

    // Phase 4 — publish-review routing: new/unestablished sellers land in the
    // admin queue (status PENDING_REVIEW) instead of the public catalog.
    let effectiveStatus: 'ACTIVE' | 'DRAFT' | 'PENDING_REVIEW' = parsed.data.status ?? 'ACTIVE'
    let reviewQueued = false
    if (wantsPublish && !isAdmin) {
      if (await sellerNeedsPublishReview(user.id)) {
        effectiveStatus = 'PENDING_REVIEW'
        reviewQueued = true
      }
    }

    try {
      const product = await createProduct(user.id, { ...parsed.data, status: effectiveStatus })
      if (parsed.data.publicationAgreed && wantsPublish) {
        await recordPublicationConsent(user.id, product!.id, product!.title, PUBLICATION_AGREEMENT_VERSION)
      }
      return NextResponse.json(
        {
          product: serializeProduct(product!),
          ...(reviewQueued
            ? { reviewQueued: true, message: 'Your listing was submitted for platform review — it goes live once approved. You can track the status in My Products.' }
            : {}),
        },
        { status: 201 }
      )
    } catch (err) {
      const status = (err as { status?: number }).status
      if (status) return NextResponse.json({ error: (err as Error).message }, { status })
      throw err
    }
  } catch (err) {
    console.error('products POST error', err)
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 })
  }
}
