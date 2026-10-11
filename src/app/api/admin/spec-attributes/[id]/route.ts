import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import {
  updateSpecAttribute,
  deleteSpecAttribute,
  SpecAttributeError,
} from '@/server/modules/kyc/spec-attributes'

const patchSchema = z.object({
  label: z.string().trim().min(2).max(60).optional(),
  unit: z.string().trim().max(20).nullable().optional(),
  options: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  required: z.boolean().optional(),
  position: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
})

// PATCH /api/admin/spec-attributes/[id] — edit label/unit/options/required/
// position/isActive. Key + dataType + scope are immutable (sellers' saved
// specs reference them by label text, but stability still matters).
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin('catalog.products.moderate')
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'admin:spec-attributes', { limit: 90, windowMs: 60_000 }, user.id)
  if (rl) return rl
  try {
    const { id } = await ctx.params
    const parsed = patchSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const attribute = await updateSpecAttribute(user.id, id, parsed.data)
    return NextResponse.json({ attribute })
  } catch (err) {
    if (err instanceof SpecAttributeError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin spec attribute PATCH error', err)
    return NextResponse.json({ error: 'Failed to update spec attribute' }, { status: 500 })
  }
}

// DELETE /api/admin/spec-attributes/[id] — hard delete (dictionary config, not
// user data; Product.specs copies survive as plain text).
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin('catalog.products.moderate')
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'admin:spec-attributes', { limit: 60, windowMs: 60_000 }, user.id)
  if (rl) return rl
  try {
    const { id } = await ctx.params
    await deleteSpecAttribute(user.id, id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof SpecAttributeError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin spec attribute DELETE error', err)
    return NextResponse.json({ error: 'Failed to delete spec attribute' }, { status: 500 })
  }
}
