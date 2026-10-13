import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { updateBrand, deleteBrand, CatalogError } from '@/server/modules/catalog/admin-catalog'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'

const patchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  logoUrl: z.string().trim().max(2048).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  websiteUrl: z.string().trim().max(512).nullable().optional(),
  originCountry: z.string().trim().max(60).nullable().optional(),
  isVerified: z.boolean().optional(),
})

// PATCH /api/admin/catalog/brands/[id] — rename / verify / enrich a brand.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin('catalog.products.moderate')
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'admin:brands', { limit: 60, windowMs: 60_000 }, user.id)
  if (rl) return rl

  try {
    const { id } = await ctx.params
    const parsed = patchSchema.safeParse(await req.json())
    if (!parsed.success)
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid patch' }, { status: 400 })
    const brand = await updateBrand(id, parsed.data)
    return NextResponse.json({ brand })
  } catch (err) {
    if (err instanceof CatalogError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('admin brand PATCH error', err)
    return NextResponse.json({ error: 'Failed to update brand' }, { status: 500 })
  }
}

// DELETE /api/admin/catalog/brands/[id] — remove an unused brand.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin('catalog.products.moderate')
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  try {
    const { id } = await ctx.params
    await deleteBrand(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof CatalogError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('admin brand DELETE error', err)
    return NextResponse.json({ error: 'Failed to delete brand' }, { status: 500 })
  }
}
