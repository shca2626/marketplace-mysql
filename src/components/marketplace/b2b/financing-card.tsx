'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FINANCING & ACCREDITATION CARD — the business-view entry point (plan §5):
// live counts (requests by status, live accreditations, pending documents) +
// quick links into the ?view=financing tabs. Self-fetching, read-only.
// ─────────────────────────────────────────────────────────────────────────────

import { ArrowRight, BadgeCheck, HandCoins, Landmark, ShieldCheck, Wallet } from 'lucide-react'
import { useMarketplace } from '@/store/marketplace'
import { useApi } from '@/hooks/use-api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type {
  MyAccreditationDTO,
  MyRequestListItemDTO,
  AccountDocumentDTO,
} from '@/components/marketplace/financing/shared'

export function FinancingCard() {
  const navigate = useMarketplace((s) => s.navigate)

  const { data: finData, loading: finLoading } = useApi<{ requests: MyRequestListItemDTO[] }>(
    '/api/financing/requests'
  )
  const { data: accData } = useApi<{ accreditations: MyAccreditationDTO[] }>('/api/accreditation/valid')
  const { data: docsData } = useApi<{ documents: AccountDocumentDTO[] }>('/api/documents')

  const requests = finData?.requests ?? []
  const live = accData?.accreditations ?? []
  const documents = docsData?.documents ?? []

  const inFlight = requests.filter((r) =>
    ['RETURNED_FOR_COMPLETION', 'OFFERED', 'SUBMITTED', 'UNDER_PLATFORM_REVIEW', 'FORWARDED_TO_FINANCIER', 'UNDER_FINANCIER_REVIEW'].includes(r.status)
  ).length
  const offered = requests.filter((r) => r.status === 'OFFERED').length
  const returned = requests.filter((r) => r.status === 'RETURNED_FOR_COMPLETION').length
  const pendingDocs = documents.filter((d) => d.isActive && d.status === 'PENDING').length

  const stats = [
    { label: 'In flight', value: inFlight, hint: returned > 0 ? `${returned} returned for fixes` : 'Applications under review' },
    { label: 'Offers waiting', value: offered, hint: offered > 0 ? 'Compare & accept' : 'None yet' },
    { label: 'Live accreditations', value: live.length, hint: 'RFQ participation unlocked' },
    { label: 'Documents pending', value: pendingDocs, hint: 'Awaiting platform review' },
  ]

  const links = [
    { label: 'Browse services & apply', icon: Landmark, tab: 'directory' },
    { label: 'My requests', icon: HandCoins, tab: 'requests' },
    { label: 'Document vault', icon: ShieldCheck, tab: 'documents' },
    { label: 'Accreditations', icon: BadgeCheck, tab: 'accreditations' },
  ]

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Wallet size={16} />
          </span>
          Financing &amp; Accreditation
          {live.length > 0 && (
            <span className="rounded-full bg-emerald-100 px-1.5 text-[11px] font-bold tabular-nums text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              {live.length} live
            </span>
          )}
        </CardTitle>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Apply to financier services through the platform&apos;s verification gate — your documents are verified once
          and reused everywhere.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {finLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl border bg-card p-3">
                <p className="text-2xl font-extrabold tabular-nums leading-none">{s.value}</p>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{s.label}</p>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground/80" title={s.hint}>
                  {s.hint}
                </p>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {links.map((l) => (
            <button
              key={l.tab}
              type="button"
              onClick={() => navigate('financing', l.tab === 'directory' ? {} : { financingTab: l.tab })}
              className="flex items-center gap-1.5 rounded-xl border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground transition-all hover:-translate-y-px hover:border-primary/40 hover:text-foreground hover:shadow-sm"
            >
              <l.icon size={14} className="text-primary" /> {l.label}
              <ArrowRight size={12} className="text-muted-foreground/60" />
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
