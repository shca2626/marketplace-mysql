'use client'

// ─────────────────────────────────────────────────────────────────────────────
// MY REQUESTS — the applicant's unified financing + accreditation list
// (GET /api/financing/requests + GET /api/accreditation/requests, unified with
// a type filter). Row click → the request detail (stepper / checklist / offers).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { BadgeCheck, Clock, FileSearch, HandCoins, Layers, PackageSearch } from 'lucide-react'
import { useMarketplace } from '@/store/marketplace'
import { useApi } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { timeAgo } from '@/lib/format'
import {
  FinancingStatusBadge,
  categoryLabel,
  formatMoney,
} from '@/components/marketplace/financier/financing-status-badge'
import { RequestDetail } from './request-detail'
import type {
  AccountDocumentDTO,
  MyAccreditationDetailDTO,
  MyAccreditationDTO,
  MyRequestDetailDTO,
  MyRequestListItemDTO,
} from './shared'

type AnyRequest = (MyRequestListItemDTO & { kind: 'FINANCING' }) | (MyAccreditationDTO & { kind: 'ACCREDITATION' })

const STATUS_ORDER = [
  'RETURNED_FOR_COMPLETION',
  'OFFERED',
  'SUBMITTED',
  'UNDER_PLATFORM_REVIEW',
  'FORWARDED_TO_FINANCIER',
  'UNDER_FINANCIER_REVIEW',
  'ACCEPTED',
  'ACCREDITED',
  'DRAFT',
  'DECLINED',
  'REJECTED',
  'EXPIRED',
  'REVOKED',
  'CANCELLED',
]

