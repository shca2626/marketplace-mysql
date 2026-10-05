'use client'

import Link from 'next/link'
import Image from 'next/image'
import * as React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  Award,
  Banknote,
  Building2,
  CalendarClock,
  CheckCircle2,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Coins,
  FileCheck2,
  Gauge,
  HandCoins,
  Landmark,
  Leaf,
  MapPin,
  Moon,
  Scale,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Eyebrow,
  FaqAccordion,
  Icon,
  IconTile,
  Marquee,
  Monogram,
  PartnerTile,
  Reveal,
  RevealGroup,
  RevealItem,
  Section,
  SectionContainer,
  SectionHead,
  StatTile,
  StepFlow,
  money,
  moneyRange,
  plural,
  tenorLabel,
  PROGRAM_CATEGORIES,
  RATE_LABELS,
  SEGMENT_LABELS,
  type StepItem,
} from '@/components/site/kit'
import type {
  FundingEntityCardData,
  FundingProgramCard,
  FundingStats,
  PublicFaq,
  PublicPartner,
  PublicStory,
  PublicStep,
} from '@/lib/site-content'

/**
 * /funding client sections — Vendora "bh" light-first redesign.
 * Flow-based narrative (hero → steps → directory → programs → stories →
 * partners → FAQ → CTA), minimal card usage, text-list sections for
 * requirements/documents (per the redesign critique), all content DB-driven.
 */

// ── Shared bits ─────────────────────────────────────────────────────────────

/** orgType → monogram accent (BANK navy / MFI emerald / EWALLET teal). */
const ORG_ACCENT: Record<string, string> = {
  BANK: '#193d8f',
  MFI: '#059669',
  EWALLET: '#0e7490',
}

const REPAYMENT_LABELS: Record<string, string> = {
  MONTHLY: 'Monthly repayments',
  QUARTERLY: 'Quarterly repayments',
  LUMP_SUM: 'Lump-sum repayment',
}

function EmptyNote({
  icon: IconCmp,
  title,
  hint,
}: {
  icon: LucideIcon
  title: string
  hint?: string
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-bh-border-dark bg-bh-card/60 p-10 text-center">
      <IconCmp className="h-6 w-6 text-bh-gold/70" aria-hidden />
      <p className="text-sm font-semibold text-bh-navy">{title}</p>
      {hint && <p className="max-w-sm text-sm text-bh-muted">{hint}</p>}
    </div>
  )
}

/** Small icon + number + label, used in entity directory rows.
 *  The label is pluralized against the value (STAB-7: "1 program"). */
function MicroStat({ icon: IconCmp, value, label }: { icon: LucideIcon; value: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-bh-muted">
      <IconCmp className="h-3.5 w-3.5 text-bh-gold" aria-hidden />
      <span className="font-bold tabular-nums text-bh-navy">{value}</span> {plural(label, value)}
    </span>
  )
}

// ── 1 · How funding works ───────────────────────────────────────────────────

export function HowFundingWorks({ steps }: { steps: PublicStep[] }) {
  const flow: StepItem[] = steps.map((s) => ({
    id: s.id,
    icon: s.icon,
    title: s.title,
    subtitle: s.subtitle,
    body: s.body,
    stat: s.stat,
  }))
  return (
    <Section id="how-it-works" tone="muted" className="py-14 sm:py-16">
      <SectionContainer>
        <SectionHead
          eyebrow="The process"
          eyebrowIcon="ClipboardCheck"
          title="How funding works on Vendora"
          sub="One request travels to every matching institution — you compare real offers side by side, not brochures."
          action={
            <Button asChild variant="outline" className="gap-1.5 border-bh-border-dark bg-bh-card text-bh-navy hover:bg-bh-soft-blue">
              <Link href="/how-it-works">
                Full walkthrough <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </Button>
          }
        />
        <div className="mt-10">
          {flow.length > 0 ? <StepFlow steps={flow} /> : <EmptyNote icon={ClipboardCheck} title="Steps coming soon" />}
        </div>
      </SectionContainer>
    </Section>
  )
}

// ── 2 · Verified entity directory (logo strip + detail rows) ────────────────

