// ── Platform pricing rules ──────────────────────────────────────────────
// Single source of truth for shipping + coupon math, used by BOTH the API
// (authoritative) and the UI (display-only preview). The server always
// recomputes from DB prices at order time.

export const FREE_SHIPPING_THRESHOLD = 75
export const SHIPPING_FEE = 6.99

export interface Coupon {
  code: string
  percentOff: number
  description: string
  /** Restrict to a buyer's first-ever order (e.g. WELCOME10). */
  firstOrderOnly: boolean
  /** Minimum pre-discount subtotal required to use the coupon. */
  minSubtotal: number
}

// Advertised in the header announcement bar. Keep codes uppercase & exact.
export const COUPONS: Record<string, Coupon> = {
  WELCOME10: {
    code: 'WELCOME10',
    percentOff: 10,
    description: '10% off your first order',
    firstOrderOnly: true,
    minSubtotal: 0,
  },
}

export function findCoupon(rawCode: string): Coupon | null {
  const code = rawCode.trim().toUpperCase()
  if (!code) return null
  return COUPONS[code] ?? null
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
