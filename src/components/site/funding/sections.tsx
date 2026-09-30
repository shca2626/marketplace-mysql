'use client'

import Link from 'next/link'
import Image from 'next/image'
import * as React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  Banknote,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Gauge,
  HandCoins,
  Leaf,
  MapPin,
  Moon,
  Sparkles,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Eyebrow,
  FaqAccordion,
  GlowCard,
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
  tenorLabel,
  PROGRAM_CATEGORIES,
  RATE_LABELS,
  SEGMENT_LABELS,
  SECTOR_LABELS,
  type StepItem,
} from '@/components/site/kit'
import type {
  FundingEntityCardData,
  FundingProgramCard,
  FundingStats,
  PublicFaq,
  PublicPartner,
  PublicRequirement,
  PublicStory,
  PublicStep,
} from '@/lib/site-content'

/**
 * /funding client sections (Task 5 — Agent A).
 * The page (server component) fetches everything from src/lib/site-content.ts
 * and hands serializable props to the components below. Fixed UI labels only —
 * every program / entity / step / story / FAQ / partner comes from the DB.
 */

// ── Shared bits ─────────────────────────────────────────────────────────────

/** orgType → monogram accent (BANK warm amber / MFI solar green / EWALLET teal). */
const ORG_ACCENT: Record<string, string> = {
  BANK: '#b45309',
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
  dark = false,
}: {
  icon: LucideIcon
  title: string
  hint?: string
  dark?: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 rounded-2xl border border-dashed p-10 text-center',
        dark ? 'border-zinc-800 bg-zinc-900/40' : 'border-border bg-card/60',
      )}
    >
      <IconCmp className={cn('h-6 w-6', dark ? 'text-amber-300/70' : 'text-primary/60')} aria-hidden />
      <p className={cn('text-sm font-semibold', dark && 'text-zinc-200')}>{title}</p>
      {hint && <p className={cn('max-w-sm text-sm', dark ? 'text-zinc-500' : 'text-muted-foreground')}>{hint}</p>}
    </div>
  )
}

/** Small icon + number + label, used in entity card micro-stat rows. */
function MicroStat({ icon: IconCmp, value, label, dark = false }: { icon: LucideIcon; value: number; label: string; dark?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', dark ? 'text-zinc-400' : 'text-muted-foreground')}>
      <IconCmp className={cn('h-3.5 w-3.5', dark ? 'text-amber-300/80' : 'text-primary/70')} aria-hidden />
      <span className="font-bold tabular-nums">{value}</span> {label}
    </span>
  )
}

// ── 2 · How funding works ───────────────────────────────────────────────────

export function HowFundingWorks({ steps }: { steps: PublicStep[] }) {
  const items: StepItem[] = steps.map((s) => ({
    id: s.id,
    icon: s.icon,
    title: s.title,
    subtitle: s.subtitle,
    body: s.body,
    stat: s.stat,
  }))
  return (
    <Section id="how-it-works" tone="light" curve="up" className="py-14 sm:py-20" aria-labelledby="how-it-works-heading">
      <SectionContainer>
        <h2 id="how-it-works-heading" className="sr-only">How funding works</h2>
        <SectionHead
          eyebrow="Process"
          eyebrowIcon="Repeat"
          title="How funding works"
          sub="From first request to a funded project — every request passes the platform verification gate before it reaches a funding entity."
        />
        <div className="mt-10">
          {items.length > 0 ? (
            <StepFlow steps={items} />
          ) : (
            <EmptyNote icon={HandCoins} title="The funding process is being published" hint="Steps will appear here as soon as they go live." />
          )}
        </div>
      </SectionContainer>
    </Section>
  )
}

// ── 3 · Funding entities directory ───────────────────────────────────────────

