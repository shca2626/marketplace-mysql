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
  Clock3,
  Coins,
  CreditCard,
  Facebook,
  FileText,
  Gauge,
  Globe,
  Instagram,
  Landmark,
  Leaf,
  Linkedin,
  Mail,
  MapPin,
  MessageCircle,
  Moon,
  Navigation,
  Phone,
  Send,
  ShieldCheck,
  Sun,
  Twitter,
  Users,
  Youtube,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
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
  PROGRAM_CATEGORIES,
  RATE_LABELS,
  SECTOR_LABELS,
  money,
  moneyRange,
  tenorLabel,
} from '@/components/site/kit'

/**
 * Financier profile — the "mini-website in one page" presentation layer for
 * /funding/entities/[id]. The server page builds a fully serialized
 * EntityPageData projection from the DB and hands it to <FinancierProfile />.
 *
 * Sections: dark editorial hero (snapshot panel + live stat band) → sticky
 * sub-nav → overview dossier → programs grid → branches → stories (dark) →
 * partners marquee → contact & closing CTA (dark).
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

/** lucide icon per social platform (kit SocialButton keys are case-mismatched). */
const PLATFORM_META: Record<string, { icon: LucideIcon; label: string }> = {
  FACEBOOK: { icon: Facebook, label: 'Facebook' },
  X: { icon: Twitter, label: 'X (Twitter)' },
  INSTAGRAM: { icon: Instagram, label: 'Instagram' },
  LINKEDIN: { icon: Linkedin, label: 'LinkedIn' },
  YOUTUBE: { icon: Youtube, label: 'YouTube' },
  WHATSAPP: { icon: MessageCircle, label: 'WhatsApp' },
  TELEGRAM: { icon: Send, label: 'Telegram' },
  WEBSITE: { icon: Globe, label: 'Website' },
}

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

// ── 1. Hero — dark editorial band ───────────────────────────────────────────

