import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAdmin } from '@/server/guards'

// ─────────────────────────────────────────────────────────────────────────────
// /api/whatsapp/templates/[id] — PATCH (partial update) + DELETE
// ─────────────────────────────────────────────────────────────────────────────

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']).optional(),
    language: z.enum(['en', 'ar']).optional(),
    body: z.string().min(1).max(2000).optional(),
    status: z.enum(['DRAFT', 'APPROVED']).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' })

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin('storefront.manage')
  if (error) return error
  try {
    const { id } = await ctx.params
    const parsed = patchSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid update' }, { status: 400 })
    }
    const existing = await db.whatsAppTemplate.findUnique({ where: { id }, select: { id: true } })
    if (!existing) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    const template = await db.whatsAppTemplate.update({ where: { id }, data: parsed.data })
    return NextResponse.json({ template })
  } catch (err) {
    console.error('[api/whatsapp/templates/[id]] PATCH failed', err)
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin('storefront.manage')
  if (error) return error
  try {
    const { id } = await ctx.params
    const existing = await db.whatsAppTemplate.findUnique({
      where: { id },
      select: { id: true, _count: { select: { campaigns: true } } },
    })
    if (!existing) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    await db.whatsAppTemplate.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[api/whatsapp/templates/[id]] DELETE failed', err)
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 })
  }
}