export function EntityDirectory({ entities }: { entities: FundingEntityCardData[] }) {
  return (
    <Section id="entities" className="py-14 sm:py-16">
      <SectionContainer>
        <SectionHead
          eyebrow="Verified institutions"
          eyebrowIcon="Landmark"
          title="The institutions behind the offers"
          sub="Regulated banks and microfinance institutions with public profiles on Vendora — every program, branch and story in one place."
        />
        {entities.length === 0 ? (
          <div className="mt-10">
            <EmptyNote icon={Landmark} title="No verified entities yet" hint="Institution profiles appear here once verified." />
          </div>
        ) : (
          <RevealGroup className="mt-8 space-y-3">
            {entities.map((e) => (
              <RevealItem key={e.id}>
                <Link
                  href={`/funding/entities/${e.id}`}
                  className="group flex flex-col gap-4 rounded-2xl border border-bh-border bg-bh-card p-5 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:border-bh-gold/40 hover:shadow-hover sm:flex-row sm:items-center"
                >
                  <Monogram name={e.name} accent={ORG_ACCENT[e.orgType]} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-bh-navy group-hover:text-bh-action">{e.name}</h3>
                      <span className="inline-block rounded-md bg-bh-soft-blue px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-bh-action">
                        {e.typeLabel}
                      </span>
                      {e.regulator && (
                        <span className="hidden items-center gap-1 text-[11px] font-medium text-bh-muted sm:inline-flex">
                          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                          {e.regulator}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-1 text-sm text-bh-subtle">{e.about}</p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                      <MicroStat icon={HandCoins} value={e.programsCount} label="programs" />
                      <MicroStat icon={Building2} value={e.branchesCount} label="branches" />
                      <MicroStat icon={Sparkles} value={e.storiesCount} label="stories" />
                      {(e.minTicket != null || e.maxTicket != null) && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-bh-muted">
                          <Banknote className="h-3.5 w-3.5 text-bh-gold" aria-hidden />
                          {moneyRange(e.minTicket, e.maxTicket, 'YER') ?? 'Flexible amounts'}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-bh-action transition-colors group-hover:text-bh-navy-deep">
                    View profile
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </Link>
              </RevealItem>
            ))}
          </RevealGroup>
        )}
      </SectionContainer>
    </Section>
  )
}

// ── 3 · Program explorer (filter chips + reference-style cards) ─────────────

export function ProgramExplorer({ programs }: { programs: FundingProgramCard[] }) {
  const categories = React.useMemo(() => {
    const set = new Map<string, number>()
    for (const p of programs) set.set(p.category, (set.get(p.category) ?? 0) + 1)
    return [...set.entries()].sort((a, b) => b[1] - a[1])
  }, [programs])
  const [active, setActive] = React.useState<string>('ALL')
  const visible = React.useMemo(
    () => (active === 'ALL' ? programs : programs.filter((p) => p.category === active)),
    [active, programs],
  )

  return (
    <Section id="programs" tone="glass" className="py-14 sm:py-16">
      <SectionContainer>
        <SectionHead
          eyebrow="Programs"
          eyebrowIcon="HandCoins"
          title="Financing programs, compared in the open"
          sub="Installments, leasing, working capital and accreditation — every program below links to a full detail page with amounts, requirements and coverage."
        />

        {/* inline filter chips */}
        <div className="mt-8 flex flex-wrap items-center gap-2" role="tablist" aria-label="Filter programs by category">
          <button
            role="tab"
            aria-selected={active === 'ALL'}
            onClick={() => setActive('ALL')}
            className={cn(
              'rounded-full px-4 py-1.5 text-xs font-bold transition-all duration-200',
              active === 'ALL'
                ? 'bg-bh-navy text-white shadow-sm'
                : 'border border-bh-border-dark bg-bh-card text-bh-muted hover:border-bh-gold/50 hover:text-bh-navy',
            )}
          >
            All programs <span className="font-semibold opacity-70">{programs.length}</span>
          </button>
          {categories.map(([cat, n]) => (
            <button
              key={cat}
              role="tab"
              aria-selected={active === cat}
              onClick={() => setActive(cat)}
              className={cn(
                'rounded-full px-4 py-1.5 text-xs font-bold transition-all duration-200',
                active === cat
                  ? 'bg-bh-navy text-white shadow-sm'
                  : 'border border-bh-border-dark bg-bh-card text-bh-muted hover:border-bh-gold/50 hover:text-bh-navy',
              )}
            >
              {PROGRAM_CATEGORIES[cat]?.label ?? cat} <span className="font-semibold opacity-70">{n}</span>
            </button>
          ))}
        </div>

        <motion.div layout className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {visible.map((p) => (
              <motion.article
                key={p.id}
                layout
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className="group relative flex flex-col justify-between rounded-2xl border border-bh-border bg-bh-card p-5 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-hover"
              >
                <Link href={`/funding/programs/${p.id}`} className="absolute inset-0 rounded-2xl focus-visible:outline-2" aria-label={p.name} />
                <div className="relative">
                  <div className="mb-2 inline-block rounded bg-bh-bg-gold px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-bh-gold-dark">
                    {PROGRAM_CATEGORIES[p.category]?.label ?? p.category}
                  </div>
                  <h3 className="text-base font-bold text-bh-navy">{p.name}</h3>
                  <p className="mb-1 text-xs text-bh-muted">by {p.entity.name}</p>
                  {p.summary && <p className="mb-4 line-clamp-2 text-xs leading-relaxed text-bh-subtle">{p.summary}</p>}
                  <div className="mb-4 flex flex-wrap gap-2 text-[11px] font-medium text-bh-navy">
                    {(p.amountMin != null || p.amountMax != null) && (
                      <span className="rounded border border-bh-border bg-bh-page px-2 py-1">
                        {p.serviceKind === 'ACCREDITATION' ? `fee ${money(p.amountMin ?? p.amountMax, p.currency)}` : moneyRange(p.amountMin, p.amountMax, p.currency)}
                      </span>
                    )}
                    {tenorLabel(p.tenorMinMonths, p.tenorMaxMonths) && (
                      <span className="rounded border border-bh-border bg-bh-page px-2 py-1">{tenorLabel(p.tenorMinMonths, p.tenorMaxMonths)}</span>
                    )}
                    {p.shariaCompliant && (
                      <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700">Sharia</span>
                    )}
                  </div>
                </div>
                <span className="relative inline-flex items-center gap-1 text-xs font-semibold text-bh-action transition-colors group-hover:text-bh-navy-deep">
                  View program <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
              </motion.article>
            ))}
          </AnimatePresence>
        </motion.div>
        {visible.length === 0 && (
          <div className="mt-8">
            <EmptyNote icon={HandCoins} title="No programs in this category yet" />
          </div>
        )}
      </SectionContainer>
    </Section>
  )
}

// ── 4 · Success stories (horizontal scroller) ────────────────────────────────

export function StoryWall({ stories, stats }: { stories: PublicStory[]; stats: FundingStats }) {
  const scroller = React.useRef<HTMLDivElement>(null)
  const scrollBy = (dir: 1 | -1) => scroller.current?.scrollBy({ left: dir * 340, behavior: 'smooth' })
  if (stories.length === 0) return null

  return (
    <Section tone="muted" className="py-14 sm:py-16">
      <SectionContainer>
        <div className="flex items-end justify-between gap-4">
          <SectionHead
            eyebrow="Impact"
            eyebrowIcon="TrendingUp"
            title="Financed, built, and running today"
            sub="Real projects funded through Vendora programs — amounts, locations and measured impact."
            className="flex-1"
          />
          <div className="hidden shrink-0 gap-2 sm:flex">
            <Button variant="outline" size="icon" aria-label="Scroll stories left" onClick={() => scrollBy(-1)} className="border-bh-border-dark bg-bh-card text-bh-navy hover:bg-bh-soft-blue">
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Button>
            <Button variant="outline" size="icon" aria-label="Scroll stories right" onClick={() => scrollBy(1)} className="border-bh-border-dark bg-bh-card text-bh-navy hover:bg-bh-soft-blue">
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </div>

        <div
          ref={scroller}
          className="scrollbar-thin -mx-4 mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2"
        >
          {stories.map((s) => (
            <article
              key={s.id}
              className="w-[300px] shrink-0 snap-start overflow-hidden rounded-2xl border border-bh-border bg-bh-card shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-hover sm:w-[330px]"
            >
                {s.imageUrl && (
                  <div className="relative h-40 overflow-hidden bg-bh-soft-blue">
                    <Image src={s.imageUrl} alt={s.title} fill sizes="330px" className="object-cover transition-transform duration-500 hover:scale-105" />
                  </div>
                )}
                <div className="p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    {s.sector && <Badge variant="outline" className="border-bh-border-dark bg-bh-page text-bh-muted">{s.sector}</Badge>}
                    {s.year && <Badge variant="outline" className="border-bh-border-dark bg-bh-page text-bh-muted">{s.year}</Badge>}
                    {s.entity && (
                      <Link
                        href={`/funding/entities/${s.entity.id}`}
                        className="text-[11px] font-bold text-bh-action underline-offset-2 hover:underline"
                      >
                        {s.entity.name}
                      </Link>
                    )}
                  </div>
                  <h3 className="mt-2.5 text-sm font-bold text-bh-navy">{s.title}</h3>
                  <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-bh-subtle">{s.summary}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium text-bh-navy">
                    {s.amountFinanced != null && (
                      <span className="rounded border border-bh-border bg-bh-page px-2 py-1">{money(s.amountFinanced, s.currency)}</span>
                    )}
                    {s.location && (
                      <span className="inline-flex items-center gap-1 rounded border border-bh-border bg-bh-page px-2 py-1">
                        <MapPin className="h-3 w-3 text-bh-gold" aria-hidden />
                        {s.location}
                      </span>
                    )}
                    {s.peopleImpacted != null && (
                      <span className="inline-flex items-center gap-1 rounded border border-bh-border bg-bh-page px-2 py-1">
                        <Users className="h-3 w-3 text-bh-gold" aria-hidden />
                        {s.peopleImpacted}
                      </span>
                    )}
                    {s.co2AvoidedTonnes != null && (
                      <span className="inline-flex items-center gap-1 rounded border border-bh-border bg-bh-page px-2 py-1">
                        <Leaf className="h-3 w-3 text-emerald-600" aria-hidden />
                        {s.co2AvoidedTonnes}t CO₂
                      </span>
                    )}
                  </div>
                </div>
              </article>
          ))}
        </div>

        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile icon="HandCoins" label="Total financed (YER)" value={stats.totalFinanced} compact />
          <StatTile icon="Users" label="People impacted" value={stats.peopleImpacted} compact />
          <StatTile icon="Moon" label={plural('Sharia-compliant programs', stats.shariaPrograms)} value={stats.shariaPrograms} compact />
          <StatTile icon="Leaf" label={plural('CO₂ avoided (tonnes)', stats.co2Avoided)} value={stats.co2Avoided} compact decimals={0} />
        </div>
      </SectionContainer>
    </Section>
  )
}

// ── 5 · Partners marquee ─────────────────────────────────────────────────────

export function PartnersBand({ partners }: { partners: PublicPartner[] }) {
  if (partners.length === 0) return null
  return (
    <Section className="py-12">
      <SectionContainer>
        <SectionHead
          eyebrow="Partners"
          eyebrowIcon="ShieldCheck"
          title="Working alongside the ecosystem"
          align="center"
        />
        <div className="mt-8">
          <Marquee speed={38}>
            {partners.map((p) => (
              <PartnerTile key={p.id} name={p.name} monogram={p.monogram} accentColor={p.accentColor} websiteUrl={p.websiteUrl} />
            ))}
          </Marquee>
        </div>
      </SectionContainer>
    </Section>
  )
}

// ── 6 · FAQ (accordion, not cards) ──────────────────────────────────────────

export function FaqBand({ faqs }: { faqs: PublicFaq[] }) {
  if (faqs.length === 0) return null
  const [featured, ...rest] = faqs
  return (
    <Section tone="glass" className="py-14 sm:py-16">
      <SectionContainer>
        <div className="grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <div className="lg:sticky lg:top-24">
              <SectionHead
                eyebrow="FAQ"
                eyebrowIcon="Sparkles"
                title="Funding questions, answered"
                sub="Everything buyers ask before requesting financing."
              />
              <Button asChild variant="outline" className="mt-5 gap-1.5 border-bh-border-dark bg-bh-card text-bh-navy hover:bg-bh-soft-blue">
                <Link href="/faq">
                  All FAQs <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </Button>
            </div>
          </div>
          <div className="lg:col-span-8">
            <div className="rounded-2xl border border-bh-border bg-bh-card p-6 shadow-card">
              <FaqAccordion
                items={featured ? [featured, ...rest] : []}
              />
            </div>
          </div>
        </div>
      </SectionContainer>
    </Section>
  )
}

// ── 7 · Join as financier (Phase 3 application door) ────────────────────────

export function JoinFinancierBand() {
  return (
    <Section tone="muted" className="py-12 sm:py-14">
      <SectionContainer>
        <Reveal>
          <div className="relative overflow-hidden rounded-2xl border border-bh-border-dark bg-bh-navy px-6 py-8 text-white sm:px-10 sm:py-10">
            <div aria-hidden className="pointer-events-none absolute inset-0">
              <div className="absolute -right-16 top-0 h-56 w-56 rounded-full bg-bh-gold/15 blur-[90px]" />
              <div className="absolute -left-12 bottom-0 h-44 w-44 rounded-full bg-bh-gold/10 blur-[80px]" />
            </div>
            <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-xl">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-bh-gold/30 bg-bh-gold/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-bh-gold">
                  <Landmark className="h-3.5 w-3.5" aria-hidden />
                  For institutions
                </span>
                <h2 className="mt-4 text-balance text-xl font-bold tracking-tight sm:text-2xl">
                  Represent a bank or microfinance institution?
                </h2>
                <p className="mt-2 text-pretty text-sm leading-relaxed text-white/75">
                  Join Vendora&apos;s financing network — verified, platform-gated applications instead of cold
                  leads. Applications are reviewed by the Vendora team before your institution goes live.
                </p>
              </div>
              <div className="shrink-0">
                <Button
                  asChild
                  size="lg"
                  className="min-h-12 bg-bh-gold px-7 text-base font-bold text-bh-navy-deep hover:bg-bh-gold-light"
                >
                  <Link href="/market?view=register-financier">
                    Join as financier <ArrowRight className="ml-1" aria-hidden />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </Reveal>
      </SectionContainer>
    </Section>
  )
}

// ── 8 · Final CTA (navy band — dark reserved for CTA) ────────────────────────

export function FinalCta() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-[#052e56] via-[#06396c] to-[#0a4a8c] py-16 text-white sm:py-20">
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
      <SectionContainer className="relative">
        <div className="mx-auto max-w-2xl text-center">
          <Reveal>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-bh-gold/30 bg-bh-gold/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-bh-gold">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              One request, many offers
            </span>
          </Reveal>
          <Reveal delay={1}>
            <h2 className="mt-5 text-balance text-2xl font-bold tracking-tight sm:text-3xl">
              Ready to fund your solar project?
            </h2>
          </Reveal>
          <Reveal delay={2}>
            <p className="mx-auto mt-3 max-w-xl text-pretty text-[15px] leading-relaxed text-white/75">
              Submit one request — verified banks and microfinance institutions respond with real offers you can compare side by side.
            </p>
          </Reveal>
          <Reveal delay={3}>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
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
                <Link href="#programs">Browse programs</Link>
              </Button>
            </div>
          </Reveal>
        </div>
      </SectionContainer>
    </section>
  )
}

// ── Program detail page pieces (reference: supplier_qualification_program) ──

export type ProgramDetailData = {
  id: string
  name: string
  summary: string | null
  serviceKind: string
  category: string
  targetSegment: string | null
  currency: string
  amountMin: number | null
  amountMax: number | null
  rateType: string | null
  rateMax: number | null
  tenorMinMonths: number | null
  tenorMaxMonths: number | null
  repaymentFrequency: string | null
  gracePeriodDays: number | null
  shariaCompliant: boolean
  processingDays: number | null
  accreditationValidMonths: number | null
  accreditationFeeAmount: number | null
  financingLimitText: string | null
  targetAudience: string | null
  termsNote: string | null
  guaranteeTypes: string[]
  financingPeriods: string[]
  features: string[]
  eligibility: string[]
  coverage: string[]
  requirements: {
    title: string
    description: string | null
    conditionType: string
    validityMonths: number | null
    isRequired: boolean
    instructions: string | null
    autoPassAccredited: boolean
  }[]
  entity: {
    id: string
    name: string
    orgType: string
    typeLabel: string
    regulator: string | null
    licenseNumber: string | null
  }
}

export type RelatedProgramCardData = FundingProgramCard

const CONDITION_TYPE_LABELS: Record<string, string> = {
  DOCUMENT: 'Document',
  INFORMATION: 'Information',
  CONDITION: 'Condition',
  DECLARATION: 'Declaration',
}

/** White header band — breadcrumbs + gold tag + practical 30px H1 + subtitle. */
export function ProgramHero({ service }: { service: ProgramDetailData }) {
  const cat = PROGRAM_CATEGORIES[service.category]
  const isAccreditation = service.serviceKind === 'ACCREDITATION'
  return (
    <header className="border-b border-bh-border bg-bh-card py-8">
      <SectionContainer>
        <nav className="mb-5 flex items-center gap-2 text-xs text-bh-muted" aria-label="Breadcrumb">
          <Link href="/" className="transition-colors hover:text-bh-navy">Home</Link>
          <ChevronRight className="h-3.5 w-3.5 text-bh-faded" aria-hidden />
          <Link href="/funding" className="transition-colors hover:text-bh-navy">Funding</Link>
          <ChevronRight className="h-3.5 w-3.5 text-bh-faded" aria-hidden />
          <Link href="/funding#programs" className="transition-colors hover:text-bh-navy">Programs</Link>
          <ChevronRight className="h-3.5 w-3.5 text-bh-faded" aria-hidden />
          <span className="font-semibold text-bh-navy">{service.name}</span>
        </nav>

        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-bh-gold/20 bg-bh-bg-gold px-3 py-1 text-xs font-bold uppercase tracking-wide text-bh-gold-dark">
          {isAccreditation ? <Award className="h-3.5 w-3.5" aria-hidden /> : <HandCoins className="h-3.5 w-3.5" aria-hidden />}
          {cat?.label ?? service.category}
        </div>

        <h1 className="h1-practical mb-2 tracking-tight text-bh-navy">{service.name}</h1>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="max-w-3xl text-sm leading-relaxed text-bh-subtle md:text-base">{service.summary}</p>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] font-medium">
          {service.shariaCompliant && (
            <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">Sharia-compliant</span>
          )}
          {SEGMENT_LABELS[service.targetSegment ?? ''] && (
            <span className="rounded border border-bh-border bg-bh-page px-2 py-1 text-bh-muted">{SEGMENT_LABELS[service.targetSegment]}</span>
          )}
          {service.entity.name && (
            <span className="rounded border border-bh-border bg-bh-page px-2 py-1 text-bh-muted">by {service.entity.name}</span>
          )}
        </div>
      </SectionContainer>
    </header>
  )
}

/** Sidebar key-facts card (reference pattern): rows + Apply + Compare. */
export function KeyFactsPanel({ service }: { service: ProgramDetailData }) {
  const isAccreditation = service.serviceKind === 'ACCREDITATION'
  const rows: { label: string; value: React.ReactNode }[] = []

  if (isAccreditation) {
    if (service.accreditationFeeAmount != null)
      rows.push({ label: 'Program fee', value: `from ${money(service.accreditationFeeAmount, service.currency)}` })
    if (service.processingDays != null)
      rows.push({ label: 'Decision time', value: `≈ ${service.processingDays} ${plural('days', service.processingDays)}` })
    if (service.accreditationValidMonths != null)
      rows.push({ label: 'Accreditation valid', value: `${service.accreditationValidMonths} ${plural('months', service.accreditationValidMonths)}` })
  } else {
    if (service.amountMin != null || service.amountMax != null)
      rows.push({ label: 'Financing range', value: moneyRange(service.amountMin, service.amountMax, service.currency) })
    if (service.rateMax != null && service.rateType)
      rows.push({ label: 'Rate cap', value: `${RATE_LABELS[service.rateType] ?? service.rateType} ≤ ${service.rateMax}%` })
    if (service.gracePeriodDays != null) {
      const graceMonths = Math.round(service.gracePeriodDays / 30)
      rows.push({ label: 'Grace period', value: `up to ${graceMonths} ${plural('months', graceMonths)}` })
    }
    const tenor = tenorLabel(service.tenorMinMonths, service.tenorMaxMonths)
    if (tenor) rows.push({ label: 'Repayment period', value: tenor })
    if (REPAYMENT_LABELS[service.repaymentFrequency ?? '']) rows.push({ label: 'Repayment', value: REPAYMENT_LABELS[service.repaymentFrequency] })
    if (service.processingDays != null)
      rows.push({ label: 'Decision time', value: `≈ ${service.processingDays} ${plural('days', service.processingDays)}` })
    rows.push({ label: 'Currency', value: service.currency === 'YER' ? 'Yemeni Rial (YER)' : service.currency })
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-bh-border bg-bh-card p-5 shadow-card">
        <div className="mb-4 flex items-center justify-between border-b border-bh-border pb-4">
          <div>
            <h2 className="h3-practical text-bh-navy">Key facts</h2>
            <p className="text-xs text-bh-muted">{isAccreditation ? 'Accreditation' : PROGRAM_CATEGORIES[service.category]?.label ?? 'Financing'}</p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-bh-bg-gold text-bh-gold">
            <Award className="h-5 w-5" aria-hidden />
          </div>
        </div>

        {/* financing amount min/max tiles */}
        {!isAccreditation && (service.amountMin != null || service.amountMax != null) && (
          <div className="mb-5 grid grid-cols-2 gap-3">
            {service.amountMin != null && (
              <div className="rounded-xl border border-bh-border bg-bh-page/70 p-3.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-bh-muted">Minimum</p>
                <p className="mt-1 text-sm font-bold tabular-nums text-bh-navy">{money(service.amountMin, '')}</p>
                <p className="text-[10px] text-bh-faded">{service.currency}</p>
              </div>
            )}
            {service.amountMax != null && (
              <div className="rounded-xl border border-bh-border bg-bh-page/70 p-3.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-bh-muted">Maximum</p>
                <p className="mt-1 text-sm font-bold tabular-nums text-bh-navy">{money(service.amountMax, '')}</p>
                <p className="text-[10px] text-bh-faded">{service.currency}</p>
              </div>
            )}
          </div>
        )}

        <div className="mb-6 space-y-3.5 text-sm">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between py-1">
              <span className="text-bh-muted">{r.label}</span>
              <span className="font-bold text-bh-navy">{r.value}</span>
            </div>
          ))}
        </div>

        <Button asChild className="mb-2.5 w-full gap-2 bg-bh-action text-sm hover:bg-bh-navy-deep">
          <Link href="/market?view=financing">
            Apply for this program
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
          </Link>
        </Button>
        <Button asChild variant="outline" className="w-full border-bh-border-dark bg-bh-card text-xs text-bh-navy hover:bg-bh-page">
          <Link href="/funding#programs">Compare all programs</Link>
        </Button>
      </section>

      {/* entity profile mini-card */}
      <section className="rounded-2xl border border-bh-border bg-bh-card p-5 shadow-card">
        <div className="mb-3 flex items-center gap-3.5">
          <Monogram name={service.entity.name} accent={ORG_ACCENT[service.entity.orgType]} size="md" />
          <div>
            <h3 className="text-sm font-bold text-bh-navy">{service.entity.name}</h3>
            <span className="mt-0.5 inline-block rounded-md bg-bh-soft-blue px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-bh-action">
              {service.entity.typeLabel}
            </span>
            {service.entity.regulator && <p className="mt-1 text-xs text-bh-muted">{service.entity.regulator}</p>}
          </div>
        </div>
        <Link
          href={`/funding/entities/${service.entity.id}`}
          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-bh-action transition-colors hover:text-bh-navy-deep"
        >
          View full profile <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </section>
    </div>
  )
}

