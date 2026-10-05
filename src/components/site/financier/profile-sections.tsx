'use client'

import * as React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion, useReducedMotion } from 'framer-motion'
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Banknote,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Coins,
  CreditCard,
  FileText,
  Gauge,
  Globe,
  Landmark,
  Leaf,
  Mail,
  MapPin,
  Moon,
  Navigation,
  Phone,
  ShieldCheck,
  Sun,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  CountUp,
  Eyebrow,
  GlowCard,
  Icon,
  Marquee,
  Monogram,
  PartnerTile,
  Reveal,
  RevealGroup,
  RevealItem,
  Section,
  SectionContainer,
  SectionHead,
  SocialButton,
  PROGRAM_CATEGORIES,
  RATE_LABELS,
  SECTOR_LABELS,
  money,
  moneyRange,
  plural,
  tenorLabel,
} from '@/components/site/kit'

/**
 * Financier profile — the "mini-website in one page" presentation layer for
 * /funding/entities/[id]. The server page builds a fully serialized
 * EntityPageData projection from the DB and hands it to <FinancierProfile />.
 *
 * bh light-first system: navy gradient hero (the only dark band besides the
 * closing CTA) → white/95 sticky sub-nav → overview (canvas) → programs
 * (soft-blue glass band, white GlowCards) → branches (white band, accent
 * left-bar cards) → stories (white band, horizontal snap scroller) →
 * partners (canvas marquee) → contact & closing (navy gradient band).
 */

// ── Serializable data contract (built by the server page) ───────────────────

export type EntitySocial = { platform: string; url: string; label: string | null }

export type EntityBranch = {
  id: string
  name: string
  kind: string
  street: string | null
  district: string | null
  city: string | null
  phone: string | null
  latitude: number | null
  longitude: number | null
}

export type EntityProgram = {
  id: string
  name: string
  serviceKind: string
  category: string
  summary: string | null
  targetSegment: string | null
  currency: string
  amountMin: number | null
  amountMax: number | null
  rateType: string | null
  rateMax: number | null
  tenorMinMonths: number | null
  tenorMaxMonths: number | null
  processingDays: number | null
  shariaCompliant: boolean
  features: string[]
  coverage: string[]
}

export type EntityStory = {
  id: string
  title: string
  summary: string
  imageUrl: string | null
  sector: string | null
  location: string | null
  year: number | null
  amountFinanced: number | null
  currency: string
  peopleImpacted: number | null
  co2AvoidedTonnes: number | null
}

export type EntityPartner = {
  id: string
  name: string
  monogram: string | null
  accentColor: string | null
  websiteUrl: string | null
  kind: string
}

export type EntityPageData = {
  id: string
  name: string
  orgType: string
  typeLabel: string
  accent: string
  verifiedAt: string | null
  website: string | null
  about: string
  regulator: string | null
  licenseNumber: string | null
  contactEmail: string | null
  contactPhone: string | null
  minTicket: number | null
  maxTicket: number | null
  viewCount: number
  socialLinks: EntitySocial[]
  branches: EntityBranch[]
  programs: EntityProgram[]
  stories: EntityStory[]
  partners: EntityPartner[]
}

// ── Local constants & helpers ────────────────────────────────────────────────

const APPLY_HREF = '/market?view=financing'

const NAV_SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'programs', label: 'Programs' },
  { id: 'branches', label: 'Branches' },
  { id: 'stories', label: 'Stories' },
  { id: 'partners', label: 'Partners' },
  { id: 'contact', label: 'Contact' },
] as const

const BRANCH_META: Record<string, { icon: LucideIcon; label: string }> = {
  BRANCH: { icon: Building2, label: 'Branch' },
  AGENT: { icon: Users, label: 'Agent' },
  ATM: { icon: CreditCard, label: 'ATM' },
}

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter((w) => /[a-zA-Z\u0600-\u06FF]/.test(w))
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || 'V'
  )
}

