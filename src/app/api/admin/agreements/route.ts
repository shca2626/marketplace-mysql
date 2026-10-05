import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { AgreementError, createTemplate, listTemplates } from '@/server/modules/catalog/agreements'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'

// GET /api/admin/agreements — every template version with consent counts
// (active first, then newest first).
export async function GET() {
  const { error } = await requireAdmin('catalog.products.moderate')
  if (error) return error
  try {
    const templates = await listTemplates()
    return NextResponse.json({ templates })
  } catch (err) {
    console.error('admin agreements GET error', err)
    return NextResponse.json({ error: 'Failed to load agreement templates' }, { status: 500 })
  }
}

const templateSchema = z.object({
  version: z.string().trim().min(1).max(32),
  title: z.string().trim().min(2).max(120),
  body: z.string().trim().min(20).max(20000),
})

// POST /api/admin/agreements — create a DRAFT template (activate it
// separately via PATCH {action:"activate"} after reviewing the text).
export async function POST(req: NextRequest) {
  const { user, error } = await requireAdmin('catalog.products.moderate')
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'admin:agreements', { limit: 60, windowMs: 60_000 }, user.id)
  if (rl) return rl

  try {
    const parsed = templateSchema.safeParse(await req.json())
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid agreement template' },
        { status: 400 }
      )
    const template = await createTemplate(parsed.data, user.id)
    return NextResponse.json({ template }, { status: 201 })
  } catch (err) {
    if (err instanceof AgreementError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('admin agreements POST error', err)
    return NextResponse.json({ error: 'Failed to create agreement template' }, { status: 500 })
  }
}
