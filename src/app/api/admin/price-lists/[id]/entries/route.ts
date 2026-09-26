import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { adminReplaceEntries, PriceListServiceError } from '@/server/modules/price-lists/service'
import { assertSameOrigin } from '@/lib/http'

const entriesSchema = z.object({
  entries: z
    .array(
      z.object({
        productId: z.string().min(1),
        minQuantity: z.number().int().min(1).max(1_000_000),
        unitPrice: z.number().min(0).max(10_000_000),
      })
    )
    .max(1000),
})

// PUT /api/admin/price-lists/[id]/entries — transactional full ladder replace
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireAdmin()
  if (error) return error
  try {
    const { id } = await ctx.params
    const body = await req.json()
    const parsed = entriesSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    const entries = await adminReplaceEntries(id, user!.id, parsed.data.entries)
    return NextResponse.json({ entries })
  } catch (err) {
    if (err instanceof PriceListServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin entries PUT error', err)
    return NextResponse.json({ error: 'Failed to save entries' }, { status: 500 })
  }
}
