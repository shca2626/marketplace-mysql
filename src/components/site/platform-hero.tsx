'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, BadgeCheck, Building2, CheckCircle2, Landmark, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { HERO_COLLAGE, HERO_IMAGE } from '@/lib/constants'

/**
 * S1 — Platform hero (pagedesign.md §5.1): the one section that must tell
 * the whole story in five seconds: shop it, procure it, fund it.
 */
export function PlatformHero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-orange-50 via-amber-50/60 to-rose-50 dark:from-orange-950/30 dark:via-amber-950/15 dark:to-rose-950/20">
      <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-rose-400/10 blur-3xl" />

      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 lg:grid-cols-2 lg:py-20">
        {/* Copy */}
        <motion.div initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }} className="relative z-10">
          <Badge variant="secondary" className="mb-4 gap-1.5 rounded-full px-3 py-1 text-xs font-medium">
            <ShieldCheck size={13} className="text-primary" />
            The renewable energy platform
          </Badge>
          <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl">
            Solar energy —{' '}
            <span className="bg-gradient-to-r from-orange-600 to-amber-500 bg-clip-text text-transparent">
              bought, procured
            </span>{' '}
            and{' '}
            <span className="bg-gradient-to-r from-amber-500 to-orange-600 bg-clip-text text-transparent">
              funded
            </span>{' '}
            in one place.
          </h1>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
            Vendora is the platform where homes, farms and businesses shop engineer-reviewed solar
            equipment, procure in bulk, and finance their projects with verified funding entities.
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <Button size="lg" className="rounded-xl" asChild>
              <Link href="/market">
                Shop the market <ArrowRight size={16} className="ml-1" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="rounded-xl" asChild>
              <Link href="/funding">
                <Landmark size={16} className="mr-1.5" /> Get funding
              </Link>
            </Button>
          </div>

          {/* Trust row */}
          <ul className="mt-8 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:gap-x-6">
            {['Engineer-reviewed gear', 'Verified funding entities', 'B2B procurement ready'].map((t) => (
              <li key={t} className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <CheckCircle2 size={16} className="shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        </motion.div>

        {/* Visual */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="relative mx-auto w-full max-w-md lg:max-w-none"
        >
          <div className="relative overflow-hidden rounded-3xl border-4 border-background shadow-2xl shadow-orange-900/10">
            <img
              src={HERO_IMAGE}
              alt="Rooftop home solar array at golden hour"
              className="aspect-[4/3] w-full object-cover"
            />
          </div>

          {/* Floating card — market */}
          <motion.a
            href="/market"
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute -left-3 top-8 hidden rounded-2xl border bg-background/95 p-3 shadow-xl backdrop-blur transition-colors hover:border-primary/40 sm:flex sm:items-center sm:gap-3"
          >
            <img src={HERO_COLLAGE[3]} alt="" className="hidden h-12 w-12 rounded-xl object-cover sm:block" />
            <div>
              <p className="text-xs font-semibold">From 450W panels to submersible pumps</p>
              <p className="text-xs text-muted-foreground">Shop the market</p>
            </div>
            <BadgeCheck size={16} className="text-primary" />
          </motion.a>

          {/* Floating card — funding */}
          <motion.a
            href="/funding"
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
            className="absolute -bottom-4 -right-2 hidden items-center gap-3 rounded-2xl border bg-background/95 p-3 shadow-xl backdrop-blur transition-colors hover:border-primary/40 sm:flex"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
              <Building2 size={17} />
            </span>
            <div>
              <p className="text-xs font-semibold">Funding for your project</p>
              <p className="text-xs text-muted-foreground">Verified entities · offers · agreements</p>
            </div>
          </motion.a>
        </motion.div>
      </div>
    </section>
  )
}
