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
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary/80">{eyebrow}</p>
      <h2 id={headingId} className="mt-1.5 text-2xl font-bold tracking-tight sm:text-3xl">
        {title}
      </h2>
      {sub ? <p className="mt-1 text-sm text-muted-foreground sm:text-base">{sub}</p> : null}
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
      className="relative overflow-hidden bg-gradient-to-br from-orange-50 via-amber-50/60 to-rose-50 dark:from-orange-950/30 dark:via-amber-950/15 dark:to-rose-950/20"
    >
      <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-primary/10 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-rose-400/10 blur-3xl" aria-hidden />
      <div className="mx-auto max-w-7xl px-4 py-14 lg:py-20">
        <motion.div {...inView()} className="mx-auto max-w-3xl text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary/80">About Vendora</p>
          <h1
            id="about-hero-heading"
            className="mt-2 text-3xl font-extrabold leading-[1.12] tracking-tight sm:text-4xl lg:text-5xl"
          >
            The renewable-energy platform:{' '}
            <span className="bg-gradient-to-r from-orange-600 to-amber-500 bg-clip-text text-transparent">
              shop it, procure it, fund it.
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
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
                    className="inline-flex items-center gap-1.5 rounded-full border bg-background/80 px-4 py-2 text-sm font-semibold shadow-sm backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                  >
                    <pillar.icon size={15} className="text-primary" aria-hidden />
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
    <section aria-labelledby="who-we-are-heading" className="mx-auto max-w-7xl px-4 py-12 sm:py-14">
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <motion.div {...inView()}>
          <SectionHeader headingId="who-we-are-heading" eyebrow="Our story" title="Who we are" />
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Going solar means navigating equipment quality, bulk procurement and financing — three
            different skills, three different industries, and usually three different headaches.
            Buyers worry about panel grades and battery chemistry, businesses lose days chasing
            quotes, and promising projects stall while the money is arranged elsewhere.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Vendora puts all three under one roof: an engineer-reviewed marketplace of solar
            equipment, a B2B engine for RFQs and recurring procurement, and a growing network of
            verified funding entities. A project can go from first quote to funded installation
            without ever leaving the platform.
          </p>
        </motion.div>
        <motion.div {...inView(0.12)} className="relative">
          <div className="overflow-hidden rounded-3xl border-4 border-background shadow-2xl shadow-orange-900/10">
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
            className="absolute -left-4 bottom-8 hidden rounded-2xl border bg-background/95 p-3 shadow-xl backdrop-blur sm:flex sm:items-center sm:gap-3"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <BadgeCheck size={18} aria-hidden />
            </span>
            <div>
              <p className="text-sm font-bold leading-tight">Engineer-reviewed</p>
              <p className="text-xs text-muted-foreground">Every listing, sized right</p>
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
    <section aria-labelledby="vision-mission-heading" className="border-y bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:py-14">
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
              className="rounded-2xl border bg-card p-6 transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <item.icon size={20} aria-hidden />
              </span>
              <h3 className="mt-4 text-base font-bold">{item.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.text}</p>
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
    <section aria-labelledby="values-heading" className="mx-auto max-w-7xl px-4 py-12 sm:py-14">
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
            className="rounded-2xl border bg-card p-5 transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <value.icon size={20} aria-hidden />
            </span>
            <h3 className="mt-4 text-base font-bold">{value.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{value.text}</p>
          </motion.article>
        ))}
      </div>
    </section>
  )
}

/* ── By the numbers (live DB counts via props) ─────────────────────── */

export function AboutStats({ stats }: { stats: { value: number; label: string }[] }) {
  return (
    <section aria-labelledby="about-stats-heading" className="mx-auto max-w-7xl px-4 py-12 sm:py-14">
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
        className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-4"
      >
        {stats.map((stat) => (
          <div key={stat.label} className="bg-card p-6 text-center">
            <dd className="text-2xl font-extrabold tabular-nums text-primary sm:text-3xl">
              {stat.value.toLocaleString('en-US')}
            </dd>
            <dt className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {stat.label}
            </dt>
          </div>
        ))}
      </motion.dl>
    </section>
  )
}

/* ── CTA band ──────────────────────────────────────────────────────── */

export function AboutCta() {
  return (
    <section aria-labelledby="about-cta-heading" className="mx-auto max-w-7xl px-4 pb-14 pt-2">
      <motion.div
        {...inView()}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-600 via-amber-600 to-rose-600 px-6 py-12 text-center sm:px-12 sm:py-16"
      >
        <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-white/10 blur-3xl" aria-hidden />
        <div className="relative">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/80">Work with us</p>
          <h2
            id="about-cta-heading"
            className="mx-auto mt-2 max-w-2xl text-2xl font-extrabold tracking-tight text-white sm:text-3xl"
          >
            Let&apos;s get your project done.
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-white/85 sm:text-base">
            Whether you&apos;re buying your first panel, equipping a farm, or financing a company-wide
            rollout — the team is one message away.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button
              size="lg"
              asChild
              className="rounded-xl bg-white text-orange-700 shadow-lg shadow-orange-950/20 hover:bg-orange-50"
            >
              <Link href="/contact">
                Work with us <ArrowRight size={16} className="ml-1" aria-hidden />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              asChild
              className="rounded-xl border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            >
              <Link href="/market">Explore the market</Link>
            </Button>
          </div>
        </div>
      </motion.div>
    </section>
  )
}
