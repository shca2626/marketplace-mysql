import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { db } from '@/lib/db'
import { getFaqs, getSiteSteps } from '@/lib/site-content'
import {
  FaqAccordion,
  GlowCard,
  IconTile,
  PageHero,
  RevealGroup,
  RevealItem,
  Section,
  SectionContainer,
  SectionHead,
  StepFlow,
} from '@/components/site/kit'
import { CtaBand } from '@/components/site/pages/cta-band'

export const metadata: Metadata = {
  title: 'Sell on Vendora — Vendora',
  description:
    'Open a solar storefront on Vendora: vetted buyer traffic, B2B RFQs delivered to your console, engineer-reviewed spec templates, and financing that grows your basket.',
}

/** Why-sell bento tiles — fixed UI labels for the seller value props. */
const BENEFITS: { icon: string; title: string; body: string }[] = [
  {
    icon: 'Search',
    title: 'Vetted buyer traffic',
    body: 'Your listings reach households, farms and businesses that arrived ready to buy solar — not window shoppers.',
  },
  {
    icon: 'FileSpreadsheet',
    title: 'B2B RFQs land in your console',
    body: 'Companies publish exactly what they need, in quantity. Quote once, win the whole order — with your own price lists.',
  },
  {
    icon: 'BadgeCheck',
    title: 'Engineer-reviewed spec templates',
    body: 'List against templates our engineers already validated: wattage, yield, compatibility. Fewer disputes, fewer returns.',
  },
  {
    icon: 'HandCoins',
    title: 'Financing grows your basket',
    body: 'When buyers fund through platform entities, carts grow from single panels to full systems — and the entity pays you directly.',
  },
]

/** Live marketplace counts — fail soft to zeros, the hero hides empty rows. */
async function getSellStats() {
  try {
    const [products, sellers, orders] = await Promise.all([
      db.product.count({ where: { status: 'ACTIVE' } }),
      db.user.count({ where: { role: 'SELLER', status: 'ACTIVE' } }),
      db.order.count(),
    ])
    return { products, sellers, orders }
  } catch {
    return { products: 0, sellers: 0, orders: 0 }
  }
}

export default async function SellPage() {
  const [steps, faqs, stats] = await Promise.all([getSiteSteps('SELL'), getFaqs('SELL'), getSellStats()])

  return (
    <>
      <PageHero
        eyebrow="Sell on Vendora"
        title="Sell to a country going solar"
        sub="Open your storefront where buyers arrive with funded carts, engineers back your specs, and B2B orders land as RFQs in your console — not as phone calls."
        art="grid"
        stats={[
          { label: 'Products listed', value: stats.products, icon: 'Package' },
          { label: 'Active sellers', value: stats.sellers, icon: 'Store' },
          { label: 'Orders placed', value: stats.orders, icon: 'ShoppingCart' },
        ]}
      >
        <Button asChild size="lg" className="h-12 rounded-full px-6 text-base">
          <Link href="/market?view=register-company">
            Register your company
            <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
          </Link>
        </Button>
        <Button
          asChild
          size="lg"
          variant="outline"
          className="h-12 rounded-full border-white/25 bg-transparent px-6 text-base text-white hover:bg-white/10 hover:text-white"
        >
          <Link href="/market">See the market</Link>
        </Button>
      </PageHero>

      {/* Why sell — bento */}
      <Section tone="light" className="py-14 sm:py-16">
        <SectionContainer>
          <SectionHead
            eyebrow="Why sell here"
            eyebrowIcon="TrendingUp"
            title="Four reasons sellers stay"
            sub="Everything on this page exists because independent solar stores asked for it."
          />
          <RevealGroup className="mt-10 grid gap-5 sm:grid-cols-2" stagger={0.09}>
            {BENEFITS.map((b) => (
              <RevealItem key={b.title} className="h-full">
                <GlowCard className="flex h-full flex-col gap-4 sm:flex-row sm:items-start">
                  <IconTile name={b.icon} size="lg" />
                  <div className="min-w-0">
                    <h3 className="font-bold tracking-tight">{b.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-bh-subtle">{b.body}</p>
                  </div>
                </GlowCard>
              </RevealItem>
            ))}
          </RevealGroup>
        </SectionContainer>
      </Section>

      {/* Seller journey */}
      {steps.length > 0 && (
        <Section tone="muted" className="py-14 sm:py-16">
          <SectionContainer>
            <SectionHead
              eyebrow="From sign-up to first order"
              eyebrowIcon="Repeat"
              title="Opening your storefront, step by step"
              sub="Most sellers go from account to first listing in a single afternoon."
            />
            <div className="mt-10">
              <StepFlow steps={steps} />
            </div>
          </SectionContainer>
        </Section>
      )}

      {/* Seller FAQ */}
      {faqs.length > 0 && (
        <Section tone="light" className="py-14 sm:py-16">
          <SectionContainer className="max-w-3xl">
            <SectionHead
              eyebrow="Seller questions"
              eyebrowIcon="ShieldCheck"
              title="What sellers ask us most"
              align="center"
            />
            <div className="mt-8">
              <FaqAccordion items={faqs} defaultOpen={false} />
            </div>
          </SectionContainer>
        </Section>
      )}

      <CtaBand
        eyebrow="Your store is one afternoon away"
        title="List your first product this week"
        sub="Create your account, pass verification, and start with the engineer-reviewed spec templates — the buyers are already here."
        primary={{ label: 'Open your store', href: '/market?view=seller' }}
        secondary={{ label: 'Talk to us', href: '/contact' }}
        icon="Store"
      />
    </>
  )
}
