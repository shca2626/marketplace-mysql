import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { assertSameOrigin, enforceRateLimit } from '@/lib/http'
import {
  listSpecAttributes,
  createSpecAttribute,
  SpecAttributeError,
} from '@/server/modules/kyc/spec-attributes'

// GET /api/admin/spec-attributes?categoryId= — the attribute dictionary for a
// category (omit categoryId → the GLOBAL set). Position-ordered.
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin('catalog.products.moderate')
  if (error) return error
  try {
    const categoryId = req.nextUrl.searchParams.get('categoryId') || null
    const attributes = await listSpecAttributes(categoryId)
    return NextResponse.json({ attributes })
  } catch (err) {
    console.error('admin spec attributes GET error', err)
    return NextResponse.json({ error: 'Failed to load spec attributes' }, { status: 500 })
  }
}

const createSchema = z.object({
  categoryId: z.string().trim().min(1).nullable().optional(), // null/omitted = global
  key: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Key must be a lowercase slug (e.g. "rated-power")'),
  label: z.string().trim().min(2).max(60),
  dataType: z.enum(['TEXT', 'NUMBER', 'SELECT', 'BOOLEAN']),
  unit: z.string().trim().max(20).nullable().optional(),
  options: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  required: z.boolean().optional(),
  position: z.number().int().min(0).max(9999).optional(),
})

// POST /api/admin/spec-attributes — create a dictionary entry. Global keys are
// service-layer deduped (MySQL @@unique can't police NULL categoryId rows).
export async function POST(req: NextRequest) {
  const { user, error } = await requireAdmin('catalog.products.moderate')
  if (error) return error
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const rl = enforceRateLimit(req, 'admin:spec-attributes', { limit: 60, windowMs: 60_000 }, user.id)
  if (rl) return rl
  try {
    const parsed = createSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const attribute = await createSpecAttribute(user.id, {
      ...parsed.data,
      categoryId: parsed.data.categoryId ?? null,
    })
    return NextResponse.json({ attribute }, { status: 201 })
  } catch (err) {
    if (err instanceof SpecAttributeError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin spec attributes POST error', err)
    return NextResponse.json({ error: 'Failed to create spec attribute' }, { status: 500 })
  }
}
