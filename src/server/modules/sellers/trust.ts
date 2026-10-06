import { db } from '@/lib/db'
import { computeUserKycLevel } from '@/server/modules/kyc/service'
import type { StoreTrustDTO } from '@/lib/types'

// ─────────────────────────────────────────────────────────────────────────────
// STORE TRUST COUNTERS — Phase 12-c (lastplan v5 §12), shared computation.
//
// Both store surfaces tell the same story: the SPA StoreView (via
// /api/sellers/[id]) and the server-rendered SEO page (/market/store/[id] via
// getPublicStore) call THIS function. Every number traces to a live query;
// absent history is null (rendered as an em dash, never invented):
//   ordersFulfilled — order items of this seller joined (OrderFulfillmentItem)
//                     to a DELIVERED fulfillment (the model's terminal success)
//   disputeFree     — true only when rate === 0 AND ≥ 5 orders; below 5 the
//                     counter is "too early" (null), never a fake 100%
//   onTimeRate      — DELIBERATELY ABSENT: OrderFulfillment carries no
//                     promised-vs-actual timestamps (12-c model audit)
//   badge           — VERIFIED_BUSINESS (SellerProfile VERIFIED) >
//                     IDENTITY_VERIFIED (KYC L2) > NEW_SELLER
// ─────────────────────────────────────────────────────────────────────────────

export async function computeStoreTrust(
  sellerId: string,
  sellerCreatedAt: Date
): Promise<StoreTrustDTO> {
  const [ordersFulfilled, sellerOrderRows, disputeOrderRows, sellerProfile, kycLevel] =
    await Promise.all([
      db.orderItem.count({
        where: {
          sellerId,
          fulfillmentItems: { some: { fulfillment: { status: 'DELIVERED' } } },
        },
      }),
      db.orderItem.findMany({
        where: { sellerId },
        select: { orderId: true },
        distinct: ['orderId'],
      }),
      db.dispute.findMany({
        where: { sellerId },
        select: { orderId: true },
        distinct: ['orderId'],
      }),
      db.sellerProfile.findFirst({
        where: { ownerUserId: sellerId },
        select: {
          verificationState: true,
          organization: { select: { kycLevel: true } },
        },
      }),
      computeUserKycLevel(sellerId),
    ])

  const ordersTotal = sellerOrderRows.length
  const ordersWithDispute = disputeOrderRows.length
  const disputeRate =
    ordersTotal > 0 ? Math.round((ordersWithDispute / ordersTotal) * 1000) / 10 : null
  const disputeFree = ordersTotal >= 5 ? ordersWithDispute === 0 : null // null = too early

  const verificationState = sellerProfile?.verificationState ?? null
  const orgKycLevel = sellerProfile?.organization.kycLevel ?? null

  const badge: StoreTrustDTO['badge'] =
    verificationState === 'VERIFIED'
      ? 'VERIFIED_BUSINESS'
      : kycLevel >= 2
        ? 'IDENTITY_VERIFIED'
        : 'NEW_SELLER'

  const memberYears =
    Math.round(((Date.now() - sellerCreatedAt.getTime()) / (365.25 * 24 * 3600 * 1000)) * 10) / 10

  return {
    ordersFulfilled,
    ordersTotal,
    ordersWithDispute,
    disputeRate,
    disputeFree,
    kycLevel,
    verificationState,
    orgKycLevel,
    badge,
    memberYears,
  }
}
