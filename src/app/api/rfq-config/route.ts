import { NextResponse } from 'next/server'
import { resolvePanel } from '@/server/modules/settings/service'

// GET /api/rfq-config — public display flags the RFQ surfaces honor
// (MOQ visibility, tier ladders, stock visibility, seller-rating chips,
// expiry defaults). Read-only, cached server-side.

export async function GET() {
  try {
    const [moq, tiers, stockHold, rating, expiry, disputes, recurring] = await Promise.all([
      resolvePanel('moq'),
      resolvePanel('tieredPricing'),
      resolvePanel('stockHold'),
      resolvePanel('sellerRating'),
      resolvePanel('rfqExpiry'),
      resolvePanel('disputes'),
      resolvePanel('recurring'),
    ])
    return NextResponse.json({
      moq: { enabled: moq.enabled, showToBuyer: moq.showToBuyer, displayStyle: moq.displayStyle },
      tiers: { buyerSeesTiers: tiers.enabled && tiers.buyerSeesTiers, showSavings: tiers.showSavings },
      stock: { showToBuyer: stockHold.enabled && stockHold.showStockToBuyer, lowThreshold: stockHold.lowStockThreshold },
      rating: {
        show: rating.show,
        showStars: rating.showStars,
        showReviewCount: rating.showReviewCount,
        showVerificationBadge: rating.showVerificationBadge,
        showMemberSince: rating.showMemberSince,
        minReviews: rating.minReviews,
      },
      expiry: {
        enabled: expiry.enabled,
        defaultDays: expiry.defaultDays,
        minDays: expiry.minDays,
        maxDays: expiry.maxDays,
        buyerOverride: expiry.buyerOverride,
      },
      disputes: {
        enabled: disputes.enabled,
        windowDays: disputes.windowDays,
        reasons: (disputes.reasons ?? []) as string[],
        buyerCancelOwn: disputes.buyerCancelOwn,
        sellerResponseDays: disputes.sellerResponseDays,
        showDisputeCount: rating.show && rating.showDisputeCount,
      },
      recurring: {
        enabled: recurring.enabled,
        patterns: (recurring.patterns ?? []) as string[],
        buyerSkipCycle: recurring.buyerSkipCycle,
      },
    })
  } catch (err) {
    console.error('[api/rfq-config] failed', err)
    return NextResponse.json({ error: 'Failed to load RFQ configuration' }, { status: 500 })
  }
}
