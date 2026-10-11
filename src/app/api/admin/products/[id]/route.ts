import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import {
  adminProductSchema,
  reasonSchema,
  updateAdminProduct,
  adminArchiveOrRestoreProduct,
  adminDeleteProduct,
  AdminProductError,
  serializeProduct,
} from '@/server/modules/catalog/admin-products'

// PUT /api/admin/products/[id] — 9.3 full-field admin edit of ANY product
// (seller-owned listings included). MANDATORY reason (≥ 10 chars) → field-level
// before/after diff in the AuditLog + a PRODUCT_ADMIN_EDIT notification to the
// seller when the listing is not platform-curated. No KYC gate, no publication
// agreement, no review queue — but every change is on the record.
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin('catalog.products.update')
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'productWrite', RATE_LIMITS.productWrite, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const bodySchema = z.object({ reason: reasonSchema, product: adminProductSchema })
    const parsed = bodySchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const updated = await updateAdminProduct(user.id, id, parsed.data.product, parsed.data.reason)
    return NextResponse.json({ product: serializeProduct(updated) })
  } catch (err) {
    if (err instanceof AdminProductError)
      return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('admin product PUT error', err)
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 })
  }
}

// PATCH /api/admin/products/[id] — 9.3 archive / restore with a reason.
// Archive: ACTIVE/DRAFT/PENDING_REVIEW/REJECTED → ARCHIVED (+featured off).
// Restore: ARCHIVED → ACTIVE.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin('catalog.products.moderate')
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'productWrite', RATE_LIMITS.productWrite, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const bodySchema = z.object({ action: z.enum(['archive', 'restore']), reason: reasonSchema })
    const parsed = bodySchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const updated = await adminArchiveOrRestoreProduct(user.id, id, parsed.data.action, parsed.data.reason)
    return NextResponse.json({ product: { id: updated.id, title: updated.title, status: updated.status, featured: updated.featured } })
  } catch (err) {
    if (err instanceof AdminProductError)
      return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('admin product PATCH error', err)
    return NextResponse.json({ error: 'Failed to moderate product' }, { status: 500 })
  }
}

// DELETE /api/admin/products/[id] — 9.3 GUARDED hard delete with a reason.
// Refused (409, "archive instead") while the product has vendor offers, order
// items, reviews, favorites or quote lines. Only unreferenced rows are deleted.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin('catalog.products.delete')
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'productWrite', RATE_LIMITS.productWrite, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const bodySchema = z.object({ reason: reasonSchema })
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const result = await adminDeleteProduct(user.id, id, parsed.data.reason)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof AdminProductError)
      return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('admin product DELETE error', err)
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 })
  }
}
