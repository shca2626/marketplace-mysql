'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  Clock,
  Handshake,
  HelpCircle,
  Landmark,
  Mail,
  Package,
  ShoppingBag,
  Store,
  Sun,
} from 'lucide-react'
import { NewsletterForm } from '@/components/site/newsletter-form'
import { ContactForm } from '@/components/site/contact-form'

/**
 * /contact client sections (pagedesign.md §5.5) — hero, channels grid,
 * the form section (with the <ContactForm /> island) and quick links.
 * Only the email channels above are listed as placeholders until the owner
 * provides real ones — no invented addresses, phones or chat handles.
 * Vendora "bh" system: navy gradient hero, white cards with gold icon
 * tiles, navy heads, soft-blue highlight rows.
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

/* ── Hero ──────────────────────────────────────────────────────────── */

export function ContactHero() {
  return (
    <section
      aria-labelledby="contact-hero-heading"
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
        <Sun className="absolute right-[12%] top-16 h-36 w-36 text-bh-gold/15" strokeWidth={0.8} />
      </div>
      <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <motion.div {...inView()} className="max-w-2xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-bh-gold/30 bg-bh-gold/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-bh-gold">
            Contact
          </span>
          <h1
            id="contact-hero-heading"
            className="mt-5 text-balance text-3xl font-extrabold leading-[1.12] tracking-tight text-white sm:text-4xl lg:text-[2.75rem]"
          >
            Talk to the{' '}
            <span className="bg-gradient-to-r from-bh-gold-light to-bh-gold bg-clip-text text-transparent">
              Vendora team
            </span>
          </h1>
          <p className="mt-4 max-w-lg text-pretty text-base leading-relaxed text-white/75 sm:text-lg">
            Questions about an order, funding, selling or partnering — pick a channel below or send
            us a message and we&apos;ll take it from there.
          </p>
        </motion.div>
      </div>
    </section>
  )
}

/* ── Channels grid ────────────────────────────────────────────────── */

const CHANNELS = [
  {
    icon: ShoppingBag,
    title: 'Sales & orders',
    email: 'sales@vendora.com',
    text: 'Orders, shipping and product questions.',
  },
  {
    icon: Landmark,
    title: 'Funding & financing',
    email: 'funding@vendora.com',
    text: 'Financing requests, entity programs and eligibility.',
  },
  {
    icon: Store,
    title: 'Seller support',
    email: 'sellers@vendora.com',
    text: 'Listings, payouts and becoming a seller.',
  },
  {
    icon: Handshake,
    title: 'Partnerships',
    email: 'partners@vendora.com',
    text: 'Suppliers, institutions and platform partnerships.',
  },
]

export function ContactChannels() {
  return (
    <section aria-labelledby="channels-heading" className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
      <motion.div {...inView()}>
        <SectionHeader
          headingId="channels-heading"
          eyebrow="Channels"
          title="Reach the right team directly"
          sub="Every channel is answered by a human — replies within 1 business day."
        />
      </motion.div>
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {CHANNELS.map((channel, i) => (
          <motion.article
            key={channel.email}
            {...inView(0.08 + i * 0.06)}
            className="flex flex-col rounded-2xl border border-bh-border bg-bh-card p-5 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-bh-gold/40 hover:shadow-hover"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-bh-bg-gold text-bh-gold">
              <channel.icon size={20} aria-hidden />
            </span>
            <h3 className="mt-4 text-base font-bold text-bh-navy">{channel.title}</h3>
            <p className="mt-1.5 flex-1 text-sm leading-relaxed text-bh-subtle">{channel.text}</p>
            <a
              href={`mailto:${channel.email}`}
              className="mt-4 inline-flex items-center gap-1.5 self-start break-all rounded-lg py-2 text-sm font-semibold text-bh-action transition-colors hover:text-bh-navy-deep hover:underline"
            >
              <Mail size={14} className="shrink-0" aria-hidden />
              {channel.email}
            </a>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-bh-muted">
              <Clock size={13} className="shrink-0 text-emerald-600" aria-hidden />
              Replies within 1 business day
            </p>
          </motion.article>
        ))}
      </div>
    </section>
  )
}

/* ── Contact form section (form island + what-happens-next aside) ───── */

const NEXT_STEPS = [
  'Your message is routed to the team behind the topic you pick.',
  'You get a reply within 1 business day — usually faster.',
  'Follow-ups continue over email, no ticket numbers to remember.',
]

