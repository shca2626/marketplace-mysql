import Link from 'next/link'
import { db } from '@/lib/db'
import { SolarIcon } from './solar-icon'
import { NewsletterForm } from './newsletter-form'

/**
 * Platform footer (pagedesign.md §4.3) — rendered on every public page
 * under the (site) group. Server component: reads live categories straight
 * from the DB and links into the market SPA via query params.
 */

const PLATFORM_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/funding', label: 'Funding entities' },
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
    <footer className="mt-auto border-t bg-muted/40">
      {/* Trust badges — continuity with the market footer */}
      <div className="border-b bg-background">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-4 py-6 sm:grid-cols-4">
          {[
            { title: 'Engineer-reviewed', text: 'Every listing, sized right' },
            { title: 'Vetted sellers', text: 'Independent solar stores' },
            { title: 'Verified funding', text: 'Partnered entities' },
            { title: 'B2B ready', text: 'RFQs & price lists' },
          ].map((b) => (
            <div key={b.title} className="flex items-center gap-3 rounded-xl px-1 py-0.5">
              <span className="flex h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />
              <div>
                <p className="text-sm font-semibold leading-tight">{b.title}</p>
                <p className="text-xs text-muted-foreground">{b.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main footer */}
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-4 py-10 sm:grid-cols-3 lg:grid-cols-6">
        {/* Brand block */}
        <div className="col-span-2">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <SolarIcon size={18} />
            </span>
            <span className="text-lg font-extrabold tracking-tight">Vendora</span>
          </div>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
            Solar energy — bought, procured and funded in one place. Shop the market, buy as a
            business, and finance your project with verified funding entities.
          </p>
          <div className="mt-4 flex items-center gap-2" aria-hidden>
            <span className="h-1 w-8 rounded-full bg-primary/60" />
            <span className="h-1 w-4 rounded-full bg-primary/30" />
            <span className="h-1 w-2 rounded-full bg-primary/20" />
          </div>
        </div>

        {/* Platform */}
        <nav aria-label="Platform">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary/80">Platform</h3>
          <ul className="mt-3 space-y-2">
            {PLATFORM_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Market */}
        <nav aria-label="Market">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary/80">Market</h3>
          <ul className="mt-3 space-y-2">
            {MARKET_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                  {l.label}
                </Link>
              </li>
            ))}
            {categories.slice(0, 3).map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/market?view=catalog&category=${c.slug}`}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Funding */}
        <nav aria-label="Funding">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary/80">Funding</h3>
          <ul className="mt-3 space-y-2">
            {FUNDING_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Company / account */}
        <nav aria-label="Account">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary/80">Account</h3>
          <ul className="mt-3 space-y-2">
            {ACCOUNT_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {/* Newsletter */}
      <div className="border-t bg-background">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-4 px-4 py-6 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-bold">Monthly solar insights</p>
            <p className="text-xs text-muted-foreground">New products, funding programs and platform news. No spam.</p>
          </div>
          <NewsletterForm compact />
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} Vendora — Solar energy, procured and funded.</p>
          <p>Built for the renewable energy transition.</p>
        </div>
      </div>
    </footer>
  )
}
