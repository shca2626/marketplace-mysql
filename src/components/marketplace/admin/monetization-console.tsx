'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN · MONETIZATION CONSOLE — Phase 11 home (lastplan v5 §11).
//
// One console for the whole monetization mix:
//   • "Fee Rules"     — the 11.1 rule engine: event × actor × scope ×
//                       dimension with precedence + effective dating
//                       (/api/admin/fees/rules)
//   • "Simulator"     — what WOULD be charged for an event/actor/amount,
//                       full scope-chain trace — no writes
//                       (/api/admin/fees/simulate)
//   • "Ledger"        — the immutable FeeAssessment rows (reversals are
//                       appended rows, never rewrites) (/api/admin/fees/ledger)
//   • "Revenue"       — 11.3 revenue console: the ledger reconciled against
//                       payout commissions / financing fees / subscription
//                       invoices, to the cent (/api/admin/fees/reconcile)
//   • "Subscriptions" — 11.2 seller-org subscriptions + plans: ceiling
//                       semantics, renewal/grace/downgrade state machine
//                       (/api/admin/subscriptions, /plans)
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { Calculator, Landmark, Layers, Megaphone, ScrollText, Wallet, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FeeRulesTab } from './monetization/fee-rules-tab'
import { SimulatorTab } from './monetization/simulator-tab'
import { LedgerTab } from './monetization/ledger-tab'
import { RevenueTab } from './monetization/revenue-tab'
import { SubscriptionsTab } from './monetization/subscriptions-tab'
import { SponsorshipsTab } from './monetization/sponsorships-tab'

type SectionKey = 'rules' | 'simulator' | 'ledger' | 'revenue' | 'subscriptions' | 'sponsorships'

const SECTIONS: { key: SectionKey; label: string; icon: LucideIcon }[] = [
  { key: 'rules', label: 'Fee Rules', icon: Layers },
  { key: 'simulator', label: 'Simulator', icon: Calculator },
  { key: 'ledger', label: 'Fee Ledger', icon: ScrollText },
  { key: 'revenue', label: 'Revenue', icon: Landmark },
  { key: 'subscriptions', label: 'Subscriptions & Plans', icon: Wallet },
  { key: 'sponsorships', label: 'Sponsorships', icon: Megaphone },
]

export function MonetizationConsole() {
  const [section, setSection] = useState<SectionKey>('rules')

  return (
    <div className="space-y-4">
      {/* ── Context strip ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <Landmark size={13} className="text-primary" />
        <span>
          Every fee the platform charges writes one immutable assessment — rules resolve ORG →
          ORG_TYPE → PLATFORM, snapshots survive rule edits, reversals append. The revenue console
          reconciles against this ledger to the cent.
        </span>
      </div>

      {/* ── Sticky section pills (dock under the dashboard topbar, h-14) ──── */}
      <div className="sticky top-14 z-20 -mx-4 border-b bg-background/95 px-4 pb-2 pt-1 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <nav
          aria-label="Monetization sections"
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

      {/* ── Active section ────────────────────────────────────────────────── */}
      {section === 'rules' && <FeeRulesTab />}
      {section === 'simulator' && <SimulatorTab />}
      {section === 'ledger' && <LedgerTab />}
      {section === 'revenue' && <RevenueTab />}
      {section === 'subscriptions' && <SubscriptionsTab />}
      {section === 'sponsorships' && <SponsorshipsTab />}
    </div>
  )
}