export function ContactFormSection() {
  return (
    <section aria-labelledby="contact-form-heading" className="border-y border-bh-border bg-bh-card">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
        <motion.div {...inView()}>
          <SectionHeader
            headingId="contact-form-heading"
            eyebrow="Message us"
            title="Send us a message"
            sub="Tell us what you need — it goes straight to the team behind the topic you pick."
          />
        </motion.div>
        <div className="mt-8 grid gap-6 lg:grid-cols-5">
          <motion.div
            {...inView(0.08)}
            className="rounded-2xl border border-bh-border bg-bh-card p-5 shadow-card sm:p-6 lg:col-span-3"
          >
            <ContactForm />
          </motion.div>
          <motion.aside {...inView(0.16)} className="lg:col-span-2" aria-label="What happens next">
            <div className="rounded-2xl border border-bh-border bg-bh-card p-5 shadow-card sm:p-6">
              <h3 className="text-base font-bold text-bh-navy">What happens next</h3>
              <ol className="mt-4 space-y-4">
                {NEXT_STEPS.map((step, i) => (
                  <li key={step} className="flex gap-3">
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bh-bg-gold text-xs font-bold text-bh-gold-dark"
                      aria-hidden
                    >
                      {i + 1}
                    </span>
                    <p className="text-sm leading-relaxed text-bh-subtle">{step}</p>
                  </li>
                ))}
              </ol>
            </div>
            <div className="mt-4 rounded-2xl border border-bh-gold/30 bg-bh-gold-pale p-5">
              <h3 className="text-sm font-bold text-bh-navy">A note on limits</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-bh-subtle">
                The form allows 5 messages per 10 minutes per sender. Need more? Email us directly
                from the channels above — every inbox is monitored.
              </p>
            </div>
          </motion.aside>
        </div>
      </div>
    </section>
  )
}

/* ── Quick links ───────────────────────────────────────────────────── */

const QUICK_LINKS = [
  {
    href: '/funding#eligibility',
    icon: HelpCircle,
    title: 'Funding FAQ',
    text: 'Eligibility, documents and how entity offers work.',
  },
  {
    href: '/market?view=orders',
    icon: Package,
    title: 'Track an order',
    text: 'See status and tracking for your marketplace orders.',
  },
  {
    href: '/market?view=seller',
    icon: Store,
    title: 'Sell on Vendora',
    text: 'Open a store, list products and manage payouts.',
  },
]

export function ContactQuickLinks() {
  return (
    <section aria-labelledby="quick-links-heading" className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
      <motion.div {...inView()}>
        <SectionHeader
          headingId="quick-links-heading"
          eyebrow="Quick links"
          title="Common answers"
          sub="Most questions are one click away — and the newsletter keeps you posted on what's new."
        />
      </motion.div>
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {QUICK_LINKS.map((link, i) => (
          <motion.article
            key={link.href}
            {...inView(0.08 + i * 0.06)}
            className="flex flex-col rounded-2xl border border-bh-border bg-bh-card p-5 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-bh-gold/40 hover:shadow-hover"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-bh-bg-gold text-bh-gold">
              <link.icon size={20} aria-hidden />
            </span>
            <h3 className="mt-4 text-base font-bold text-bh-navy">
              <Link
                href={link.href}
                className="transition-colors hover:text-bh-action hover:underline"
              >
                {link.title}
              </Link>
            </h3>
            <p className="mt-1.5 flex-1 text-sm leading-relaxed text-bh-subtle">{link.text}</p>
            <Link
              href={link.href}
              className="mt-4 inline-flex items-center gap-1 self-start rounded-lg py-2 text-sm font-semibold text-bh-action transition-colors hover:text-bh-navy-deep hover:underline"
            >
              Open <ArrowRight size={14} aria-hidden />
            </Link>
          </motion.article>
        ))}

        {/* Newsletter card — the inline signup the quick-links section promises */}
        <motion.article
          {...inView(0.08 + QUICK_LINKS.length * 0.06)}
          className="flex flex-col rounded-2xl border border-bh-border bg-bh-card p-5 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-bh-gold/40 hover:shadow-hover"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-bh-bg-gold text-bh-gold">
            <Mail size={20} aria-hidden />
          </span>
          <h3 className="mt-4 text-base font-bold text-bh-navy">Newsletter</h3>
          <p className="mt-1.5 flex-1 text-sm leading-relaxed text-bh-subtle">
            Monthly solar insights and platform news. No spam, unsubscribe anytime.
          </p>
          <div className="mt-4">
            <NewsletterForm compact />
          </div>
        </motion.article>
      </div>
    </section>
  )
}
