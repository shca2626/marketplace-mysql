'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, BadgeCheck, ClipboardCheck, FileSignature, Landmark, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * S4 — Funding preview (pagedesign.md §5.1): mirrors the /funding page's
 * entity cards + a mini 3-step process. Entity data matches the live
 * verified institutions in the DB (see worklog Task 0-B).
 */
const ENTITIES = [
  { name: 'Al-Amal Bank', type: 'Bank', note: 'Working-capital financing for small producers and traders' },
  { name: 'Al-Kuraimi Microfinance', type: 'Microfinance', note: 'Sharia-compliant financing across 14 governorates' },
  { name: 'Tihama Microfinance', type: 'Microfinance', note: 'Community-rooted financing institution' },
]

const STEPS = [
  { icon: ClipboardCheck, title: 'Submit your request', text: 'Tell the entities what you are funding' },
  { icon: Search, title: 'Review & offers', text: 'Verified entities respond with offers' },
  { icon: FileSignature, title: 'Sign & get funded', text: 'Accept an offer and close the agreement' },
]

export function FundingPreview() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:py-14" aria-labelledby="funding-heading">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary/80">Funding</p>
          <h2 id="funding-heading" className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
            Meet the funding entities
          </h2>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Finance the project — not just the hardware — with verified institutions.
          </p>
        </div>
        <Button variant="ghost" className="group hidden shrink-0 rounded-full text-primary sm:flex" asChild>
          <Link href="/funding">
            See how funding works <ArrowRight size={15} className="ml-1 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Entity cards */}
        {ENTITIES.map((e, i) => (
          <motion.div
            key={e.name}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08, duration: 0.35 }}
            className="group flex items-start gap-4 rounded-2xl border bg-card p-5 transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 font-extrabold text-primary" aria-hidden>
              {e.name.split(' ').filter((w) => /^[A-Z]/.test(w[0] ?? '')).slice(0, 2).map((w) => w[0]).join('')}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-base font-bold tracking-tight">{e.name}</h3>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                  <BadgeCheck size={12} aria-hidden /> Verified
                </span>
              </div>
              <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{e.type}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{e.note}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Mini process + CTA */}
      <div className="mt-6 grid gap-4 rounded-2xl border bg-gradient-to-br from-orange-50 via-amber-50/60 to-rose-50 p-6 dark:from-orange-950/30 dark:via-amber-950/15 dark:to-rose-950/20 md:grid-cols-[1fr_auto] md:items-center sm:p-7">
        <ol className="grid gap-5 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <s.icon size={17} aria-hidden />
              </span>
              <div>
                <p className="text-sm font-semibold">
                  <span className="mr-1 text-primary">{i + 1}.</span> {s.title}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="flex flex-col gap-2 sm:flex-row md:flex-col">
          <Button className="rounded-full" asChild>
            <Link href="/market?view=financing">
              <Landmark size={15} className="mr-1.5" /> Apply now
            </Link>
          </Button>
          <Button variant="outline" className="rounded-full" asChild>
            <Link href="/funding">Learn more</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
