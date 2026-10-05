import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAdmin } from '@/server/guards'

// ─────────────────────────────────────────────────────────────────────────────
// /api/whatsapp/rules/[id] — PATCH (partial update / toggle active) + DELETE
// ─────────────────────────────────────────────────────────────────────────────

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    matchType: z.enum(['CONTAINS', 'EXACT', 'STARTS_WITH', 'REGEX']).optional(),
    pattern: z.string().trim().min(1).max(500).optional(),
    reply: z.string().trim().min(1).max(2000).optional(),
    priority: z.number().int().min(0).max(1000).optional(),
    active: z.boolean().optional(),
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
    const existing = await db.chatbotRule.findUnique({ where: { id }, select: { id: true, matchType: true, pattern: true } })
    if (!existing) return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
    // Validate the (possibly updated) regex before persisting
    const matchType = parsed.data.matchType ?? existing.matchType
    const pattern = parsed.data.pattern ?? existing.pattern
    if (matchType === 'REGEX') {
      try {
        new RegExp(pattern)
      } catch {
        return NextResponse.json({ error: `Invalid regular expression: ${pattern}` }, { status: 400 })
      }
    }
    const rule = await db.chatbotRule.update({ where: { id }, data: parsed.data })
    return NextResponse.json({ rule })
  } catch (err) {
    console.error('[api/whatsapp/rules/[id]] PATCH failed', err)
    return NextResponse.json({ error: 'Failed to update rule' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin('storefront.manage')
  if (error) return error
  try {
    const { id } = await ctx.params
    const existing = await db.chatbotRule.findUnique({ where: { id }, select: { id: true } })
    if (!existing) return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
    await db.chatbotRule.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[api/whatsapp/rules/[id]] DELETE failed', err)
    return NextResponse.json({ error: 'Failed to delete rule' }, { status: 500 })
  }
}
