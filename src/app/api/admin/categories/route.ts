import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAdmin } from '@/server/guards'
import { createCategory, CatalogError } from '@/server/modules/catalog/service'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'

// GET /api/admin/categories — full category list with product + spec counts.
export async function GET() {
  const { error } = await requireAdmin('catalog.products.moderate')
  if (error) return error
  try {
    const rows = await db.category.findMany({
      include: { _count: { select: { products: true, specAttributes: true } } },
      orderBy: { sortOrder: 'asc' },
    })
    return NextResponse.json({
      categories: rows.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        icon: c.icon,
        description: c.description,
        sortOrder: c.sortOrder,
        productCount: c._count.products,
        specAttributeCount: c._count.specAttributes,
      })),
    })
  } catch (err) {
    console.error('admin categories GET error', err)
    return NextResponse.json({ error: 'Failed to load categories' }, { status: 500 })
  }
}

const categorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  icon: z.string().trim().max(40).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
})

// POST /api/admin/categories — create a category.
export async function POST(req: NextRequest) {
  const { user, error } = await requireAdmin('catalog.products.moderate')
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'admin:categories', { limit: 30, windowMs: 60_000 }, user.id)
  if (rl) return rl

  try {
    const parsed = categorySchema.safeParse(await req.json())
    if (!parsed.success)
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid category' }, { status: 400 })
    const category = await createCategory(parsed.data)
    return NextResponse.json({ category }, { status: 201 })
  } catch (err) {
    if (err instanceof CatalogError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('admin categories POST error', err)
    return NextResponse.json({ error: 'Failed to create category' }, { status: 500 })
  }
}
