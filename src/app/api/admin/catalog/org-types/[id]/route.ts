import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { updateOrgType, CatalogError } from '@/server/modules/catalog/service'
import { assertSameOrigin } from '@/lib/http'

const patchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  icon: z.string().trim().max(40).nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
})

// PATCH /api/admin/catalog/org-types/[id] — rename / describe / hide / reorder.
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
    const orgType = await updateOrgType(id, parsed.data)
    return NextResponse.json({ orgType })
  } catch (err) {
    if (err instanceof CatalogError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('admin org-type PATCH error', err)
    return NextResponse.json({ error: 'Failed to update organization type' }, { status: 500 })
  }
}
