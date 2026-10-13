import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { listUnits, createUnit, CatalogError } from '@/server/modules/catalog/admin-catalog'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'

// GET /api/admin/catalog/units — the unit-of-measure dictionary.
export async function GET() {
  const { error } = await requireAdmin('catalog.products.moderate')
  if (error) return error
  try {
    const units = await listUnits()
    return NextResponse.json({ units })
  } catch (err) {
    console.error('admin units GET error', err)
    return NextResponse.json({ error: 'Failed to load units' }, { status: 500 })
  }
}

const unitSchema = z.object({
  code: z.string().trim().min(1).max(10),
  label: z.string().trim().min(1).max(40),
  dimension: z.enum(['POWER', 'VOLTAGE', 'CURRENT', 'WEIGHT', 'LENGTH', 'AREA', 'VOLUME', 'COUNT', 'TIME', 'OTHER']),
})

// POST /api/admin/catalog/units — add a unit (used by spec-attribute forms).
export async function POST(req: NextRequest) {
  const { user, error } = await requireAdmin('catalog.products.moderate')
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'admin:units', { limit: 60, windowMs: 60_000 }, user.id)
  if (rl) return rl

  try {
    const parsed = unitSchema.safeParse(await req.json())
    if (!parsed.success)
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid unit' }, { status: 400 })
    const unit = await createUnit(parsed.data)
    return NextResponse.json({ unit }, { status: 201 })
  } catch (err) {
    if (err instanceof CatalogError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('admin units POST error', err)
    return NextResponse.json({ error: 'Failed to create unit' }, { status: 500 })
  }
}
