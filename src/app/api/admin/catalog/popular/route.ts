import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { listPopular, setPopularRank, CatalogError } from '@/server/modules/catalog/service'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'

// GET /api/admin/catalog/popular — the curated popular-products rail.
export async function GET() {
  const { error } = await requireAdmin('catalog.products.moderate')
  if (error) return error
  try {
    const rows = await listPopular()
    return NextResponse.json({
      products: rows.map((p) => ({
        id: p.id,
        title: p.title,
        price: p.price,
        popularRank: p.popularRank,
        featured: p.featured,
        category: p.category.name,
        seller: p.seller.storeName,
        image: (() => {
          try {
            const arr = JSON.parse(p.images || '[]')
            return Array.isArray(arr) && arr.length > 0 ? arr[0] : null
          } catch {
            return null
          }
        })(),
      })),
    })
  } catch (err) {
    console.error('admin popular GET error', err)
    return NextResponse.json({ error: 'Failed to load popular products' }, { status: 500 })
  }
}

const rankSchema = z.object({
  productId: z.string().min(1),
  rank: z.number().int().min(1).max(999).nullable(),
})

// POST /api/admin/catalog/popular — set/clear one popular rank.
export async function POST(req: NextRequest) {
  const { user, error } = await requireAdmin('catalog.products.moderate')
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'admin:popular', { limit: 60, windowMs: 60_000 }, user.id)
  if (rl) return rl

  try {
    const parsed = rankSchema.safeParse(await req.json())
    if (!parsed.success)
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid rank' }, { status: 400 })
    await setPopularRank(user.id, parsed.data.productId, parsed.data.rank)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof CatalogError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('admin popular POST error', err)
    return NextResponse.json({ error: 'Failed to set popular rank' }, { status: 500 })
  }
}
