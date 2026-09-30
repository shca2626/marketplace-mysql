'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, Building2, Check, Landmark, Store } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * S2 — The three pillars identity strip (pagedesign.md §5.1): Shop /
 * Buy for business / Fund. A visitor understands the whole platform from
 * this single band.
 * Vendora "bh" system: white cards, gold icon tiles, navy headings.
 */
const PILLARS = [
  {
    n: '01',
    icon: Store,
    title: 'Shop',
    text: 'Solar panels, LiFePO4 batteries, inverters and submersible pumps from engineer-owned stores.',
    points: ['Engineer-reviewed listings', 'Reviews & buyer protection', 'Favorites and compare'],
    href: '/market',
    cta: 'Browse products',
  },
  {
    n: '02',
    icon: Building2,
    title: 'Buy for business',
    text: 'Procure in bulk with requests for quotes, recurring schedules and organization price lists.',
    points: ['RFQs with seller quotes', 'Recurring procurement', 'Org price lists & approvals'],
    href: '/market?view=rfqs',
    cta: 'Open your RFQ inbox',
  },
  {
    n: '03',
    icon: Landmark,
    title: 'Fund',
    text: 'Finance the project, not just the hardware — offers and agreements from verified funding entities.',
    points: ['Verified funding entities', 'Competitive offers', 'Signed agreements'],
    href: '/funding',
    cta: 'Explore funding',
  },
]

export function ThreePillars() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8" aria-labelledby="pillars-heading">
      <div className="mb-8 text-center">
        <p className="inline-flex items-center gap-1.5 rounded-full border border-bh-gold/25 bg-bh-bg-gold px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-bh-gold-dark">
          One platform
        </p>
        <h2 id="pillars-heading" className="h2-practical mt-4 text-balance tracking-tight text-bh-navy sm:text-2xl lg:text-3xl">
          Everything your solar project needs
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-pretty text-sm text-bh-subtle sm:text-base">
          The market is one page of the platform — here is the whole picture.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {PILLARS.map((p, i) => (
          <motion.div
            key={p.n}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08, duration: 0.35 }}
            className="group relative flex flex-col rounded-2xl border border-bh-border bg-bh-card p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-bh-gold/40 hover:shadow-hover"
          >
            <span className="pointer-events-none absolute right-5 top-4 text-4xl font-extrabold text-bh-faded/15 transition-colors group-hover:text-bh-gold/20" aria-hidden>
              {p.n}
            </span>
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-bh-bg-gold text-bh-gold">
              <p.icon size={21} aria-hidden />
            </span>
            <h3 className="mt-4 text-lg font-bold tracking-tight text-bh-navy">{p.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-bh-subtle">{p.text}</p>
            <ul className="mt-4 space-y-1.5">
              {p.points.map((pt) => (
                <li key={pt} className="flex items-center gap-2 text-sm text-bh-subtle">
                  <Check size={14} className="shrink-0 text-bh-gold" aria-hidden /> {pt}
                </li>
              ))}
            </ul>
            <div className="mt-5 pt-1">
              <Button variant="ghost" className="rounded-full px-4 text-bh-action group-hover:gap-2 hover:text-bh-navy-deep" asChild>
                <Link href={p.href}>
                  {p.cta} <ArrowRight size={15} className="ml-1 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
              </Button>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
