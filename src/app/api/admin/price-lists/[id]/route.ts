import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import {
  adminDeletePriceList,
  adminGetPriceList,
  adminUpdatePriceList,
  PriceListServiceError,
} from '@/server/modules/price-lists/service'

const updateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  status: z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']).optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
})

// GET /api/admin/price-lists/[id] — with full entry ladder
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin()
  if (error) return error
  try {
    const { id } = await ctx.params
    const priceList = await adminGetPriceList(id)
    return NextResponse.json({ priceList })
  } catch (err) {
    if (err instanceof PriceListServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin price-list GET error', err)
    return NextResponse.json({ error: 'Failed to load price list' }, { status: 500 })
  }
}

// PATCH /api/admin/price-lists/[id]
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin()
  if (error) return error
  try {
    const { id } = await ctx.params
    const body = await req.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    const priceList = await adminUpdatePriceList(id, user!.id, parsed.data)
    return NextResponse.json({ priceList })
  } catch (err) {
    if (err instanceof PriceListServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin price-list PATCH error', err)
    return NextResponse.json({ error: 'Failed to update price list' }, { status: 500 })
  }
}

// DELETE /api/admin/price-lists/[id]
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin()
  if (error) return error
  try {
    const { id } = await ctx.params
    await adminDeletePriceList(id, user!.id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof PriceListServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin price-list DELETE error', err)
    return NextResponse.json({ error: 'Failed to delete price list' }, { status: 500 })
  }
}
