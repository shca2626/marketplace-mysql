'use client'

// ─────────────────────────────────────────────────────────────────────────────
// CURRENCY SWITCHER (Phase 8 — dynamic rates, nothing hardcoded)
// Dropdown in the marketplace header: swaps the storefront-wide display
// currency. All prices re-render instantly through the live DB-backed rate
// (1 USD → 535.5 YER today, whatever the feed says tomorrow). The choice is
// persisted per visitor.
// ─────────────────────────────────────────────────────────────────────────────

import { Check, ChevronDown, RefreshCw } from 'lucide-react'
import { useMarketplace } from '@/store/marketplace'
import { rateLabel, syncAgeLabel } from '@/lib/currency'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

export function CurrencySwitcher() {
  const list = useMarketplace((s) => s.currencyList)
  const active = useMarketplace((s) => s.activeCurrency)
  const base = useMarketplace((s) => s.currencyBase)
  const setActiveCurrencyCode = useMarketplace((s) => s.setActiveCurrencyCode)
  const lastRefreshedAt = useMarketplace((s) => s.lastRefreshedAt)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-9 gap-1 px-2.5 text-bh-muted hover:text-bh-gold-dark"
          aria-label={`Prices shown in ${active.code} — change currency`}
        >
          <span className="text-[13px] font-bold tracking-wide">{active.code}</span>
          <ChevronDown size={13} className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex items-center justify-between gap-2 pb-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-bh-muted">Display currency</span>
          <span
            className="inline-flex items-center gap-1 text-[10px] font-medium text-bh-muted"
            title={lastRefreshedAt ? syncAgeLabel(lastRefreshedAt) : 'rates load with the page'}
          >
            <RefreshCw size={10} />
            {lastRefreshedAt ? syncAgeLabel(lastRefreshedAt).replace('synced ', '') : 'live'}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {list.length === 0 ? (
          <div className="px-3 py-3 text-xs text-bh-muted">Loading live rates…</div>
        ) : (
          list.map((c) => {
            const isActive = c.code === active.code
            return (
              <DropdownMenuItem
                key={c.code}
                onClick={() => setActiveCurrencyCode(c.code)}
                className={cn('cursor-pointer items-start gap-2.5 py-2', isActive && 'bg-bh-bg-gold/60')}
                aria-label={`Show prices in ${c.name}`}
              >
                <Check
                  size={14}
                  className={cn('mt-0.5 shrink-0 text-bh-gold-dark', !isActive && 'opacity-0')}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-bh-navy">{c.code}</span>
                    <span className="text-xs text-bh-muted">{c.symbol}</span>
                    {c.code === base && (
                      <span className="rounded bg-bh-navy px-1 py-px text-[9px] font-bold uppercase tracking-wide text-bh-gold">
                        base
                      </span>
                    )}
                    {c.isManual && (
                      <span className="rounded bg-amber-100 px-1 py-px text-[9px] font-bold uppercase tracking-wide text-amber-700">
                        manual
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[11px] text-bh-muted">
                    {c.name} · {rateLabel(c)}
                  </p>
                </div>
              </DropdownMenuItem>
            )
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
