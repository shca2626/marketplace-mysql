'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  FileSignature,
  FileText,
  Info,
  Landmark,
  Package,
  ShieldCheck,
  Wallet,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { HERO_COLLAGE } from '@/lib/constants'

/**
 * /funding client sections (pagedesign.md §5.3) — animated presentation layer
 * over the financing module. The page (server component) fetches the verified
 * institutions from the DB and passes them into <FundingEntities />.
 */

/** Serializable funding-entity projection rendered by the directory cards. */
export type FundingEntityCard = {
  id: string
  name: string
  typeLabel: string
  about: string
  regulator: string | null
}

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

/* ── Hero ─────────────────────────────────────────────────────────── */

const HERO_IMAGES = [
  { src: HERO_COLLAGE[0], alt: 'Solar field at sunrise' },
  { src: HERO_COLLAGE[1], alt: 'Home battery energy wall' },
  { src: HERO_COLLAGE[2], alt: 'Solar water pumping on a farm' },
  { src: HERO_COLLAGE[3], alt: 'Monocrystalline solar panel' },
]

export function FundingHero() {
  return (
    <section
      aria-labelledby="funding-hero-heading"
      className="relative overflow-hidden bg-gradient-to-br from-orange-50 via-amber-50/60 to-rose-50 dark:from-orange-950/30 dark:via-amber-950/15 dark:to-rose-950/20"
    >
      <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-primary/10 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-rose-400/10 blur-3xl" aria-hidden />
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 lg:grid-cols-2 lg:py-20">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45 }}
          className="relative z-10"
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary/80">Funding</p>
          <h1
            id="funding-hero-heading"
            className="mt-2 text-3xl font-extrabold leading-[1.1] tracking-tight sm:text-4xl lg:text-5xl"
          >
            Fund your solar project with{' '}
            <span className="bg-gradient-to-r from-orange-600 to-amber-500 bg-clip-text text-transparent">
              verified entities
            </span>
          </h1>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
            Banks and microfinance institutions on Vendora review your project and respond with real
            offers — from equipment installments to full project financing.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button size="lg" className="rounded-xl" asChild>
              <Link href="/market?view=financing">
                Apply for funding <ArrowRight size={16} className="ml-1" aria-hidden />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="rounded-xl" asChild>
              <Link href="/contact">Talk to us</Link>
            </Button>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2.5">
            {['Verified institutions', 'Documents reviewed by the platform', 'One request — multiple offers'].map(
              (item) => (
                <li key={item} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <CheckCircle2 size={15} className="shrink-0 text-emerald-600" aria-hidden />
                  {item}
                </li>
              ),
            )}
          </ul>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.45, delay: 0.1 }}
          className="relative mx-auto w-full max-w-md lg:max-w-none"
        >
          <div className="grid grid-cols-2 gap-3">
            {HERO_IMAGES.map((img, i) => (
              <div
                key={img.src}
                className={`overflow-hidden rounded-2xl border-2 border-background shadow-lg shadow-orange-900/5 ${
                  i % 2 ? 'translate-y-4' : ''
                }`}
              >
                <img
                  src={img.src}
                  alt={img.alt}
                  className="aspect-[4/3] w-full object-cover"
                  loading={i < 2 ? 'eager' : 'lazy'}
                  decoding="async"
                />
              </div>
            ))}
          </div>
          <motion.div
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute -left-4 top-6 hidden rounded-2xl border bg-background/95 p-3 shadow-xl backdrop-blur sm:flex sm:items-center sm:gap-3"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
              <ShieldCheck size={18} aria-hidden />
            </span>
            <div>
              <p className="text-sm font-bold leading-tight">Platform-verified</p>
              <p className="text-xs text-muted-foreground">Institutions reviewed by Vendora</p>
            </div>
          </motion.div>
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute -right-4 bottom-8 hidden rounded-2xl border bg-background/95 p-3 shadow-xl backdrop-blur sm:flex sm:items-center sm:gap-3"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Clock size={18} aria-hidden />
            </span>
            <div>
              <p className="text-sm font-bold leading-tight">Decisions in days</p>
              <p className="text-xs text-muted-foreground">Offers arrive in the platform</p>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}

/* ── How it works — 4 steps ────────────────────────────────────────── */