/** Section head used by all main-column cards (icon tile + h2-practical). */
function CardHead({ icon: IconCmp, title, sub }: { icon: LucideIcon; title: string; sub?: string }) {
  return (
    <>
      <div className="mb-4 flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-bh-bg-gold text-bh-gold">
          <IconCmp className="h-4 w-4" aria-hidden />
        </div>
        <h2 className="h2-practical text-bh-navy">{title}</h2>
      </div>
      {sub && <p className="mb-5 text-xs text-bh-muted">{sub}</p>}
    </>
  )
}

/** Service features — financing limit, target audience, guarantees, periods. */
export function ServiceFeaturesPanel({ service }: { service: ProgramDetailData }) {
  const { financingLimitText, targetAudience, guaranteeTypes, financingPeriods } = service
  if (!financingLimitText && !targetAudience && guaranteeTypes.length === 0 && financingPeriods.length === 0) return null
  const audienceLines = targetAudience?.split('\n').map((l) => l.trim()).filter(Boolean) ?? []

  return (
    <section className="rounded-2xl border border-bh-border bg-bh-card p-6 shadow-card">
      <CardHead icon={Sparkles} title="Service features" />
      <div className="space-y-5">
        {financingLimitText && (
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bh-soft-blue text-bh-action">
              <Coins className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-bh-muted">Financing limit</p>
              <p className="mt-0.5 text-sm font-medium text-bh-ink">{financingLimitText}</p>
            </div>
          </div>
        )}
        {audienceLines.length > 0 && (
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bh-soft-blue text-bh-action">
              <Users className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-bh-muted">Target audience</p>
              <ul className="mt-1 space-y-1.5">
                {audienceLines.map((line) => (
                  <li key={line} className="flex items-start gap-2 text-sm font-medium text-bh-ink">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-bh-action" aria-hidden />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {guaranteeTypes.length > 0 && (
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bh-soft-blue text-bh-action">
              <ShieldCheck className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-bh-muted">Types of guarantees</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {guaranteeTypes.map((g) => (
                  <span key={g} className="rounded-lg border border-bh-border bg-bh-page/70 px-2.5 py-1 text-xs font-semibold text-bh-navy">
                    {g}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
        {financingPeriods.length > 0 && (
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bh-soft-blue text-bh-action">
              <CalendarClock className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-bh-muted">Financing period</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {financingPeriods.map((p) => (
                  <span key={p} className="rounded-lg border border-bh-border bg-bh-page/70 px-2.5 py-1 text-xs font-semibold text-bh-navy">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

/** What's included — FEATURE attributes as soft-blue check rows (reference §2). */
export function ProgramChecklists({ features, eligibility }: { features: string[]; eligibility: string[] }) {
  return (
    <section className="rounded-2xl border border-bh-border bg-bh-card p-6 shadow-card">
      <CardHead icon={Building2} title="What's included" />
      {features.length > 0 ? (
        <div className="space-y-3">
          {features.map((f) => (
            <div key={f} className="flex items-start gap-3 rounded-xl border border-bh-border bg-bh-soft-blue/60 p-3.5">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-bh-action" aria-hidden />
              <span className="text-sm font-medium text-bh-ink">{f}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-bh-muted">Details available on request.</p>
      )}

      {eligibility.length > 0 && (
        <>
          <div className="mb-4 mt-8 flex items-center gap-2.5 border-t border-bh-border pt-6">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-bh-soft-blue text-bh-action">
              <ClipboardCheck className="h-4 w-4" aria-hidden />
            </div>
            <h2 className="h2-practical text-bh-navy">Requirements</h2>
          </div>
          <ul className="divide-y divide-bh-border">
            {eligibility.map((e) => (
              <li key={e} className="flex items-start gap-3.5 py-3.5">
                <CheckSquare className="mt-0.5 h-5 w-5 shrink-0 text-bh-gold" aria-hidden />
                <span className="text-sm font-medium text-bh-ink">{e}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

/** Documents & conditions — ONE text section (divide-y rows, NOT cards). */
export function ProgramRequirements({ requirements }: { requirements: ProgramDetailData['requirements'] }) {
  if (requirements.length === 0) return null
  return (
    <section className="rounded-2xl border border-bh-border bg-bh-card p-6 shadow-card">
      <CardHead
        icon={FileCheck2}
        title="Documents & conditions"
        sub="Everything checked during review — submitted once and verified by the platform."
      />
      <div className="divide-y divide-bh-border border-t border-bh-border">
        {requirements.map((r) => (
          <div key={r.title} className="flex items-start gap-3.5 py-3.5">
            <div className="mt-0.5 text-bh-gold">
              <CheckSquare className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-bh-navy">{r.title}</span>
                <span className="rounded border border-bh-border-dark bg-bh-page px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-bh-muted">
                  {CONDITION_TYPE_LABELS[r.conditionType] ?? r.conditionType}
                </span>
                {r.isRequired && (
                  <span className="rounded bg-bh-soft-blue px-2 py-0.5 text-[10px] font-bold text-bh-action">Required</span>
                )}
                {r.validityMonths != null && (
                  <span className="rounded bg-bh-bg-gold px-2 py-0.5 text-[10px] font-medium text-bh-gold-dark">Valid {r.validityMonths} {plural('mos', r.validityMonths)}</span>
                )}
                {r.autoPassAccredited && (
                  <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                    Auto-pass accredited
                  </span>
                )}
              </div>
              {r.description && <p className="text-xs leading-relaxed text-bh-subtle">{r.description}</p>}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

/** Terms note — gold pale callout band. */
export function TermsNoteBand({ note }: { note: string | null }) {
  if (!note) return null
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-bh-gold/30 bg-bh-gold-pale p-5">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bh-bg-gold text-bh-gold-dark">
        <Scale className="h-4 w-4" aria-hidden />
      </span>
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-bh-gold-dark">Terms & conditions</p>
        <p className="mt-1 text-sm leading-relaxed text-bh-ink">{note}</p>
      </div>
    </div>
  )
}

/** Where it's available — region chips + count (reference §4). */
export function CoveragePanel({ coverage }: { coverage: string[] }) {
  if (coverage.length === 0) return null
  return (
    <section className="rounded-2xl border border-bh-border bg-bh-card p-6 shadow-card">
      <CardHead icon={MapPin} title="Where it's available" />
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-bh-border bg-bh-page/50 p-3.5">
        <div className="flex flex-wrap gap-2">
          {coverage.map((region) => (
            <span
              key={region}
              className="flex items-center gap-2 rounded-full border border-bh-border-dark bg-bh-card px-3 py-1 text-xs font-semibold text-bh-navy"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
              {region}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-3 text-xs text-bh-muted">
        {coverage.length} {coverage.length === 1 ? 'region' : 'regions'} covered by this program
      </p>
    </section>
  )
}

/** More programs to compare — 2-col reference cards. */
export function RelatedPrograms({ related }: { related: RelatedProgramCardData[] }) {
  if (related.length === 0) return null
  return (
    <section className="pt-4">
      <h2 className="h2-practical mb-4 text-bh-navy">More programs to compare</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {related.map((p) => (
          <div
            key={p.id}
            className="flex flex-col justify-between rounded-2xl border border-bh-border bg-bh-card p-5 shadow-card transition-all duration-300 hover:shadow-hover"
          >
            <div>
              <div className="mb-2 inline-block rounded bg-bh-bg-gold px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-bh-gold-dark">
                {PROGRAM_CATEGORIES[p.category]?.label ?? p.category}
              </div>
              <h3 className="text-base font-bold text-bh-navy">{p.name}</h3>
              <p className="mb-3 text-xs text-bh-muted">by {p.entity.name}</p>
              {p.summary && <p className="mb-4 line-clamp-2 text-xs leading-relaxed text-bh-subtle">{p.summary}</p>}
              <div className="mb-4 flex flex-wrap gap-2 text-[11px] font-medium text-bh-navy">
                {(p.amountMin != null || p.amountMax != null) && (
                  <span className="rounded border border-bh-border bg-bh-page px-2 py-1">
                    {p.serviceKind === 'ACCREDITATION' ? `fee ${money(p.amountMin ?? p.amountMax, p.currency)}` : moneyRange(p.amountMin, p.amountMax, p.currency)}
                  </span>
                )}
                {tenorLabel(p.tenorMinMonths, p.tenorMaxMonths) && (
                  <span className="rounded border border-bh-border bg-bh-page px-2 py-1">{tenorLabel(p.tenorMinMonths, p.tenorMaxMonths)}</span>
                )}
                {p.shariaCompliant && (
                  <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700">Sharia</span>
                )}
              </div>
            </div>
            <Link href={`/funding/programs/${p.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-bh-action transition-colors hover:text-bh-navy-deep">
              View program <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        ))}
      </div>
    </section>
  )
}
