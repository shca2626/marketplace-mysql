'use client'

import { motion } from 'framer-motion'
import { Quote, Star } from 'lucide-react'

/**
 * S7 — Testimonials (pagedesign.md §5.1): one buyer, one funded customer,
 * one seller — one voice per pillar.
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
    <section className="mx-auto max-w-7xl px-4 py-12 sm:py-14" aria-labelledby="testimonials-heading">
      <div className="mb-8 text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary/80">Trusted by</p>
        <h2 id="testimonials-heading" className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
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
            className="relative flex flex-col rounded-2xl border bg-card p-6 transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10"
          >
            <Quote size={22} className="text-primary/30" aria-hidden />
            <blockquote className="mt-3 flex-1 text-sm leading-relaxed text-foreground/90">
              “{t.quote}”
            </blockquote>
            <div className="mt-4 flex items-center gap-1" aria-label="5 out of 5 stars">
              {Array.from({ length: 5 }).map((_, s) => (
                <Star key={s} size={14} className="fill-amber-400 text-amber-400" aria-hidden />
              ))}
            </div>
            <figcaption className="mt-3 flex items-center justify-between gap-3 border-t pt-3.5">
              <div>
                <p className="text-sm font-semibold">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.role}</p>
              </div>
              <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
                {t.pillar}
              </span>
            </figcaption>
          </motion.figure>
        ))}
      </div>
    </section>
  )
}
