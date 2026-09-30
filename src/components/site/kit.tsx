'use client'

import Link from 'next/link'
import * as React from 'react'
import { motion, useInView, useMotionValue, useSpring, type Variants } from 'framer-motion'
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  Building2,
  CalendarClock,
  Coins,
  CreditCard,
  Droplets,
  Facebook,
  FileSpreadsheet,
  FileText,
  Gauge,
  GitCompareArrows,
  HandCoins,
  Home,
  Instagram,
  Landmark,
  LineChart,
  Linkedin,
  Mail,
  MapPin,
  Moon,
  Package,
  Phone,
  Plug,
  Repeat,
  Search,
  ShieldCheck,
  ShoppingCart,
  Signal,
  Snowflake,
  Sprout,
  Store,
  Sun,
  TrendingUp,
  UserPlus,
  Wallet,
  Wrench,
  Youtube,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

/**
 * Shared design kit for the Phase 3–4 public pages.
 *
 * Visual language (pagedesign.md §9 + user mandate "innovative, not traditional"):
 *  - layered sections with alternating tones + curved dividers
 *  - dark "editorial" bands (zinc-950 + amber) for heroes and stat bands
 *  - bento grids, connected step timelines, monogram tiles, logo marquee
 *  - motion: whileInView reveals, count-up stats, hover lift cards
 *  - NO indigo/blue; amber/solar primary family everywhere
 */

// ── Icon registry (DB stores lucide icon *names*) ──────────────────────────

const ICONS: Record<string, LucideIcon> = {
  ArrowRight, BadgeCheck, Banknote, Building2, CalendarClock, Coins, CreditCard,
  Droplets, Facebook, FileSpreadsheet, FileText, Gauge, GitCompareArrows,
  HandCoins, Home, Instagram, Landmark, LineChart, Linkedin, Mail, MapPin, Moon,
  Package, Phone, Plug, Repeat, Search, ShieldCheck, ShoppingCart, Signal,
  Snowflake, Sprout, Store, Sun, TrendingUp, UserPlus, Wallet, Wrench, Youtube,
}

export function Icon({ name, className, strokeWidth }: { name?: string | null; className?: string; strokeWidth?: number }) {
  const Cmp = (name && ICONS[name]) || BadgeCheck
  return <Cmp className={className} strokeWidth={strokeWidth} aria-hidden />
}

// ── Motion primitives ──────────────────────────────────────────────────────

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.45, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] } }),
}

export function Reveal({
  children,
  className,
  delay = 0,
  as = 'div',
}: {
  children: React.ReactNode
  className?: string
  delay?: number
  as?: 'div' | 'section' | 'li' | 'article' | 'span'
}) {
  const MotionTag = motion[as] as typeof motion.div
  return (
    <MotionTag
      className={className}
      variants={fadeUp}
      custom={delay}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-60px' }}
    >
      {children}
    </MotionTag>
  )
}

/** Staggered children container */
export function RevealGroup({ children, className, stagger = 0.08 }: { children: React.ReactNode; className?: string; stagger?: number }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-60px' }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: stagger } } }}
    >
      {children}
    </motion.div>
  )
}

export function RevealItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={fadeUp}>
      {children}
    </motion.div>
  )
}

// ── Section shells (the "layers") ──────────────────────────────────────────

/**
 * Full-width layered section. tone: 'light' (background), 'muted' (muted/30),
 * 'dark' (zinc-950 editorial band), 'glass' (soft amber wash).
 * curve: renders an SVG curved divider on top of the section.
 */