/** Deterministic "Month Year" for verification dates (no hydration drift). */
function verifiedLabel(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

/** Smooth anchor scroll that clears the sticky header + sub-nav. */
function smoothScrollTo(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const nav = document.getElementById('entity-subnav')
  const offset = 64 + (nav?.offsetHeight ?? 56) + 10
  window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset, behavior: 'smooth' })
}

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^+\d]/g, '')}`
}

// ── Orchestrator ────────────────────────────────────────────────────────────

export function FinancierProfile({ data }: { data: EntityPageData }) {
  return (
    <div>
      <EntityHero data={data} />
      <EntitySubNav data={data} />
      <OverviewSection data={data} />
      <ProgramsSection data={data} />
      <BranchesSection data={data} />
      <StoriesSection data={data} />
      <PartnersSection data={data} />
      <ContactSection data={data} />
    </div>
  )
}

// ── 1. Hero — navy gradient band (dark reserved for the hero + final CTA) ────

function EntityHero({ data }: { data: EntityPageData }) {
  const range = moneyRange(data.minTicket, data.maxTicket)

  return (
    <section id="entity-top" aria-label={`${data.name} — profile`} className="relative overflow-hidden bg-gradient-to-br from-[#052e56] via-[#06396c] to-[#0a4a8c] text-white">
      {/* layered art: gold accent blooms + solar grid + giant monogram watermark */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 -top-40 h-[26rem] w-[26rem] rounded-full bg-bh-gold/15 blur-[130px]" />
        <div className="absolute -right-28 bottom-[-6rem] h-96 w-96 rounded-full bg-bh-gold/10 blur-[110px]" />
        <span
          className="absolute -right-8 -top-24 select-none text-[19rem] font-black leading-none tracking-tighter text-white/5 sm:text-[24rem]"
        >
          {initialsOf(data.name)}
        </span>
        <div
          className="absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(211,175,60,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(211,175,60,0.14) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
            maskImage: 'radial-gradient(ellipse 90% 70% at 50% 0%, black, transparent)',
            WebkitMaskImage: 'radial-gradient(ellipse 90% 70% at 50% 0%, black, transparent)',
          }}
        />
      </div>

      <SectionContainer className="relative py-14 sm:py-20">
        <div className="grid items-start gap-12 lg:grid-cols-12">
          {/* identity + CTAs */}
          <div className="lg:col-span-7">
            <Reveal>
              <Eyebrow tone="dark" icon="Landmark">
                Financier profile
              </Eyebrow>
            </Reveal>

            <Reveal delay={1} className="mt-6 flex flex-wrap items-start gap-5 sm:gap-6">
              <Monogram name={data.name} size="xl" dark />
              <div className="min-w-0 flex-1">
                <h1 className="text-balance text-3xl font-bold leading-[1.08] tracking-tight text-white sm:text-4xl lg:text-[2.8rem]">{data.name}</h1>
                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-bh-gold sm:text-sm">{data.typeLabel}</span>
                  {data.verifiedAt && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                      <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Verified institution
                    </span>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {data.regulator && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white/80">
                      <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-bh-gold" aria-hidden />
                      Regulated by {data.regulator}
                    </span>
                  )}
                  {data.licenseNumber && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 font-mono text-xs text-white/80">
                      <FileText className="h-3.5 w-3.5 shrink-0 text-bh-gold" aria-hidden />
                      License {data.licenseNumber}
                    </span>
                  )}
                </div>
              </div>
            </Reveal>

            <Reveal delay={2}>
              <p className="mt-7 line-clamp-2 max-w-2xl text-pretty text-base leading-relaxed text-white/75 sm:text-lg">{data.about}</p>
            </Reveal>

            <Reveal delay={3} className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                asChild
                size="lg"
                className="h-12 rounded-full bg-bh-gold px-6 text-[15px] font-bold text-bh-navy-deep hover:bg-bh-gold-light"
              >
                <Link href={APPLY_HREF}>
                  Apply for funding
                  <ArrowRight className="h-4.5 w-4.5" aria-hidden />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 rounded-full border-white/25 bg-transparent px-6 text-[15px] font-semibold text-white hover:bg-white/10 hover:text-white"
              >
                <a
                  href="#contact"
                  onClick={(e) => {
                    e.preventDefault()
                    smoothScrollTo('contact')
                  }}
                >
                  Contact the entity
                </a>
              </Button>
              {data.socialLinks.length > 0 && (
                <>
                  <span aria-hidden className="mx-1 hidden h-7 w-px bg-white/15 sm:block" />
                  <div className="flex flex-wrap items-center gap-2">
                    {data.socialLinks.map((s) => (
                      <SocialButton key={`${s.platform}-${s.url}`} platform={s.platform} url={s.url} label={s.label} dark />
                    ))}
                  </div>
                </>
              )}
            </Reveal>
          </div>

          {/* decorative snapshot panel (lg+) */}
          <div className="hidden lg:col-span-5 lg:block" aria-hidden>
            <SnapshotPanel data={data} />
          </div>
        </div>

        {/* live stat band — white/10 glass chips (dark StatTile variant) */}
        <RevealGroup className="mt-14 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <RevealItem className="h-full">
            <HeroStatTile icon={Coins} label={plural('Financing programs', data.programs.length)}>
              <CountUp value={data.programs.length} />
            </HeroStatTile>
          </RevealItem>
          <RevealItem className="h-full">
            <HeroStatTile icon={MapPin} label={plural('Branches & agents', data.branches.length)}>
              <CountUp value={data.branches.length} />
            </HeroStatTile>
          </RevealItem>
          <RevealItem className="h-full">
            <HeroStatTile icon={Sun} label={plural('Success stories', data.stories.length)}>
              <CountUp value={data.stories.length} />
            </HeroStatTile>
          </RevealItem>
          <RevealItem className="h-full">
            <HeroStatTile icon={Banknote} label="Ticket range">
              {range ?? '—'}
            </HeroStatTile>
          </RevealItem>
        </RevealGroup>
      </SectionContainer>
    </section>
  )
}

function HeroStatTile({ icon: IconCmp, label, children }: { icon: LucideIcon; label: string; children: React.ReactNode }) {
  return (
    <div className="h-full rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur transition-colors hover:border-white/25 sm:p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-bh-gold">
          <IconCmp className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xl font-bold tabular-nums text-white sm:text-2xl">{children}</p>
          <p className="truncate text-xs font-medium text-white/65">{label}</p>
        </div>
      </div>
    </div>
  )
}

function SnapshotPanel({ data }: { data: EntityPageData }) {
  const range = moneyRange(data.minTicket, data.maxTicket)
  const shariaCount = data.programs.filter((p) => p.shariaCompliant).length
  const processingDays = data.programs.map((p) => p.processingDays).filter((d): d is number => d != null)
  const fastest = processingDays.length > 0 ? Math.min(...processingDays) : null
  const regions = new Set(data.programs.flatMap((p) => p.coverage)).size
  const reducedMotion = useReducedMotion()
  const float = reducedMotion ? undefined : { y: [0, -6, 0] }

  return (
    <div className="relative ml-auto w-full max-w-sm">
      <div aria-hidden className="absolute -inset-5 rounded-[2.75rem] border border-dashed border-white/15" />
      <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.06] p-7 shadow-2xl shadow-black/30 backdrop-blur">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(120% 90% at 85% 0%, rgba(211,175,60,0.12), transparent 60%)' }} />
        <div className="relative flex items-center gap-4">
          <Monogram name={data.name} size="lg" dark />
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-bh-gold">Snapshot</p>
            <p className="mt-0.5 truncate text-base font-bold text-white">{data.typeLabel}</p>
          </div>
        </div>
        <div className="relative mt-5">
          <SnapshotRow icon={Coins} label={plural('Active programs', data.programs.length)}>
            <CountUp value={data.programs.length} />
          </SnapshotRow>
          <SnapshotRow icon={MapPin} label="Coverage">
            {regions > 0 ? `${regions} ${plural('governorates', regions)}` : 'Nationwide'}
          </SnapshotRow>
          {fastest != null && (
            <SnapshotRow icon={Zap} label="Fastest decision">
              ~{fastest} days
            </SnapshotRow>
          )}
          {shariaCount > 0 && (
            <SnapshotRow icon={Moon} label="Sharia options">
              {shariaCount} {shariaCount === 1 ? 'program' : 'programs'}
            </SnapshotRow>
          )}
          {range && (
            <SnapshotRow icon={Banknote} label="Ticket range">
              {range}
            </SnapshotRow>
          )}
        </div>
        {data.verifiedAt && (
          <p className="relative mt-5 flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3.5 py-2.5 text-xs font-semibold text-emerald-300">
            <BadgeCheck className="h-4 w-4 shrink-0" aria-hidden />
            Verified institution since {verifiedLabel(data.verifiedAt)}
          </p>
        )}
      </div>

      {/* floating chips */}
      {shariaCount > 0 && (
        <motion.div
          animate={float}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -right-4 -top-6 rotate-[3deg] rounded-2xl border border-white/15 bg-bh-navy-deep px-4 py-2.5 shadow-xl shadow-black/40"
        >
          <p className="flex items-center gap-2 whitespace-nowrap text-xs font-bold text-bh-gold">
            <Moon className="h-4 w-4" aria-hidden /> Sharia-compliant
          </p>
        </motion.div>
      )}
      {fastest != null && (
        <motion.div
          animate={float}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 0.8 }}
          className="absolute -bottom-6 -left-4 -rotate-[2deg] rounded-2xl border border-white/15 bg-bh-navy-deep px-4 py-2.5 shadow-xl shadow-black/40"
        >
          <p className="flex items-center gap-2 whitespace-nowrap text-xs font-bold text-white">
            <Zap className="h-4 w-4 text-bh-gold" aria-hidden /> Decisions from {fastest} days
          </p>
        </motion.div>
      )}
    </div>
  )
}

function SnapshotRow({ icon: IconCmp, label, children }: { icon: LucideIcon; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/10 py-2.5 last:border-b-0">
      <span className="flex items-center gap-2 text-sm text-white/60">
        <IconCmp className="h-4 w-4 shrink-0 text-bh-gold" aria-hidden />
        {label}
      </span>
      <span className="text-right text-sm font-semibold tabular-nums text-white">{children}</span>
    </div>
  )
}

// ── 2. Sticky entity sub-nav (white/95 glass bar) ───────────────────────────

function EntitySubNav({ data }: { data: EntityPageData }) {
  const [active, setActive] = React.useState<string>('overview')

  // scroll-spy: highlight whichever section crosses the viewport middle
  React.useEffect(() => {
    const sections = NAV_SECTIONS.map((s) => document.getElementById(s.id)).filter((el): el is HTMLElement => el != null)
    if (sections.length === 0) return
    const spy = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id)
        }
      },
      { rootMargin: '-40% 0px -55% 0px' },
    )
    sections.forEach((el) => spy.observe(el))
    return () => spy.disconnect()
  }, [])

  return (
    <nav id="entity-subnav" aria-label={`${data.name} — profile sections`} className="sticky top-16 z-30 border-b border-bh-border bg-bh-card/95 backdrop-blur-md">
      <SectionContainer className="flex items-center gap-2 sm:gap-3">
        <a
          href="#entity-top"
          onClick={(e) => {
            e.preventDefault()
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
          aria-label={`Back to top — ${data.name}`}
          className="flex min-h-11 shrink-0 items-center gap-2.5 rounded-xl px-1 py-1"
        >
          <Monogram name={data.name} size="sm" />
          <span className="hidden max-w-52 truncate text-sm font-bold tracking-tight text-bh-navy md:block">{data.name}</span>
        </a>
        <span aria-hidden className="h-5 w-px shrink-0 bg-bh-border" />
        <ul className="flex min-h-11 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {NAV_SECTIONS.map((s) => (
            <li key={s.id} className="shrink-0">
              <a
                href={`#${s.id}`}
                onClick={(e) => {
                  e.preventDefault()
                  smoothScrollTo(s.id)
                }}
                aria-current={active === s.id ? 'true' : undefined}
                className={cn(
                  'flex h-11 items-center whitespace-nowrap rounded-full px-3.5 text-[13px] font-semibold transition-colors sm:px-4',
                  active === s.id ? 'bg-bh-navy text-white' : 'text-bh-muted hover:text-bh-navy',
                )}
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
        <Button asChild size="sm" className="h-9 shrink-0 rounded-full bg-bh-action px-4 font-bold text-white hover:bg-bh-navy-deep">
          <Link href={APPLY_HREF}>
            Apply
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </Button>
      </SectionContainer>
    </nav>
  )
}

