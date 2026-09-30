'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, Building2, CalendarClock, ListTree, MessagesSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { HERO_COLLAGE } from '@/lib/constants'

/**
 * S5 — B2B preview (pagedesign.md §5.1): the procurement pillar made
 * visible for farms and companies.
 * Vendora "bh" system: soft-blue band, white feature cards with gold icon
 * tiles, navy heads.
 */
const FEATURES = [
  { icon: MessagesSquare, title: 'Requests for quotes', text: 'Send one RFQ, collect seller quotes and negotiate in one thread.' },
  { icon: CalendarClock, title: 'Recurring procurement', text: 'Schedule repeating RFQs so seasonal buying runs itself.' },
  { icon: ListTree, title: 'Org price lists', text: 'Negotiated price lists and approval flows for your organization.' },
]

export function B2BPreview() {
  return (
    <section className="bg-bh-soft-blue/60 py-12 sm:py-14" aria-labelledby="b2b-heading">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
        {/* Copy + features */}
        <motion.div initial={{ opacity: 0, x: -16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.4 }}>
          <p className="inline-flex items-center gap-1.5 rounded-full border border-bh-gold/25 bg-bh-bg-gold px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-bh-gold-dark">
            For business
          </p>
          <h2 id="b2b-heading" className="h2-practical mt-3 flex items-center gap-2.5 text-balance tracking-tight text-bh-navy sm:text-2xl lg:text-3xl">
            <Building2 className="text-bh-gold" size={26} aria-hidden /> Buying for a farm or a company?
          </h2>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-bh-subtle sm:text-base">
            Skip the per-unit shopping cart. Procure panels, batteries and pumps in bulk with the
            platform&apos;s B2B tools — built for organizations, not just households.
          </p>

          <ul className="mt-6 space-y-4">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex items-start gap-3.5 rounded-2xl border border-bh-border bg-bh-card p-4 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:border-bh-gold/40 hover:shadow-hover">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-bh-bg-gold text-bh-gold">
                  <f.icon size={18} aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold text-bh-navy">{f.title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-bh-subtle">{f.text}</p>
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
          <div className="overflow-hidden rounded-2xl border-4 border-white shadow-hover">
            <img
              src={HERO_COLLAGE[2]}
              alt="Solar-powered water pumping installation on a farm"
              loading="lazy"
              className="aspect-[4/3] w-full object-cover"
            />
          </div>
          <div className="absolute -bottom-4 left-4 right-4 rounded-2xl border border-bh-border bg-bh-card/95 p-3.5 shadow-hover backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-bh-navy">DeepFlow 1.5HP submersible pump</p>
                <p className="text-xs text-bh-muted">Borehole · 80 m head · 6 m³/h</p>
              </div>
              <span className="shrink-0 rounded-full bg-bh-bg-gold px-2.5 py-1 text-[11px] font-bold text-bh-gold-dark">
                RFQ ready
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