export function EntityDirectory({ entities }: { entities: FundingEntityCardData[] }) {
  return (
    <Section id="entities" tone="muted" className="py-14 sm:py-20" aria-labelledby="entities-heading">
      <SectionContainer>
        <h2 id="entities-heading" className="sr-only">Funding entities directory</h2>
        <SectionHead
          eyebrow="Directory"
          eyebrowIcon="Landmark"
          title="Funding entities directory"
          sub="Banks and microfinance institutions verified by Vendora, each with live financing programs on the platform."
          action={
            entities.length > 0 ? (
              <Badge variant="outline" className="gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold">
                <ShieldCheckInline className="h-3.5 w-3.5 text-emerald-600" />
                {entities.length} verified {entities.length === 1 ? 'entity' : 'entities'}
              </Badge>
            ) : undefined
          }
        />
        {entities.length === 0 ? (
          <div className="mt-10">
            <EmptyNote icon={Sparkles} title="Funding entities are being verified" hint="Verified institutions will appear here soon." />
          </div>
        ) : (
          <RevealGroup className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {entities.map((e) => {
              const accent = ORG_ACCENT[e.orgType]
              return (
                <RevealItem key={e.id} className="h-full">
                  <GlowCard accent={accent} className="flex h-full flex-col">
                    <div className="flex items-start gap-4">
                      <Monogram name={e.name} accent={accent} />
                      <div className="min-w-0 flex-1">
                        <h3 className="text-balance text-base font-bold leading-snug text-foreground">{e.name}</h3>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <Badge variant="secondary" className="rounded-full text-[11px] font-medium">
                            {e.typeLabel}
                          </Badge>
                          <Badge className="gap-1 rounded-full border-emerald-200 bg-emerald-50 text-[11px] font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-400">
                            <ShieldCheckInline className="h-3 w-3" /> Verified
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <p className="mt-4 line-clamp-3 flex-1 text-sm leading-relaxed text-muted-foreground">{e.about}</p>
                    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t pt-4">
                      <MicroStat icon={HandCoins} value={e.programsCount} label={e.programsCount === 1 ? 'program' : 'programs'} />
                      <MicroStat icon={MapPin} value={e.branchesCount} label={e.branchesCount === 1 ? 'branch' : 'branches'} />
                      <MicroStat icon={Sparkles} value={e.storiesCount} label={e.storiesCount === 1 ? 'story' : 'stories'} />
                    </div>
                    {e.regulator && (
                      <p className="mt-2.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <ShieldCheckInline className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                        Regulated by {e.regulator}
                      </p>
                    )}
                    <Link
                      href={`/funding/entities/${e.id}`}
                      className="mt-4 inline-flex min-h-11 items-center gap-1.5 self-start rounded-lg px-1 text-sm font-semibold text-primary transition-colors hover:text-primary/80 hover:underline"
                    >
                      View profile
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </Link>
                  </GlowCard>
                </RevealItem>
              )
            })}
          </RevealGroup>
        )}
      </SectionContainer>
    </Section>
  )
}

/** Inline shield-check glyph (kept local — lucide re-export would bloat the import list). */
function ShieldCheckInline({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}

// ── 4 · Financing programs (filterable) ──────────────────────────────────────

function ProgramCard({ program }: { program: FundingProgramCard }) {
  const cat = PROGRAM_CATEGORIES[program.category] ?? PROGRAM_CATEGORIES.OTHER!
  const isAccreditation = program.serviceKind === 'ACCREDITATION'
  const amount = moneyRange(program.amountMin, program.amountMax, program.currency)
  const tenor = tenorLabel(program.tenorMinMonths, program.tenorMaxMonths)
  const rate = program.rateMax != null ? `up to ${program.rateMax}%` : null

  const facts = [
    amount ? { icon: Banknote, label: 'Amount', value: amount } : null,
    rate ? { icon: TrendingUp, label: program.rateType ? RATE_LABELS[program.rateType] ?? 'Rate' : 'Rate', value: rate } : null,
    tenor ? { icon: CalendarClock, label: 'Tenor', value: tenor } : null,
    program.processingDays != null ? { icon: Gauge, label: 'Decision', value: `≈ ${program.processingDays} days` } : null,
  ].filter((f): f is { icon: LucideIcon; label: string; value: string } => f !== null)

  return (
    <motion.article
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'relative flex h-full flex-col rounded-2xl border bg-card p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-zinc-950/[0.06]',
        isAccreditation
          ? 'border-dashed border-primary/45 bg-primary/[0.03] hover:border-primary/70'
          : 'border-border hover:border-primary/30',
      )}
    >
      {/* stretched link — the whole card opens the program page */}
      <Link
        href={`/funding/programs/${program.id}`}
        className="absolute inset-0 z-10 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <span className="sr-only">View program: {program.name}</span>
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <IconTile name={cat.icon} size="sm" />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">{cat.label}</p>
            <p className="text-[11px] text-muted-foreground">{SEGMENT_LABELS[program.targetSegment ?? ''] ?? 'Open program'}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {isAccreditation && (
            <Badge variant="outline" className="rounded-full border-primary/40 bg-primary/10 text-[10px] font-semibold uppercase tracking-wide text-primary">
              Accreditation
            </Badge>
          )}
          {program.shariaCompliant && (
            <Badge variant="outline" className="gap-1 rounded-full border-emerald-200 bg-emerald-50 text-[10px] font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-400">
              <Moon className="h-3 w-3" aria-hidden /> Sharia ✓
            </Badge>
          )}
        </div>
      </div>

      <h3 className="mt-4 text-balance text-base font-bold leading-snug text-foreground">{program.name}</h3>
      <p className="mt-0.5 text-xs font-medium text-muted-foreground">
        by{' '}
        <Link
          href={`/funding/entities/${program.entity.id}`}
          className="relative z-20 rounded font-medium text-foreground/80 underline decoration-primary/40 underline-offset-2 transition-colors hover:text-primary"
        >
          {program.entity.name}
        </Link>
      </p>
      {program.summary && <p className="mt-2.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{program.summary}</p>}

      {facts.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {facts.map((f) => (
            <div key={f.label} className="rounded-xl border bg-muted/40 px-3 py-2.5">
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <f.icon className="h-3 w-3 text-primary/80" aria-hidden /> {f.label}
              </p>
              <p className="mt-0.5 truncate text-xs font-bold tabular-nums text-foreground">{f.value}</p>
            </div>
          ))}
        </div>
      )}

      <span className="mt-auto inline-flex items-center gap-1.5 pt-5 text-sm font-semibold text-primary">
        View program
        <ArrowRight className="h-4 w-4" aria-hidden />
      </span>
    </motion.article>
  )
}