// ── 3. Overview / about + identity dossier (light canvas) ──────────────────

function OverviewSection({ data }: { data: EntityPageData }) {
  const paragraphs = data.about
    .split(/\n{2,}/)
    .map((t) => t.trim())
    .filter(Boolean)
  const coverageGovernorates = new Set(data.programs.flatMap((p) => p.coverage)).size

  return (
    <Section id="overview" tone="light">
      <SectionContainer className="py-16 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-7">
            <SectionHead
              eyebrow="Overview"
              eyebrowIcon="FileText"
              title={`About ${data.name}`}
              sub="The institution behind the programs — who they are, how they are regulated and how to reach them."
            />
            <div className="mt-7 border-l-4 pl-6 sm:pl-7" style={{ borderLeftColor: `${data.accent}59` }}>
              {paragraphs.map((t, i) => (
                <Reveal key={i} delay={i}>
                  <p className="text-pretty text-[15px] leading-[1.85] text-bh-subtle sm:text-base">{t}</p>
                </Reveal>
              ))}
            </div>
          </div>

          <Reveal delay={2} className="lg:col-span-5">
            <div className="h-full rounded-2xl border border-bh-border bg-bh-card p-6 shadow-card sm:p-7">
              <div className="mb-4 flex items-center justify-between border-b border-bh-border pb-4">
                <div>
                  <h3 className="h3-practical text-bh-navy">Institution dossier</h3>
                  <p className="mt-0.5 text-xs text-bh-muted">{data.typeLabel}</p>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-bh-bg-gold text-bh-gold">
                  <FileText className="h-4.5 w-4.5" aria-hidden />
                </span>
              </div>
              <ul>
                <DossierRow icon={ShieldCheck} label="Regulator" value={data.regulator} />
                <DossierRow icon={FileText} label="License number" value={data.licenseNumber} mono />
                <DossierRow icon={Landmark} label="Organization type" value={data.typeLabel} />
                <DossierRow icon={BadgeCheck} label="Platform-verified" value={data.verifiedAt ? `Since ${verifiedLabel(data.verifiedAt)}` : null} />
                <DossierRow icon={Globe} label="Website" value={data.website} href={data.website ?? undefined} external />
                <DossierRow icon={Mail} label="Email" value={data.contactEmail} href={data.contactEmail ? `mailto:${data.contactEmail}` : undefined} />
                <DossierRow icon={Phone} label="Phone" value={data.contactPhone} href={data.contactPhone ? telHref(data.contactPhone) : undefined} />
                <DossierRow icon={MapPin} label="Program coverage" value={`${coverageGovernorates} ${plural('governorates', coverageGovernorates)}`} />
              </ul>
            </div>
          </Reveal>
        </div>
      </SectionContainer>
    </Section>
  )
}

