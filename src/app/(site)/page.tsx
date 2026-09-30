import type { Metadata } from 'next'
import { PlatformHero } from '@/components/site/platform-hero'
import { ThreePillars } from '@/components/site/three-pillars'
import { MarketPreview } from '@/components/site/market-preview'
import { FundingPreview } from '@/components/site/funding-preview'
import { B2BPreview } from '@/components/site/b2b-preview'
import { StatsBar } from '@/components/site/stats-bar'
import { Testimonials } from '@/components/site/testimonials'
import { FinalCta } from '@/components/site/final-cta'

export const metadata: Metadata = {
  title: 'Vendora — Solar energy, bought, procured and funded in one place',
  description:
    'The renewable energy platform: shop engineer-reviewed solar panels, batteries, inverters and pumps, procure in bulk with RFQs, and finance your project with verified funding entities.',
  keywords: [
    'solar energy platform',
    'renewable energy',
    'solar marketplace',
    'solar financing',
    'solar panels wholesale',
    'solar RFQ',
    'Vendora',
  ],
  openGraph: {
    title: 'Vendora — Solar energy, bought, procured and funded',
    description:
      'Shop the market, buy as a business, and fund your solar project — all on one platform.',
    siteName: 'Vendora',
    type: 'website',
  },
}

/**
 * Platform homepage (pagedesign.md §5.1) — a composite of sections from the
 * other pages (market, funding, B2B) so a visitor understands the whole
 * platform at first glance. The market itself lives at /market.
 */
export default function HomePage() {
  return (
    <>
      {/* S1 — platform identity */}
      <PlatformHero />
      {/* S2 — the three pillars */}
      <ThreePillars />
      {/* S3 — market section (same components as the market page) */}
      <MarketPreview />
      {/* S4 — funding entities section */}
      <FundingPreview />
      {/* S5 — B2B procurement section */}
      <B2BPreview />
      {/* S6 — live numbers */}
      <StatsBar />
      {/* S7 — social proof */}
      <Testimonials />
      {/* S8 — final CTA + newsletter */}
      <FinalCta />
    </>
  )
}
