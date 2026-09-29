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
} from 'lucide-react'
import { NewsletterForm } from '@/components/site/newsletter-form'
import { ContactForm } from '@/components/site/contact-form'

/**
 * /contact client sections (pagedesign.md §5.5) — hero, channels grid,
 * the form section (with the <ContactForm /> island) and quick links.
 * Only the email channels above are listed as placeholders until the owner
 * provides real ones — no invented addresses, phones or chat handles.
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

/* ── Hero ──────────────────────────────────────────────────────────── */

export function ContactHero() {
  return (
    <section
      aria-labelledby="contact-hero-heading"
      className="relative overflow-hidden bg-gradient-to-br from-orange-50 via-amber-50/60 to-rose-50 dark:from-orange-950/30 dark:via-amber-950/15 dark:to-rose-950/20"
    >
      <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-primary/10 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-rose-400/10 blur-3xl" aria-hidden />
      <div className="mx-auto max-w-7xl px-4 py-14">
        <motion.div {...inView()} className="max-w-2xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary/80">Contact</p>
          <h1
            id="contact-hero-heading"
            className="mt-2 text-3xl font-extrabold leading-[1.12] tracking-tight sm:text-4xl lg:text-5xl"
          >
            Talk to the{' '}
            <span className="bg-gradient-to-r from-orange-600 to-amber-500 bg-clip-text text-transparent">
              Vendora team
            </span>
          </h1>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
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
    <section aria-labelledby="channels-heading" className="mx-auto max-w-7xl px-4 py-12 sm:py-14">
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
            className="flex flex-col rounded-2xl border bg-card p-5 transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <channel.icon size={20} aria-hidden />
            </span>
            <h3 className="mt-4 text-base font-bold">{channel.title}</h3>
            <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground">{channel.text}</p>
            <a
              href={`mailto:${channel.email}`}
              className="mt-4 inline-flex items-center gap-1.5 self-start break-all rounded-lg py-2 text-sm font-semibold text-primary transition-colors hover:text-primary/80 hover:underline"
            >
              <Mail size={14} className="shrink-0" aria-hidden />
              {channel.email}
            </a>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
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
    <section aria-labelledby="contact-form-heading" className="border-y bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:py-14">
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
            className="rounded-2xl border bg-card p-5 sm:p-6 lg:col-span-3"
          >
            <ContactForm />
          </motion.div>
          <motion.aside {...inView(0.16)} className="lg:col-span-2" aria-label="What happens next">
            <div className="rounded-2xl border bg-card p-5 sm:p-6">
              <h3 className="text-base font-bold">What happens next</h3>
              <ol className="mt-4 space-y-4">
                {NEXT_STEPS.map((step, i) => (
                  <li key={step} className="flex gap-3">
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary"
                      aria-hidden
                    >
                      {i + 1}
                    </span>
                    <p className="text-sm leading-relaxed text-muted-foreground">{step}</p>
                  </li>
                ))}
              </ol>
            </div>
            <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/5 p-5">
              <h3 className="text-sm font-bold">A note on limits</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
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
    <section aria-labelledby="quick-links-heading" className="mx-auto max-w-7xl px-4 py-12 sm:py-14">
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
            className="flex flex-col rounded-2xl border bg-card p-5 transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <link.icon size={20} aria-hidden />
            </span>
            <h3 className="mt-4 text-base font-bold">
              <Link
                href={link.href}
                className="transition-colors hover:text-primary hover:underline"
              >
                {link.title}
              </Link>
            </h3>
            <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground">{link.text}</p>
            <Link
              href={link.href}
              className="mt-4 inline-flex items-center gap-1 self-start rounded-lg py-2 text-sm font-semibold text-primary transition-colors hover:text-primary/80 hover:underline"
            >
              Open <ArrowRight size={14} aria-hidden />
            </Link>
          </motion.article>
        ))}

        {/* Newsletter card — the inline signup the quick-links section promises */}
        <motion.article
          {...inView(0.08 + QUICK_LINKS.length * 0.06)}
          className="flex flex-col rounded-2xl border bg-card p-5 transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Mail size={20} aria-hidden />
          </span>
          <h3 className="mt-4 text-base font-bold">Newsletter</h3>
          <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground">
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
