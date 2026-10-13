import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { mergeProducts, CatalogError } from '@/server/modules/catalog/admin-catalog'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'

const mergeSchema = z.object({
  duplicateId: z.string().min(1),
  targetId: z.string().min(1),
})

// POST /api/admin/catalog/merge — merge a duplicate listing into the canonical
// one: the duplicate's seller becomes an offer holder on the target; attached
// offers/reviews/order items/RFQ lines re-assign; the duplicate archives.
export async function POST(req: NextRequest) {
  const { user, error } = await requireAdmin('catalog.products.moderate')
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'admin:catalog-merge', { limit: 20, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl

  try {
    const parsed = mergeSchema.safeParse(await req.json())
    if (!parsed.success)
      return NextResponse.json({ error: 'Provide duplicateId and targetId' }, { status: 400 })
    const result = await mergeProducts(user.id, parsed.data.duplicateId, parsed.data.targetId)
    return NextResponse.json({ ...result, merged: true })
  } catch (err) {
    if (err instanceof CatalogError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('admin merge POST error', err)
    return NextResponse.json({ error: 'Failed to merge products' }, { status: 500 })
  }
}