export function ProgramExplorer({ programs }: { programs: FundingProgramCard[] }) {
  const [active, setActive] = React.useState<string>('ALL')

  const categories = React.useMemo(() => {
    const seen = new Map<string, number>()
    for (const p of programs) seen.set(p.category, (seen.get(p.category) ?? 0) + 1)
    return [...seen.entries()]
  }, [programs])

  const filtered = React.useMemo(
    () => (active === 'ALL' ? programs : programs.filter((p) => p.category === active)),
    [active, programs],
  )

  return (
    <Section id="programs" tone="glass" className="py-14 sm:py-20" aria-labelledby="programs-heading">
      <SectionContainer>
        <h2 id="programs-heading" className="sr-only">Financing programs</h2>
        <SectionHead
          eyebrow="Programs"
          eyebrowIcon="HandCoins"
          title="Financing programs"
          sub="Every live program from the verified entities — amounts, rates and terms set by each institution, compared side by side."
        />
        {programs.length === 0 ? (
          <div className="mt-10">
            <EmptyNote icon={HandCoins} title="Programs coming soon" hint="Financing programs are being prepared by the verified entities." />
          </div>
        ) : (
          <>
            {/* category filter chips */}
            <Reveal className="mt-8" delay={1}>
              <div
                role="group"
                aria-label="Filter programs by category"
                className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <FilterChip active={active === 'ALL'} onClick={() => setActive('ALL')} label="All programs" count={programs.length} />
                {categories.map(([category, count]) => {
                  const cat = PROGRAM_CATEGORIES[category] ?? PROGRAM_CATEGORIES.OTHER!
                  return (
                    <FilterChip
                      key={category}
                      active={active === category}
                      onClick={() => setActive(category)}
                      label={cat.label}
                      icon={cat.icon}
                      count={count}
                    />
                  )
                })}
              </div>
            </Reveal>

            <motion.div layout className="mt-6 grid items-stretch gap-5 sm:grid-cols-2 xl:grid-cols-3">
              <AnimatePresence mode="popLayout">
                {filtered.map((program) => (
                  <ProgramCard key={program.id} program={program} />
                ))}
              </AnimatePresence>
            </motion.div>
          </>
        )}
      </SectionContainer>
    </Section>
  )
}

function FilterChip({
  active,
  onClick,
  label,
  icon,
  count,
}: {
  active: boolean
  onClick: () => void
  label: string
  icon?: string
  count: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-all',
        active
          ? 'border-primary bg-primary text-primary-foreground shadow-sm'
          : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
      )}
    >
      {icon && (
        <span className={cn('inline-flex h-5 w-5 items-center justify-center rounded-md', active ? 'text-primary-foreground' : 'text-primary')}>
          <Icon name={icon} className="h-4 w-4" />
        </span>
      )}
      {label}
      <span className={cn('rounded-full px-1.5 text-[11px] font-bold tabular-nums', active ? 'bg-primary-foreground/20' : 'bg-muted text-muted-foreground')}>{count}</span>
    </button>
  )
}

// ── 5 · Eligibility & documents ─────────────────────────────────────────────

const REQ_META: Record<string, { icon: string; label: string }> = {
  DOCUMENT: { icon: 'FileText', label: 'Document' },
  PROFILE_FIELD: { icon: 'UserPlus', label: 'Profile data' },
  DECLARATION: { icon: 'ShieldCheck', label: 'Declaration' },
  NUMBER: { icon: 'LineChart', label: 'Figure' },
  SELECT: { icon: 'GitCompareArrows', label: 'Choice' },
  MULTI_SELECT: { icon: 'GitCompareArrows', label: 'Choices' },
  DATE: { icon: 'CalendarClock', label: 'Date' },
  TEXT: { icon: 'FileText', label: 'Text' },
}

const REQ_ORDER = ['DOCUMENT', 'PROFILE_FIELD', 'DECLARATION', 'NUMBER', 'SELECT', 'MULTI_SELECT', 'DATE', 'TEXT']