function DossierRow({
  icon: IconCmp,
  label,
  value,
  href,
  mono = false,
  external = false,
}: {
  icon: LucideIcon
  label: string
  value: string | null
  href?: string
  mono?: boolean
  external?: boolean
}) {
  if (!value) return null
  const content = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-bh-soft-blue text-bh-action">
        <IconCmp className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-bh-muted">{label}</span>
        <span className={cn('mt-0.5 block truncate text-sm font-semibold', href ? 'text-bh-action' : 'text-bh-ink', mono && 'font-mono text-[13px] tracking-tight')}>{value}</span>
      </span>
      {href && <ArrowUpRight className="ml-auto h-4 w-4 shrink-0 text-bh-faded transition-colors group-hover:text-bh-action" aria-hidden />}
    </>
  )
  const rowClasses = 'group flex min-h-11 items-center gap-3.5 py-3 sm:-mx-2 sm:rounded-lg sm:px-2 sm:hover:bg-bh-page'
  return (
    <li className="border-b border-bh-border last:border-b-0">
      {href ? (
        <a
          href={href}
          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          aria-label={`${label}: ${value}`}
          className={rowClasses}
        >
          {content}
        </a>
      ) : (
        <div className={rowClasses}>{content}</div>
      )}
    </li>
  )
}

