import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAdmin } from '@/server/guards'

// ─────────────────────────────────────────────────────────────────────────────
// /api/whatsapp/rules — chatbot auto-reply rules CRUD (list + create)
// REGEX patterns are compiled server-side before saving.
// ─────────────────────────────────────────────────────────────────────────────

const MATCH_TYPES = ['CONTAINS', 'EXACT', 'STARTS_WITH', 'REGEX'] as const

const createSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  matchType: z.enum(MATCH_TYPES),
  pattern: z.string().trim().min(1, 'Pattern is required').max(500),
  reply: z.string().trim().min(1, 'Reply is required').max(2000),
  priority: z.number().int().min(0).max(1000).optional(),
  active: z.boolean().optional(),
})

export async function GET() {
  const { error } = await requireAdmin('storefront.manage')
  if (error) return error
  try {
    const rules = await db.chatbotRule.findMany({
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    })
    return NextResponse.json({ rules })
  } catch (err) {
    console.error('[api/whatsapp/rules] GET failed', err)
    return NextResponse.json({ error: 'Failed to load rules' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin('storefront.manage')
  if (error) return error
  try {
    const parsed = createSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid rule' }, { status: 400 })
    }
    if (parsed.data.matchType === 'REGEX') {
      try {
        new RegExp(parsed.data.pattern)
      } catch {
        return NextResponse.json({ error: `Invalid regular expression: ${parsed.data.pattern}` }, { status: 400 })
      }
    }
    const rule = await db.chatbotRule.create({
      data: { ...parsed.data, priority: parsed.data.priority ?? 0, active: parsed.data.active ?? true },
    })
    return NextResponse.json({ rule }, { status: 201 })
  } catch (err) {
    console.error('[api/whatsapp/rules] POST failed', err)
    return NextResponse.json({ error: 'Failed to create rule' }, { status: 500 })
  }
}