export function RequirementBoard({ requirements }: { requirements: PublicRequirement[] }) {
  const sorted = React.useMemo(
    () => [...requirements].sort((a, b) => REQ_ORDER.indexOf(a.conditionType) - REQ_ORDER.indexOf(b.conditionType)),
    [requirements],
  )
  return (
    <Section id="eligibility" tone="light" curve="down" className="py-14 sm:py-20" aria-labelledby="eligibility-heading">
      <SectionContainer>
        <h2 id="eligibility-heading" className="sr-only">Eligibility and documents</h2>
        <SectionHead
          eyebrow="Eligibility"
          eyebrowIcon="FileText"
          title="What you'll typically need"
          sub="One reusable pack of documents and data — upload it once, and every entity offer builds on the same verified baseline."
        />
        {sorted.length === 0 ? (
          <div className="mt-10">
            <EmptyNote icon={ClipboardCheck} title="Requirements are being finalized" hint="The document checklist will appear here soon." />
          </div>
        ) : (
          <RevealGroup className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((r) => {
              const meta = REQ_META[r.conditionType] ?? { icon: 'FileText', label: r.conditionType }
              return (
                <RevealItem key={r.id} className="h-full">
                  <div className="flex h-full flex-col rounded-2xl border bg-card p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <IconTile name={meta.icon} size="sm" />
                      <Badge variant="outline" className="rounded-full text-[10px] font-semibold uppercase tracking-wide">
                        {meta.label}
                      </Badge>
                    </div>
                    <h3 className="mt-4 text-sm font-bold leading-snug text-foreground">{r.title}</h3>
                    {r.description && <p className="mt-1.5 line-clamp-2 flex-1 text-sm leading-relaxed text-muted-foreground">{r.description}</p>}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Badge variant="secondary" className="gap-1 rounded-full text-[11px]">
                        <HandCoins className="h-3 w-3 text-primary/70" aria-hidden />
                        Used by {r.usedByCount} {r.usedByCount === 1 ? 'program' : 'programs'}
                      </Badge>
                      {r.validityMonths != null && (
                        <Badge variant="secondary" className="gap-1 rounded-full text-[11px]">
                          <Clock className="h-3 w-3 text-primary/70" aria-hidden /> valid {r.validityMonths} mo
                        </Badge>
                      )}
                    </div>
                  </div>
                </RevealItem>
              )
            })}
          </RevealGroup>
        )}
      </SectionContainer>
    </Section>
  )
}

// ── 6 · Success stories (dark editorial band) ───────────────────────────────

export function StoryWall({ stories, stats }: { stories: PublicStory[]; stats: FundingStats }) {
  const scroller = React.useRef<HTMLDivElement>(null)

  const scrollBy = React.useCallback((dir: 1 | -1) => {
    const el = scroller.current
    if (!el) return
    const card = el.querySelector<HTMLElement>('[data-story-card]')
    const step = card ? card.offsetWidth + 20 : 380
    el.scrollBy({ left: dir * step, behavior: 'smooth' })
  }, [])

  return (
    <Section id="stories" tone="dark" className="py-14 sm:py-20" aria-labelledby="stories-heading">
      <SectionContainer>
        <h2 id="stories-heading" className="sr-only">Success stories</h2>
        <SectionHead
          tone="dark"
          eyebrow="Impact"
          eyebrowIcon="Sun"
          title="Funded, installed, running"
          sub="Real projects financed through the platform — measured in kilowatts, livelihoods and tonnes of CO₂ kept out of the sky."
          action={
            stories.length > 0 ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => scrollBy(-1)}
                  aria-label="Scroll stories left"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900/60 text-zinc-300 transition-all hover:border-amber-400/50 hover:text-amber-300"
                >
                  <ChevronLeft className="h-5 w-5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => scrollBy(1)}
                  aria-label="Scroll stories right"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900/60 text-zinc-300 transition-all hover:border-amber-400/50 hover:text-amber-300"
                >
                  <ChevronRight className="h-5 w-5" aria-hidden />
                </button>
              </div>
            ) : undefined
          }
        />

        {/* aggregate impact strip */}
        {(stats.totalFinanced > 0 || stats.peopleImpacted > 0 || stats.co2Avoided > 0) && (
          <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:max-w-3xl">
            {stats.totalFinanced > 0 && <StatTile dark icon="Banknote" label="Financed to date" value={stats.totalFinanced} suffix=" YER" />}
            {stats.peopleImpacted > 0 && <StatTile dark icon="UserPlus" label="People impacted" value={stats.peopleImpacted} />}
            {stats.co2Avoided > 0 && <StatTile dark icon="Sprout" label="CO₂ avoided (tonnes)" value={stats.co2Avoided} />}
          </div>
        )}

        {stories.length === 0 ? (
          <div className="mt-10">
            <EmptyNote dark icon={Sparkles} title="Success stories are coming" hint="Funded projects will be featured here." />
          </div>
        ) : (
          <div
            ref={scroller}
            className="scrollbar-thin -mx-4 mt-10 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
            role="region"
            aria-label="Success stories — horizontally scrollable"
          >
            {stories.map((s) => (
              <article key={s.id} data-story-card className="group w-[300px] shrink-0 snap-start sm:w-[360px]">
                <GlowCard dark className="flex h-full flex-col overflow-hidden p-0">
                  <div className="relative aspect-[16/10] overflow-hidden">
                    {s.imageUrl ? (
                      <Image
                        src={s.imageUrl}
                        alt={s.title}
                        fill
                        sizes="(max-width: 640px) 90vw, (max-width: 1024px) 400px, 380px"
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
                        <SunGlyph className="h-12 w-12 text-amber-400/30" />
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-zinc-950/80 to-transparent" aria-hidden />
                    {s.sector && (
                      <span className="absolute left-3 top-3 rounded-full border border-amber-400/30 bg-zinc-950/70 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-300 backdrop-blur">
                        {SECTOR_LABELS[s.sector] ?? s.sector}
                      </span>
                    )}
                    {s.amountFinanced != null && (
                      <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-bold text-zinc-950">
                        <Banknote className="h-3 w-3" aria-hidden /> {money(s.amountFinanced, s.currency)}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-zinc-400">
                      {s.location && (
                        <>
                          <MapPin className="h-3.5 w-3.5 text-amber-300/80" aria-hidden /> {s.location}
                        </>
                      )}
                      {s.location && s.year != null && <span aria-hidden>·</span>}
                      {s.year != null && <span>{s.year}</span>}
                    </p>
                    <h3 className="mt-2 text-balance text-base font-bold leading-snug text-zinc-50">{s.title}</h3>
                    <p className="mt-1.5 line-clamp-2 flex-1 text-sm leading-relaxed text-zinc-400">{s.summary}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {s.peopleImpacted != null && (
                        <Badge variant="outline" className="gap-1 rounded-full border-zinc-800 bg-zinc-900/60 text-[11px] text-zinc-300">
                          <Users className="h-3 w-3 text-amber-300/80" aria-hidden /> {s.peopleImpacted.toLocaleString('en-US')} people
                        </Badge>
                      )}
                      {s.co2AvoidedTonnes != null && (
                        <Badge variant="outline" className="gap-1 rounded-full border-zinc-800 bg-zinc-900/60 text-[11px] text-zinc-300">
                          <Leaf className="h-3 w-3 text-emerald-400/80" aria-hidden /> {s.co2AvoidedTonnes.toLocaleString('en-US')} t CO₂
                        </Badge>
                      )}
                    </div>
                    {s.entity && (
                      <p className="mt-4 border-t border-zinc-800 pt-3 text-xs text-zinc-500">
                        Financed by{' '}
                        <Link
                          href={`/funding/entities/${s.entity.id}`}
                          className="rounded font-medium text-amber-300 underline decoration-amber-400/40 underline-offset-2 transition-colors hover:text-amber-200"
                        >
                          {s.entity.name}
                        </Link>
                      </p>
                    )}
                  </div>
                </GlowCard>
              </article>
            ))}
          </div>
        )}
      </SectionContainer>
    </Section>
  )
}

/** Faint sun glyph used as image placeholder / section art. */
function SunGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className={className} aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  )
}

