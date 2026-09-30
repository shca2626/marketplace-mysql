import Link from 'next/link'
import { db } from '@/lib/db'
import { SolarIcon } from './solar-icon'
import { NewsletterForm } from './newsletter-form'

/**
 * Platform footer (pagedesign.md §4.3) — rendered on every public page
 * under the (site) group. Server component: reads live categories straight
 * from the DB and links into the market SPA via query params.
 * Vendora "bh" system: white surface with gold-dot trust props, navy column
 * heads and the navy-deep + gold brand mark (reference footer).
 */

const PLATFORM_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/solutions', label: 'Solutions' },
  { href: '/funding', label: 'Funding entities' },
  { href: '/insights', label: 'Insights' },
  { href: '/faq', label: 'FAQ' },
  { href: '/about', label: 'About us' },
  { href: '/contact', label: 'Contact us' },
]

const FUNDING_LINKS = [
  { href: '/funding#how-it-works', label: 'How funding works' },
  { href: '/funding#entities', label: 'Funding entities' },
  { href: '/funding#programs', label: 'Financing programs' },
  { href: '/funding#eligibility', label: 'Eligibility & documents' },
]

const MARKET_LINKS = [
  { href: '/market', label: 'All products' },
  { href: '/market?view=rfqs', label: 'Send an RFQ (B2B)' },
  { href: '/sell', label: 'Sell on Vendora' },
  { href: '/market?view=favorites', label: 'Favorites' },
  { href: '/market?view=cart', label: 'Cart' },
]

const ACCOUNT_LINKS = [
  { href: '/market?view=account', label: 'Buyer dashboard' },
  { href: '/market?view=seller', label: 'Seller console' },
  { href: '/market?view=financing', label: 'My funding requests' },
  { href: '/market?view=admin', label: 'Admin console' },
]

async function getCategories(): Promise<{ slug: string; name: string }[]> {
  try {
    const cats = await db.category.findMany({
      where: { products: { some: { status: 'ACTIVE', seller: { status: 'ACTIVE' } } } },
      select: { slug: true, name: true },
      orderBy: { name: 'asc' },
      take: 6,
    })
    return cats
  } catch {
    return []
  }
}

export async function SiteFooter() {
  const categories = await getCategories()

  return (
    <footer className="mt-auto border-t border-bh-border bg-bh-card">
      {/* Trust badges — continuity with the market footer */}
      <div className="border-b border-bh-border">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-4 py-6 sm:px-6 sm:grid-cols-4 lg:px-8">
          {[
            { title: 'Engineer-reviewed', text: 'Every listing, sized right' },
            { title: 'Vetted sellers', text: 'Independent solar stores' },
            { title: 'Verified funding', text: 'Partnered entities' },
            { title: 'B2B ready', text: 'RFQs & price lists' },
          ].map((b) => (
            <div key={b.title} className="flex items-center gap-3 px-1 py-0.5">
              <span className="h-2 w-2 shrink-0 rounded-full bg-bh-gold" aria-hidden />
              <div className="min-w-0">
                <p className="text-xs font-bold leading-tight text-bh-navy">{b.title}</p>
                <p className="text-xs text-bh-muted">{b.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main footer */}
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-4 py-10 sm:grid-cols-3 sm:px-6 lg:grid-cols-6 lg:px-8">
        {/* Brand block */}
        <div className="col-span-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-bh-navy-deep text-bh-gold">
              <SolarIcon size={16} />
            </span>
            <span className="text-lg font-extrabold tracking-tight text-bh-navy">Vendora</span>
          </div>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-bh-muted">
            Solar energy — bought, procured and funded in one place. Shop the market, buy as a
            business, and finance your project with verified funding entities.
          </p>
          <div className="mt-4 flex items-center gap-2" aria-hidden>
            <span className="h-1 w-8 rounded-full bg-bh-gold/70" />
            <span className="h-1 w-4 rounded-full bg-bh-gold/40" />
            <span className="h-1 w-2 rounded-full bg-bh-gold/25" />
          </div>
        </div>

        {/* Platform */}
        <nav aria-label="Platform">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-bh-navy">Platform</h3>
          <ul className="mt-3 space-y-2">
            {PLATFORM_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-sm text-bh-muted transition-colors hover:text-bh-navy">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Market */}
        <nav aria-label="Market">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-bh-navy">Market</h3>
          <ul className="mt-3 space-y-2">
            {MARKET_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-sm text-bh-muted transition-colors hover:text-bh-navy">
                  {l.label}
                </Link>
              </li>
            ))}
            {categories.slice(0, 3).map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/market?view=catalog&category=${c.slug}`}
                  className="text-sm text-bh-muted transition-colors hover:text-bh-navy"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Funding */}
        <nav aria-label="Funding">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-bh-navy">Funding</h3>
          <ul className="mt-3 space-y-2">
            {FUNDING_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-sm text-bh-muted transition-colors hover:text-bh-navy">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Company / account */}
        <nav aria-label="Account">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-bh-navy">Account</h3>
          <ul className="mt-3 space-y-2">
            {ACCOUNT_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-sm text-bh-muted transition-colors hover:text-bh-navy">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {/* Newsletter */}
      <div className="border-t border-bh-border">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-4 px-4 py-6 sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <div>
            <p className="text-sm font-bold text-bh-navy">Monthly solar insights</p>
            <p className="text-xs text-bh-muted">New products, funding programs and platform news. No spam.</p>
          </div>
          <NewsletterForm compact />
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-bh-border">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-bh-muted sm:flex-row sm:px-6 lg:px-8">
          <p>© {new Date().getFullYear()} Vendora — Solar energy, procured and funded.</p>
          <nav aria-label="Legal">
            <ul className="flex items-center gap-4">
              <li>
                <Link href="/legal/terms" className="transition-colors hover:text-bh-navy">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/legal/privacy" className="transition-colors hover:text-bh-navy">
                  Privacy Policy
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  )
}