export function Section({
  id,
  tone = 'light',
  curve,
  className,
  children,
}: {
  id?: string
  tone?: 'light' | 'muted' | 'dark' | 'glass'
  curve?: 'up' | 'down' | false
  className?: string
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      className={cn(
        'relative scroll-mt-24 overflow-hidden',
        tone === 'light' && 'bg-background',
        tone === 'muted' && 'bg-muted/40',
        tone === 'glass' && 'bg-primary/[0.045]',
        tone === 'dark' && 'bg-zinc-950 text-zinc-100',
        className,
      )}
    >
      {curve === 'up' && (
        <div className="pointer-events-none absolute inset-x-0 -top-1 translate-y-[-99%] text-background dark:text-zinc-950" aria-hidden>
          <svg viewBox="0 0 1440 72" preserveAspectRatio="none" className="block h-10 w-full fill-current sm:h-14">
            <path d="M0,72 C360,-24 1080,120 1440,24 L1440,72 Z" />
          </svg>
        </div>
      )}
      {curve === 'down' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-[99%] text-background dark:text-zinc-950" aria-hidden>
          <svg viewBox="0 0 1440 72" preserveAspectRatio="none" className="block h-10 w-full fill-current sm:h-14">
            <path d="M0,0 L1440,48 C1080,144 360,0 0,72 Z" />
          </svg>
        </div>
      )}
      {children}
    </section>
  )
}

export function SectionContainer({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8', className)}>{children}</div>
}

/** Eyebrow chip — small icon + label pill used above every section heading. */
export function Eyebrow({ icon, children, tone = 'default' }: { icon?: string | null; children: React.ReactNode; tone?: 'default' | 'dark' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]',
        tone === 'default'
          ? 'border-primary/25 bg-primary/10 text-primary'
          : 'border-amber-400/30 bg-amber-400/10 text-amber-300',
      )}
    >
      {icon && <Icon name={icon} className="h-3.5 w-3.5" />}
      {children}
    </span>
  )
}

export function SectionHead({
  eyebrow,
  eyebrowIcon,
  title,
  sub,
  tone = 'default',
  align = 'left',
  className,
  action,
}: {
  eyebrow?: string
  eyebrowIcon?: string | null
  title: React.ReactNode
  sub?: React.ReactNode
  tone?: 'default' | 'dark'
  align?: 'left' | 'center'
  className?: string
  action?: React.ReactNode
}) {
  return (
    <div className={cn('flex flex-col gap-4', align === 'center' ? 'items-center text-center' : 'sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className={cn('max-w-2xl', align === 'center' && 'mx-auto')}>
        {eyebrow && (
          <Reveal>
            <Eyebrow icon={eyebrowIcon} tone={tone}>
              {eyebrow}
            </Eyebrow>
          </Reveal>
        )}
        <Reveal delay={1}>
          <h2
            className={cn(
              'mt-4 text-balance text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl',
              tone === 'dark' ? 'text-zinc-50' : 'text-foreground',
            )}
          >
            {title}
          </h2>
        </Reveal>
        {sub && (
          <Reveal delay={2}>
            <p className={cn('mt-3 text-pretty text-base leading-relaxed', tone === 'dark' ? 'text-zinc-400' : 'text-muted-foreground')}>{sub}</p>
          </Reveal>
        )}
      </div>
      {action && (
        <Reveal delay={2} className={cn(align === 'center' && 'mt-2')}>
          {action}
        </Reveal>
      )}
    </div>
  )
}

/** "View all →" link used at the right of section heads. */
export function ViewAll({ href, label = 'View all', tone = 'default' }: { href: string; label?: string; tone?: 'default' | 'dark' }) {
  return (
    <Button asChild variant="ghost" className={cn('group gap-1.5', tone === 'dark' && 'text-amber-300 hover:text-amber-200')}>
      <Link href={href}>
        {label}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </Button>
  )
}

// ── Cards ──────────────────────────────────────────────────────────────────

/** Hover-lift card with soft ring, used across bento grids. */
export function GlowCard({
  className,
  children,
  dark = false,
  accent,
}: {
  className?: string
  children: React.ReactNode
  dark?: boolean
  accent?: string | null
}) {
  return (
    <div
      className={cn(
        'group relative rounded-2xl border p-6 transition-all duration-300',
        'hover:-translate-y-1 hover:shadow-lg hover:shadow-zinc-950/[0.06] dark:hover:shadow-zinc-950/50',
        dark
          ? 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700'
          : 'border-border bg-card hover:border-primary/30',
        className,
      )}
      style={accent ? ({ ['--accent' as string]: accent } as React.CSSProperties) : undefined}
    >
      {accent && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-6 top-0 h-px opacity-70 transition-opacity group-hover:opacity-100"
          style={{ background: 'linear-gradient(90deg, transparent, var(--accent), transparent)' }}
        />
      )}
      {children}
    </div>
  )
}

/** Icon tile — rounded square with icon, tone-aware. */
export function IconTile({ name, accent, className, dark = false, size = 'md' }: { name?: string | null; accent?: string | null; className?: string; dark?: boolean; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-xl border',
        size === 'sm' && 'h-9 w-9',
        size === 'md' && 'h-11 w-11',
        size === 'lg' && 'h-14 w-14',
        dark
          ? 'border-zinc-800 bg-zinc-900 text-amber-300'
          : 'border-primary/20 bg-primary/10 text-primary',
        className,
      )}
      style={accent ? { backgroundColor: `${accent}1a`, borderColor: `${accent}40`, color: accent } : undefined}
    >
      <Icon name={name} className={cn(size === 'sm' ? 'h-4 w-4' : size === 'md' ? 'h-5 w-5' : 'h-7 w-7')} />
    </span>
  )
}

