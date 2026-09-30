import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

/**
 * Breadcrumbs (pagedesign.md §4.4) — server component; last item is the
 * current page (no link), everything before it links to its page.
 *
 * JSON-LD can be layered on in Phase 2 alongside product/category routes.
 */
export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mx-auto w-full max-w-7xl px-4 pt-5">
      <ol className="flex flex-wrap items-center gap-1 text-sm">
        <li>
          <Link href="/" className="rounded px-1 py-0.5 text-muted-foreground transition-colors hover:text-foreground">
            Home
          </Link>
        </li>
        {items.map((item, i) => (
          <li key={`${item.label}-${i}`} className="flex items-center gap-1">
            <ChevronRight size={14} className="text-muted-foreground/60" aria-hidden />
            {item.href && i < items.length - 1 ? (
              <Link
                href={item.href}
                className="rounded px-1 py-0.5 text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="px-1 py-0.5 font-medium text-foreground">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
