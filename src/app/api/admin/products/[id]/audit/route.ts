import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { listProductAuditTrail } from '@/server/modules/catalog/admin-products'

// GET /api/admin/products/[id]/audit — 9.3 product-scoped audit history
// (powers the admin diff viewer: field-level before→after changes from
// PRODUCT_ADMIN_EDITED metadata, plus every moderation event on the row).
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin('catalog.products.view')
  if (error) return error
  try {
    const { id } = await ctx.params
    const limit = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') || '30') || 30))
    const entries = await listProductAuditTrail(id, limit)
    return NextResponse.json({ entries })
  } catch (err) {
    console.error('admin product audit GET error', err)
    return NextResponse.json({ error: 'Failed to load product audit trail' }, { status: 500 })
  }
}
