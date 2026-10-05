import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAdmin } from '@/server/guards'

// ─────────────────────────────────────────────────────────────────────────────
// /api/whatsapp/templates — template library CRUD (list + create)
// ─────────────────────────────────────────────────────────────────────────────

const createSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']),
  language: z.enum(['en', 'ar']),
  body: z.string().min(1, 'Body is required').max(2000, 'Body is limited to 2000 characters'),
  status: z.enum(['DRAFT', 'APPROVED']).optional(),
})

export async function GET() {
  const { error } = await requireAdmin('storefront.manage')
  if (error) return error
  try {
    const templates = await db.whatsAppTemplate.findMany({
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { campaigns: true } } },
    })
    return NextResponse.json({
      templates: templates.map((t) => ({
        id: t.id,
        name: t.name,
        category: t.category,
        language: t.language,
        body: t.body,
        status: t.status,
        useCount: t.useCount,
        campaignCount: t._count.campaigns,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
    })
  } catch (err) {
    console.error('[api/whatsapp/templates] GET failed', err)
    return NextResponse.json({ error: 'Failed to load templates' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireAdmin('storefront.manage')
  if (error) return error
  try {
    const parsed = createSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid template' }, { status: 400 })
    }
    const template = await db.whatsAppTemplate.create({
      data: { ...parsed.data, status: parsed.data.status ?? 'DRAFT', createdById: user.id },
    })
    return NextResponse.json({ template }, { status: 201 })
  } catch (err) {
    console.error('[api/whatsapp/templates] POST failed', err)
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 })
  }
}
