import { db } from '@/lib/db'
import { recordAudit } from '@/server/modules/audit/service'
import type { CouponDTO } from '@/lib/types'

/**
 * COUPONS — moved from hardcoded constants (lib/pricing.ts) to data.
 * Fully admin-managed: create, edit, deactivate. The public lookup used by
 * checkout is findActiveCoupon(code).
 */

export class CouponServiceError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

/** Shape mirrors the legacy lib/pricing Coupon so computePricing keeps working. */
export interface ActiveCoupon {
  code: string
  description: string
  percentOff: number
  firstOrderOnly: boolean
  minSubtotal: number
}

function serializeCoupon(c: {
  id: string
  code: string
  description: string
  percentOff: number
  minSubtotal: number
  firstOrderOnly: boolean
  active: boolean
  createdAt: Date
}): CouponDTO {
  return {
    id: c.id,
    code: c.code,
    description: c.description,
    percentOff: c.percentOff,
    minSubtotal: c.minSubtotal,
    firstOrderOnly: c.firstOrderOnly,
    active: c.active,
    createdAt: c.createdAt.toISOString(),
  }
}

export async function findActiveCoupon(rawCode: string): Promise<ActiveCoupon | null> {
  const code = rawCode.trim().toUpperCase()
  if (!code) return null
  const coupon = await db.coupon.findUnique({ where: { code } })
  if (!coupon || !coupon.active) return null
  return {
    code: coupon.code,
    description: coupon.description,
    percentOff: coupon.percentOff,
    firstOrderOnly: coupon.firstOrderOnly,
    minSubtotal: coupon.minSubtotal,
  }
}

export async function adminListCoupons(includeInactive = true): Promise<CouponDTO[]> {
  const coupons = await db.coupon.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: { createdAt: 'desc' },
  })
  return coupons.map(serializeCoupon)
}

export async function adminCreateCoupon(
  adminId: string,
  input: {
    code: string
    description: string
    percentOff: number
    minSubtotal?: number
    firstOrderOnly?: boolean
  }
): Promise<CouponDTO> {
  const code = input.code.trim().toUpperCase()
  if (!/^[A-Z0-9]{3,24}$/.test(code)) {
    throw new CouponServiceError('Code must be 3–24 letters/numbers')
  }
  if (input.percentOff < 1 || input.percentOff > 100) {
    throw new CouponServiceError('Percent off must be 1–100')
  }
  const exists = await db.coupon.findUnique({ where: { code } })
  if (exists) throw new CouponServiceError('That coupon code already exists', 409)

  const coupon = await db.coupon.create({
    data: {
      code,
      description: input.description,
      percentOff: input.percentOff,
      minSubtotal: input.minSubtotal ?? 0,
      firstOrderOnly: input.firstOrderOnly ?? false,
      active: true,
    },
  })
  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: 'COUPON_CREATED',
    entityType: 'Coupon',
    entityId: coupon.id,
    summary: `Coupon ${code} (${input.percentOff}% off) created`,
  })
  return serializeCoupon(coupon)
}

export async function adminUpdateCoupon(
  couponId: string,
  adminId: string,
  input: {
    description?: string
    percentOff?: number
    minSubtotal?: number
    firstOrderOnly?: boolean
    active?: boolean
  }
): Promise<CouponDTO> {
  const coupon = await db.coupon.findUnique({ where: { id: couponId } })
  if (!coupon) throw new CouponServiceError('Coupon not found', 404)

  if (input.percentOff !== undefined && (input.percentOff < 1 || input.percentOff > 100)) {
    throw new CouponServiceError('Percent off must be 1–100')
  }

  const updated = await db.coupon.update({ where: { id: couponId }, data: input })
  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: input.active === false ? 'COUPON_DEACTIVATED' : 'COUPON_UPDATED',
    entityType: 'Coupon',
    entityId: couponId,
    summary: `Coupon ${coupon.code} updated`,
    metadata: { fields: Object.keys(input) },
  })
  return serializeCoupon(updated)
}

export async function adminDeleteCoupon(couponId: string, adminId: string): Promise<void> {
  const coupon = await db.coupon.findUnique({ where: { id: couponId } })
  if (!coupon) throw new CouponServiceError('Coupon not found', 404)
  await db.coupon.delete({ where: { id: couponId } })
  await recordAudit({
    actorId: adminId,
    actorType: 'ADMIN',
    action: 'COUPON_DELETED',
    entityType: 'Coupon',
    entityId: couponId,
    summary: `Coupon ${coupon.code} deleted`,
  })
}