const STEPS = [
  {
    icon: FileText,
    title: 'Submit request',
    text: 'Submit a financing request in the platform — describe the project, the equipment it covers and the timeline you are working with.',
  },
  {
    icon: ShieldCheck,
    title: 'Platform review',
    text: 'The Vendora team verifies your documents and project details before anything reaches a funding entity.',
  },
  {
    icon: Landmark,
    title: 'Entity offer',
    text: 'Verified funding entities review your request and respond with concrete offers — amounts, schedules and terms side by side.',
  },
  {
    icon: FileSignature,
    title: 'Agreement & funding',
    text: 'Accept the offer that fits, sign the agreement, and the funding goes to work on your project.',
  },
]

export function FundingSteps() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-heading"
      className="mx-auto max-w-7xl scroll-mt-24 px-4 py-12 sm:py-14"
    >
      <motion.div {...inView()}>
        <SectionHeader
          headingId="how-it-works-heading"
          eyebrow="Process"
          title="How funding works"
          sub="From first request to funded project in four steps — every request passes the platform gate before it reaches an entity."
        />
      </motion.div>
      <ol className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, i) => (
          <motion.li
            key={step.title}
            {...inView(0.08 + i * 0.06)}
            className="group rounded-2xl border bg-card p-5 transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <step.icon size={20} aria-hidden />
              </span>
              <span
                className="text-2xl font-extrabold tabular-nums text-primary/15 transition-colors group-hover:text-primary/30"
                aria-hidden
              >
                0{i + 1}
              </span>
            </div>
            <h3 className="mt-4 text-base font-bold">{step.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.text}</p>
          </motion.li>
        ))}
      </ol>
    </section>
  )
}

/* ── Funding entities directory (live DB data via props) ───────────── */

function initialsOf(name: string) {
  const letters = name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.replace(/[^A-Za-z\u0600-\u06FF]/g, '').charAt(0))
    .filter(Boolean)
  return (letters.length > 0 ? letters.join('') : 'V').toUpperCase()
}

export function FundingEntities({ entities }: { entities: FundingEntityCard[] }) {
  return (
    <section
      id="entities"
      aria-labelledby="entities-heading"
      className="mx-auto max-w-7xl scroll-mt-24 px-4 py-12 sm:py-14"
    >
      <motion.div {...inView()}>
        <SectionHeader
          headingId="entities-heading"
          eyebrow="Directory"
          title="Funding entities directory"
          sub="Verified institutions currently offering financing through Vendora — every one of them passes the platform's verification gate."
        />
      </motion.div>
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {entities.map((entity, i) => (
          <motion.article
            key={entity.id}
            {...inView(0.08 + i * 0.06)}
            className="flex flex-col rounded-2xl border bg-card p-6 transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10"
          >
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-extrabold text-primary"
              >
                {initialsOf(entity.name)}
              </span>
              <div className="min-w-0">
                <h3 className="truncate text-base font-bold leading-tight">{entity.name}</h3>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary" className="rounded-full text-[11px] font-medium">
                    {entity.typeLabel}
                  </Badge>
                  <Badge className="gap-1 rounded-full border-emerald-200 bg-emerald-50 text-[11px] font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-400">
                    <BadgeCheck size={12} aria-hidden /> Verified
                  </Badge>
                </div>
              </div>
            </div>
            <p className="mt-4 flex-1 text-sm leading-relaxed text-muted-foreground">{entity.about}</p>
            <div className="mt-4 space-y-2 border-t pt-4">
              {entity.regulator ? (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldCheck size={13} className="shrink-0 text-primary/70" aria-hidden />
                  Regulated by {entity.regulator}
                </p>
              ) : null}
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Info size={13} className="shrink-0 text-primary/70" aria-hidden />
                View programs — entity profiles and the program catalogue are coming soon
              </p>
            </div>
          </motion.article>
        ))}
      </div>
    </section>
  )
}

/* ── Financing programs ────────────────────────────────────────────── */

const PROGRAMS = [
  {
    icon: CreditCard,
    title: 'Installment plans',
    text: 'Spread the cost of panels, batteries, inverters or pumps over fixed monthly installments — terms set by the funding entity.',
  },
  {
    icon: Package,
    title: 'Equipment leasing',
    text: 'Use the solar equipment while you pay for it, with options to upgrade or take ownership at the end of the term.',
  },
  {
    icon: Building2,
    title: 'Project financing',
    text: 'Fund a complete solar project — equipment, installation and commissioning — under a single facility.',
  },
  {
    icon: Wallet,
    title: 'Working capital',
    text: 'Bridge inventory and operating-cycle gaps with advances against confirmed orders and invoices.',
  },
]

