import type { Metadata } from 'next'
import * as React from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getSiteSteps } from '@/lib/site-content'
import {
  Icon,
  PageHero,
  Reveal,
  Section,
  SectionContainer,
  SectionHead,
} from '@/components/site/kit'
import { HowItWorksTracks } from '@/components/site/pages/how-it-works-tracks'
import { CtaBand } from '@/components/site/pages/cta-band'

export const metadata: Metadata = {
  title: 'How it works — Vendora',
  description:
    'One platform, three ways to go solar: shop the engineer-reviewed market, procure in bulk with B2B RFQs, or fund your project with verified financing entities.',
}

/** Fixed UI labels for the comparison strip (labels only — facts come from the DB steps). */
const COMPARE: {
  key: 'SHOP' | 'PROCURE' | 'FUND'
  label: string
  icon: string
  accent: string
  who: string
  what: string
  where: { href: string; label: string }
}[] = [
  {
    key: 'SHOP',
    label: 'Shop',
    icon: 'ShoppingCart',
    accent: '#d97706',
    who: 'Households and small buyers',
    what: 'Retail shopping with engineer-reviewed specs',
    where: { href: '/market', label: 'The market' },
  },
  {
    key: 'PROCURE',
    label: 'Buy as a business',
    icon: 'Building2',
    accent: '#059669',
    who: 'Companies, farms and institutions',
    what: 'RFQs, bulk quotes, approvals and recurring cycles',
    where: { href: '/market?view=rfqs', label: 'B2B RFQ console' },
  },
  {
    key: 'FUND',
    label: 'Fund your project',
    icon: 'Landmark',
    accent: '#b45309',
    who: 'Anyone financing a solar project',
    what: 'Binding offers from verified funding entities',
    where: { href: '/funding', label: 'The funding hub' },
  },
]

export default async function HowItWorksPage() {
  const [shop, procure, fund] = await Promise.all([
    getSiteSteps('HOW_WORKS', 'SHOP'),
    getSiteSteps('HOW_WORKS', 'PROCURE'),
    getSiteSteps('HOW_WORKS', 'FUND'),
  ])
  const tracks = { SHOP: shop, PROCURE: procure, FUND: fund }

  return (
    <>
      <PageHero
        eyebrow="How it works"
        title="One platform, three ways to go solar"
        sub="Shop the market as a household, procure in bulk as a business, or fund the whole project with verified entities — the same platform carries all three paths, end to end."
        art="grid"
      >
        <Button asChild size="lg" className="h-12 rounded-full px-6 text-base">
          <Link href="/market">
            Browse the market
            <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
          </Link>
        </Button>
        <Button
          asChild
          size="lg"
          variant="outline"
          className="h-12 rounded-full border-amber-400/40 bg-amber-400/5 px-6 text-base text-amber-200 hover:bg-amber-400/15 hover:text-amber-100"
        >
          <Link href="/funding">Get funding</Link>
        </Button>
      </PageHero>

      {/* Interactive track switcher */}
      <Section tone="light" className="py-14 sm:py-16">
        <SectionContainer>
          <SectionHead
            eyebrow="Pick your path"
            eyebrowIcon="Repeat"
            title="Choose how you want to go solar"
            sub="Select a pillar to see its journey — every step below is live from the platform playbook."
          />
          <div className="mt-10">
            <HowItWorksTracks tracks={tracks} />
          </div>
        </SectionContainer>
      </Section>

      {/* Compare the three paths */}
      <Section tone="muted" className="py-14 sm:py-16">
        <SectionContainer>
          <SectionHead
            eyebrow="At a glance"
            eyebrowIcon="GitCompareArrows"
            title="Compare the three paths"
            sub="Same platform, different doors — here is how they differ before you commit."
          />
          <Reveal className="mt-10">
            <div className="overflow-hidden rounded-3xl border bg-card">
              {/* Desktop table */}
              <div className="hidden lg:grid lg:grid-cols-[150px_repeat(3,1fr)]">
                <div className="border-b border-r bg-muted/60" aria-hidden />
                {COMPARE.map((c) => (
                  <div key={c.key} className="flex items-center gap-2.5 border-b border-l p-5">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                      style={{ backgroundColor: `${c.accent}14`, color: c.accent }}
                    >
                      <Icon name={c.icon} className="h-4.5 w-4.5" />
                    </span>
                    <p className="font-bold tracking-tight">{c.label}</p>
                  </div>
                ))}
                {[
                  { label: 'Who it’s for', get: (c: (typeof COMPARE)[number]) => c.who },
                  { label: 'What you get', get: (c: (typeof COMPARE)[number]) => c.what },
                ].map((row) => (
                  <React.Fragment key={row.label}>
                    <div className="flex items-center border-b border-r bg-muted/60 p-5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      {row.label}
                    </div>
                    {COMPARE.map((c) => (
                      <div key={c.key} className="border-b border-l p-5 text-sm text-muted-foreground">
                        {row.get(c)}
                      </div>
                    ))}
                  </React.Fragment>
                ))}
                <div className="flex items-center border-r bg-muted/60 p-5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Where it starts
                </div>
                {COMPARE.map((c) => (
                  <div key={c.key} className="flex flex-col gap-2 border-l p-5">
                    <Link
                      href={c.where.href}
                      className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-xl px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                      style={{ color: c.accent }}
                    >
                      {c.where.label}
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </Link>
                    {tracks[c.key][0]?.title ? (
                      <span className="text-xs text-muted-foreground">Starts with “{tracks[c.key][0]!.title}”</span>
                    ) : null}
                  </div>
                ))}
              </div>

              {/* Mobile stacked cards */}
              <div className="divide-y lg:hidden">
                {COMPARE.map((c) => (
                  <div key={c.key} className="p-5">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                        style={{ backgroundColor: `${c.accent}14`, color: c.accent }}
                      >
                        <Icon name={c.icon} className="h-4.5 w-4.5" />
                      </span>
                      <p className="font-bold tracking-tight">{c.label}</p>
                    </div>
                    <dl className="mt-4 space-y-3 text-sm">
                      <div className="flex flex-col gap-0.5">
                        <dt className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Who it’s for</dt>
                        <dd className="text-muted-foreground">{c.who}</dd>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <dt className="text-xs font-bold uppercase tracking-wider text-muted-foreground">What you get</dt>
                        <dd className="text-muted-foreground">{c.what}</dd>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <dt className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Where it starts</dt>
                        <dd>
                          <Link
                            href={c.where.href}
                            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl text-sm font-semibold"
                            style={{ color: c.accent }}
                          >
                            {c.where.label}
                            <ArrowRight className="h-4 w-4" aria-hidden />
                          </Link>
                        </dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </SectionContainer>
      </Section>

      <CtaBand
        eyebrow="Ready when you are"
        title="Three paths, one platform — pick yours today"
        sub="Browse engineer-reviewed gear, send your first RFQ, or submit a funding request in about ten minutes."
        primary={{ label: 'Browse the market', href: '/market' }}
        secondary={{ label: 'Get funding', href: '/funding' }}
      />
    </>
  )
}
