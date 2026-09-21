import { NextResponse } from 'next/server'
import { resolvePanel } from '@/server/modules/settings/service'

// GET /api/rfq-config — public display flags the RFQ surfaces honor
// (MOQ visibility, tier ladders, stock visibility, seller-rating chips,
// expiry defaults). Read-only, cached server-side.

export async function GET() {
  try {
    const [moq, tiers, stockHold, rating, expiry] = await Promise.all([
      resolvePanel('moq'),
      resolvePanel('tieredPricing'),
      resolvePanel('stockHold'),
      resolvePanel('sellerRating'),
      resolvePanel('rfqExpiry'),
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
    })
  } catch (err) {
    console.error('[api/rfq-config] failed', err)
    return NextResponse.json({ error: 'Failed to load RFQ configuration' }, { status: 500 })
  }
}
