'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SolarIcon } from '@/components/site/solar-icon'

/**
 * Slim platform strip rendered above the marketplace SPA at /market
 * (pagedesign.md §4.2): keeps the five primary pages reachable at all
 * times while the market keeps its own full shopping header below.
 * Vendora "bh" system: white surface, navy wordmark with the gold sun mark.
 */
export function MarketSiteStrip() {
  const pathname = usePathname()

  const links = [
    { href: '/', label: 'Home', active: false },
    { href: '/market', label: 'Market', active: true },
    { href: '/funding', label: 'Funding', active: false },
    { href: '/about', label: 'About', active: false },
    { href: '/contact', label: 'Contact', active: false },
  ].map((l) => ({
    ...l,
    active: l.href === '/market' ? pathname === '/market' : pathname === l.href,
  }))

  return (
    <div className="border-b border-bh-border bg-bh-card">
      <nav
        aria-label="Platform"
        className="mx-auto flex h-11 max-w-7xl items-center justify-between gap-3 px-4"
      >
        <Link
          href="/"
          className="flex items-center gap-2 rounded-md px-1 py-1 text-sm font-extrabold tracking-tight text-bh-navy transition-colors hover:text-bh-action focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bh-action focus-visible:ring-offset-2"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-bh-navy-deep text-bh-gold">
            <SolarIcon size={15} />
          </span>
          Vendora
        </Link>
        <ul className="flex items-center gap-1">
          {links.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={l.active ? 'page' : undefined}
                className={`rounded-full px-3 py-1 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bh-action focus-visible:ring-offset-2 ${
                  l.active
                    ? 'bg-bh-soft-blue text-bh-action'
                    : 'text-bh-muted hover:bg-bh-page hover:text-bh-navy'
                }`}
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
