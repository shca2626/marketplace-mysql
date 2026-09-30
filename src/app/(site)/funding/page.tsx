import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { PageHero } from '@/components/site/kit'
import { Button } from '@/components/ui/button'
import {
  EntityDirectory,
  FaqBand,
  FinalCta,
  HowFundingWorks,
  PartnersBand,
  ProgramExplorer,
  StoryWall,
} from '@/components/site/funding/sections'
import {
  getFaqs,
  getFundingEntities,
  getFundingPrograms,
  getFundingStats,
  getPartners,
  getSiteSteps,
  getStories,
} from '@/lib/site-content'

/**
 * /funding — the public home of the financing module (bh light-first redesign).
 * Server component: every section is DB-driven via src/lib/site-content.ts
 * fetchers (verified entities, live programs, stories, steps, partners, FAQ,
 * stats) — no hardcoded content. The Eligibility/requirements section was
 * removed per the redesign critique (requirements live on program detail
 * pages as one text section). The authenticated wizard stays at
 * /market?view=financing.
 */

export const metadata: Metadata = {
  title: 'Funding — Vendora',
  description:
    'Finance your solar project with verified banks and microfinance institutions — installment plans, equipment leasing, project financing and working capital, reviewed and compared on Vendora.',
  openGraph: {
    title: 'Funding — Vendora',
    description:
      'Finance your solar project with verified banks and microfinance institutions — one request, multiple real offers, compared side by side.',
    type: 'website',
  },
}

export default async function FundingPage() {
  const [stats, steps, entities, programs, stories, partners, faqs] = await Promise.all([
    getFundingStats(),
    getSiteSteps('FUNDING'),
    getFundingEntities(),
    getFundingPrograms(),
    getStories(),
    getPartners(),
    getFaqs('FUNDING'),
  ])

  return (
    <>
      {/* 1 · navy hero with live stats */}
      <PageHero
        eyebrow="Funding"
        eyebrowIcon="HandCoins"
        title={
          <>
            Fund your solar project with{' '}
            <span className="bg-gradient-to-r from-bh-gold-light to-bh-gold bg-clip-text text-transparent">verified entities</span>
          </>
        }
        sub="Banks and microfinance institutions on Vendora review your project and respond with real offers — from equipment installments to full project financing."
        stats={[
          { icon: 'Landmark', label: 'Verified entities', value: stats.entities },
          { icon: 'HandCoins', label: 'Financing programs', value: stats.programs },
          { icon: 'Moon', label: 'Sharia-compliant programs', value: stats.shariaPrograms },
          { icon: 'MapPin', label: 'Regions covered', value: stats.regionsCovered },
        ]}
      >
        <Button asChild size="lg" className="min-h-12 bg-bh-gold px-7 text-base font-bold text-bh-navy-deep hover:bg-bh-gold-light">
          <Link href="/market?view=financing">
            Apply for funding <ArrowRight className="ml-1" aria-hidden />
          </Link>
        </Button>
        <Button
          asChild
          size="lg"
          variant="outline"
          className="min-h-12 border-white/25 bg-transparent px-7 text-base text-white hover:bg-white/10 hover:text-white"
        >
          <Link href="#programs">
            Explore programs <ArrowRight className="ml-1" aria-hidden />
          </Link>
        </Button>
      </PageHero>

      {/* 2 · how funding works (steps from the DB) */}
      <HowFundingWorks steps={steps} />

      {/* 3 · verified entities directory */}
      <EntityDirectory entities={entities} />

      {/* 4 · financing programs (client-side category filter) */}
      <ProgramExplorer programs={programs} />

      {/* 5 · success stories */}
      <StoryWall stories={stories} stats={stats} />

      {/* 6 · partners marquee */}
      <PartnersBand partners={partners} />

      {/* 7 · FAQ */}
      <FaqBand faqs={faqs} />

      {/* 8 · final CTA (navy band) */}
      <FinalCta />
    </>
  )
}
