import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Breadcrumbs } from '@/components/site/breadcrumbs'
import { PageHero } from '@/components/site/kit'
import { Button } from '@/components/ui/button'
import {
  EntityDirectory,
  FaqBand,
  FinalCta,
  HowFundingWorks,
  PartnersBand,
  ProgramExplorer,
  RequirementBoard,
  StoryWall,
} from '@/components/site/funding/sections'
import {
  getFaqs,
  getFundingEntities,
  getFundingPrograms,
  getFundingStats,
  getGeneralRequirements,
  getPartners,
  getSiteSteps,
  getStories,
} from '@/lib/site-content'

/**
 * /funding — the public home of the financing module.
 * Server component: every section is DB-driven via src/lib/site-content.ts
 * fetchers (verified entities, live programs, requirements, stories, steps,
 * partners, FAQ, stats) — no hardcoded content. The authenticated wizard
 * stays at /market?view=financing.
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
  const [stats, steps, entities, programs, requirements, stories, partners, faqs] = await Promise.all([
    getFundingStats(),
    getSiteSteps('FUNDING'),
    getFundingEntities(),
    getFundingPrograms(),
    getGeneralRequirements(),
    getStories(),
    getPartners(),
    getFaqs('FUNDING'),
  ])

  return (
    <>
      <Breadcrumbs items={[{ label: 'Funding' }]} />

      {/* 1 · dark editorial hero with live stats */}
      <PageHero
        eyebrow="Funding"
        eyebrowIcon="HandCoins"
        title={
          <>
            Fund your solar project with{' '}
            <span className="bg-gradient-to-r from-amber-300 to-orange-400 bg-clip-text text-transparent">verified entities</span>
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
        <Button asChild size="lg" className="min-h-12 rounded-xl px-7 text-base">
          <Link href="/market?view=financing">
            Apply for funding <ArrowRight className="ml-1" aria-hidden />
          </Link>
        </Button>
        <Button
          asChild
          size="lg"
          variant="outline"
          className="min-h-12 rounded-xl border-zinc-700 bg-transparent px-7 text-base text-zinc-200 hover:bg-zinc-900 hover:text-zinc-50"
        >
          <Link href="#programs">
            Explore programs <ArrowRight className="ml-1" aria-hidden />
          </Link>
        </Button>
      </PageHero>

      {/* 2 · how funding works (steps from the DB, curved transition from hero) */}
      <HowFundingWorks steps={steps} />

      {/* 3 · verified entities directory */}
      <EntityDirectory entities={entities} />

      {/* 4 · financing programs (client-side category filter) */}
      <ProgramExplorer programs={programs} />

      {/* 5 · eligibility & documents (grouped by condition type) */}
      <RequirementBoard requirements={requirements} />

      {/* 6 · success stories (dark editorial band) */}
      <StoryWall stories={stories} stats={stats} />

      {/* 7 · partners marquee */}
      <PartnersBand partners={partners} />

      {/* 8 · FAQ */}
      <FaqBand faqs={faqs} />

      {/* 9 · final CTA */}
      <FinalCta />
    </>
  )
}
