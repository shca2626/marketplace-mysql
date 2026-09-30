import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowRight, Compass, LifeBuoy, Search, Sun } from 'lucide-react'
import { SolarIcon } from '@/components/site/solar-icon'

export const metadata: Metadata = {
  title: '404 — Page off-grid | Vendora',
  description: 'The page you are looking for is off-grid. Head back to the market, funding hub or insights.',
}

/**
 * Branded 404 (pagedesign.md §6) — renders inside the root layout, so it is
 * self-contained: own brand strip, layered solar art, sticky footer behavior.
 * Catches unmatched URLs AND notFound() calls from any route group.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* slim brand strip */}
      <header className="border-b bg-background/80">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5 rounded-lg focus-visible:outline-2" aria-label="Vendora home">
            <SolarIcon className="h-7 w-7 text-primary" />
            <span className="text-lg font-bold tracking-tight">Vendora</span>
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            <Sun className="h-3.5 w-3.5" aria-hidden />
            Error 404
          </span>
        </div>
      </header>

      <main className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-20">
        {/* layered solar art */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 top-1/4 h-80 w-80 rounded-full bg-primary/10 blur-[110px]" />
          <div className="absolute -right-20 bottom-0 h-96 w-96 rounded-full bg-orange-500/10 blur-[120px]" />
          <Sun className="absolute right-[16%] top-[12%] hidden h-40 w-40 text-primary/10 md:block" strokeWidth={0.7} />
          <div
            className="absolute inset-0 opacity-[0.5] dark:opacity-20"
            style={{
              backgroundImage:
                'radial-gradient(rgba(217,119,6,0.07) 1px, transparent 1px)',
              backgroundSize: '26px 26px',
              maskImage: 'radial-gradient(ellipse 70% 60% at 50% 40%, black, transparent)',
            }}
          />
        </div>

        <div className="relative mx-auto max-w-xl text-center">
          <p className="text-[100px] font-extrabold leading-none tracking-tighter text-primary/15 sm:text-[140px]" aria-hidden>
            404
          </p>
          <h1 className="-mt-8 text-balance text-2xl font-bold tracking-tight sm:-mt-12 sm:text-3xl">
            This page went <span className="text-primary">off-grid</span>
          </h1>
          <p className="mx-auto mt-4 max-w-md text-pretty text-muted-foreground">
            The link you followed is as dead as a panel at midnight. Let’s get you back to somewhere sunny.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5"
            >
              Back to home
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/market"
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-5 text-sm font-semibold transition-colors hover:border-primary/40"
            >
              <Search className="h-4 w-4" aria-hidden />
              Search the market
            </Link>
          </div>

          <nav aria-label="Popular destinations" className="mt-10">
            <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <Compass className="h-3.5 w-3.5" aria-hidden />
              Popular destinations
            </p>
            <ul className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {[
                { href: '/market', label: 'Marketplace' },
                { href: '/funding', label: 'Funding entities' },
                { href: '/how-it-works', label: 'How it works' },
                { href: '/solutions', label: 'Solutions' },
                { href: '/insights', label: 'Insights' },
                { href: '/faq', label: 'FAQ' },
                { href: '/contact', label: 'Contact us' },
              ].map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="inline-flex h-9 items-center rounded-full border border-border bg-card px-4 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <p className="mt-10 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <LifeBuoy className="h-3.5 w-3.5" aria-hidden />
            Still lost? <Link href="/contact" className="font-medium text-primary hover:underline">Talk to us</Link> — we answer within a day.
          </p>
        </div>
      </main>

      {/* pinned footer */}
      <footer className="mt-auto border-t bg-muted/40">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
          <p>© {new Date().getFullYear()} Vendora — Solar energy, procured and funded.</p>
          <p className="flex items-center gap-3">
            <Link href="/legal/terms" className="hover:text-foreground">Terms</Link>
            <Link href="/legal/privacy" className="hover:text-foreground">Privacy</Link>
          </p>
        </div>
      </footer>
    </div>
  )
}
