import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowRight, Compass, LifeBuoy, Search, Sun } from 'lucide-react'
import { SolarIcon } from '@/components/site/solar-icon'

export const metadata: Metadata = {
  title: '404 — Page off-grid | Vendora',
  description: 'The page you are looking for is off-grid. Head back to the market, funding hub or insights.',
}

const DESTINATIONS = [
  { href: '/market', label: 'Marketplace' },
  { href: '/funding', label: 'Funding entities' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/solutions', label: 'Solutions' },
  { href: '/insights', label: 'Insights' },
  { href: '/faq', label: 'FAQ' },
  { href: '/contact', label: 'Contact us' },
]

/**
 * Branded 404 (pagedesign.md §6) — renders inside the root layout, so it is
 * self-contained: own brand strip, layered solar art, sticky footer behavior.
 * Catches unmatched URLs AND notFound() calls from any route group.
 * Vendora "bh" system: page canvas, white cards, navy wordmark, gold sun.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-bh-page text-bh-ink">
      {/* slim brand strip */}
      <header className="border-b border-bh-border bg-bh-card">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5 rounded-lg focus-visible:outline-2" aria-label="Vendora home">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-bh-navy-deep text-bh-gold">
              <SolarIcon size={17} />
            </span>
            <span className="text-lg font-bold tracking-tight text-bh-navy">Vendora</span>
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-bh-gold/25 bg-bh-bg-gold px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-bh-gold-dark">
            <Sun className="h-3.5 w-3.5" aria-hidden />
            Error 404
          </span>
        </div>
      </header>

      <main className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-20">
        {/* layered solar art */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 top-1/4 h-80 w-80 rounded-full bg-bh-gold/10 blur-[110px]" />
          <div className="absolute -right-20 bottom-0 h-96 w-96 rounded-full bg-bh-soft-blue blur-[120px]" />
          <Sun className="absolute right-[16%] top-[12%] hidden h-40 w-40 text-bh-gold/15 md:block" strokeWidth={0.7} />
          <div
            className="absolute inset-0 opacity-[0.5] dark:opacity-20"
            style={{
              backgroundImage:
                'radial-gradient(rgba(211,175,60,0.09) 1px, transparent 1px)',
              backgroundSize: '26px 26px',
              maskImage: 'radial-gradient(ellipse 70% 60% at 50% 40%, black, transparent)',
            }}
          />
        </div>

        <div className="relative mx-auto max-w-xl text-center">
          <p className="text-[100px] font-extrabold leading-none tracking-tighter text-bh-navy/10 sm:text-[140px]" aria-hidden>
            404
          </p>
          <h1 className="-mt-8 text-balance text-2xl font-bold tracking-tight text-bh-navy sm:-mt-12 sm:text-3xl">
            This page went{' '}
            <span className="bg-gradient-to-r from-bh-gold-light to-bh-gold bg-clip-text text-transparent">off-grid</span>
          </h1>
          <p className="mx-auto mt-4 max-w-md text-pretty text-bh-subtle">
            The link you followed is as dead as a panel at midnight. Let’s get you back to somewhere sunny.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-bh-action px-5 text-sm font-semibold text-white shadow-card transition-all hover:-translate-y-0.5 hover:bg-bh-navy-deep"
            >
              Back to home
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/market"
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-bh-border bg-bh-card px-5 text-sm font-semibold text-bh-navy shadow-card transition-all hover:-translate-y-0.5 hover:border-bh-gold/40 hover:shadow-hover"
            >
              <Search className="h-4 w-4" aria-hidden />
              Search the market
            </Link>
          </div>

          <nav aria-label="Popular destinations" className="mt-10">
            <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-bh-muted">
              <Compass className="h-3.5 w-3.5" aria-hidden />
              Popular destinations
            </p>
            <ul className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
              {DESTINATIONS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="flex h-14 items-center justify-center rounded-xl border border-bh-border bg-bh-card px-4 text-xs font-semibold text-bh-navy shadow-card transition-all hover:-translate-y-0.5 hover:border-bh-gold/40 hover:shadow-hover"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <p className="mt-10 inline-flex items-center gap-1.5 text-xs text-bh-muted">
            <LifeBuoy className="h-3.5 w-3.5" aria-hidden />
            Still lost? <Link href="/contact" className="font-medium text-bh-action hover:text-bh-navy-deep hover:underline">Talk to us</Link> — we answer within a day.
          </p>
        </div>
      </main>

      {/* pinned footer */}
      <footer className="mt-auto border-t border-bh-border bg-bh-card">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-bh-muted sm:flex-row sm:px-6 lg:px-8">
          <p>© {new Date().getFullYear()} Vendora — Solar energy, procured and funded.</p>
          <p className="flex items-center gap-3">
            <Link href="/legal/terms" className="hover:text-bh-navy">Terms</Link>
            <Link href="/legal/privacy" className="hover:text-bh-navy">Privacy</Link>
          </p>
        </div>
      </footer>
    </div>
  )
}