// ── 7 · Partners marquee ─────────────────────────────────────────────────────

export function PartnersBand({ partners }: { partners: PublicPartner[] }) {
  if (partners.length === 0) return null
  return (
    <Section tone="light" curve="up" className="py-12 sm:py-14" aria-label="Partners and network">
      <SectionContainer>
        <Reveal>
          <Eyebrow icon="ShieldCheck">Partners & network</Eyebrow>
        </Reveal>
        <Reveal delay={1}>
          <p className="mt-3 text-sm text-muted-foreground">
            The ecosystem behind the funding network — development partners, energy programs and institutions.
          </p>
        </Reveal>
        <Reveal delay={2} className="mt-8">
          <Marquee speed={46}>
            {partners.map((p) => (
              <PartnerTile key={p.id} name={p.name} monogram={p.monogram} accentColor={p.accentColor} websiteUrl={p.websiteUrl} />
            ))}
          </Marquee>
        </Reveal>
      </SectionContainer>
    </Section>
  )
}

// ── 8 · FAQ ──────────────────────────────────────────────────────────────────

export function FaqBand({ faqs }: { faqs: PublicFaq[] }) {
  if (faqs.length === 0) return null
  return (
    <Section id="faq" tone="muted" className="py-14 sm:py-20" aria-labelledby="faq-heading">
      <SectionContainer>
        <h2 id="faq-heading" className="sr-only">Funding questions</h2>
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="lg:sticky lg:top-24">
            <SectionHead
              align="left"
              eyebrow="FAQ"
              eyebrowIcon="Search"
              title="Funding questions, answered"
              sub="The essentials applicants ask before submitting a financing request."
            />
            <Reveal delay={2}>
              <Button asChild variant="outline" className="mt-6 min-h-11 rounded-xl">
                <Link href="/contact">Still unsure? Talk to us</Link>
              </Button>
            </Reveal>
          </div>
          <Reveal delay={1}>
            <FaqAccordion items={faqs.map((f) => ({ id: f.id, question: f.question, answer: f.answer }))} />
          </Reveal>
        </div>
      </SectionContainer>
    </Section>
  )
}

// ── 9 · Final CTA band ───────────────────────────────────────────────────────

