'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN · FINANCING — GATE QUEUE (W-GATE-QUEUE, DP-23). Financing AND
// accreditation requests awaiting platform verification, in one queue (kind
// badges FIN/ACC). Row click opens the review console (W-GATE-REVIEW).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  SearchX,
  ShieldAlert,
} from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import type { AdminGateQueueResponseDTO } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { FilterChips, SearchInput, StatusBadge, useDebounced } from '../shared'
import {
  ACC_STATUS_MAP,
  FIN_REQUEST_STATUS_MAP,
  timeAgo,
} from '../../financing/financing-shared'
import { GateReviewConsole } from './gate-review-console'

const STATUS_FILTERS = [
  { value: '', label: 'In gate (all)' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'UNDER_PLATFORM_REVIEW', label: 'Platform review' },
  { value: 'RETURNED_FOR_COMPLETION', label: 'Returned' },
  { value: 'FORWARDED_TO_FINANCIER', label: 'Forwarded' },
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'ACCREDITED', label: 'Accredited' },
  { value: 'DECLINED', label: 'Declined' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

type KindFilter = 'ALL' | 'FINANCING' | 'ACCREDITATION'
const KIND_FILTERS: { value: KindFilter; label: string }[] = [
  { value: 'ALL', label: 'All kinds' },
  { value: 'FINANCING', label: 'Financing' },
  { value: 'ACCREDITATION', label: 'Accreditation' },
]

const PAGE_SIZE = 20

export function GateQueueSection() {
  const [statusFilter, setStatusFilter] = useState('')
  const [kindFilter, setKindFilter] = useState<KindFilter>('ALL')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search)
  const [page, setPage] = useState(1)
  const [reviewId, setReviewId] = useState<string | null>(null)

  // Render-time keyed sync: jump back to page 1 whenever filters change.
  const filterKey = `${statusFilter}|${kindFilter}|${debouncedSearch}`
  const [appliedKey, setAppliedKey] = useState<string | null>(null)
  if (appliedKey !== filterKey) {
    setAppliedKey(filterKey)
    setPage(1)
  }

  const query = new URLSearchParams()
  if (kindFilter !== 'ALL') query.set('type', kindFilter)
  if (statusFilter) query.set('status', statusFilter)
  if (debouncedSearch.trim()) query.set('search', debouncedSearch.trim())
  query.set('page', String(page))
  query.set('limit', String(PAGE_SIZE))

  const { data, loading, error, refetch } = useApi<AdminGateQueueResponseDTO>(
    `/api/admin/financing/gate?${query.toString()}`
  )

  // The review console replaces the queue until the admin goes back.
  if (reviewId) {
    return (
      <GateReviewConsole
        requestId={reviewId}
        onBack={() => {
          setReviewId(null)
          void refetch()
        }}
      />
    )
  }

  const fin = data?.financing.requests ?? []
  const acc = data?.accreditation.requests ?? []
  const finTotal = data?.financing.total ?? 0
  const accTotal = data?.accreditation.total ?? 0
  const pages = Math.max(1, Math.ceil(Math.max(finTotal, accTotal) / PAGE_SIZE))

  return (
    <div className="space-y-5">
      {/* Explainer (the gate IS the product — DP-23) */}
      <div className="flex items-start gap-3 rounded-2xl border border-primary/25 bg-primary/5 px-4 py-3">
        <ClipboardCheck size={18} className="mt-0.5 shrink-0 text-primary" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">The platform verification gate.</span>{' '}
          Every financing and accreditation request lands here before any financier can see it —
          verify each checklist item, return incomplete requests or forward complete ones.
        </p>
      </div>

      {/* Kind segmented toggle */}
      <div
        role="tablist"
        aria-label="Request kind"
        className="inline-flex rounded-full border bg-muted/40 p-0.5"
      >
        {KIND_FILTERS.map((k) => (
          <button
            key={k.value}
            type="button"
            role="tab"
            aria-selected={kindFilter === k.value}
            onClick={() => setKindFilter(k.value)}
            className={cn(
              'rounded-full px-4 py-1.5 text-xs font-semibold transition-colors',
              kindFilter === k.value
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {k.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterChips
          options={STATUS_FILTERS}
          value={statusFilter}
          onChange={setStatusFilter}
          ariaLabel="Filter the gate queue by status"
        />
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search — number, applicant, activity…"
          ariaLabel="Search the gate queue"
          className="min-w-0 flex-1 md:max-w-72"
        />
      </div>

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-12 text-center">
          <ShieldAlert size={34} className="text-muted-foreground/40" />
          <p className="mt-3 text-sm font-semibold">Couldn't load the gate queue</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">{error}</p>
          <Button variant="outline" className="mt-4 rounded-xl" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      )}

      {!loading && !error && fin.length === 0 && acc.length === 0 && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-12 text-center">
          <SearchX size={34} className="text-muted-foreground/40" />
          <p className="mt-3 text-sm font-semibold">
            {debouncedSearch.trim() || statusFilter ? 'No requests match' : 'The gate is clear'}
          </p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            {debouncedSearch.trim() || statusFilter
              ? 'Try clearing the search or switching the status filter.'
              : 'New financing and accreditation submissions will appear here the moment they arrive.'}
          </p>
        </div>
      )}

      {!loading && !error && fin.length > 0 && (
        <QueueList
          title="Financing requests"
          icon="FIN"
          rows={fin.map((r) => ({
            id: r.id,
            number: r.number,
            status: r.status,
            who: r.applicant.name,
            whoSub: r.applicant.email,
            service: r.serviceName,
            financier: r.financierOrgName,
            submittedAt: r.submittedAt ?? r.createdAt,
            stats: r.submissionStats,
          }))}
          map={FIN_REQUEST_STATUS_MAP}
          onOpen={setReviewId}
        />
      )}

      {!loading && !error && acc.length > 0 && (
        <QueueList
          title="Accreditation requests"
          icon="ACC"
          rows={acc.map((r) => ({
            id: r.id,
            number: r.number,
            status: r.status,
            who: r.organizationName,
            whoSub: `by ${r.submittedBy.name}`,
            service: r.serviceName,
            financier: r.financierOrgName,
            submittedAt: r.submittedAt ?? r.createdAt,
            stats: r.submissionStats,
          }))}
          map={ACC_STATUS_MAP}
          onOpen={setReviewId}
        />
      )}

      {/* Shared pagination (the API pages both lists together) */}
      {!loading && !error && (finTotal > PAGE_SIZE || accTotal > PAGE_SIZE) && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border px-4 py-3">
          <p className="text-xs text-muted-foreground">
            {finTotal} financing · {accTotal} accreditation
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-lg"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft size={13} className="mr-0.5" /> Prev
            </Button>
            <span className="text-xs font-semibold tabular-nums">
              Page {page} of {pages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-lg"
              disabled={page >= pages}
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
            >
              Next <ChevronRight size={13} className="ml-0.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── One kind's list (desktop table + mobile cards) ───────────────────────────

interface QueueRow {
  id: string
  number: string
  status: string
  who: string
  whoSub: string
  service: string
  financier: string
  submittedAt: string | null
  stats?: { total: number; verified: number; missing: number }
}

function QueueList({
  title,
  icon,
  rows,
  map,
  onOpen,
}: {
  title: string
  icon: 'FIN' | 'ACC'
  rows: QueueRow[]
  map: Parameters<typeof StatusBadge>[0]['map']
  onOpen: (id: string) => void
}) {
  return (
    <section aria-label={title} className="space-y-2">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
            icon === 'FIN'
              ? 'bg-primary/15 text-primary'
              : 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300'
          )}
        >
          {icon}
        </span>
        <h2 className="text-sm font-semibold">
          {title} <span className="text-muted-foreground">({rows.length})</span>
        </h2>
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-2xl border md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="px-4 py-3 font-medium">Request</th>
              <th scope="col" className="px-4 py-3 font-medium">Applicant</th>
              <th scope="col" className="px-4 py-3 font-medium">Service</th>
              <th scope="col" className="px-4 py-3 font-medium">Checklist</th>
              <th scope="col" className="px-4 py-3 font-medium">Status</th>
              <th scope="col" className="px-4 py-3 font-medium">Age</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className="cursor-pointer border-b transition-colors last:border-0 hover:bg-accent/50"
                onClick={() => onOpen(r.id)}
              >
                <td className="px-4 py-3.5">
                  <p className="font-semibold tabular-nums">{r.number}</p>
                </td>
                <td className="px-4 py-3.5">
                  <p className="max-w-[160px] truncate font-medium">{r.who}</p>
                  <p className="max-w-[160px] truncate text-xs text-muted-foreground">{r.whoSub}</p>
                </td>
                <td className="px-4 py-3.5">
                  <p className="max-w-[160px] truncate">{r.service}</p>
                  <p className="max-w-[160px] truncate text-xs text-muted-foreground">{r.financier}</p>
                </td>
                <td className="px-4 py-3.5">
                  <ItemsCell stats={r.stats} />
                </td>
                <td className="px-4 py-3.5">
                  <StatusBadge status={r.status} map={map} />
                </td>
                <td className="px-4 py-3.5 text-muted-foreground" title={r.submittedAt ?? ''}>
                  {timeAgo(r.submittedAt)}
                </td>
                <td className="px-4 py-3.5 text-right">
                  <ChevronRight size={16} className="ml-auto text-muted-foreground/50" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile stacked cards */}
      <div className="space-y-3 md:hidden">
        {rows.map((r, i) => (
          <motion.div
            key={r.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, delay: i * 0.02 }}
          >
            <Card className="overflow-hidden">
              <CardContent className="p-4">
                <button type="button" className="w-full text-left" onClick={() => onOpen(r.id)} aria-label={`Open ${r.number}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold tabular-nums">{r.number}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {r.who} · {r.service}
                      </p>
                    </div>
                    <StatusBadge status={r.status} map={map} />
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <ItemsCell stats={r.stats} />
                    <span>{timeAgo(r.submittedAt)}</span>
                  </div>
                </button>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </section>
  )
}

/** "3 of 7 ✓" checklist progress cell (required items only). */
function ItemsCell({ stats }: { stats?: { total: number; verified: number; missing: number } }) {
  if (!stats || stats.total === 0) return <span className="text-xs text-muted-foreground">—</span>
  const done = stats.verified
  const complete = done >= stats.total
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-semibold tabular-nums',
        complete
          ? 'text-emerald-700 dark:text-emerald-400'
          : done > 0
            ? 'text-amber-700 dark:text-amber-400'
            : 'text-muted-foreground'
      )}
    >
      {done} of {stats.total} verified{complete && ' ✓'}
    </span>
  )
}
