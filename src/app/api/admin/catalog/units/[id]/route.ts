import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { updateUnit, deleteUnit, CatalogError } from '@/server/modules/catalog/admin-catalog'
import { assertSameOrigin } from '@/lib/http'

const patchSchema = z.object({
  label: z.string().trim().min(1).max(40).optional(),
  dimension: z.enum(['POWER', 'VOLTAGE', 'CURRENT', 'WEIGHT', 'LENGTH', 'AREA', 'VOLUME', 'COUNT', 'TIME', 'OTHER']).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
})

// PATCH /api/admin/catalog/units/[id] — edit / deactivate a unit.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin('catalog.products.moderate')
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  try {
    const { id } = await ctx.params
    const parsed = patchSchema.safeParse(await req.json())
    if (!parsed.success)
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid patch' }, { status: 400 })
    const unit = await updateUnit(id, parsed.data)
    return NextResponse.json({ unit })
  } catch (err) {
    if (err instanceof CatalogError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('admin unit PATCH error', err)
    return NextResponse.json({ error: 'Failed to update unit' }, { status: 500 })
  }
}

// DELETE /api/admin/catalog/units/[id] — soft-delete (spec attributes keep the label).
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin('catalog.products.moderate')
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  try {
    const { id } = await ctx.params
    await deleteUnit(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof CatalogError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('admin unit DELETE error', err)
    return NextResponse.json({ error: 'Failed to delete unit' }, { status: 500 })
  }
}
