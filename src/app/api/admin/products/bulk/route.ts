import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { adminBulkProducts, reasonSchema, AdminProductError } from '@/server/modules/catalog/admin-products'

// POST /api/admin/products/bulk — 9.3 bulk archive / restore / feature /
// unfeature across selected listings. ONE audit entry per action (ids + reason
// in the metadata); visibility-changing actions notify affected sellers.
export async function POST(req: NextRequest) {
  const { user, error } = await requireAdmin('catalog.products.moderate')
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'productWrite', RATE_LIMITS.productWrite, user.id)
  if (rl) return rl

  try {
    const bodySchema = z.object({
      ids: z.array(z.string().min(1)).min(1, 'Select at least one listing').max(100),
      action: z.enum(['archive', 'restore', 'feature', 'unfeature']),
      reason: reasonSchema,
    })
    const parsed = bodySchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const result = await adminBulkProducts(user.id, parsed.data.ids, parsed.data.action, parsed.data.reason)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof AdminProductError)
      return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('admin products bulk POST error', err)
    return NextResponse.json({ error: 'Failed to run bulk action' }, { status: 500 })
  }
}
