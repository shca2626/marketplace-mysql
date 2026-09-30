'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, Building2, CalendarClock, ListTree, MessagesSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { HERO_COLLAGE } from '@/lib/constants'

/**
 * S5 — B2B preview (pagedesign.md §5.1): the procurement pillar made
 * visible for farms and companies.
 */
const FEATURES = [
  { icon: MessagesSquare, title: 'Requests for quotes', text: 'Send one RFQ, collect seller quotes and negotiate in one thread.' },
  { icon: CalendarClock, title: 'Recurring procurement', text: 'Schedule repeating RFQs so seasonal buying runs itself.' },
  { icon: ListTree, title: 'Org price lists', text: 'Negotiated price lists and approval flows for your organization.' },
]

export function B2BPreview() {
  return (
    <section className="bg-muted/40 py-12 sm:py-14" aria-labelledby="b2b-heading">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 lg:grid-cols-2">
        {/* Copy + features */}
        <motion.div initial={{ opacity: 0, x: -16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.4 }}>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary/80">For business</p>
          <h2 id="b2b-heading" className="mt-1 flex items-center gap-2.5 text-2xl font-bold tracking-tight sm:text-3xl">
            <Building2 className="text-primary" size={26} aria-hidden /> Buying for a farm or a company?
          </h2>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base">
            Skip the per-unit shopping cart. Procure panels, batteries and pumps in bulk with the
            platform's B2B tools — built for organizations, not just households.
          </p>

          <ul className="mt-6 space-y-4">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex items-start gap-3.5 rounded-2xl border bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <f.icon size={18} aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold">{f.title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{f.text}</p>
                </div>
              </li>
            ))}
          </ul>

          <Button size="lg" className="mt-6 rounded-xl" asChild>
            <Link href="/market?view=rfqs">
              Open your RFQ inbox <ArrowRight size={16} className="ml-1" />
            </Link>
          </Button>
        </motion.div>

        {/* Visual */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45 }}
          className="relative mx-auto w-full max-w-md lg:max-w-none"
        >
          <div className="overflow-hidden rounded-3xl border-4 border-background shadow-2xl shadow-orange-900/10">
            <img
              src={HERO_COLLAGE[2]}
              alt="Solar-powered water pumping installation on a farm"
              loading="lazy"
              className="aspect-[4/3] w-full object-cover"
            />
          </div>
          <div className="absolute -bottom-4 left-4 right-4 rounded-2xl border bg-background/95 p-3.5 shadow-xl backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">DeepFlow 1.5HP submersible pump</p>
                <p className="text-xs text-muted-foreground">Borehole · 80 m head · 6 m³/h</p>
              </div>
              <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
                RFQ ready
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
