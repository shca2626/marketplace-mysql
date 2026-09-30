'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, BadgeCheck, Building2, CheckCircle2, Landmark, ShieldCheck, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { HERO_COLLAGE, HERO_IMAGE } from '@/lib/constants'

/**
 * S1 — Platform hero (pagedesign.md §5.1): the one section that must tell
 * the whole story in five seconds: shop it, procure it, fund it.
 * Vendora "bh" system: navy gradient band with layered gold glows, a subtle
 * grid and the Sun glyph (same art language as kit PageHero).
 */
export function PlatformHero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-[#052e56] via-[#06396c] to-[#0a4a8c] text-white">
      {/* layered gold art */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-bh-gold/20 blur-[120px]" />
        <div className="absolute -right-24 top-10 h-80 w-80 rounded-full bg-bh-gold/10 blur-[100px]" />
        <div
          className="absolute inset-0 opacity-[0.13]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(211,175,60,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(211,175,60,0.14) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
            maskImage: 'radial-gradient(ellipse 85% 70% at 50% 0%, black, transparent)',
          }}
        />
        <Sun className="absolute right-[6%] top-14 h-40 w-40 text-bh-gold/15" strokeWidth={0.8} />
      </div>

      <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:py-20 lg:px-8">
        {/* Copy */}
        <motion.div initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }} className="relative z-10">
          <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-bh-gold/30 bg-bh-gold/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-bh-gold">
            <ShieldCheck size={13} aria-hidden />
            The renewable energy platform
          </span>
          <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight text-white sm:text-5xl">
            Solar energy —{' '}
            <span className="bg-gradient-to-r from-bh-gold-light to-bh-gold bg-clip-text text-transparent">
              bought, procured
            </span>{' '}
            and{' '}
            <span className="bg-gradient-to-r from-bh-gold-light to-bh-gold bg-clip-text text-transparent">
              funded
            </span>{' '}
            in one place.
          </h1>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-white/75 sm:text-lg">
            Vendora is the platform where homes, farms and businesses shop engineer-reviewed solar
            equipment, procure in bulk, and finance their projects with verified funding entities.
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <Button
              size="lg"
              asChild
              className="min-h-12 rounded-xl bg-bh-gold px-7 text-base font-bold text-bh-navy-deep shadow-card hover:bg-bh-gold-light"
            >
              <Link href="/market">
                Shop the market <ArrowRight size={16} className="ml-1" />
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
          </div>

          {/* Trust row */}
          <ul className="mt-8 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:gap-x-6">
            {['Engineer-reviewed gear', 'Verified funding entities', 'B2B procurement ready'].map((t) => (
              <li key={t} className="flex items-center gap-2 text-sm font-medium text-white/70">
                <CheckCircle2 size={16} className="shrink-0 text-emerald-400" aria-hidden />
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
          <div className="relative overflow-hidden rounded-2xl border-4 border-white shadow-2xl shadow-[#031d38]/50">
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
            className="absolute -left-3 top-8 hidden rounded-2xl border border-bh-border bg-bh-card/95 p-3 shadow-hover backdrop-blur transition-colors hover:border-bh-gold/40 sm:flex sm:items-center sm:gap-3"
          >
            <img src={HERO_COLLAGE[3]} alt="" className="hidden h-12 w-12 rounded-xl object-cover sm:block" />
            <div>
              <p className="text-xs font-semibold text-bh-navy">From 450W panels to submersible pumps</p>
              <p className="text-xs text-bh-muted">Shop the market</p>
            </div>
            <BadgeCheck size={16} className="text-bh-gold" />
          </motion.a>

          {/* Floating card — funding */}
          <motion.a
            href="/funding"
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
            className="absolute -bottom-4 -right-2 hidden items-center gap-3 rounded-2xl border border-bh-border bg-bh-card/95 p-3 shadow-hover backdrop-blur transition-colors hover:border-bh-gold/40 sm:flex"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-bh-bg-gold text-bh-gold">
              <Building2 size={17} />
            </span>
            <div>
              <p className="text-xs font-semibold text-bh-navy">Funding for your project</p>
              <p className="text-xs text-bh-muted">Verified entities · offers · agreements</p>
            </div>
          </motion.a>
        </motion.div>
      </div>
    </section>
  )
}
