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
 * Shared design kit for the public pages — Vendora "bh" light-first system
 * (upload/supplier_qualification_program.html + dual-theme style guide).
 *
 * Visual language:
 *  - LIGHT-FIRST: #f3f6fc canvas, white cards, navy headings (#06396c),
 *    gold accents (#d3af3c), soft-blue highlight rows (#edf6ff/60)
 *  - dark (navy #052e56) reserved for hero + CTA + high-impact bands only
 *  - flat layered sections (white bands / soft-blue washes) — no fake cards
 *  - motion: whileInView reveals, count-up stats, hover lift cards
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
 * Full-width layered section — flat modern bands (no curves).
 * tone: 'light' (page canvas), 'muted' (white surface band),
 * 'glass' (soft-blue wash), 'dark' (navy deep — hero/CTA only).
 */
export function Section({
  id,
  tone = 'light',
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
        'relative scroll-mt-24',
        tone === 'light' && 'bg-transparent',
        tone === 'muted' && 'border-y border-bh-border bg-bh-card',
        tone === 'glass' && 'bg-bh-soft-blue/60',
        tone === 'dark' && 'bg-bh-navy-deep text-white',
        className,
      )}
    >
      {children}
    </section>
  )
}

export function SectionContainer({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8', className)}>{children}</div>
}

/** Eyebrow chip — gold brand pill above section headings. */
export function Eyebrow({ icon, children, tone = 'default' }: { icon?: string | null; children: React.ReactNode; tone?: 'default' | 'dark' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em]',
        tone === 'default'
          ? 'border-bh-gold/25 bg-bh-bg-gold text-bh-gold-dark'
          : 'border-bh-gold/30 bg-bh-gold/15 text-bh-gold',
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
              'h2-practical mt-4 text-balance tracking-tight sm:text-2xl lg:text-3xl',
              tone === 'dark' ? 'text-white' : 'text-bh-navy',
            )}
          >
            {title}
          </h2>
        </Reveal>
        {sub && (
          <Reveal delay={2}>
            <p className={cn('mt-3 text-pretty text-[15px] leading-relaxed', tone === 'dark' ? 'text-white/70' : 'text-bh-subtle')}>{sub}</p>
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
    <Button asChild variant="ghost" className={cn('group gap-1.5 text-bh-action hover:text-bh-navy-deep', tone === 'dark' && 'text-bh-gold hover:text-bh-gold-light')}>
      <Link href={href}>
        {label}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </Button>
  )
}

// ── Cards ──────────────────────────────────────────────────────────────────

/** White surface card with subtle navy shadow + hover lift. */
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
        'group relative rounded-2xl border p-6 shadow-card transition-all duration-300',
        'hover:-translate-y-1 hover:shadow-hover',
        dark
          ? 'border-white/10 bg-white/[0.06] hover:border-white/20'
          : 'border-bh-border bg-bh-card hover:border-bh-gold/40',
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

/** Icon tile — gold-soft rounded square with the brand gold icon. */
export function IconTile({ name, accent, className, dark = false, size = 'md' }: { name?: string | null; accent?: string | null; className?: string; dark?: boolean; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-xl',
        size === 'sm' && 'h-9 w-9',
        size === 'md' && 'h-11 w-11',
        size === 'lg' && 'h-14 w-14',
        dark ? 'bg-white/10 text-bh-gold' : 'bg-bh-bg-gold text-bh-gold',
        className,
      )}
      style={accent ? { backgroundColor: `${accent}1a`, color: accent } : undefined}
    >
      <Icon name={name} className={cn(size === 'sm' ? 'h-4 w-4' : size === 'md' ? 'h-5 w-5' : 'h-7 w-7')} />
    </span>
  )
}