export function FundingPrograms() {
  return (
    <section id="programs" aria-labelledby="programs-heading" className="scroll-mt-24 border-y bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:py-14">
        <motion.div {...inView()}>
          <SectionHeader
            headingId="programs-heading"
            eyebrow="Programs"
            title="Financing programs"
            sub="Typical program families available through the entities above — the wizard matches your request to what they currently offer."
          />
        </motion.div>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PROGRAMS.map((program, i) => (
            <motion.div
              key={program.title}
              {...inView(0.08 + i * 0.06)}
              className="flex flex-col rounded-2xl border bg-card p-5 transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <program.icon size={20} aria-hidden />
              </span>
              <h3 className="mt-4 text-base font-bold">{program.title}</h3>
              <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground">{program.text}</p>
              <Link
                href="/market?view=financing"
                className="mt-4 inline-flex items-center gap-1 self-start rounded-lg py-2 text-sm font-semibold text-primary transition-colors hover:text-primary/80 hover:underline"
              >
                Check eligibility <ArrowRight size={14} aria-hidden />
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── Eligibility & documents ───────────────────────────────────────── */

const DOCUMENTS = [
  {
    title: 'Business or ID documents',
    text: 'Commercial registration for companies, or a government ID for individuals.',
  },
  {
    title: 'Project quotes',
    text: 'Marketplace quotes or supplier pro-forma invoices for the equipment and work.',
  },
  {
    title: 'Bank statements',
    text: 'Recent account activity — each entity confirms how much history it needs.',
  },
]

export function FundingEligibility() {
  return (
    <section
      id="eligibility"
      aria-labelledby="eligibility-heading"
      className="mx-auto max-w-7xl scroll-mt-24 px-4 py-12 sm:py-14"
    >
      <div className="grid items-start gap-8 lg:grid-cols-2 lg:gap-12">
        <motion.div {...inView()}>
          <SectionHeader
            headingId="eligibility-heading"
            eyebrow="Eligibility"
            title="What you'll typically need"
            sub="One document pack, reused across every entity offer — you upload it once during the request."
          />
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Requirements are confirmed per entity inside the application wizard — institutions may add
            their own conditions on top of the platform baseline.
          </p>
          <div className="mt-6">
            <Button asChild className="rounded-xl">
              <Link href="/market?view=financing">
                Start the funding wizard <ArrowRight size={16} className="ml-1" aria-hidden />
              </Link>
            </Button>
          </div>
        </motion.div>
        <motion.ul {...inView(0.1)} className="space-y-4 rounded-2xl border bg-card p-5 sm:p-6">
          {DOCUMENTS.map((doc) => (
            <li key={doc.title} className="flex gap-3">
              <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden />
              <div>
                <p className="text-sm font-bold">{doc.title}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{doc.text}</p>
              </div>
            </li>
          ))}
          <li className="flex gap-3 border-t pt-4 text-xs leading-relaxed text-muted-foreground">
            <Info size={15} className="mt-0.5 shrink-0 text-primary/70" aria-hidden />
            Documents pass the platform verification gate once — every entity offer builds on the same
            verified pack.
          </li>
        </motion.ul>
      </div>
    </section>
  )
}

/* ── Final CTA band ────────────────────────────────────────────────── */

export function FundingCta() {
  return (
    <section aria-labelledby="funding-cta-heading" className="mx-auto max-w-7xl px-4 pb-14 pt-2">
      <motion.div
        {...inView()}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-600 via-amber-600 to-rose-600 px-6 py-12 text-center sm:px-12 sm:py-16"
      >
        <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-white/10 blur-3xl" aria-hidden />
        <div className="relative">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/80">
            One request — real offers
          </p>
          <h2
            id="funding-cta-heading"
            className="mx-auto mt-2 max-w-2xl text-2xl font-extrabold tracking-tight text-white sm:text-3xl"
          >
            Ready to fund your solar project?
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-white/85 sm:text-base">
            Submit one request in the platform wizard — verified entities review it and respond with
            offers you can compare side by side.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button
              size="lg"
              asChild
              className="rounded-xl bg-white text-orange-700 shadow-lg shadow-orange-950/20 hover:bg-orange-50"
            >
              <Link href="/market?view=financing">
                Apply for funding <ArrowRight size={16} className="ml-1" aria-hidden />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              asChild
              className="rounded-xl border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            >
              <Link href="/market">Browse the market first</Link>
            </Button>
          </div>
        </div>
      </motion.div>
    </section>
  )
}
