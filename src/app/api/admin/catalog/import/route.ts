import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { importCatalogCsv, CatalogError } from '@/server/modules/catalog/admin-catalog'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'

const importSchema = z.object({
  csv: z.string().min(10, 'Paste CSV content first').max(1_000_000),
})

// POST /api/admin/catalog/import — bulk-import curated listings from CSV.
// Header columns: title,category,brand,price,stock,moq,sku,gtin,mpn,description,imageUrl
// (title, category, price required; rows with images publish, the rest stay DRAFT).
export async function POST(req: NextRequest) {
  const { user, error } = await requireAdmin('catalog.products.moderate')
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'admin:catalog-import', { limit: 5, windowMs: 10 * 60_000 }, user.id)
  if (rl) return rl

  try {
    const parsed = importSchema.safeParse(await req.json())
    if (!parsed.success)
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid import' }, { status: 400 })
    const results = await importCatalogCsv(user.id, parsed.data.csv)
    return NextResponse.json({
      results,
      created: results.filter((r) => r.status === 'created').length,
      failed: results.filter((r) => r.status === 'failed').length,
    })
  } catch (err) {
    if (err instanceof CatalogError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('admin catalog import POST error', err)
    return NextResponse.json({ error: 'Failed to import CSV' }, { status: 500 })
  }
}