/** Monogram tile for entities & partners (navy deep surface, gold initials). */
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
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-xl font-bold tracking-wide',
        size === 'sm' && 'h-9 w-9 text-xs rounded-lg',
        size === 'md' && 'h-12 w-12 text-sm rounded-xl',
        size === 'lg' && 'h-16 w-16 text-lg rounded-xl',
        size === 'xl' && 'h-20 w-20 text-2xl rounded-2xl',
        dark && 'ring-1 ring-white/15',
      )}
      style={
        accent
          ? { background: `linear-gradient(135deg, ${accent}30, ${accent}12)`, color: accent, border: `1px solid ${accent}50` }
          : { background: 'linear-gradient(135deg, #0a4179, #052e56)', color: '#d3af3c' }
      }
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
    <Reveal className={cn('rounded-2xl border p-5 shadow-card', dark ? 'border-white/10 bg-white/[0.06]' : 'border-bh-border bg-bh-card')}>
      <div className="flex items-center gap-3">
        {icon && <IconTile name={icon} dark={dark} size="sm" />}
        <div className="min-w-0">
          <p className={cn('text-2xl font-bold tabular-nums', dark ? 'text-white' : 'text-bh-navy')}>
            <CountUp value={value} suffix={suffix} prefix={prefix} decimals={decimals} />
          </p>
          <p className={cn('truncate text-xs font-medium', dark ? 'text-white/65' : 'text-bh-muted')}>{label}</p>
          {sub && <p className={cn('mt-0.5 text-[11px]', dark ? 'text-white/45' : 'text-bh-faded')}>{sub}</p>}
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
    <ol className="relative grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((step, i) => (
        <Reveal as="li" key={step.id} delay={i} className="relative">
          {/* connector */}
          {i < steps.length - 1 && (
            <span
              aria-hidden
              className={cn(
                'absolute left-[calc(50%+34px)] top-7 hidden h-px w-[calc(100%-68px)] bg-gradient-to-r lg:block',
                dark ? 'from-bh-gold/50 to-bh-gold/5' : 'from-bh-gold/60 to-bh-gold/10',
              )}
            />
          )}
          <div
            className={cn(
              'h-full rounded-2xl border p-6 text-center shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-hover sm:text-left',
              dark ? 'border-white/10 bg-white/[0.06]' : 'border-bh-border bg-bh-card',
            )}
          >
            <span className="relative">
              <IconTile name={step.icon} dark={dark} />
              <span
                className={cn(
                  'absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold',
                  dark ? 'bg-bh-gold text-bh-navy-deep' : 'bg-bh-navy text-white',
                )}
              >
                {i + 1}
              </span>
            </span>
            <div className="mt-3 min-w-0">
              <p className={cn('font-bold', dark ? 'text-white' : 'text-bh-navy')}>{step.title}</p>
              {step.subtitle && <p className={cn('text-xs font-semibold', dark ? 'text-bh-gold' : 'text-bh-gold-dark')}>{step.subtitle}</p>}
              {step.body && <p className={cn('mt-2 text-sm leading-relaxed', dark ? 'text-white/65' : 'text-bh-subtle')}>{step.body}</p>}
              {step.stat && (
                <Badge variant="outline" className={cn('mt-3 gap-1', dark ? 'border-bh-gold/40 text-bh-gold' : 'border-bh-border-dark bg-bh-page text-bh-muted')}>
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
        'flex items-center gap-3 rounded-xl border px-5 py-3.5 shadow-card transition-all hover:-translate-y-0.5',
        dark ? 'border-white/10 bg-white/[0.06] hover:border-white/25' : 'border-bh-border bg-bh-card hover:border-bh-gold/40 hover:shadow-hover',
      )}
    >
      <Monogram name={name} monogram={monogram} accent={accentColor} size="sm" />
      <span className={cn('whitespace-nowrap text-sm font-semibold', dark ? 'text-white' : 'text-bh-navy')}>{name}</span>
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
    <Accordion type="single" collapsible defaultValue={defaultOpen ? items[0]!.id : undefined} className="w-full">
      {items.map((item, i) => (
        <AccordionItem key={item.id} value={item.id} className={cn('border-b last:border-b-0', dark ? 'border-white/10' : 'border-bh-border')}>
          <AccordionTrigger className={cn('gap-4 py-5 text-left text-[15px] font-semibold hover:no-underline', dark ? 'text-white hover:text-bh-gold' : 'text-bh-navy hover:text-bh-action')}>
            <span className="flex items-center gap-3">
              <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold', dark ? 'bg-bh-gold/15 text-bh-gold' : 'bg-bh-bg-gold text-bh-gold-dark')}>
                {String(i + 1).padStart(2, '0')}
              </span>
              {item.question}
            </span>
          </AccordionTrigger>
          <AccordionContent className={cn('pb-5 pl-13 text-sm leading-relaxed', dark ? 'text-white/65' : 'text-bh-subtle')}>
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
            ? 'border-white/15 bg-white/[0.06] text-white/80 hover:border-bh-gold/50 hover:text-bh-gold'
            : 'border-bh-border bg-bh-card text-bh-muted hover:border-bh-gold/50 hover:text-bh-gold-dark',
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
          ? 'border-white/15 bg-white/[0.06] text-white/80 hover:border-bh-gold/50 hover:text-bh-gold'
          : 'border-bh-border bg-bh-card text-bh-muted hover:border-bh-gold/50 hover:text-bh-gold-dark',
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

/**
 * Count-label pluralization (STAB-7 hygiene): "1 program", never "1 programs".
 * Shared across the site surfaces (funding sections + financier profiles).
 */
const COUNT_SINGULARS: Record<string, string> = {
  programs: 'program',
  branches: 'branch',
  stories: 'story',
  days: 'day',
  months: 'month',
  mos: 'mo',
  governorates: 'governorate',
  'Sharia-compliant programs': 'Sharia-compliant program',
  'CO₂ avoided (tonnes)': 'CO₂ avoided (tonne)',
  'Financing programs': 'Financing program',
  'Branches & agents': 'Branch & agent',
  'Success stories': 'Success story',
  'Active programs': 'Active program',
}

/** Singularize `label` when the count is exactly 1; identity otherwise. */
export function plural(label: string, n: number): string {
  if (n !== 1) return label
  return COUNT_SINGULARS[label] ?? label
}

/** Tenor label "6–36 months" */
export function tenorLabel(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null
  if (min != null && max != null)
    return `${min}–${max} ${plural('months', min === max ? min : max)}`
  if (max != null) return `up to ${max} ${plural('months', max)}`
  return `from ${min} ${plural('months', min as number)}`
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
    <section className="relative overflow-hidden bg-gradient-to-br from-[#052e56] via-[#06396c] to-[#0a4a8c] text-white">
      {/* layered art */}
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
        {art === 'sun' && <Sun className="absolute right-[12%] top-16 h-44 w-44 text-bh-gold/15" strokeWidth={0.8} />}
      </div>
      <SectionContainer className="relative pt-14 pb-12 sm:pt-20 sm:pb-16">
        <div className="max-w-3xl">
          <Reveal>
            <Eyebrow tone="dark" icon="Sun">
              {eyebrow}
            </Eyebrow>
          </Reveal>
          <Reveal delay={1}>
            <h1 className="mt-5 text-balance text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl lg:text-[2.75rem]">{title}</h1>
          </Reveal>
          {sub && (
            <Reveal delay={2}>
              <p className="mt-4 max-w-2xl text-pretty text-base leading-relaxed text-white/75 sm:text-lg">{sub}</p>
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
    </section>
  )
}
