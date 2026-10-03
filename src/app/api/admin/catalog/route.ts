import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAdmin } from '@/server/guards'
import { getCatalogSettings, saveCatalogSettings } from '@/server/modules/catalog/settings'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'

// GET /api/admin/catalog — catalog console overview: review settings + counts
// for the nav badges and the review-queue header.
export async function GET() {
  const { error } = await requireAdmin('catalog.products.moderate')
  if (error) return error
  try {
    const [settings, pendingProducts, pendingOffers, pendingServices, brands, units, categories, orgTypes, curated, popularRanked, merged] =
      await Promise.all([
        getCatalogSettings(),
        db.product.count({ where: { status: 'PENDING_REVIEW' } }),
        db.productOffer.count({ where: { status: 'PENDING_REVIEW' } }),
        db.financierService.count({ where: { status: 'PENDING_REVIEW' } }),
        db.brand.count(),
        db.unitOfMeasure.count(),
        db.category.count(),
        db.organizationType.count(),
        db.product.count({ where: { isCurated: true, status: { not: 'ARCHIVED' } } }),
        db.product.count({ where: { popularRank: { not: null }, status: 'ACTIVE' } }),
        db.product.count({ where: { status: 'ARCHIVED', slug: { startsWith: 'merged-' } } }),
      ])
    return NextResponse.json({
      settings,
      counts: { pendingProducts, pendingOffers, pendingServices, brands, units, categories, orgTypes, curated, popularRanked, merged },
    })
  } catch (err) {
    console.error('admin catalog overview GET error', err)
    return NextResponse.json({ error: 'Failed to load the catalog overview' }, { status: 500 })
  }
}

const settingsSchema = z.object({
  publishReview: z.enum(['OFF', 'NEW_SELLERS', 'ALL']).optional(),
  editReview: z.enum(['OFF', 'ALL']).optional(),
})

// PATCH /api/admin/catalog — update the publish/edit review settings.
export async function PATCH(req: NextRequest) {
  const { user, error } = await requireAdmin('catalog.products.moderate')
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'admin:catalog-settings', { limit: 30, windowMs: 60_000 }, user.id)
  if (rl) return rl

  try {
    const parsed = settingsSchema.safeParse(await req.json())
    if (!parsed.success)
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid settings' }, { status: 400 })
    if (!parsed.data.publishReview && !parsed.data.editReview)
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    const settings = await saveCatalogSettings(parsed.data)
    return NextResponse.json({ settings })
  } catch (err) {
    console.error('admin catalog settings PATCH error', err)
    return NextResponse.json({ error: 'Failed to save the catalog settings' }, { status: 500 })
  }
}
