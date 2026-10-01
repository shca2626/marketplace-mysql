'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Handshake,
  Landmark,
  Leaf,
  Scale,
  ShoppingBag,
  Sun,
  Target,
  Telescope,
  Wrench,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { HERO_COLLAGE } from '@/lib/constants'

/**
 * /about client sections (pagedesign.md §5.4) — story, vision & mission,
 * values and the live stats band. The page (server component) passes the
 * DB counts into <AboutStats />.
 * Vendora "bh" system: navy gradient hero + CTA band, white cards with gold
 * icon tiles, navy headings, flat light sections in between.
 */

/** Subtle whileInView reveal — shared section rhythm (style guide §motion). */
function inView(delay = 0) {
  return {
    initial: { opacity: 0, y: 12 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true },
    transition: { duration: 0.35, delay },
  }
}

function SectionHeader({
  eyebrow,
  title,
  sub,
  headingId,
}: {
  eyebrow: string
  title: string
  sub?: string
  headingId?: string
}) {
  return (
    <div className="max-w-2xl">
      <p className="inline-flex items-center gap-1.5 rounded-full border border-bh-gold/25 bg-bh-bg-gold px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-bh-gold-dark">
        {eyebrow}
      </p>
      <h2 id={headingId} className="h2-practical mt-3 text-balance tracking-tight text-bh-navy sm:text-2xl lg:text-3xl">
        {title}
      </h2>
      {sub ? <p className="mt-1 text-sm text-bh-subtle sm:text-base">{sub}</p> : null}
    </div>
  )
}

/* ── Hero — mission statement ──────────────────────────────────────── */

const PILLARS = [
  { href: '/market', icon: ShoppingBag, label: 'Shop' },
  { href: '/market?view=rfqs', icon: Building2, label: 'Buy for business' },
  { href: '/funding', icon: Landmark, label: 'Fund' },
]

