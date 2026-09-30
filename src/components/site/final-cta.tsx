'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, Landmark, Store } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NewsletterForm } from './newsletter-form'

/**
 * S8 — Final CTA (pagedesign.md §5.1): dual hand-off (market / funding)
 * plus the newsletter capture.
 */
export function FinalCta() {
  return (
    <section className="mx-auto max-w-7xl px-4 pb-14" aria-labelledby="cta-heading">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-orange-100 via-amber-50 to-rose-100 px-6 py-12 text-center dark:from-orange-950/40 dark:via-amber-950/20 dark:to-rose-950/30 sm:px-10 sm:py-14"
      >
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-rose-400/15 blur-3xl" />

        <h2 id="cta-heading" className="relative text-2xl font-extrabold tracking-tight sm:text-3xl">
          Ready to go solar?
        </h2>
        <p className="relative mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base">
          Shop the market, procure as a business, or fund your project — the whole journey lives
          here, and it starts with a single step.
        </p>

        <div className="relative mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button size="lg" className="rounded-full px-7" asChild>
            <Link href="/market">
              <Store size={16} className="mr-1.5" /> Shop the market
            </Link>
          </Button>
          <Button size="lg" variant="outline" className="rounded-full px-7" asChild>
            <Link href="/funding">
              <Landmark size={16} className="mr-1.5" /> Get funding
            </Link>
          </Button>
          <a
            href="#pillars-heading"
            className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            How it works <ArrowRight size={14} aria-hidden />
          </a>
        </div>

        <div className="relative mt-9 flex flex-col items-center gap-3 border-t pt-7">
          <p className="text-sm font-bold">Monthly solar insights, straight to your inbox</p>
          <NewsletterForm compact />
        </div>
      </motion.div>
    </section>
  )
}