export function RequestsTab({
  onManageDocuments,
  onBrowse,
}: {
  onManageDocuments: () => void
  onBrowse: () => void
}) {
  const navigate = useMarketplace((s) => s.navigate)
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'FINANCING' | 'ACCREDITATION'>('ALL')
  const [selected, setSelected] = useState<{ id: string; isAccreditation: boolean } | null>(null)

  const { data: finData, loading: finLoading, refetch: refetchFin } = useApi<{ requests: MyRequestListItemDTO[] }>(
    '/api/financing/requests',
    { pollMs: 30_000 }
  )
  const { data: accData, loading: accLoading, refetch: refetchAcc } = useApi<{ accreditations: MyAccreditationDTO[] }>(
    '/api/accreditation/requests',
    { pollMs: 30_000 }
  )
  const { data: docsData } = useApi<{ documents: AccountDocumentDTO[] }>('/api/documents')
  const documents = docsData?.documents ?? []

  const all: AnyRequest[] = useMemo(() => [
    ...(finData?.requests ?? []).map((r) => ({ ...r, kind: 'FINANCING' as const })),
    ...(accData?.accreditations ?? []).map((r) => ({ ...r, kind: 'ACCREDITATION' as const })),
  ], [finData, accData])

  const filtered = useMemo(
    () =>
      [...all]
        .filter((r) => typeFilter === 'ALL' || r.kind === typeFilter)
        .sort((a, b) => {
          const ia = STATUS_ORDER.indexOf(a.status)
          const ib = STATUS_ORDER.indexOf(b.status)
          if (ia !== ib) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
          return b.createdAt.localeCompare(a.createdAt)
        }),
    [all, typeFilter]
  )

  // ── Detail (fetch the selected request's full dossier) ──
  const detailUrl = selected
    ? selected.isAccreditation
      ? `/api/accreditation/requests/${selected.id}`
      : `/api/financing/requests/${selected.id}`
    : null
  const { data: detailFinData, loading: detailFinLoading, refetch: refetchDetailFin } = useApi<{
    request: MyRequestDetailDTO
  }>(detailUrl && !selected?.isAccreditation ? detailUrl : null)
  const { data: detailAccData, loading: detailAccLoading, refetch: refetchDetailAcc } = useApi<{
    request: MyAccreditationDetailDTO
  }>(detailUrl && selected?.isAccreditation ? detailUrl : null)
  const refreshLists = () => {
    void refetchFin({ silent: true })
    void refetchAcc({ silent: true })
    void refetchDetailFin({ silent: true })
    void refetchDetailAcc({ silent: true })
  }

  if (selected) {
    const loading = detailFinLoading || detailAccLoading
    if (loading) {
      return (
        <div className="space-y-5">
          <Skeleton className="h-10 w-64 rounded-xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
      )
    }
    const request = selected.isAccreditation ? detailAccData?.request : detailFinData?.request
    if (!request) {
      return (
        <div className="rounded-2xl border border-dashed px-6 py-14 text-center">
          <PackageSearch size={30} className="text-muted-foreground/40" />
          <p className="mt-3 text-sm font-semibold">Request not found</p>
          <Button variant="outline" className="mt-4 rounded-xl" onClick={() => setSelected(null)}>
            Back to my requests
          </Button>
        </div>
      )
    }
    return (
      <RequestDetail
        key={request.id}
        request={request}
        isAccreditation={selected.isAccreditation}
        documents={documents}
        onBack={() => setSelected(null)}
        onChanged={refreshLists}
        onManageDocuments={onManageDocuments}
      />
    )
  }

  const loading = finLoading || accLoading

  return (
    <div className="space-y-4">
      {/* Type filter */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex rounded-xl border bg-card p-0.5" role="tablist" aria-label="Request type">
          {(['ALL', 'FINANCING', 'ACCREDITATION'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={typeFilter === t}
              onClick={() => setTypeFilter(t)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                typeFilter === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t === 'ALL' ? `All (${all.length})` : t === 'FINANCING' ? `Financing (${all.filter((r) => r.kind === 'FINANCING').length})` : `Accreditations (${all.filter((r) => r.kind === 'ACCREDITATION').length})`}
            </button>
          ))}
        </div>
        <Button variant="outline" className="ml-auto h-9 rounded-xl text-xs" onClick={onBrowse}>
          <HandCoins size={14} className="mr-1.5" /> Browse services
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-14 text-center">
          <FileSearch size={34} className="text-muted-foreground/40" />
          <p className="mt-3 text-sm font-semibold">No applications yet</p>
          <p className="mt-1 max-w-md text-xs text-muted-foreground">
            Browse the services directory — apply once, and the platform verifies your file before any financier
            sees it.
          </p>
          <Button className="mt-5 rounded-xl" onClick={() => navigate('financing', { financingTab: 'directory' })}>
            <HandCoins size={15} className="mr-1.5" /> Open the directory
          </Button>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {filtered.map((r, i) => (
            <motion.li
              key={`${r.kind}-${r.id}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: Math.min(i * 0.04, 0.2) }}
            >
              <button
                type="button"
                onClick={() => setSelected({ id: r.id, isAccreditation: r.kind === 'ACCREDITATION' })}
                className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border bg-card px-5 py-4 text-left shadow-sm transition-all hover:-translate-y-px hover:border-primary/40 hover:shadow-md"
              >
                <span
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                    r.kind === 'ACCREDITATION' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-primary/10 text-primary'
                  )}
                >
                  {r.kind === 'ACCREDITATION' ? <BadgeCheck size={19} /> : <HandCoins size={19} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
                    <span className="font-mono">{r.number}</span>
                    <FinancingStatusBadge status={r.status} />
                    {r.siblings.length > 0 && (
                      <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                        <Layers size={10} /> {r.siblings.length + 1} financiers
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {r.serviceName} · {r.financierName ?? '—'}
                    {r.kind === 'ACCREDITATION' ? ` · ${r.organizationName ?? ''}` : ` · ${categoryLabel(r.serviceCategory)}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-4 text-right">
                  <div>
                    {r.kind === 'FINANCING' && (
                      <p className="text-sm font-bold tabular-nums">{formatMoney(r.amountRequested, r.currency)}</p>
                    )}
                    <p className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
                      <Clock size={10} />
                      {r.submittedAt ? `submitted ${timeAgo(r.submittedAt)}` : 'not submitted yet'}
                    </p>
                  </div>
                </div>
              </button>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  )
}