/** Monogram tile for entities & partners (initials on accent-colored surface). */
export function Monogram({ name, monogram, accent, size = 'md', dark = false }: { name: string; monogram?: string | null; accent?: string | null; size?: 'sm' | 'md' | 'lg' | 'xl'; dark?: boolean }) {
  const initials =
    monogram?.trim() ||
    name
      .split(/\s+/)
      .filter((w) => /[a-zA-Z\u0600-\u06FF]/.test(w))
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') ||
    'V'
  const hue = accent || '#d97706'
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-xl font-bold tracking-wide',
        size === 'sm' && 'h-9 w-9 text-xs rounded-lg',
        size === 'md' && 'h-12 w-12 text-sm',
        size === 'lg' && 'h-16 w-16 text-lg',
        size === 'xl' && 'h-20 w-20 text-2xl',
        dark && 'ring-1 ring-white/10',
      )}
      style={{ background: `linear-gradient(135deg, ${hue}26, ${hue}0d)`, color: hue, border: `1px solid ${hue}45` }}
    >
      {initials}
    </span>
  )
}

// ── Animated count-up stat ─────────────────────────────────────────────────

export function CountUp({ value, suffix = '', prefix = '', compact = true, decimals = 0, className }: { value: number; suffix?: string; prefix?: string; compact?: boolean; decimals?: number; className?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })
  const mv = useMotionValue(0)
  const spring = useSpring(mv, { duration: 1.6, bounce: 0 })
  const [display, setDisplay] = React.useState('0')

  React.useEffect(() => {
    if (inView) mv.set(value)
  }, [inView, value, mv])

  React.useEffect(() => {
    const fmt = (n: number) => {
      if (compact && Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(decimals || 1)}M`
      if (compact && Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(decimals || 1)}k`
      return n.toLocaleString('en-US', { maximumFractionDigits: decimals })
    }
    const unsub = spring.on('change', (v) => setDisplay(fmt(v)))
    return unsub
  }, [spring, compact, decimals])

  return (
    <span ref={ref} className={className}>
      {prefix}
      {display}
      {suffix}
    </span>
  )
}

export function StatTile({
  icon,
  label,
  value,
  suffix,
  prefix,
  decimals,
  dark = false,
  sub,
}: {
  icon?: string | null
  label: string
  value: number
  suffix?: string
  prefix?: string
  decimals?: number
  dark?: boolean
  sub?: string
}) {
  return (
    <Reveal className={cn('rounded-2xl border p-5', dark ? 'border-zinc-800 bg-zinc-900/50' : 'border-border bg-card')}>
      <div className="flex items-center gap-3">
        {icon && <IconTile name={icon} dark={dark} size="sm" />}
        <div className="min-w-0">
          <p className={cn('text-2xl font-bold tabular-nums', dark ? 'text-zinc-50' : 'text-foreground')}>
            <CountUp value={value} suffix={suffix} prefix={prefix} decimals={decimals} />
          </p>
          <p className={cn('truncate text-xs font-medium', dark ? 'text-zinc-400' : 'text-muted-foreground')}>{label}</p>
          {sub && <p className={cn('mt-0.5 text-[11px]', dark ? 'text-zinc-500' : 'text-muted-foreground/70')}>{sub}</p>}
        </div>
      </div>
    </Reveal>
  )
}

