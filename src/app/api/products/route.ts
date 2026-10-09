import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { favoriteIdsFor, productInclude, serializeProduct } from '@/lib/serialize'
import { ensureUniqueSlug, productFormSchema, slugify, createProduct } from '@/server/modules/products/service'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'

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
    if (user) isAdmin = user.role === 'ADMIN'
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
      if (statusFilter && ['ACTIVE', 'DRAFT', 'ARCHIVED'].includes(statusFilter)) where.status = statusFilter
    } else {
      // Public storefront: only platform-approved, live products from vendors in good standing
      where.status = 'ACTIVE'
      where.approvalState = 'APPROVED'
      where.seller = { status: 'ACTIVE' }
    }
    if (featured) where.featured = true
    if (sellerId) where.sellerId = sellerId // store pages — coexists with the seller-status filter
    if (categorySlug) where.category = { slug: categorySlug }
    if (ids.length > 0) where.id = { in: ids }
    // Shared-catalog org scope: company products (proposals + approved) — the
    // caller must be a member of that org (server-verified via session).
    const orgScope = sp.get('organizationId') || ''
    if (orgScope) {
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      const member = await db.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: orgScope, userId: user.id } },
      })
      if (!member) return NextResponse.json({ error: 'Not a member of that organization' }, { status: 403 })
      where.organizationId = orgScope
      delete where.approvalState // org members see their own proposals in any state
      if (where.status === 'ACTIVE' && (where as { seller?: unknown }).seller) delete (where as { seller?: unknown }).seller
    }
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

// POST /api/products — create. Two paths (B2B2C model):
//   • Platform admin (catalog.products.create) → platform-managed listing, live immediately.
//   • Company member (org.proposals.manage in an active org context) → PRODUCT
//     PROPOSAL: private (approvalState PENDING_APPROVAL, status DRAFT) until the
//     platform approves it into the shared catalog. The legacy personal-SELLER
//     path is retired — individuals do not sell.
export async function POST(req: NextRequest) {
  try {
    const csrf = assertSameOrigin(req)
    if (csrf) return csrf

    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Please sign in first' }, { status: 401 })

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

    if (user.role === 'ADMIN') {
      try {
        const product = await createProduct(user.id, parsed.data)
        return NextResponse.json({ product: serializeProduct(product!) }, { status: 201 })
      } catch (err) {
        const status = (err as { status?: number }).status
        if (status) return NextResponse.json({ error: (err as Error).message }, { status })
        throw err
      }
    }

    // Company path: a product proposal via the org context (org.proposals.manage).
    const membership = await db.organizationMember.findFirst({
      where: { userId: user.id, organization: { orgType: 'COMPANY', status: 'ACTIVE' } },
    })
    if (!membership) {
      return NextResponse.json(
        {
          error: 'Products are proposed by companies — open your organization workspace to submit a catalog proposal',
          code: 'SELLING_NOT_ALLOWED',
        },
        { status: 403 }
      )
    }
    const allowed = await db.userRole.count({
      where: { userId: user.id, organizationId: membership.organizationId, role: { permissions: { some: { permissionKey: 'org.proposals.manage' } } } },
    })
    if (allowed === 0 && membership.role !== 'OWNER' && membership.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'This action requires the "org.proposals.manage" permission', code: 'MISSING_PERMISSION' },
        { status: 403 }
      )
    }
    const { proposeProduct, CatalogServiceError } = await import('@/server/modules/catalog/service')
    try {
      const proposal = await proposeProduct(user.id, membership.organizationId, {
        title: parsed.data.title,
        description: parsed.data.description,
        price: parsed.data.price,
        images: Array.isArray(parsed.data.images) ? parsed.data.images : [],
        categoryId: parsed.data.categoryId,
        sku: parsed.data.sku ?? null,
        moq: parsed.data.moq ?? null,
      })
      return NextResponse.json({ product: proposal, proposal }, { status: 201 })
    } catch (err) {
      if (err instanceof CatalogServiceError) {
        return NextResponse.json({ error: err.message, code: 'DENIED' }, { status: err.status })
      }
      throw err
    }
  } catch (err) {
    console.error('products POST error', err)
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 })
  }
}