// ── 4. Programs — reference-style cards on a soft-blue glass band ───────────

function ProgramsSection({ data }: { data: EntityPageData }) {
  const has = data.programs.length > 0
  return (
    <Section id="programs" tone="glass">
      <SectionContainer className="py-16 sm:py-20">
        <SectionHead
          eyebrow="Programs"
          eyebrowIcon="Coins"
          title="Programs & services"
          sub={
            has
              ? `${data.programs.length} active offering${data.programs.length === 1 ? '' : 's'} from ${data.name} — financing programs and accreditation tracks with transparent terms.`
              : undefined
          }
        />
        {has ? (
          <RevealGroup className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3" stagger={0.07}>
            {data.programs.map((p) => (
              <RevealItem key={p.id} className="h-full">
                <ProgramCard program={p} />
              </RevealItem>
            ))}
          </RevealGroup>
        ) : (
          <Reveal className="mt-10">
            <EmptyNote icon={Coins}>
              No active programs are published right now — apply once and let the {data.typeLabel.toLowerCase()} team match you when a program opens.
            </EmptyNote>
          </Reveal>
        )}
      </SectionContainer>
    </Section>
  )
}

function ProgramCard({ program }: { program: EntityProgram }) {
  const cat = PROGRAM_CATEGORIES[program.category] ?? PROGRAM_CATEGORIES.OTHER!
  const range = moneyRange(program.amountMin, program.amountMax, program.currency)
  const tenor = tenorLabel(program.tenorMinMonths, program.tenorMaxMonths)

  const chips: { icon: LucideIcon; text: string }[] = []
  if (range) chips.push({ icon: Banknote, text: range })
  if (program.rateMax != null) chips.push({ icon: Gauge, text: `Up to ${program.rateMax}% ${RATE_LABELS[program.rateType ?? ''] ?? 'rate'}` })
  if (tenor) chips.push({ icon: CalendarClock, text: tenor })
  if (program.processingDays != null) chips.push({ icon: Zap, text: `≈ ${program.processingDays} day${program.processingDays === 1 ? '' : 's'} decision` })

  return (
    <GlowCard className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded bg-bh-bg-gold px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-bh-gold-dark">
          <Icon name={cat.icon} className="h-3.5 w-3.5" />
          {cat.label}
        </span>
        <span className="rounded border border-bh-border-dark bg-bh-page px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-bh-muted">
          {program.serviceKind === 'ACCREDITATION' ? 'Accreditation' : 'Financing'}
        </span>
        {program.shariaCompliant && (
          <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
            <Moon className="h-3 w-3" aria-hidden /> Sharia
          </span>
        )}
      </div>

      <h3 className="mt-3.5 text-base font-bold leading-snug tracking-tight text-bh-navy">{program.name}</h3>
      {program.summary && <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-bh-subtle">{program.summary}</p>}

      {chips.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {chips.map((c) => (
            <span key={c.text} className="inline-flex items-center gap-1.5 rounded border border-bh-border bg-bh-page px-2 py-1 text-[11px] font-medium text-bh-navy">
              <c.icon className="h-3 w-3 shrink-0 text-bh-gold" aria-hidden />
              {c.text}
            </span>
          ))}
        </div>
      )}

      {program.features.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {program.features.slice(0, 3).map((f) => (
            <li key={f} className="flex items-start gap-2 text-[13px] leading-snug text-bh-subtle">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
              {f}
            </li>
          ))}
        </ul>
      )}

      {program.coverage.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-bh-faded" aria-hidden />
          {program.coverage.slice(0, 4).map((r) => (
            <span key={r} className="rounded-full border border-bh-border bg-bh-page px-2 py-0.5 text-[11px] font-medium text-bh-muted">
              {r}
            </span>
          ))}
          {program.coverage.length > 4 && (
            <span className="text-[11px] font-medium text-bh-faded">+{program.coverage.length - 4} more</span>
          )}
        </div>
      )}

      <Link
        href={`/funding/programs/${program.id}`}
        className="mt-auto inline-flex items-center gap-1 pt-5 text-xs font-semibold text-bh-action transition-colors hover:text-bh-navy-deep"
      >
        View program details
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </GlowCard>
  )
}

