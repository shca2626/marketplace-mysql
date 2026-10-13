import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { cloneProductAsCurated, CatalogError } from '@/server/modules/catalog/admin-catalog'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'

// POST /api/admin/catalog/products/[id]/clone — deep-copy any listing into a
// curated DRAFT (platform standardization tool: copy, clean up, publish).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin('catalog.products.moderate')
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'admin:catalog-products', { limit: 20, windowMs: 60_000 }, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const clone = await cloneProductAsCurated(user.id, id)
    return NextResponse.json(
      { product: { id: clone.id, title: clone.title, status: clone.status }, message: `Cloned into draft "${clone.title}"` },
      { status: 201 }
    )
  } catch (err) {
    if (err instanceof CatalogError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('admin clone POST error', err)
    return NextResponse.json({ error: 'Failed to clone product' }, { status: 500 })
  }
}
