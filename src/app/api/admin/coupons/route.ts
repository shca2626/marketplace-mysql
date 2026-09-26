import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/server/guards'
import { adminCreateCoupon, adminListCoupons, CouponServiceError } from '@/server/modules/coupons/service'
import { assertSameOrigin } from '@/lib/http'

const createSchema = z.object({
  code: z.string().trim().min(3).max(24),
  description: z.string().trim().min(3).max(160),
  percentOff: z.number().int().min(1).max(100),
  minSubtotal: z.number().min(0).max(1_000_000).optional(),
  firstOrderOnly: z.boolean().optional(),
})

// GET /api/admin/coupons
export async function GET() {
  const { error } = await requireAdmin()
  if (error) return error
  try {
    const coupons = await adminListCoupons()
    return NextResponse.json({ coupons })
  } catch (err) {
    console.error('admin coupons GET error', err)
    return NextResponse.json({ error: 'Failed to load coupons' }, { status: 500 })
  }
}

// POST /api/admin/coupons
export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const { user, error } = await requireAdmin()
  if (error) return error
  try {
    const body = await req.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    const coupon = await adminCreateCoupon(user!.id, parsed.data)
    return NextResponse.json({ coupon }, { status: 201 })
  } catch (err) {
    if (err instanceof CouponServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('admin coupons POST error', err)
    return NextResponse.json({ error: 'Failed to create coupon' }, { status: 500 })
  }
}
