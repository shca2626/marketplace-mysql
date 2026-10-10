import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminPermission } from '@/server/modules/catalog/service'
import { adminReviewProduct, CatalogServiceError } from '@/server/modules/catalog/service'
import { assertSameOrigin } from '@/lib/http'

const approveSchema = z.object({
  approve: z.boolean(),
  note: z.string().trim().max(2000).optional().nullable(),
})

// POST /api/products/[id]/approve — platform gate: approve/reject a product proposal
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const admin = await requireAdminPermission('catalog.products.moderate')
  if (!admin) {
    return NextResponse.json(
      { error: 'This action requires the "catalog.products.moderate" permission', code: 'MISSING_PERMISSION' },
      { status: 403, headers: { 'X-Authz-Deny': 'MISSING_PERMISSION' } }
    )
  }
  try {
    const { id } = await ctx.params
    const parsed = approveSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }
    const result = await adminReviewProduct(admin.id, id, parsed.data)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof CatalogServiceError) {
      return NextResponse.json({ error: err.message, code: 'DENIED' }, { status: err.status })
    }
    console.error('product approve error', err)
    return NextResponse.json({ error: 'Failed to review product' }, { status: 500 })
  }
}
