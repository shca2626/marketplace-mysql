'use client'

import { motion } from 'framer-motion'
import { Quote, Star } from 'lucide-react'

/**
 * S7 — Testimonials (pagedesign.md §5.1): one buyer, one funded customer,
 * one seller — one voice per pillar.
 * Vendora "bh" system: white cards, gold quote marks & star ratings, navy names.
 */
const TESTIMONIALS = [
  {
    quote:
      'The listings actually explain what fits together. I bought panels and a battery sized for my roof, and the store answered my wiring questions the same day.',
    name: 'Omar A.',
    role: 'Homeowner · rooftop system',
    pillar: 'Shop',
  },
  {
    quote:
      'We sent one RFQ for the season, compared quotes in a single thread, and financed the irrigation pump through a verified entity — all on Vendora.',
    name: 'Sana M.',
    role: 'Farm owner · solar pumping',
    pillar: 'Fund',
  },
  {
    quote:
      'As an engineer-owned store, Vendora gets it. The B2B buyers find us with real projects, and the tooling — variants, price lists, RFQ inbox — just works.',
    name: 'Khaled R.',
    role: 'Seller · SunCore Energy',
    pillar: 'Sell',
  },
]

export function Testimonials() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8" aria-labelledby="testimonials-heading">
      <div className="mb-8 text-center">
        <p className="inline-flex items-center gap-1.5 rounded-full border border-bh-gold/25 bg-bh-bg-gold px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-bh-gold-dark">
          Trusted by
        </p>
        <h2 id="testimonials-heading" className="h2-practical mt-4 text-balance tracking-tight text-bh-navy sm:text-2xl lg:text-3xl">
          From first panel to funded project
        </h2>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {TESTIMONIALS.map((t, i) => (
          <motion.figure
            key={t.name}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08, duration: 0.35 }}
            className="relative flex flex-col rounded-2xl border border-bh-border bg-bh-card p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-bh-gold/40 hover:shadow-hover"
          >
            <Quote size={22} className="text-bh-gold/60" aria-hidden />
            <blockquote className="mt-3 flex-1 text-sm leading-relaxed text-bh-subtle">
              “{t.quote}”
            </blockquote>
            <div className="mt-4 flex items-center gap-1" aria-label="5 out of 5 stars">
              {Array.from({ length: 5 }).map((_, s) => (
                <Star key={s} size={14} className="fill-bh-gold text-bh-gold" aria-hidden />
              ))}
            </div>
            <figcaption className="mt-3 flex items-center justify-between gap-3 border-t border-bh-border pt-3.5">
              <div>
                <p className="text-sm font-semibold text-bh-navy">{t.name}</p>
                <p className="text-xs text-bh-muted">{t.role}</p>
              </div>
              <span className="shrink-0 rounded-full bg-bh-soft-blue px-2.5 py-1 text-[11px] font-bold text-bh-action">
                {t.pillar}
              </span>
            </figcaption>
          </motion.figure>
        ))}
      </div>
    </section>
  )
}
