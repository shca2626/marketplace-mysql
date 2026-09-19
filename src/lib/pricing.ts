// ── Platform pricing rules ──────────────────────────────────────────────
// Pure math + constants shared by API (authoritative) and UI (display-only).
// COUPONS ARE NO LONGER HARDCODED — they live in the Coupon table and are
// managed from the admin panel. Server-side lookup:
//   src/server/modules/coupons/service.ts → findActiveCoupon(code)

export const FREE_SHIPPING_THRESHOLD = 75
export const SHIPPING_FEE = 6.99

/** Platform commission taken from each seller's gross sales (displayed in the
 *  seller dashboard Payouts card). Single source of truth for API + UI. */
export const PLATFORM_COMMISSION_RATE = 0.08

export interface Coupon {
  code: string
  percentOff: number
  description: string
  /** Restrict to a buyer's first-ever order (e.g. WELCOME10). */
  firstOrderOnly: boolean
  /** Minimum pre-discount subtotal required to use the coupon. */
  minSubtotal: number
}

export function couponDiscount(subtotal: number, coupon: Coupon): number {
  return Math.round(subtotal * (coupon.percentOff / 100) * 100) / 100
}

export interface Pricing {
  subtotal: number
  discount: number
  shipping: number
  total: number
  coupon: Coupon | null
}

/**
 * Compute full pricing breakdown.
 * Shipping eligibility is decided on the PRE-discount subtotal (matches the
 * free-shipping progress bar, which tracks the raw cart subtotal).
 */
export function computePricing(subtotal: number, coupon: Coupon | null): Pricing {
  const discount = coupon ? couponDiscount(subtotal, coupon) : 0
  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE
  const total = Math.round((subtotal - discount + shipping) * 100) / 100
  return { subtotal, discount, shipping, total, coupon }
}
