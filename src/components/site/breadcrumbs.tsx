import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

/**
 * Breadcrumbs (pagedesign.md §4.4) — server component; last item is the
 * current page (no link), everything before it links to its page.
 * Styled after the approved reference: xs muted trail, faded chevrons,
 * navy semibold current page.
 */
export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mx-auto w-full max-w-7xl px-4 pt-5">
      <ol className="flex flex-wrap items-center gap-2 text-xs text-bh-muted">
        <li>
          <Link href="/" className="rounded px-1 py-0.5 transition-colors hover:text-bh-navy">
            Home
          </Link>
        </li>
        {items.map((item, i) => (
          <li key={`${item.label}-${i}`} className="flex items-center gap-2">
            <ChevronRight className="h-3.5 w-3.5 text-bh-faded" aria-hidden />
            {item.href && i < items.length - 1 ? (
              <Link href={item.href} className="rounded px-1 py-0.5 transition-colors hover:text-bh-navy">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="px-1 py-0.5 font-semibold text-bh-navy">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
