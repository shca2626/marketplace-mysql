'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN · CURRENCIES CONSOLE — unified home for everything money-conversion.
//
// Merges the two former admin tabs into ONE console (2026-10-05, owner
// request "unify fx + currency"):
//   • "Live Rates & Pins"  — the Phase 8 engine: open-feed refresh, manual
//     market pins (e.g. YER 535.5), decimals, switcher visibility,
//     auto-refresh window. `/api/admin/currency`.
//   • "Currencies & History" — the Phase 7.2 substrate: currency directory
//     CRUD + the auditable ExchangeRate ledger (one rate per pair instant,
//     money rows snapshot at conversion time). `/api/admin/fx`.
//
// Cross-link: each Live Rates row has a history icon that jumps straight to
// that pair's ledger (FxTab is remounted with a key so the pair applies
// cleanly).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { ArrowLeftRight, History, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CurrencyTab } from './currency-tab'
import { FxTab } from './fx-tab'

type SectionKey = 'live' | 'history'

const SECTIONS: { key: SectionKey; label: string; icon: typeof Zap }[] = [
  { key: 'live', label: 'Live Rates & Pins', icon: Zap },
  { key: 'history', label: 'Currencies & Rate History', icon: History },
]

export function CurrenciesConsole() {
  const [section, setSection] = useState<SectionKey>('live')
  // Pair requested via the Live Rates cross-link (USD → <code>).
  const [pendingPair, setPendingPair] = useState<{ base: string; quote: string } | null>(null)

  const viewHistory = (code: string) => {
    setPendingPair({ base: 'USD', quote: code })
    setSection('history')
  }

  return (
    <div className="space-y-4">
      {/* ── Context strip ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-bh-muted">
        <ArrowLeftRight size={13} className="text-bh-gold-dark" />
        <span>
          One console for the whole money pipeline — feeds &amp; pins operate the live table every
          price converts through; the ledger keeps the immutable history. Nothing is hardcoded.
        </span>
      </div>

      {/* ── Sticky section pills (dock under the dashboard topbar, h-14) ──── */}
      <div className="sticky top-14 z-20 -mx-4 border-b bg-background/95 px-4 pb-2 pt-1 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <nav
          aria-label="Currency sections"
          className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {SECTIONS.map((s) => {
            const active = section === s.key
            const Icon = s.icon
            return (
              <button
                key={s.key}
                type="button"
                aria-current={active ? 'true' : undefined}
                onClick={() => setSection(s.key)}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition-colors',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
                )}
              >
                <Icon size={14} />
                {s.label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* ── Section bodies ────────────────────────────────────────────────── */}
      {section === 'live' ? (
        <CurrencyTab onViewHistory={viewHistory} />
      ) : (
        <FxTab
          key={pendingPair ? `${pendingPair.base}-${pendingPair.quote}` : 'all'}
          initialPair={pendingPair}
        />
      )}
    </div>
  )
}