// ── Step timeline (connected) ──────────────────────────────────────────────

export type StepItem = { id: string; icon?: string | null; title: string; subtitle?: string | null; body?: string | null; stat?: string | null }

/**
 * Connected process timeline — horizontal on lg, vertical on mobile.
 * Numbered nodes linked by a progress line; stats shown as chips.
 */
export function StepFlow({ steps, dark = false, columns = 4 }: { steps: StepItem[]; dark?: boolean; columns?: 3 | 4 | 5 }) {
  return (
    <ol className="relative grid gap-6 sm:grid-cols-2 lg:grid-cols-4" style={{ lgColumns: columns }}>
      {steps.map((step, i) => (
        <Reveal as="li" key={step.id} delay={i} className="relative">
          {/* connector */}
          {i < steps.length - 1 && (
            <span
              aria-hidden
              className={cn(
                'absolute left-[calc(50%+34px)] top-7 hidden h-px w-[calc(100%-68px)] bg-gradient-to-r from-primary/50 to-primary/10 lg:block',
                dark && 'from-amber-400/50 to-amber-400/5',
              )}
            />
          )}
          <div className="flex h-full flex-col items-center gap-3 rounded-2xl border p-6 text-center transition-colors sm:items-start sm:text-left"
            style={{ borderColor: dark ? '#27272a' : undefined, backgroundColor: dark ? 'rgba(24,24,27,0.5)' : undefined }}
          >
            <span className="relative">
              <IconTile name={step.icon} dark={dark} />
              <span
                className={cn(
                  'absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold',
                  dark ? 'bg-amber-400 text-zinc-950' : 'bg-primary text-primary-foreground',
                )}
              >
                {i + 1}
              </span>
            </span>
            <div className="min-w-0">
              <p className={cn('font-semibold', dark ? 'text-zinc-100' : 'text-foreground')}>{step.title}</p>
              {step.subtitle && <p className={cn('text-xs font-medium', dark ? 'text-amber-300/90' : 'text-primary')}>{step.subtitle}</p>}
              {step.body && <p className={cn('mt-2 text-sm leading-relaxed', dark ? 'text-zinc-400' : 'text-muted-foreground')}>{step.body}</p>}
              {step.stat && (
                <Badge variant="outline" className={cn('mt-3 gap-1', dark && 'border-amber-400/30 text-amber-300')}>
                  <CalendarClock className="h-3 w-3" aria-hidden />
                  {step.stat}
                </Badge>
              )}
            </div>
          </div>
        </Reveal>
      ))}
    </ol>
  )
}

// ── Marquee (partners / logos) ─────────────────────────────────────────────

export function Marquee({ children, className, speed = 40 }: { children: React.ReactNode; className?: string; speed?: number }) {
  return (
    <div className={cn('group relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)]', className)}>
      <div
        className="flex w-max animate-marquee items-center gap-4 pr-4 motion-reduce:animate-none motion-reduce:overflow-x-auto group-hover:[animation-play-state:paused]"
        style={{ animationDuration: `${speed}s` }}
      >
        {children}
        {children}
      </div>
    </div>
  )
}

export function PartnerTile({ name, monogram, accentColor, websiteUrl, dark = false }: { name: string; monogram?: string | null; accentColor?: string | null; websiteUrl?: string | null; dark?: boolean }) {
  const inner = (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border px-5 py-3.5 transition-all hover:-translate-y-0.5',
        dark ? 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-600' : 'border-border bg-card hover:border-primary/30 hover:shadow-sm',
      )}
    >
      <Monogram name={name} monogram={monogram} accent={accentColor} size="sm" />
      <span className={cn('whitespace-nowrap text-sm font-semibold', dark ? 'text-zinc-200' : 'text-foreground')}>{name}</span>
    </div>
  )
  return websiteUrl ? (
    <a href={websiteUrl} target="_blank" rel="noopener noreferrer" className="rounded-xl focus-visible:outline-2">
      {inner}
    </a>
  ) : (
    inner
  )
}

