import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { adminDeleteCoupon, adminUpdateCoupon, CouponServiceError } from '@/server/modules/coupons/service'
import { assertSameOrigin } from '@/lib/http'

const updateSchema = z.object({
  description: z.string().trim().min(3).max(160).optional(),
  percentOff: z.number().int().min(1).max(100).optional(),
  minSubtotal: z.number().min(0).max(1_000_000).optional(),
  firstOrderOnly: z.boolean().optional(),
  active: z.boolean().optional(),
})

// PATCH /api/admin/coupons/[id]
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireAdmin()
  if (error) return error
  try {
    const { id } = await ctx.params
    const body = await req.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    const coupon = await adminUpdateCoupon(id, user!.id, parsed.data)
    return NextResponse.json({ coupon })
  } catch (err) {
    if (err instanceof CouponServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin coupon PATCH error', err)
    return NextResponse.json({ error: 'Failed to update coupon' }, { status: 500 })
  }
}

// DELETE /api/admin/coupons/[id]
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin()
  if (error) return error
  try {
    const { id } = await ctx.params
    await adminDeleteCoupon(id, user!.id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof CouponServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin coupon DELETE error', err)
    return NextResponse.json({ error: 'Failed to delete coupon' }, { status: 500 })
  }
}