// ── 5. Branches — white cards with an org-accent left bar (white band) ──────

function BranchesSection({ data }: { data: EntityPageData }) {
  const has = data.branches.length > 0
  return (
    <Section id="branches" tone="muted">
      <SectionContainer className="py-16 sm:py-20">
        <SectionHead
          eyebrow="Network"
          eyebrowIcon="MapPin"
          title="Branches & service points"
          sub={has ? `${data.branches.length} location${data.branches.length === 1 ? '' : 's'} across Yemen — visit the branch or agent nearest to your project.` : undefined}
        />
        {has ? (
          <RevealGroup className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" stagger={0.07}>
            {data.branches.map((b) => (
              <RevealItem key={b.id} className="h-full">
                <BranchCard branch={b} accent={data.accent} />
              </RevealItem>
            ))}
          </RevealGroup>
        ) : (
          <Reveal className="mt-10">
            <EmptyNote icon={MapPin}>{data.name} has not published branch locations yet — reach the financing team directly instead.</EmptyNote>
          </Reveal>
        )}
      </SectionContainer>
    </Section>
  )
}

function BranchCard({ branch, accent }: { branch: EntityBranch; accent: string }) {
  const meta = BRANCH_META[branch.kind] ?? BRANCH_META.BRANCH!
  const address = [branch.street, branch.district, branch.city].filter(Boolean).join(', ')
  const hasGeo = branch.latitude != null && branch.longitude != null

  return (
    <article
      className="flex h-full flex-col gap-3 rounded-2xl border border-bh-border border-l-4 bg-bh-card p-5 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-hover"
      style={{ borderLeftColor: accent }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2.5">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-bh-bg-gold text-bh-gold">
            <meta.icon className="h-4.5 w-4.5" aria-hidden />
          </span>
          <span className="text-[11px] font-bold uppercase tracking-wider text-bh-muted">{meta.label}</span>
        </span>
        {hasGeo && (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-600/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
            <Navigation className="h-3 w-3" aria-hidden /> Geo
          </span>
        )}
      </div>
      <h3 className="text-[15px] font-bold leading-snug text-bh-navy">{branch.name}</h3>
      {address && (
        <p className="flex items-start gap-2 text-sm leading-snug text-bh-subtle">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-bh-gold" aria-hidden />
          <span>{address}</span>
        </p>
      )}
      {branch.phone && (
        <a href={telHref(branch.phone)} className="mt-auto inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-bh-action transition-colors hover:text-bh-navy-deep">
          <Phone className="h-4 w-4 text-bh-gold" aria-hidden />
          {branch.phone}
        </a>
      )}
    </article>
  )
}

// ── 6. Success stories — horizontal snap scroller on a white band ────────────

function StoriesSection({ data }: { data: EntityPageData }) {
  const has = data.stories.length > 0
  const scroller = React.useRef<HTMLDivElement>(null)
  const scrollBy = (dir: 1 | -1) => scroller.current?.scrollBy({ left: dir * 340, behavior: 'smooth' })

  return (
    <Section id="stories" tone="muted" className="border-t-0">
      <SectionContainer className="py-16 sm:py-20">
        <div className="flex items-end justify-between gap-4">
          <SectionHead
            eyebrow="Impact"
            eyebrowIcon="Sun"
            title="Success stories"
            sub={has ? `Real projects on the ground, financed by ${data.name}.` : undefined}
            className="flex-1"
          />
          {has && (
            <div className="hidden shrink-0 gap-2 sm:flex">
              <Button
                variant="outline"
                size="icon"
                aria-label="Scroll stories left"
                onClick={() => scrollBy(-1)}
                className="border-bh-border-dark bg-bh-card text-bh-navy hover:bg-bh-soft-blue hover:text-bh-navy"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="Scroll stories right"
                onClick={() => scrollBy(1)}
                className="border-bh-border-dark bg-bh-card text-bh-navy hover:bg-bh-soft-blue hover:text-bh-navy"
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          )}
        </div>
        {has ? (
          <Reveal className="mt-8">
            <div ref={scroller} className="scrollbar-thin -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2">
              {data.stories.map((s) => (
                <StoryCard key={s.id} story={s} />
              ))}
            </div>
          </Reveal>
        ) : (
          <Reveal className="mt-10">
            <EmptyNote icon={Sun}>No published stories yet — projects financed by {data.name} will appear here as they are verified.</EmptyNote>
          </Reveal>
        )}
      </SectionContainer>
    </Section>
  )
}

function StoryCard({ story }: { story: EntityStory }) {
  return (
    <article className="w-[300px] shrink-0 snap-start overflow-hidden rounded-2xl border border-bh-border bg-bh-card shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-hover sm:w-[330px]">
      <div className="relative h-40 overflow-hidden bg-bh-soft-blue">
        {story.imageUrl ? (
          <Image
            src={story.imageUrl}
            alt={story.title}
            fill
            sizes="330px"
            className="object-cover transition-transform duration-500 hover:scale-105"
          />
        ) : (
          <div aria-hidden className="flex h-full items-center justify-center text-bh-gold">
            <Sun className="h-10 w-10 opacity-60" />
          </div>
        )}
        {story.year != null && (
          <span className="absolute right-3 top-3 rounded-full bg-bh-navy-deep/70 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">{story.year}</span>
        )}
      </div>
      <div className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          {story.sector && (
            <span className="rounded border border-bh-border-dark bg-bh-page px-2 py-0.5 text-[11px] font-semibold text-bh-muted">
              {SECTOR_LABELS[story.sector] ?? story.sector}
            </span>
          )}
          {story.location && (
            <span className="inline-flex items-center gap-1 rounded border border-bh-border bg-bh-page px-2 py-0.5 text-[11px] font-medium text-bh-navy">
              <MapPin className="h-3 w-3 text-bh-gold" aria-hidden />
              {story.location}
            </span>
          )}
        </div>
        <h3 className="mt-2.5 text-sm font-bold text-bh-navy">{story.title}</h3>
        <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-bh-subtle">{story.summary}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium text-bh-navy">
          {story.amountFinanced != null && (
            <span className="rounded border border-bh-border bg-bh-page px-2 py-1">{money(story.amountFinanced, story.currency)} financed</span>
          )}
          {story.peopleImpacted != null && (
            <span className="inline-flex items-center gap-1 rounded border border-bh-border bg-bh-page px-2 py-1">
              <Users className="h-3 w-3 text-bh-gold" aria-hidden />
              {story.peopleImpacted.toLocaleString('en-US')} people
            </span>
          )}
          {story.co2AvoidedTonnes != null && (
            <span className="inline-flex items-center gap-1 rounded border border-bh-border bg-bh-page px-2 py-1">
              <Leaf className="h-3 w-3 text-emerald-600" aria-hidden />
              {story.co2AvoidedTonnes.toLocaleString('en-US')}t CO₂
            </span>
          )}
        </div>
      </div>
    </article>
  )
}

// ── 7. Partners — logo marquee on canvas ────────────────────────────────────

function PartnersSection({ data }: { data: EntityPageData }) {
  const has = data.partners.length > 0
  return (
    <Section id="partners" tone="light">
      <SectionContainer className="py-14 sm:py-16">
        <SectionHead
          eyebrow="Partners"
          eyebrowIcon="BadgeCheck"
          title="Partners & collaborators"
          sub={has ? `${data.partners.length} institutions and initiatives working alongside ${data.name} across Yemen.` : undefined}
        />
        {has ? (
          <Reveal className="mt-9">
            <Marquee speed={46} className="py-1">
              {data.partners.map((p) => (
                <PartnerTile key={p.id} name={p.name} monogram={p.monogram} accentColor={p.accentColor} websiteUrl={p.websiteUrl} />
              ))}
            </Marquee>
          </Reveal>
        ) : (
          <Reveal className="mt-9">
            <EmptyNote icon={BadgeCheck}>Partner announcements from {data.name} will appear here.</EmptyNote>
          </Reveal>
        )}
      </SectionContainer>
    </Section>
  )
}

// ── 8. Contact & final CTA — navy gradient band ────────────────────────────

function ContactSection({ data }: { data: EntityPageData }) {
  const socials = data.socialLinks
  return (
    <section id="contact" className="relative scroll-mt-24 overflow-hidden bg-gradient-to-br from-[#052e56] via-[#06396c] to-[#0a4a8c] py-16 text-white sm:py-24">
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
            WebkitMaskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black, transparent)',
          }}
        />
      </div>
      <SectionContainer className="relative">
        <SectionHead
          align="center"
          tone="dark"
          eyebrow="Contact & apply"
          eyebrowIcon="Mail"
          title={`Fund your next project with ${data.name}`}
          sub="Apply online in minutes, or reach the financing team directly."
        />

        <div className="mt-12 grid gap-5 lg:grid-cols-2">
          {/* Apply card */}
          <Reveal>
            <GlowCard dark className="flex h-full flex-col p-7 sm:p-8">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-bh-gold">
                <Landmark className="h-7 w-7" aria-hidden />
              </span>
              <h3 className="mt-5 text-xl font-bold tracking-tight text-white">Apply for funding</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/70">
                One request — {data.name} and every other verified entity on Vendora can respond with an offer. Compare terms side by side and sign online.
              </p>
              <ol className="mt-6 space-y-2.5">
                {['Submit your request', 'Review entity offers', 'Sign the agreement'].map((s, i) => (
                  <li key={s} className="flex items-center gap-3 text-sm text-white/80">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bh-gold/15 text-[11px] font-bold text-bh-gold">{i + 1}</span>
                    {s}
                  </li>
                ))}
              </ol>
              <Button
                asChild
                size="lg"
                className="mt-7 w-full rounded-full bg-bh-gold text-[15px] font-bold text-bh-navy-deep hover:bg-bh-gold-light sm:w-auto sm:px-7"
              >
                <Link href={APPLY_HREF}>
                  Apply for funding
                  <ArrowRight className="h-4.5 w-4.5" aria-hidden />
                </Link>
              </Button>
              <p className="mt-3 text-xs text-white/45">Free to apply — no obligation to accept any offer.</p>
            </GlowCard>
          </Reveal>

          {/* Direct contact card */}
          <Reveal delay={1}>
            <GlowCard dark className="flex h-full flex-col p-7 sm:p-8">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-bh-gold">
                <Phone className="h-7 w-7" aria-hidden />
              </span>
              <h3 className="mt-5 text-xl font-bold tracking-tight text-white">Talk to {data.name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/70">
                Prefer a direct conversation? Reach the {data.typeLabel.toLowerCase()} team through any channel below.
              </p>
              <div className="mt-6 space-y-1.5">
                <ContactRow icon={Mail} label="Email" value={data.contactEmail} href={data.contactEmail ? `mailto:${data.contactEmail}` : undefined} />
                <ContactRow icon={Phone} label="Phone" value={data.contactPhone} href={data.contactPhone ? telHref(data.contactPhone) : undefined} />
                <ContactRow icon={Globe} label="Website" value={data.website} href={data.website ?? undefined} external />
              </div>
              {socials.length > 0 && (
                <div className="mt-6 flex flex-wrap items-center gap-2.5">
                  <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/45">Follow</span>
                  {socials.map((s) => (
                    <SocialButton key={`${s.platform}-${s.url}`} platform={s.platform} url={s.url} label={s.label} dark />
                  ))}
                </div>
              )}
              <p className="mt-6 flex items-center gap-2 text-xs text-white/45">
                <Clock3 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Financing teams typically respond within 1–2 business days.
              </p>
            </GlowCard>
          </Reveal>
        </div>

        {/* closing statement */}
        <Reveal className="mt-16 sm:mt-20">
          <div className="mx-auto max-w-3xl text-center">
            <Monogram name={data.name} size="lg" dark className="mx-auto" />
            <p className="mt-5 text-balance text-2xl font-bold leading-snug tracking-tight text-white sm:text-[1.9rem]">
              {data.name} is ready to power your next solar project.
            </p>
            <p className="mx-auto mt-3 max-w-xl text-pretty text-sm leading-relaxed text-white/70 sm:text-base">
              {data.regulator ? `Regulated by ${data.regulator}, ` : ''}verified by Vendora and reviewed continuously — every program, branch and story on this page is maintained by the
              institution itself.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <Button
                asChild
                size="lg"
                className="h-12 rounded-full bg-bh-gold px-6 text-[15px] font-bold text-bh-navy-deep hover:bg-bh-gold-light"
              >
                <Link href={APPLY_HREF}>
                  Apply for funding
                  <ArrowRight className="h-4.5 w-4.5" aria-hidden />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 rounded-full border-white/25 bg-transparent px-6 text-[15px] font-semibold text-white hover:bg-white/10 hover:text-white"
              >
                <Link href="/funding">
                  Browse all financiers
                  <ArrowRight className="h-4.5 w-4.5" aria-hidden />
                </Link>
              </Button>
            </div>
          </div>
        </Reveal>
      </SectionContainer>
    </section>
  )
}