function EntityHero({ data }: { data: EntityPageData }) {
  const { accent } = data
  const range = moneyRange(data.minTicket, data.maxTicket)

  return (
    <section id="entity-top" aria-label={`${data.name} — profile`} className="relative overflow-hidden bg-zinc-950 text-zinc-100">
      {/* layered art: accent bloom + solar grid + giant monogram watermark */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 -top-40 h-[26rem] w-[26rem] rounded-full blur-[130px]" style={{ backgroundColor: `${accent}38` }} />
        <div className="absolute -right-28 bottom-[-6rem] h-96 w-96 rounded-full bg-amber-500/10 blur-[110px]" />
        <span
          className="absolute -right-8 -top-24 select-none text-[19rem] font-black leading-none tracking-tighter opacity-[0.05] sm:text-[24rem]"
          style={{ color: accent }}
        >
          {initialsOf(data.name)}
        </span>
        <div
          className="absolute inset-0 opacity-[0.13]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(251,191,36,0.09) 1px, transparent 1px), linear-gradient(90deg, rgba(251,191,36,0.09) 1px, transparent 1px)',
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
              <Monogram name={data.name} accent={accent} size="xl" dark />
              <div className="min-w-0 flex-1">
                <h1 className="text-balance text-3xl font-bold leading-[1.08] tracking-tight text-zinc-50 sm:text-4xl lg:text-[2.8rem]">{data.name}</h1>
                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-400 sm:text-sm">{data.typeLabel}</span>
                  {data.verifiedAt && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                      <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Verified institution
                    </span>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {data.regulator && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700/80 bg-zinc-900/70 px-3 py-1.5 text-xs font-medium text-zinc-300">
                      <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden />
                      Regulated by {data.regulator}
                    </span>
                  )}
                  {data.licenseNumber && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700/80 bg-zinc-900/70 px-3 py-1.5 font-mono text-xs text-zinc-300">
                      <FileText className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden />
                      License {data.licenseNumber}
                    </span>
                  )}
                </div>
              </div>
            </Reveal>

            <Reveal delay={2}>
              <p className="mt-7 line-clamp-2 max-w-2xl text-pretty text-base leading-relaxed text-zinc-400 sm:text-lg">{data.about}</p>
            </Reveal>

            <Reveal delay={3} className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                asChild
                size="lg"
                className="h-12 rounded-full bg-amber-400 px-6 text-[15px] font-bold text-zinc-950 shadow-lg shadow-amber-400/10 transition-all hover:bg-amber-300 hover:shadow-amber-400/20"
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
                className="h-12 rounded-full border-zinc-700 bg-zinc-900/60 px-6 text-[15px] font-semibold text-zinc-200 hover:border-amber-400/50 hover:bg-zinc-900 hover:text-amber-300"
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
                  <span aria-hidden className="mx-1 hidden h-7 w-px bg-zinc-800 sm:block" />
                  <div className="flex flex-wrap items-center gap-2">
                    {data.socialLinks.map((s) => (
                      <SocialIconButton key={`${s.platform}-${s.url}`} social={s} dark />
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

        {/* live stat band */}
        <RevealGroup className="mt-14 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <RevealItem className="h-full">
            <HeroStatTile icon={Coins} label="Financing programs">
              <CountUp value={data.programs.length} />
            </HeroStatTile>
          </RevealItem>
          <RevealItem className="h-full">
            <HeroStatTile icon={MapPin} label="Branches & agents">
              <CountUp value={data.branches.length} />
            </HeroStatTile>
          </RevealItem>
          <RevealItem className="h-full">
            <HeroStatTile icon={Sun} label="Success stories">
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
    <div className="h-full rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 backdrop-blur transition-colors hover:border-zinc-700 sm:p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-amber-300">
          <IconCmp className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xl font-bold tabular-nums text-zinc-50 sm:text-2xl">{children}</p>
          <p className="truncate text-xs font-medium text-zinc-400">{label}</p>
        </div>
      </div>
    </div>
  )
}

function SnapshotPanel({ data }: { data: EntityPageData }) {
  const { accent } = data
  const range = moneyRange(data.minTicket, data.maxTicket)
  const shariaCount = data.programs.filter((p) => p.shariaCompliant).length
  const processingDays = data.programs.map((p) => p.processingDays).filter((d): d is number => d != null)
  const fastest = processingDays.length > 0 ? Math.min(...processingDays) : null
  const regions = new Set(data.programs.flatMap((p) => p.coverage)).size
  const reducedMotion = useReducedMotion()
  const float = reducedMotion ? undefined : { y: [0, -6, 0] }

  return (
    <div className="relative ml-auto w-full max-w-sm">
      <div aria-hidden className="absolute -inset-5 rounded-[2.75rem] border border-dashed" style={{ borderColor: `${accent}4d` }} />
      <div className="relative overflow-hidden rounded-[2rem] border border-zinc-800 bg-zinc-900/70 p-7 shadow-2xl shadow-zinc-950/60 backdrop-blur">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(120% 90% at 85% 0%, ${accent}26, transparent 60%)` }} />
        <div className="relative flex items-center gap-4">
          <Monogram name={data.name} accent={accent} size="lg" dark />
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">Snapshot</p>
            <p className="mt-0.5 truncate text-base font-bold text-zinc-100">{data.typeLabel}</p>
          </div>
        </div>
        <div className="relative mt-5">
          <SnapshotRow icon={Coins} label="Active programs">
            <CountUp value={data.programs.length} />
          </SnapshotRow>
          <SnapshotRow icon={MapPin} label="Coverage">
            {regions > 0 ? `${regions} governorates` : 'Nationwide'}
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
          <p className="relative mt-5 flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3.5 py-2.5 text-xs font-semibold text-emerald-300">
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
          className="absolute -right-4 -top-6 rotate-[3deg] rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 shadow-xl shadow-zinc-950/50"
        >
          <p className="flex items-center gap-2 whitespace-nowrap text-xs font-bold text-amber-300">
            <Moon className="h-4 w-4" aria-hidden /> Sharia-compliant
          </p>
        </motion.div>
      )}
      {fastest != null && (
        <motion.div
          animate={float}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 0.8 }}
          className="absolute -bottom-6 -left-4 -rotate-[2deg] rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 shadow-xl shadow-zinc-950/50"
        >
          <p className="flex items-center gap-2 whitespace-nowrap text-xs font-bold text-zinc-100">
            <Zap className="h-4 w-4 text-amber-300" aria-hidden /> Decisions from {fastest} days
          </p>
        </motion.div>
      )}
    </div>
  )
}

function SnapshotRow({ icon: IconCmp, label, children }: { icon: LucideIcon; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-zinc-800/70 py-2.5 last:border-b-0">
      <span className="flex items-center gap-2 text-sm text-zinc-400">
        <IconCmp className="h-4 w-4 shrink-0 text-amber-300/80" aria-hidden />
        {label}
      </span>
      <span className="text-right text-sm font-semibold tabular-nums text-zinc-100">{children}</span>
    </div>
  )
}

// ── 2. Sticky entity sub-nav ────────────────────────────────────────────────

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
    <nav id="entity-subnav" aria-label={`${data.name} — profile sections`} className="sticky top-16 z-30 border-b border-border bg-background/85 backdrop-blur-md">
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
          <Monogram name={data.name} accent={data.accent} size="sm" />
          <span className="hidden max-w-52 truncate text-sm font-bold tracking-tight md:block">{data.name}</span>
        </a>
        <span aria-hidden className="h-5 w-px shrink-0 bg-border" />
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
                  active === s.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
        <Button asChild size="sm" className="h-9 shrink-0 rounded-full px-4 font-bold">
          <Link href={APPLY_HREF}>
            Apply
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </Button>
      </SectionContainer>
    </nav>
  )
}

// ── 3. Overview / about + identity dossier ─────────────────────────────────

function OverviewSection({ data }: { data: EntityPageData }) {
  const paragraphs = data.about
    .split(/\n{2,}/)
    .map((t) => t.trim())
    .filter(Boolean)

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
            <div className="mt-7 border-l-2 pl-6 sm:pl-7" style={{ borderColor: `${data.accent}59` }}>
              {paragraphs.map((t, i) => (
                <Reveal key={i} delay={i}>
                  <p className="text-pretty text-[15px] leading-[1.85] text-muted-foreground sm:text-base">{t}</p>
                </Reveal>
              ))}
            </div>
          </div>

          <Reveal delay={2} className="lg:col-span-5">
            <div className="h-full rounded-3xl border bg-card p-6 shadow-sm sm:p-7">
              <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
                <FileText className="h-3.5 w-3.5" aria-hidden />
                Institution dossier
              </p>
              <ul className="mt-4">
                <DossierRow icon={ShieldCheck} label="Regulator" value={data.regulator} />
                <DossierRow icon={FileText} label="License number" value={data.licenseNumber} mono />
                <DossierRow icon={Landmark} label="Organization type" value={data.typeLabel} />
                <DossierRow icon={BadgeCheck} label="Platform-verified" value={data.verifiedAt ? `Since ${verifiedLabel(data.verifiedAt)}` : null} />
                <DossierRow icon={Globe} label="Website" value={data.website} href={data.website ?? undefined} external />
                <DossierRow icon={Mail} label="Email" value={data.contactEmail} href={data.contactEmail ? `mailto:${data.contactEmail}` : undefined} />
                <DossierRow icon={Phone} label="Phone" value={data.contactPhone} href={data.contactPhone ? telHref(data.contactPhone) : undefined} />
                <DossierRow icon={MapPin} label="Program coverage" value={`${new Set(data.programs.flatMap((p) => p.coverage)).size} governorates`} />
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
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
        <IconCmp className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">{label}</span>
        <span className={cn('mt-0.5 block truncate text-sm font-semibold text-foreground', mono && 'font-mono text-[13px] tracking-tight')}>{value}</span>
      </span>
      {href && <ArrowUpRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-primary" aria-hidden />}
    </>
  )
  const rowClasses = 'group flex min-h-11 items-center gap-3.5 py-3 sm:-mx-2 sm:rounded-lg sm:px-2 sm:hover:bg-muted/50'
  return (
    <li className="border-b border-border last:border-b-0">
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

// ── 4. Programs — rich service cards ────────────────────────────────────────

function ProgramsSection({ data }: { data: EntityPageData }) {
  const has = data.programs.length > 0
  return (
    <Section id="programs" tone="muted">
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
                <ProgramCard program={p} accent={data.accent} />
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

function ProgramCard({ program, accent }: { program: EntityProgram; accent: string }) {
  const cat = PROGRAM_CATEGORIES[program.category] ?? PROGRAM_CATEGORIES.OTHER!
  const range = moneyRange(program.amountMin, program.amountMax, program.currency)
  const tenor = tenorLabel(program.tenorMinMonths, program.tenorMaxMonths)

  const facts: { icon: LucideIcon; label: string; value: string }[] = []
  if (range) facts.push({ icon: Banknote, label: 'Amount', value: range })
  if (program.rateMax != null) facts.push({ icon: Gauge, label: RATE_LABELS[program.rateType ?? ''] ?? 'Rate cap', value: `Up to ${program.rateMax}%` })
  if (tenor) facts.push({ icon: CalendarClock, label: 'Tenor', value: tenor })
  if (program.processingDays != null) facts.push({ icon: Zap, label: 'Decision', value: `~${program.processingDays} days` })

  return (
    <GlowCard accent={accent} className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
          <Icon name={cat.icon} className="h-3.5 w-3.5" />
          {cat.label}
        </span>
        <Badge variant="outline" className="text-[11px] font-medium text-muted-foreground">
          {program.serviceKind === 'ACCREDITATION' ? 'Accreditation' : 'Financing'}
        </Badge>
        {program.shariaCompliant && (
          <Badge className="gap-1 border border-amber-400/30 bg-amber-400/10 text-[11px] font-semibold text-amber-700 shadow-none hover:bg-amber-400/10 dark:text-amber-300">
            <Moon className="h-3 w-3" aria-hidden /> Sharia
          </Badge>
        )}
      </div>

      <h3 className="mt-4 text-lg font-bold leading-snug tracking-tight">{program.name}</h3>
      {program.summary && <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{program.summary}</p>}

      {facts.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {facts.map((f) => (
            <div key={f.label} className="rounded-xl border bg-background/70 px-3 py-2">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                <f.icon className="h-3 w-3 shrink-0 text-primary/80" aria-hidden />
                {f.label}
              </p>
              <p className="mt-0.5 truncate text-[13px] font-semibold tabular-nums">{f.value}</p>
            </div>
          ))}
        </div>
      )}

      {program.features.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {program.features.slice(0, 3).map((f) => (
            <li key={f} className="flex items-start gap-2 text-[13px] leading-snug text-muted-foreground">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
              {f}
            </li>
          ))}
        </ul>
      )}

      {program.coverage.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-muted-foreground/70" aria-hidden />
          {program.coverage.slice(0, 4).map((r) => (
            <span key={r} className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {r}
            </span>
          ))}
          {program.coverage.length > 4 && (
            <span className="text-[11px] font-medium text-muted-foreground/70">+{program.coverage.length - 4} more</span>
          )}
        </div>
      )}

      <div className="mt-auto pt-5">
        <Button asChild variant="outline" className="group/link w-full justify-between rounded-xl font-semibold">
          <Link href={`/funding/programs/${program.id}`}>
            View program details
            <ArrowRight className="h-4 w-4 transition-transform group-hover/link:translate-x-0.5" aria-hidden />
          </Link>
        </Button>
      </div>
    </GlowCard>
  )
}

// ── 5. Branches ─────────────────────────────────────────────────────────────

function BranchesSection({ data }: { data: EntityPageData }) {
  const has = data.branches.length > 0
  return (
    <Section id="branches" tone="light">
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
    <article className="group relative flex h-full flex-col gap-3 overflow-hidden rounded-2xl border bg-card p-5 pl-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
      <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: accent }} />
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
          <meta.icon className="h-3.5 w-3.5" aria-hidden />
          {meta.label}
        </span>
        {hasGeo && (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-600/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            <Navigation className="h-3 w-3" aria-hidden /> Geo
          </span>
        )}
      </div>
      <h3 className="text-[15px] font-bold leading-snug">{branch.name}</h3>
      {address && (
        <p className="flex items-start gap-2 text-sm leading-snug text-muted-foreground">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" aria-hidden />
          <span>{address}</span>
        </p>
      )}
      {branch.phone && (
        <a href={telHref(branch.phone)} className="mt-auto inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-foreground transition-colors hover:text-primary">
          <Phone className="h-4 w-4 text-primary/70" aria-hidden />
          {branch.phone}
        </a>
      )}
    </article>
  )
}

// ── 6. Success stories — dark editorial band ────────────────────────────────

function StoriesSection({ data }: { data: EntityPageData }) {
  const has = data.stories.length > 0
  return (
    <Section id="stories" tone="dark" curve="up">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-1/3 h-96 w-96 rounded-full bg-amber-500/10 blur-[120px]" />
      </div>
      <SectionContainer className="relative py-16 sm:py-20">
        <SectionHead
          tone="dark"
          eyebrow="Impact"
          eyebrowIcon="Sun"
          title="Success stories"
          sub={has ? `Real projects on the ground, financed by ${data.name}.` : undefined}
        />
        {has ? (
          <RevealGroup className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3" stagger={0.09}>
            {data.stories.map((s) => (
              <RevealItem key={s.id} className="h-full">
                <StoryCard story={s} />
              </RevealItem>
            ))}
          </RevealGroup>
        ) : (
          <Reveal className="mt-10">
            <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/40 px-6 py-10 text-center">
              <Sun className="mx-auto h-6 w-6 text-zinc-600" aria-hidden />
              <p className="mt-3 text-sm leading-relaxed text-zinc-400">No published stories yet — projects financed by {data.name} will appear here as they are verified.</p>
            </div>
          </Reveal>
        )}
      </SectionContainer>
    </Section>
  )
}

function StoryCard({ story }: { story: EntityStory }) {
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60 transition-all duration-300 hover:-translate-y-1 hover:border-zinc-600/70">
      <div className="relative aspect-[16/10] overflow-hidden bg-zinc-900">
        {story.imageUrl ? (
          <Image
            src={story.imageUrl}
            alt={story.title}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.05]"
          />
        ) : (
          <div aria-hidden className="flex h-full items-center justify-center bg-gradient-to-br from-zinc-900 to-zinc-800 text-zinc-700">
            <Sun className="h-10 w-10" />
          </div>
        )}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-zinc-950/70 via-transparent to-transparent" />
        {story.sector && (
          <span className="absolute left-3 top-3 inline-flex items-center rounded-full border border-zinc-700/70 bg-zinc-950/70 px-2.5 py-1 text-[11px] font-semibold text-zinc-200 backdrop-blur">
            {SECTOR_LABELS[story.sector] ?? story.sector}
          </span>
        )}
        {story.year != null && (
          <span className="absolute right-3 top-3 rounded-full bg-zinc-950/70 px-2.5 py-1 text-[11px] font-semibold text-zinc-300 backdrop-blur">{story.year}</span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-base font-bold leading-snug tracking-tight text-zinc-100">{story.title}</h3>
        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-zinc-400">{story.summary}</p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {story.amountFinanced != null && <DarkChip icon={Banknote}>{money(story.amountFinanced, story.currency)} financed</DarkChip>}
          {story.location && <DarkChip icon={MapPin}>{story.location}</DarkChip>}
          {story.peopleImpacted != null && <DarkChip icon={Users}>{story.peopleImpacted.toLocaleString('en-US')} people reached</DarkChip>}
          {story.co2AvoidedTonnes != null && <DarkChip icon={Leaf}>{story.co2AvoidedTonnes.toLocaleString('en-US')} t CO₂ avoided</DarkChip>}
        </div>
      </div>
    </article>
  )
}

function DarkChip({ icon: IconCmp, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700/80 bg-zinc-900/80 px-2.5 py-1 text-[11px] font-medium text-zinc-300">
      <IconCmp className="h-3.5 w-3.5 text-amber-300" aria-hidden />
      {children}
    </span>
  )
}

// ── 7. Partners — logo marquee ──────────────────────────────────────────────

function PartnersSection({ data }: { data: EntityPageData }) {
  const has = data.partners.length > 0
  return (
    <Section id="partners" tone="light" curve="up">
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

// ── 8. Contact & final CTA — dark band ─────────────────────────────────────

function ContactSection({ data }: { data: EntityPageData }) {
  const { accent } = data
  const socials = data.socialLinks
  return (
    <Section id="contact" tone="dark" curve="up">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-0 h-72 w-[42rem] max-w-full -translate-x-1/2 rounded-full blur-[140px]" style={{ backgroundColor: `${accent}2e` }} />
      </div>
      <SectionContainer className="relative py-16 sm:py-24">
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
            <div className="relative h-full overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/60 p-7 sm:p-8">
              <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full" style={{ background: `radial-gradient(closest-side, ${accent}40, transparent)` }} />
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-400/25 bg-amber-400/10 text-amber-300">
                <Landmark className="h-7 w-7" aria-hidden />
              </span>
              <h3 className="mt-5 text-xl font-bold tracking-tight text-zinc-50">Apply for funding</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                One request — {data.name} and every other verified entity on Vendora can respond with an offer. Compare terms side by side and sign online.
              </p>
              <ol className="mt-6 space-y-2.5">
                {['Submit your request', 'Review entity offers', 'Sign the agreement'].map((s, i) => (
                  <li key={s} className="flex items-center gap-3 text-sm text-zinc-300">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-[11px] font-bold text-amber-300">{i + 1}</span>
                    {s}
                  </li>
                ))}
              </ol>
              <Button
                asChild
                size="lg"
                className="mt-7 w-full rounded-full bg-amber-400 text-[15px] font-bold text-zinc-950 shadow-lg shadow-amber-400/10 hover:bg-amber-300 sm:w-auto sm:px-7"
              >
                <Link href={APPLY_HREF}>
                  Apply for funding
                  <ArrowRight className="h-4.5 w-4.5" aria-hidden />
                </Link>
              </Button>
              <p className="mt-3 text-xs text-zinc-500">Free to apply — no obligation to accept any offer.</p>
            </div>
          </Reveal>

          {/* Direct contact card */}
          <Reveal delay={1}>
            <div className="h-full rounded-3xl border border-zinc-800 bg-zinc-900/60 p-7 sm:p-8">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-700 bg-zinc-900 text-amber-300">
                <Phone className="h-7 w-7" aria-hidden />
              </span>
              <h3 className="mt-5 text-xl font-bold tracking-tight text-zinc-50">Talk to {data.name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                Prefer a direct conversation? Reach the {data.typeLabel.toLowerCase()} team through any channel below.
              </p>
              <div className="mt-6 space-y-1.5">
                <ContactRow icon={Mail} label="Email" value={data.contactEmail} href={data.contactEmail ? `mailto:${data.contactEmail}` : undefined} />
                <ContactRow icon={Phone} label="Phone" value={data.contactPhone} href={data.contactPhone ? telHref(data.contactPhone) : undefined} />
                <ContactRow icon={Globe} label="Website" value={data.website} href={data.website ?? undefined} external />
              </div>
              {socials.length > 0 && (
                <div className="mt-6 flex flex-wrap items-center gap-2.5">
                  <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500">Follow</span>
                  {socials.map((s) => (
                    <SocialIconButton key={`${s.platform}-${s.url}`} social={s} dark />
                  ))}
                </div>
              )}
              <p className="mt-6 flex items-center gap-2 text-xs text-zinc-500">
                <Clock3 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Financing teams typically respond within 1–2 business days.
              </p>
            </div>
          </Reveal>
        </div>

        {/* closing statement */}
        <Reveal className="mt-16 sm:mt-20">
          <div className="mx-auto max-w-3xl text-center">
            <Monogram name={data.name} accent={accent} size="lg" dark className="mx-auto" />
            <p className="mt-5 text-balance text-2xl font-bold leading-snug tracking-tight text-zinc-50 sm:text-[1.9rem]">
              {data.name} is ready to power your next solar project.
            </p>
            <p className="mx-auto mt-3 max-w-xl text-pretty text-sm leading-relaxed text-zinc-400 sm:text-base">
              {data.regulator ? `Regulated by ${data.regulator}, ` : ''}verified by Vendora and reviewed continuously — every program, branch and story on this page is maintained by the
              institution itself.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <Button
                asChild
                size="lg"
                className="h-12 rounded-full bg-amber-400 px-6 text-[15px] font-bold text-zinc-950 shadow-lg shadow-amber-400/10 hover:bg-amber-300"
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
                className="h-12 rounded-full border-zinc-700 bg-transparent px-6 text-[15px] font-semibold text-zinc-200 hover:border-zinc-500 hover:bg-zinc-900 hover:text-zinc-50"
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
    </Section>
  )
}

function ContactRow({ icon: IconCmp, label, value, href, external = false }: { icon: LucideIcon; label: string; value: string | null; href?: string; external?: boolean }) {
  if (!value) return null
  const content = (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-amber-300">
        <IconCmp className="h-4.5 w-4.5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</span>
        <span className="block truncate text-sm font-semibold text-zinc-100">{value}</span>
      </span>
      {href && <ArrowUpRight className="ml-auto h-4 w-4 shrink-0 text-zinc-600 transition-colors group-hover:text-amber-300" aria-hidden />}
    </>
  )
  const classes = 'group flex min-h-11 items-center gap-3.5 rounded-xl px-1 py-1.5 transition-colors hover:bg-zinc-800/50'
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

/** Social icon button with correct per-platform lucide icons. */
function SocialIconButton({ social, dark = false }: { social: EntitySocial; dark?: boolean }) {
  const meta = PLATFORM_META[social.platform]
  const label = social.label || meta?.label || social.platform
  return (
    <a
      href={social.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${label} — opens in a new tab`}
      className={cn(
        'inline-flex h-11 w-11 items-center justify-center rounded-xl border transition-all hover:-translate-y-0.5',
        dark
          ? 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-amber-400/50 hover:text-amber-300'
          : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-primary',
      )}
    >
      {meta ? <meta.icon className="h-4.5 w-4.5" aria-hidden /> : <Globe className="h-4.5 w-4.5" aria-hidden />}
    </a>
  )
}

function EmptyNote({ icon: IconCmp, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed px-6 py-10 text-center text-muted-foreground">
      <IconCmp className="mx-auto h-6 w-6 text-muted-foreground/60" aria-hidden />
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed">{children}</p>
    </div>
  )
}