export function AboutHero() {
  return (
    <section
      aria-labelledby="about-hero-heading"
      className="relative overflow-hidden bg-gradient-to-br from-[#052e56] via-[#06396c] to-[#0a4a8c] text-white"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-bh-gold/20 blur-[120px]" />
        <div className="absolute -right-24 top-10 h-80 w-80 rounded-full bg-bh-gold/10 blur-[100px]" />
        <div
          className="absolute inset-0 opacity-[0.13]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(211,175,60,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(211,175,60,0.14) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
            maskImage: 'radial-gradient(ellipse 85% 70% at 50% 0%, black, transparent)',
          }}
        />
        <Sun className="absolute right-[12%] top-16 h-40 w-40 text-bh-gold/15" strokeWidth={0.8} />
      </div>
      <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:py-20 lg:px-8">
        <motion.div {...inView()} className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-bh-gold/30 bg-bh-gold/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-bh-gold">
            About Vendora
          </span>
          <h1
            id="about-hero-heading"
            className="mt-5 text-balance text-3xl font-extrabold leading-[1.12] tracking-tight text-white sm:text-4xl lg:text-[2.75rem]"
          >
            The renewable-energy platform:{' '}
            <span className="bg-gradient-to-r from-bh-gold-light to-bh-gold bg-clip-text text-transparent">
              shop it, procure it, fund it.
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-pretty text-base leading-relaxed text-white/75 sm:text-lg">
            Vendora exists so that going solar never requires becoming a solar expert — buyers, farms
            and businesses get vetted equipment, real procurement leverage and verified financing on
            a single platform.
          </p>
          <nav aria-label="The three pillars of Vendora" className="mt-7">
            <ul className="flex flex-wrap justify-center gap-2.5">
              {PILLARS.map((pillar) => (
                <li key={pillar.label}>
                  <Link
                    href={pillar.href}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:border-bh-gold/50 hover:bg-white/15"
                  >
                    <pillar.icon size={15} className="text-bh-gold" aria-hidden />
                    {pillar.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </motion.div>
      </div>
    </section>
  )
}

/* ── Who we are ────────────────────────────────────────────────────── */

export function AboutStory() {
  return (
    <section aria-labelledby="who-we-are-heading" className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <motion.div {...inView()}>
          <SectionHeader headingId="who-we-are-heading" eyebrow="Our story" title="Who we are" />
          <p className="mt-4 text-sm leading-relaxed text-bh-subtle sm:text-base">
            Going solar means navigating equipment quality, bulk procurement and financing — three
            different skills, three different industries, and usually three different headaches.
            Buyers worry about panel grades and battery chemistry, businesses lose days chasing
            quotes, and promising projects stall while the money is arranged elsewhere.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-bh-subtle sm:text-base">
            Vendora puts all three under one roof: an engineer-reviewed marketplace of solar
            equipment, a B2B engine for RFQs and recurring procurement, and a growing network of
            verified funding entities. A project can go from first quote to funded installation
            without ever leaving the platform.
          </p>
        </motion.div>
        <motion.div {...inView(0.12)} className="relative">
          <div className="overflow-hidden rounded-2xl border-4 border-white shadow-hover">
            <img
              src={HERO_COLLAGE[0]}
              alt="Solar array glowing at sunrise"
              className="aspect-[4/3] w-full object-cover"
              loading="lazy"
              decoding="async"
            />
          </div>
          <motion.div
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute -left-4 bottom-8 hidden rounded-2xl border border-bh-border bg-bh-card/95 p-3 shadow-hover backdrop-blur sm:flex sm:items-center sm:gap-3"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-bh-bg-gold text-bh-gold">
              <BadgeCheck size={18} aria-hidden />
            </span>
            <div>
              <p className="text-sm font-bold leading-tight text-bh-navy">Engineer-reviewed</p>
              <p className="text-xs text-bh-muted">Every listing, sized right</p>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}

/* ── Vision & mission ──────────────────────────────────────────────── */

const DIRECTION = [
  {
    icon: Telescope,
    title: 'Vision',
    text: 'A region where every home, farm and business runs on sunlight — where clean energy is the obvious choice because it is the easy one.',
  },
  {
    icon: Target,
    title: 'Mission',
    text: 'Make solar happen: connect buyers with vetted equipment, give businesses real procurement leverage, and bring verified financing to the projects that need it.',
  },
]

export function AboutVisionMission() {
  return (
    <section aria-labelledby="vision-mission-heading" className="border-y border-bh-border bg-bh-card">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
        <motion.div {...inView()}>
          <SectionHeader
            headingId="vision-mission-heading"
            eyebrow="Direction"
            title="Vision & mission"
            sub="Why the platform exists, and what it is here to do."
          />
        </motion.div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {DIRECTION.map((item, i) => (
            <motion.article
              key={item.title}
              {...inView(0.08 + i * 0.08)}
              className="rounded-2xl border border-bh-border bg-bh-card p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-bh-gold/40 hover:shadow-hover"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-bh-bg-gold text-bh-gold">
                <item.icon size={20} aria-hidden />
              </span>
              <h3 className="mt-4 text-base font-bold text-bh-navy">{item.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-bh-subtle">{item.text}</p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── Values ────────────────────────────────────────────────────────── */

const VALUES = [
  {
    icon: Wrench,
    title: 'Engineering quality',
    text: 'Listings are reviewed by people who understand systems, not just SKUs — honest specs and sizing guidance come standard.',
  },
  {
    icon: Scale,
    title: 'Transparency',
    text: 'Clear pricing, real reviews, and financing terms you can read before you sign — no hidden margins, no surprises.',
  },
  {
    icon: Handshake,
    title: 'Partnership',
    text: 'Sellers, buyers, businesses and funding entities succeed together. We build for the long term, not the quick sale.',
  },
  {
    icon: Leaf,
    title: 'Impact',
    text: 'Every funded panel and every pumping system is a step past fuel dependency — measured in savings made and emissions avoided.',
  },
]

export function AboutValues() {
  return (
    <section aria-labelledby="values-heading" className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
      <motion.div {...inView()}>
        <SectionHeader
          headingId="values-heading"
          eyebrow="Values"
          title="What we hold ourselves to"
          sub="Four rules that decide what ships and what doesn't."
        />
      </motion.div>
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {VALUES.map((value, i) => (
          <motion.article
            key={value.title}
            {...inView(0.08 + i * 0.06)}
            className="rounded-2xl border border-bh-border bg-bh-card p-5 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-bh-gold/40 hover:shadow-hover"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-bh-bg-gold text-bh-gold">
              <value.icon size={20} aria-hidden />
            </span>
            <h3 className="mt-4 text-base font-bold text-bh-navy">{value.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-bh-subtle">{value.text}</p>
          </motion.article>
        ))}
      </div>
    </section>
  )
}

/* ── By the numbers (live DB counts via props) ─────────────────────── */

export function AboutStats({ stats }: { stats: { value: number; label: string }[] }) {
  return (
    <section aria-labelledby="about-stats-heading" className="border-y border-bh-border bg-bh-card">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
        <motion.div {...inView()}>
          <SectionHeader
            headingId="about-stats-heading"
            eyebrow="By the numbers"
            title="The platform today"
            sub="Live from the Vendora database — products, sellers, reviews and orders, right now."
          />
        </motion.div>
        <motion.dl
          {...inView(0.1)}
          className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-bh-border bg-bh-border shadow-card sm:grid-cols-4"
        >
          {stats.map((stat) => (
            <div key={stat.label} className="bg-bh-card p-6 text-center">
              <dd className="text-2xl font-extrabold tabular-nums text-bh-navy sm:text-3xl">
                {stat.value.toLocaleString('en-US')}
              </dd>
              <dt className="mt-1 text-xs font-medium uppercase tracking-wide text-bh-muted">
                {stat.label}
              </dt>
            </div>
          ))}
        </motion.dl>
      </div>
    </section>
  )
}

/* ── CTA band ──────────────────────────────────────────────────────── */

export function AboutCta() {
  return (
    <section aria-labelledby="about-cta-heading" className="relative overflow-hidden bg-gradient-to-br from-[#052e56] via-[#06396c] to-[#0a4a8c] py-14 text-white sm:py-16">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-bh-gold/20 blur-[110px]" />
        <div className="absolute -right-16 bottom-0 h-72 w-72 rounded-full bg-bh-gold/10 blur-[100px]" />
        <div
          className="absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(211,175,60,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(211,175,60,0.14) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
            maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black, transparent)',
          }}
        />
      </div>
      <div className="relative mx-auto max-w-2xl px-4 text-center sm:px-6">
        <motion.div {...inView()}>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-bh-gold/30 bg-bh-gold/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-bh-gold">
            Work with us
          </span>
          <h2
            id="about-cta-heading"
            className="mt-5 text-balance text-2xl font-bold tracking-tight text-white sm:text-3xl"
          >
            Let&apos;s get your project done.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-pretty text-[15px] leading-relaxed text-white/75">
            Whether you&apos;re buying your first panel, equipping a farm, or financing a company-wide
            rollout — the team is one message away.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button
              size="lg"
              asChild
              className="min-h-12 rounded-xl bg-bh-gold px-7 text-base font-bold text-bh-navy-deep hover:bg-bh-gold-light"
            >
              <Link href="/contact">
                Work with us <ArrowRight size={16} className="ml-1" aria-hidden />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              asChild
              className="min-h-12 rounded-xl border-white/25 bg-transparent px-7 text-base text-white hover:bg-white/10 hover:text-white"
            >
              <Link href="/market">Explore the market</Link>
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
