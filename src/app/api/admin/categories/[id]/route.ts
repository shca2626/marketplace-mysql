import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { updateCategory, deleteCategory, CatalogError } from '@/server/modules/catalog/admin-catalog'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'

const patchSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  icon: z.string().trim().max(40).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
})

// PATCH /api/admin/categories/[id] — rename / re-order / enrich a category.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin('catalog.products.moderate')
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'admin:categories', { limit: 30, windowMs: 60_000 }, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const parsed = patchSchema.safeParse(await req.json())
    if (!parsed.success)
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid patch' }, { status: 400 })
    const category = await updateCategory(id, parsed.data)
    return NextResponse.json({ category })
  } catch (err) {
    if (err instanceof CatalogError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('admin category PATCH error', err)
    return NextResponse.json({ error: 'Failed to update category' }, { status: 500 })
  }
}

// DELETE /api/admin/categories/[id]?reassignTo=<categoryId> — delete with
// optional product re-assignment (required when the category still has listings).
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin('catalog.products.moderate')
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  try {
    const { id } = await ctx.params
    const reassignTo = req.nextUrl.searchParams.get('reassignTo') || null
    const result = await deleteCategory(id, reassignTo)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof CatalogError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('admin category DELETE error', err)
    return NextResponse.json({ error: 'Failed to delete category' }, { status: 500 })
  }
}
