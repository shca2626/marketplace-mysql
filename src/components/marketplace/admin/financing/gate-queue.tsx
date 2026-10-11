'use client'

// ─────────────────────────────────────────────────────────────────────────────
// THE GATE — review queue (FIN-7 sub-tab 1, the default).
// Every financing + accreditation request in SUBMITTED / UNDER_PLATFORM_REVIEW
// / RETURNED_FOR_COMPLETION, filterable by family and status. Rows carry the
// submission-count chips and the amber blockingCount signal; clicking opens
// the dossier with the per-item verdict console.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { Layers, ShieldCheck, SearchX } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { AdminEmptyState, FilterChips } from '../shared'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate, timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  FinancingStatusBadge,
  categoryLabel,
  formatMoney,
} from '@/components/marketplace/financier/financing-status-badge'
import { BlockingChip, SubmissionCountChips, GateDossier } from './gate-dossier'
import type { GateQueueResponse, GateQueueRow } from './shared'

const TYPE_FILTERS = [
  { value: 'ALL', label: 'All types' },
  { value: 'FINANCING', label: 'Financing' },
  { value: 'ACCREDITATION', label: 'Accreditation' },
]

const STATUS_FILTERS = [
  { value: 'ALL', label: 'All statuses' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'UNDER_PLATFORM_REVIEW', label: 'Under review' },
  { value: 'RETURNED_FOR_COMPLETION', label: 'Returned' },
]

type QueueRow = GateQueueRow & { kind: 'financing' | 'accreditation' }

export function GateQueue() {
  const [type, setType] = useState('ALL')
  const [status, setStatus] = useState('ALL')
  const [openId, setOpenId] = useState<string | null>(null)

  const params = new URLSearchParams()
  if (type !== 'ALL') params.set('type', type)
  if (status !== 'ALL') params.set('status', status)
  const qs = params.toString()

  const { data, loading, error, refetch } = useApi<GateQueueResponse>(
    `/api/admin/financing/queue${qs ? `?${qs}` : ''}`
  )

  const rows: QueueRow[] = [
    ...(data?.financing ?? []).map((r) => ({ ...r, kind: 'financing' as const })),
    ...(data?.accreditation ?? []).map((r) => ({ ...r, kind: 'accreditation' as const })),
  ]
  const totalBlocking = rows.reduce((s, r) => s + r.blockingCount, 0)

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="space-y-2">
        <FilterChips options={TYPE_FILTERS} value={type} onChange={setType} ariaLabel="Filter queue by request type" />
        <FilterChips options={STATUS_FILTERS} value={status} onChange={setStatus} ariaLabel="Filter queue by status" />
      </div>

      {/* Queue summary */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded-full border bg-card px-2.5 py-1 font-semibold tabular-nums">
          {rows.length} in the gate
        </span>
        {totalBlocking > 0 ? (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-800 tabular-nums dark:bg-amber-950 dark:text-amber-300">
            {totalBlocking} required item{totalBlocking > 1 ? 's' : ''} still blocking
          </span>
        ) : rows.length > 0 ? (
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            gate clear
          </span>
        ) : null}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <AdminEmptyState
          icon={SearchX}
          title="Couldn't load the queue"
          description={error}
        />
      ) : rows.length === 0 ? (
        <AdminEmptyState
          icon={ShieldCheck}
          title="The gate is clear"
          description="No financing or accreditation applications are waiting for platform review right now."
        />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <button key={r.id} type="button" className="block w-full text-left" onClick={() => setOpenId(r.id)}>
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="space-y-2.5 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold tracking-wide text-muted-foreground">{r.number}</span>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[11px] font-bold',
                        r.kind === 'financing'
                          ? 'bg-primary/10 text-primary'
                          : 'bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-300'
                      )}
                    >
                      {r.kind === 'financing' ? 'Financing' : 'Accreditation'}
                    </span>
                    <FinancingStatusBadge status={r.status} />
                    <BlockingChip count={r.blockingCount} />
                    {r.multiGroupId && (
                      <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                        <Layers size={11} /> {r.siblings.length + 1} financiers
                      </span>
                    )}
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      submitted {r.submittedAt ? `${formatDate(r.submittedAt)} · ${timeAgo(r.submittedAt)}` : '—'}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {r.organizationName ?? 'Individual applicant'}
                        <span className="font-normal text-muted-foreground">
                          {' '}· {r.requester?.name ?? 'applicant'}
                        </span>
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {r.serviceName} · {r.financierName ?? 'Financier'} ·{' '}
                        {r.kind === 'financing'
                          ? `${formatMoney(r.amountRequested, r.currency)} · ${r.tenorRequestedMonths ?? '—'} mo`
                          : categoryLabel(r.serviceCategory)}
                      </p>
                    </div>
                    <SubmissionCountChips counts={r.submissionCounts} />
                  </div>

                  {r.status === 'RETURNED_FOR_COMPLETION' && r.returnedReason && (
                    <p className="rounded-lg bg-amber-100/70 px-2.5 py-1.5 text-[11px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                      <span className="font-semibold">Returned:</span> {r.returnedReason}
                    </p>
                  )}
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      )}

      {/* The dossier + verdict console */}
      {openId && (
        <GateDossier key={openId} requestId={openId} onClose={() => setOpenId(null)} onChanged={() => void refetch()} />
      )}
    </div>
  )
}