function ContactRow({ icon: IconCmp, label, value, href, external = false }: { icon: LucideIcon; label: string; value: string | null; href?: string; external?: boolean }) {
  if (!value) return null
  const content = (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-bh-gold">
        <IconCmp className="h-4.5 w-4.5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-white/50">{label}</span>
        <span className="block truncate text-sm font-semibold text-white">{value}</span>
      </span>
      {href && <ArrowUpRight className="ml-auto h-4 w-4 shrink-0 text-white/30 transition-colors group-hover:text-bh-gold" aria-hidden />}
    </>
  )
  const classes = 'group flex min-h-11 items-center gap-3.5 rounded-xl px-1 py-1.5 transition-colors hover:bg-white/[0.06]'
  if (href) {
    return (
      <a
        href={href}
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        aria-label={`${label}: ${value}`}
        className={classes}
      >
        {content}
      </a>
    )
  }
  return <div className={classes}>{content}</div>
}

// ── Shared bits ────────────────────────────────────────────────────────────

function EmptyNote({ icon: IconCmp, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-bh-border-dark bg-bh-card/50 px-6 py-10 text-center">
      <IconCmp className="mx-auto h-6 w-6 text-bh-faded" aria-hidden />
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-bh-muted">{children}</p>
    </div>
  )
}
