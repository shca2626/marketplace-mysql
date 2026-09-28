'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN · FINANCING TAB (FIN-7 — ?view=admin&tab=financing).
// THE GATE (DP-23) + the financier module's platform-side consoles in ONE tab
// with INTERNAL section state (no new routes):
//   Gate queue (default) · Institutions · Fees · Requirements library ·
//   Documents · Monitor.
// Visual language: the admin/shared + financing/financing-shared kits (warm
// stone/orange, NO blue/indigo).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import {
  ClipboardCheck,
  FolderLock,
  Landmark,
  Library,
  LineChart,
  Receipt,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { GateQueueSection } from './financing/gate-queue-section'
import { InstitutionsSection } from './financing/institutions-section'
import { FeesSection } from './financing/fees-section'
import { RequirementsLibrarySection } from './financing/requirements-library-section'
import { DocumentsQueueSection } from './financing/documents-queue-section'
import { MonitorSection } from './financing/monitor-section'

export type FinancingSection =
  | 'gate'
  | 'institutions'
  | 'fees'
  | 'requirements'
  | 'documents'
  | 'monitor'

const SECTIONS: { key: FinancingSection; label: string; icon: typeof Landmark }[] = [
  { key: 'gate', label: 'Gate queue', icon: ClipboardCheck },
  { key: 'institutions', label: 'Institutions', icon: Landmark },
  { key: 'fees', label: 'Fees', icon: Receipt },
  { key: 'requirements', label: 'Requirements library', icon: Library },
  { key: 'documents', label: 'Documents', icon: FolderLock },
  { key: 'monitor', label: 'Monitor', icon: LineChart },
]

export function FinancingTab() {
  const [section, setSection] = useState<FinancingSection>('gate')

  return (
    <div className="space-y-5">
      {/* Section switcher — internal state, mirrors the financing console look */}
      <nav aria-label="Financing sections" className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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

      {section === 'gate' && <GateQueueSection />}
      {section === 'institutions' && <InstitutionsSection />}
      {section === 'fees' && <FeesSection />}
      {section === 'requirements' && <RequirementsLibrarySection />}
      {section === 'documents' && <DocumentsQueueSection />}
      {section === 'monitor' && <MonitorSection />}
    </div>
  )
}
