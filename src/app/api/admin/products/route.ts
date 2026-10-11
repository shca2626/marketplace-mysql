import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import { RATE_LIMITS } from '@/lib/rate-limit'
import {
  adminProductSchema,
  createAdminCuratedProduct,
  AdminProductError,
  serializeProduct,
} from '@/server/modules/catalog/admin-products'

// POST /api/admin/products — 9.2 full-field ADMIN product creation.
// Creates a CURATED platform catalog record (the Phase 9.1 ownership model):
//   sellerId: null  ·  curatedById: <admin>  ·  isCurated: true
// A curated record is a catalog identity — never directly purchasable; vendors
// attach ACTIVE ProductOffers to it. No publication-agreement, no KYC gate,
// no publish-review queue: the platform is the author.
export async function POST(req: NextRequest) {
  const { user, error } = await requireAdmin('catalog.products.update')
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'productWrite', RATE_LIMITS.productWrite, user.id)
  if (rl) return rl

  try {
    const parsed = adminProductSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid product input' },
        { status: 400 }
      )
    }
    const created = await createAdminCuratedProduct(user.id, parsed.data)
    return NextResponse.json(
      {
        product: serializeProduct(created),
        // 9.1 provenance proof for the caller (not part of the public DTO):
        curatedProvenance: { sellerId: null, curatedById: user.id, isCurated: true },
      },
      { status: 201 }
    )
  } catch (err) {
    if (err instanceof AdminProductError)
      return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('admin products POST error', err)
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 })
  }
}