// ── FAQ accordion ──────────────────────────────────────────────────────────

export function FaqAccordion({ items, dark = false, defaultOpen = true }: { items: { id: string; question: string; answer: string }[]; dark?: boolean; defaultOpen?: boolean }) {
  if (items.length === 0) return null
  return (
    <Accordion type="single" collapsible defaultValue={defaultOpen ? items[0]!.id : undefined} className={cn('w-full', dark && '[&_svg]:text-zinc-400')}>
      {items.map((item, i) => (
        <AccordionItem key={item.id} value={item.id} className={cn('border-b last:border-b-0', dark ? 'border-zinc-800' : 'border-border')}>
          <AccordionTrigger className={cn('gap-4 py-5 text-left text-[15px] font-semibold hover:no-underline', dark && 'text-zinc-100 hover:text-amber-300')}>
            <span className="flex items-center gap-3">
              <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold', dark ? 'bg-amber-400/15 text-amber-300' : 'bg-primary/10 text-primary')}>
                {String(i + 1).padStart(2, '0')}
              </span>
              {item.question}
            </span>
          </AccordionTrigger>
          <AccordionContent className={cn('pb-5 pl-13 text-sm leading-relaxed', dark ? 'text-zinc-400' : 'text-muted-foreground')}>
            {item.answer}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}

// ── Social links (entity pages) ────────────────────────────────────────────

const SOCIAL_ICON: Record<string, LucideIcon> = {
  FACEBOOK: Facebook,
  INSTAGRAM: Instagram,
  LINKEDIN: Linkedin,
  YOUTUBE: Youtube,
  Facebook,
  Instagram,
  Linkedin,
  Youtube,
}

export function SocialButton({ platform, url, label, dark = false }: { platform: string; url: string; label?: string | null; dark?: boolean }) {
  const Cmp = SOCIAL_ICON[platform]
  const text = label || platform.charAt(0) + platform.slice(1).toLowerCase()
  if (Cmp) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={text}
        className={cn(
          'inline-flex h-10 w-10 items-center justify-center rounded-xl border transition-all hover:-translate-y-0.5',
          dark
            ? 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-amber-400/50 hover:text-amber-300'
            : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-primary',
        )}
      >
        <Cmp className="h-4.5 w-4.5" aria-hidden />
      </a>
    )
  }
  // X / WhatsApp / Website etc → text glyph
  const glyph =
    platform === 'X' ? '𝕏' : platform === 'WHATSAPP' ? '✆' : platform === 'TELEGRAM' ? 'TG' : '↗'
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={text}
      className={cn(
        'inline-flex h-10 w-10 items-center justify-center rounded-xl border text-sm font-semibold transition-all hover:-translate-y-0.5',
        dark
          ? 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-amber-400/50 hover:text-amber-300'
          : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-primary',
      )}
    >
      {glyph}
    </a>
  )
}

// ── Program / domain label maps (used by funding + solutions pages) ────────

export const PROGRAM_CATEGORIES: Record<string, { label: string; icon: string }> = {
  WORKING_CAPITAL: { label: 'Working capital', icon: 'Banknote' },
  INVOICE_FINANCING: { label: 'Invoice financing', icon: 'FileSpreadsheet' },
  PO_FINANCING: { label: 'Purchase-order financing', icon: 'Package' },
  EQUIPMENT: { label: 'Equipment financing', icon: 'Wrench' },
  VEHICLE: { label: 'Vehicle financing', icon: 'Store' },
  HOME: { label: 'Home systems', icon: 'Home' },
  EDUCATION: { label: 'Education', icon: 'Signal' },
  AGRICULTURE: { label: 'Agriculture', icon: 'Sprout' },
  MICROENTERPRISE: { label: 'Micro-business', icon: 'Store' },
  SME: { label: 'SME packages', icon: 'Building2' },
  OTHER: { label: 'Other programs', icon: 'Coins' },
  SUPPLIER_QUALIFICATION: { label: 'Supplier qualification', icon: 'BadgeCheck' },
  VENDOR_APPROVAL: { label: 'Vendor approval', icon: 'BadgeCheck' },
}

export const SEGMENT_LABELS: Record<string, string> = {
  BUSINESS: 'For businesses',
  INDIVIDUAL: 'For individuals',
  BOTH: 'Businesses & individuals',
}

export const RATE_LABELS: Record<string, string> = {
  MURABAHA_ANNUAL: 'Murabaha (annual)',
  FIXED_ANNUAL: 'Fixed annual',
  FLAT_FEE: 'Flat fee',
}

export const SECTOR_LABELS: Record<string, string> = {
  AGRICULTURE: 'Agriculture',
  RETAIL: 'Retail',
  MANUFACTURING: 'Manufacturing',
  HEALTH: 'Healthcare',
  EDUCATION: 'Education',
  SERVICES: 'Services',
  ENERGY: 'Energy',
}

/** Money formatting — compact YER amounts. */
export function money(amount: number | null | undefined, currency = 'YER'): string {
  if (amount == null) return '—'
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}M ${currency}`
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(amount % 1_000 === 0 ? 0 : 1)}k ${currency}`
  return `${amount.toLocaleString('en-US')} ${currency}`
}

