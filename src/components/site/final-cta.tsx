'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, Landmark, Sparkles, Store } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NewsletterForm } from './newsletter-form'

/**
 * S8 — Final CTA (pagedesign.md §5.1): dual hand-off (market / funding)
 * plus the newsletter capture.
 * Vendora "bh" system: navy gradient band with layered gold art (same
 * language as the funding FinalCta), gold primary CTA, newsletter in a
 * white inset card so the form stays readable.
 */
export function FinalCta() {
  return (
    <section
      aria-labelledby="cta-heading"
      className="relative overflow-hidden bg-gradient-to-br from-[#052e56] via-[#06396c] to-[#0a4a8c] py-16 text-white sm:py-20"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-bh-gold/20 blur-[110px]" />
        <div className="absolute -right-16 bottom-0 h-72 w-72 rounded-full bg-bh-gold/10 blur-[100px]" />
        <div
          className="absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(211,175,60,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(211,175,60,0.14) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
            maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black, transparent)',
          }}
        />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="mx-auto max-w-2xl text-center"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full border border-bh-gold/30 bg-bh-gold/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-bh-gold">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            One platform, whole journey
          </span>
          <h2 id="cta-heading" className="mt-5 text-balance text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Ready to go solar?
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-pretty text-[15px] leading-relaxed text-white/75">
            Shop the market, procure as a business, or fund your project — the whole journey lives
            here, and it starts with a single step.
          </p>

          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              size="lg"
              asChild
              className="min-h-12 rounded-xl bg-bh-gold px-7 text-base font-bold text-bh-navy-deep hover:bg-bh-gold-light"
            >
              <Link href="/market">
                <Store size={16} className="mr-1.5" /> Shop the market
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              asChild
              className="min-h-12 rounded-xl border-white/25 bg-transparent px-7 text-base text-white hover:bg-white/10 hover:text-white"
            >
              <Link href="/funding">
                <Landmark size={16} className="mr-1.5" /> Get funding
              </Link>
            </Button>
            <a
              href="#pillars-heading"
              className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-sm font-medium text-white/70 transition-colors hover:text-white"
            >
              How it works <ArrowRight size={14} aria-hidden />
            </a>
          </div>
        </motion.div>

        {/* Newsletter — white inset card keeps the form readable on navy */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="mx-auto mt-10 flex max-w-2xl flex-col items-center gap-3 rounded-2xl border border-white/50 bg-bh-card px-6 py-6 text-center shadow-hover sm:px-10"
        >
          <p className="text-sm font-bold text-bh-navy">Monthly solar insights, straight to your inbox</p>
          <p className="text-xs text-bh-muted">New products, funding programs and platform news. No spam.</p>
          <div className="mt-1 w-full">
            <NewsletterForm compact />
          </div>
        </motion.div>
      </div>
    </section>
  )
}