export function FinalCta() {
  return (
    <Section tone="dark" className="py-16 sm:py-24" aria-labelledby="funding-cta-heading">
      {/* layered art */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 top-0 h-96 w-96 rounded-full bg-amber-500/15 blur-[120px]" />
        <div className="absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-orange-600/10 blur-[100px]" />
        <SunGlyph className="absolute -bottom-10 left-1/2 h-64 w-64 -translate-x-1/2 text-amber-400/[0.06]" />
      </div>
      <SectionContainer className="relative text-center">
        <Reveal>
          <Eyebrow tone="dark" icon="HandCoins">
            One request — real offers
          </Eyebrow>
        </Reveal>
        <Reveal delay={1}>
          <h2
            id="funding-cta-heading"
            className="mx-auto mt-5 max-w-2xl text-balance text-3xl font-bold tracking-tight text-zinc-50 sm:text-4xl lg:text-5xl"
          >
            Your project deserves funding
          </h2>
        </Reveal>
        <Reveal delay={2}>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-base leading-relaxed text-zinc-400">
            Submit one request in the platform — verified entities review it and respond with offers you can compare side by side.
          </p>
        </Reveal>
        <Reveal delay={3}>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
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
              <Link href="/contact">Contact the team</Link>
            </Button>
          </div>
        </Reveal>
      </SectionContainer>
    </Section>
  )
}

// ── Program detail page pieces (/funding/programs/[id]) ──────────────────────

/** Serializable projection of a FinancierService for the detail-page client sections. */
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

/** Light editorial hero band for the program detail page. */
export function ProgramHero({ service }: { service: ProgramDetailData }) {
  const cat = PROGRAM_CATEGORIES[service.category] ?? PROGRAM_CATEGORIES.OTHER!
  const isAccreditation = service.serviceKind === 'ACCREDITATION'
  const accent = ORG_ACCENT[service.entity.orgType]

  return (
    <section aria-labelledby="program-hero-heading" className="relative overflow-hidden bg-primary/[0.05] pb-10 pt-10 sm:pb-12 sm:pt-14">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -right-32 -top-32 h-80 w-80 rounded-full bg-primary/10 blur-[100px]" />
        <SunGlyph className="absolute -right-8 -top-10 h-44 w-44 text-primary/[0.07]" />
      </div>
      <SectionContainer className="relative">
        <Reveal>
          <Eyebrow icon={cat.icon}>{cat.label}</Eyebrow>
        </Reveal>
        <Reveal delay={1}>
          <h1 id="program-hero-heading" className="mt-4 max-w-3xl text-balance text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            {service.name}
          </h1>
        </Reveal>
        {service.summary && (
          <Reveal delay={2}>
            <p className="mt-4 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">{service.summary}</p>
          </Reveal>
        )}
        <Reveal delay={3}>
          <div className="mt-7 flex flex-wrap items-center gap-2.5">
            <Link
              href={`/funding/entities/${service.entity.id}`}
              className="group inline-flex min-h-11 items-center gap-2.5 rounded-full border bg-card py-1.5 pl-1.5 pr-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm"
            >
              <Monogram name={service.entity.name} accent={accent} size="sm" />
              <span className="text-sm font-semibold text-foreground">{service.entity.name}</span>
              <span className="text-xs text-muted-foreground">· {service.entity.typeLabel}</span>
            </Link>
            {SEGMENT_LABELS[service.targetSegment ?? ''] && (
              <Badge variant="outline" className="min-h-9 rounded-full px-3.5 text-xs font-semibold">
                {SEGMENT_LABELS[service.targetSegment]}
              </Badge>
            )}
            {isAccreditation && (
              <Badge variant="outline" className="min-h-9 rounded-full border-primary/40 bg-primary/10 px-3.5 text-xs font-semibold text-primary">
                Accreditation program
              </Badge>
            )}
            {service.shariaCompliant && (
              <Badge variant="outline" className="min-h-9 gap-1.5 rounded-full border-emerald-200 bg-emerald-50 px-3.5 text-xs font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-400">
                <Moon className="h-3.5 w-3.5" aria-hidden /> Sharia-compliant
              </Badge>
            )}
          </div>
        </Reveal>
      </SectionContainer>
    </section>
  )
}

/** Sticky key-facts panel + apply CTA + entity mini-card (detail page aside). */
export function KeyFactsPanel({ service }: { service: ProgramDetailData }) {
  const cat = PROGRAM_CATEGORIES[service.category] ?? PROGRAM_CATEGORIES.OTHER!
  const isAccreditation = service.serviceKind === 'ACCREDITATION'
  const accent = ORG_ACCENT[service.entity.orgType]
  const amount = moneyRange(service.amountMin, service.amountMax, service.currency)
  const tenor = tenorLabel(service.tenorMinMonths, service.tenorMaxMonths)

  const rows = [
    amount ? { icon: 'Banknote', label: isAccreditation ? 'Program fee' : 'Amount', value: amount } : null,
    service.rateMax != null
      ? { icon: 'TrendingUp', label: service.rateType ? RATE_LABELS[service.rateType] ?? 'Rate' : 'Rate', value: `up to ${service.rateMax}%` }
      : null,
    tenor ? { icon: 'CalendarClock', label: 'Tenor', value: tenor } : null,
    service.repaymentFrequency && REPAYMENT_LABELS[service.repaymentFrequency]
      ? { icon: 'Repeat', label: 'Repayment', value: REPAYMENT_LABELS[service.repaymentFrequency]! }
      : null,
    service.gracePeriodDays != null ? { icon: 'Snowflake', label: 'Grace period', value: `${service.gracePeriodDays} days` } : null,
    service.processingDays != null ? { icon: 'Gauge', label: 'Decision time', value: `≈ ${service.processingDays} days` } : null,
    isAccreditation && service.accreditationValidMonths != null
      ? { icon: 'ShieldCheck', label: 'Accreditation valid', value: `${service.accreditationValidMonths} months` }
      : null,
  ].filter((r): r is { icon: string; label: string; value: string } => r !== null)

  return (
    <div className="space-y-5 lg:sticky lg:top-24">
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex items-center gap-3 border-b bg-muted/40 px-5 py-4">
          <IconTile name={cat.icon} size="sm" />
          <div>
            <p className="text-sm font-bold text-foreground">Key facts</p>
            <p className="text-[11px] text-muted-foreground">{cat.label}</p>
          </div>
        </div>
        {rows.length > 0 ? (
          <dl className="px-5 py-2">
            {rows.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-4 border-b border-dashed py-3 last:border-0">
                <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <IconTile name={row.icon} size="sm" className="h-6 w-6 rounded-md" />
                  {row.label}
                </dt>
                <dd className="text-right text-sm font-bold tabular-nums text-foreground">{row.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="px-5 py-4 text-sm text-muted-foreground">Terms are set case by case for this program.</p>
        )}
        <div className="space-y-2.5 border-t px-5 py-5">
          <Button asChild size="lg" className="min-h-12 w-full rounded-xl text-base">
            <Link href="/market?view=financing">
              Apply for this program <ArrowRight className="ml-1" aria-hidden />
            </Link>
          </Button>
          <Button asChild variant="ghost" className="min-h-11 w-full rounded-xl">
            <Link href="/funding#programs">Compare all programs</Link>
          </Button>
        </div>
      </div>

      {/* entity mini-card */}
      <div className="rounded-2xl border bg-card p-5">
        <div className="flex items-start gap-3.5">
          <Monogram name={service.entity.name} accent={accent} />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-foreground">{service.entity.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{service.entity.typeLabel}</p>
            {service.entity.regulator && <p className="mt-1 text-[11px] text-muted-foreground">Regulated by {service.entity.regulator}</p>}
          </div>
        </div>
        <Link
          href={`/funding/entities/${service.entity.id}`}
          className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm font-semibold text-primary transition-colors hover:text-primary/80 hover:underline"
        >
          View full profile
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </div>
  )
}

/** "What's included" + "Who it's for" checklists (attributes from the DB). */
export function ProgramChecklists({ features, eligibility }: { features: string[]; eligibility: string[] }) {
  if (features.length === 0 && eligibility.length === 0) return null
  return (
    <div className="grid gap-10 sm:grid-cols-2">
      {features.length > 0 && (
        <section aria-labelledby="included-heading">
          <Reveal>
            <div className="flex items-center gap-2.5">
              <IconTile name="Package" size="sm" />
              <h2 id="included-heading" className="text-xl font-bold tracking-tight text-foreground">
                What's included
              </h2>
            </div>
          </Reveal>
          <ul className="mt-5 space-y-3">
            {features.map((f, i) => (
              <Reveal as="li" key={f} delay={i} className="flex items-start gap-3 rounded-xl border bg-card px-4 py-3.5">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                <span className="text-sm leading-relaxed text-foreground">{f}</span>
              </Reveal>
            ))}
          </ul>
        </section>
      )}
      {eligibility.length > 0 && (
        <section aria-labelledby="eligibility-list-heading">
          <Reveal>
            <div className="flex items-center gap-2.5">
              <IconTile name="UserPlus" size="sm" />
              <h2 id="eligibility-list-heading" className="text-xl font-bold tracking-tight text-foreground">
                Who it's for
              </h2>
            </div>
          </Reveal>
          <ul className="mt-5 space-y-3">
            {eligibility.map((c, i) => (
              <Reveal as="li" key={c} delay={i} className="flex items-start gap-3 rounded-xl border bg-card px-4 py-3.5">
                <ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                <span className="text-sm leading-relaxed text-foreground">{c}</span>
              </Reveal>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

/** Required documents & conditions (requirements engine, ordered). */
export function ProgramRequirements({ requirements }: { requirements: ProgramDetailData['requirements'] }) {
  if (requirements.length === 0) return null
  return (
    <section aria-labelledby="requirements-heading">
      <Reveal>
        <div className="flex items-center gap-2.5">
          <IconTile name="FileText" size="sm" />
          <h2 id="requirements-heading" className="text-xl font-bold tracking-tight text-foreground">
            Documents & conditions
          </h2>
        </div>
      </Reveal>
      <Reveal delay={1}>
        <p className="mt-2 text-sm text-muted-foreground">Everything checked during review — submitted once, verified by the platform.</p>
      </Reveal>
      <RevealGroup className="mt-6 grid gap-3 sm:grid-cols-2">
        {requirements.map((r) => {
          const meta = REQ_META[r.conditionType] ?? { icon: 'FileText', label: r.conditionType }
          return (
            <RevealItem key={r.title} className="h-full">
              <div className="flex h-full items-start gap-3.5 rounded-xl border bg-card p-4 transition-colors hover:border-primary/30">
                <IconTile name={meta.icon} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="text-sm font-bold text-foreground">{r.title}</p>
                    <Badge variant="outline" className="text-[10px] font-semibold uppercase tracking-wide">
                      {meta.label}
                    </Badge>
                  </div>
                  {r.description && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{r.description}</p>}
                  {r.instructions && (
                    <p className="mt-1.5 rounded-lg bg-primary/[0.06] px-2.5 py-1.5 text-xs leading-relaxed text-primary">{r.instructions}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge variant="secondary" className="text-[10px] font-semibold">
                      {r.isRequired ? 'Required' : 'Optional'}
                    </Badge>
                    {r.validityMonths != null && (
                      <Badge variant="secondary" className="gap-1 text-[10px]">
                        <Clock className="h-2.5 w-2.5" aria-hidden /> valid {r.validityMonths} mo
                      </Badge>
                    )}
                    {r.autoPassAccredited && (
                      <Badge variant="outline" className="gap-1 border-emerald-200 bg-emerald-50 text-[10px] font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-400">
                        <ShieldCheckInline className="h-2.5 w-2.5" /> auto-pass with accreditation
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </RevealItem>
          )
        })}
      </RevealGroup>
    </section>
  )
}

/** Region coverage panel — chips on a dotted "map-ish" surface. */
export function CoveragePanel({ coverage }: { coverage: string[] }) {
  if (coverage.length === 0) return null
  return (
    <section aria-labelledby="coverage-heading">
      <Reveal>
        <div className="flex items-center gap-2.5">
          <IconTile name="MapPin" size="sm" />
          <h2 id="coverage-heading" className="text-xl font-bold tracking-tight text-foreground">
            Where it's available
          </h2>
        </div>
      </Reveal>
      <Reveal delay={1}>
        <div
          className="relative mt-6 overflow-hidden rounded-2xl border border-dashed border-primary/30 p-6 sm:p-8"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(180,83,9,0.14) 1.2px, transparent 1.2px)',
            backgroundSize: '22px 22px',
          }}
        >
          <div className="flex flex-wrap items-center gap-2.5">
            {coverage.map((region) => (
              <span
                key={region}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-primary/25 bg-background/90 px-4 py-2 text-sm font-semibold text-foreground shadow-sm backdrop-blur transition-transform hover:-translate-y-0.5"
              >
                <MapPin className="h-4 w-4 text-primary" aria-hidden />
                {region}
              </span>
            ))}
          </div>
          <p className="mt-5 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Badge variant="secondary" className="rounded-full font-bold tabular-nums">
              {coverage.length} {coverage.length === 1 ? 'region' : 'regions'}
            </Badge>
            covered by this program
          </p>
        </div>
      </Reveal>
    </section>
  )
}

/** Related programs grid (same entity or category). */
export function RelatedPrograms({ related }: { related: RelatedProgramCardData[] }) {
  if (related.length === 0) return null
  return (
    <section aria-labelledby="related-heading">
      <Reveal>
        <h2 id="related-heading" className="text-xl font-bold tracking-tight text-foreground">
          More programs to compare
        </h2>
      </Reveal>
      <RevealGroup className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {related.map((p) => {
          const cat = PROGRAM_CATEGORIES[p.category] ?? PROGRAM_CATEGORIES.OTHER!
          const tenor = tenorLabel(p.tenorMinMonths, p.tenorMaxMonths)
          return (
            <RevealItem key={p.id} className="h-full">
              <Link
                href={`/funding/programs/${p.id}`}
                className="group flex h-full flex-col rounded-2xl border bg-card p-5 transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg hover:shadow-zinc-950/[0.06]"
              >
                <div className="flex items-center gap-3">
                  <IconTile name={cat.icon} size="sm" />
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">{cat.label}</p>
                </div>
                <h3 className="mt-4 text-balance text-base font-bold leading-snug text-foreground">{p.name}</h3>
                <p className="mt-0.5 text-xs font-medium text-muted-foreground">by {p.entity.name}</p>
                {p.summary && <p className="mt-2 line-clamp-2 flex-1 text-sm leading-relaxed text-muted-foreground">{p.summary}</p>}
                <div className="mt-4 flex flex-wrap gap-2">
                  {p.amountMax != null && (
                    <Badge variant="secondary" className="rounded-full text-[11px]">
                      up to {money(p.amountMax, p.currency)}
                    </Badge>
                  )}
                  {tenor && (
                    <Badge variant="secondary" className="rounded-full text-[11px]">
                      {tenor}
                    </Badge>
                  )}
                  {p.shariaCompliant && (
                    <Badge variant="outline" className="gap-1 rounded-full border-emerald-200 bg-emerald-50 text-[11px] text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-400">
                      <Moon className="h-3 w-3" aria-hidden /> Sharia
                    </Badge>
                  )}
                </div>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                  View program
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Link>
            </RevealItem>
          )
        })}
      </RevealGroup>
    </section>
  )
}