/** Range label "80k – 2.5M YER" */
export function moneyRange(min: number | null, max: number | null, currency = 'YER'): string | null {
  if (min == null && max == null) return null
  if (min != null && max != null) return `${money(min, '')} – ${money(max, currency)}`
  if (max != null) return `up to ${money(max, currency)}`
  return `from ${money(min as number, currency)}`
}

/** Tenor label "6–36 months" */
export function tenorLabel(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null
  if (min != null && max != null) return `${min}–${max} months`
  if (max != null) return `up to ${max} months`
  return `from ${min} months`
}

// ── Page hero (dark editorial band with layered art) ───────────────────────

/**
 * Dark editorial hero with: gradient mesh + sun glyph + optional stats row.
 * Used on /funding, /how-it-works, /solutions, /sell, insights index.
 */
export function PageHero({
  eyebrow,
  title,
  sub,
  children,
  stats,
  art = 'sun',
}: {
  eyebrow: string
  eyebrowIcon?: string | null
  title: React.ReactNode
  sub?: React.ReactNode
  children?: React.ReactNode
  stats?: { label: string; value: number; suffix?: string; prefix?: string; icon?: string | null; sub?: string }[]
  art?: 'sun' | 'grid'
}) {
  return (
    <Section tone="dark" className="pt-14 pb-12 sm:pt-20 sm:pb-16">
      {/* layered art */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-amber-500/20 blur-[120px]" />
        <div className="absolute -right-24 top-10 h-80 w-80 rounded-full bg-orange-600/10 blur-[100px]" />
        {art === 'sun' && (
          <Sun className="absolute right-[12%] top-16 h-44 w-44 text-amber-500/10" strokeWidth={0.8} />
        )}
        {art === 'grid' && (
          <div
            className="absolute inset-0 opacity-[0.15]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(251,191,36,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(251,191,36,0.08) 1px, transparent 1px)',
              backgroundSize: '44px 44px',
              maskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, black, transparent)',
            }}
          />
        )}
      </div>
      <SectionContainer className="relative">
        <div className="max-w-3xl">
          <Reveal>
            <Eyebrow tone="dark" icon="Sun">
              {eyebrow}
            </Eyebrow>
          </Reveal>
          <Reveal delay={1}>
            <h1 className="mt-5 text-balance text-3xl font-bold leading-tight tracking-tight text-zinc-50 sm:text-4xl lg:text-5xl">{title}</h1>
          </Reveal>
          {sub && (
            <Reveal delay={2}>
              <p className="mt-4 max-w-2xl text-pretty text-base leading-relaxed text-zinc-400 sm:text-lg">{sub}</p>
            </Reveal>
          )}
          {children && (
            <Reveal delay={3}>
              <div className="mt-7 flex flex-wrap items-center gap-3">{children}</div>
            </Reveal>
          )}
        </div>
        {stats && stats.length > 0 && (
          <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:max-w-4xl">
            {stats.map((s) => (
              <StatTile key={s.label} {...s} dark />
            ))}
          </div>
        )}
      </SectionContainer>
    </Section>
  )
}
