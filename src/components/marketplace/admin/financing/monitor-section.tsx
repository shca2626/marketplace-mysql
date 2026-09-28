'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN · FINANCING — MONITOR. Read-only module health: requests by status,
// forward vs return rate, avg checklist size, active services, accredited
// orgs and pending fees. Derived from the gate queue + institutions + fees
// payloads (lightweight parallel fetches, no dedicated endpoint).
// ─────────────────────────────────────────────────────────────────────────────

import {
  ArrowRightLeft,
  ClipboardCheck,
  Landmark,
  ListChecks,
  Loader2,
  LineChart as LineChartIcon,
  Receipt,
  ShieldAlert,
} from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import type {
  AdminGateQueueResponseDTO,
  FinancierInstitutionDTO,
  FinancingFeeDTO,
} from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { formatMoney } from '../../financing/financing-shared'

export function MonitorSection() {
  // In-gate requests (default 3 statuses) + forwarded + returned counts +
  // institutions + fees — five lightweight read-only fetches.
  const inGate = useApi<AdminGateQueueResponseDTO>('/api/admin/financing/gate?limit=100')
  const forwarded = useApi<AdminGateQueueResponseDTO>(
    '/api/admin/financing/gate?status=FORWARDED_TO_FINANCIER&limit=100'
  )
  const returned = useApi<AdminGateQueueResponseDTO>(
    '/api/admin/financing/gate?status=RETURNED_FOR_COMPLETION&limit=100'
  )
  const institutions = useApi<{ institutions: FinancierInstitutionDTO[] }>(
    '/api/admin/financing/institutions'
  )
  const fees = useApi<{ fees: FinancingFeeDTO[] }>('/api/admin/financing/fees')

  const loading =
    inGate.loading || forwarded.loading || returned.loading || institutions.loading || fees.loading
  const failed =
    inGate.error && forwarded.error && returned.error ? inGate.error : null

  if (failed) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-12 text-center">
        <ShieldAlert size={34} className="text-muted-foreground/40" />
        <p className="mt-3 text-sm font-semibold">Couldn't load the monitor</p>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">{failed}</p>
        <div className="mt-4 flex gap-2">
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => {
              void inGate.refetch()
              void forwarded.refetch()
              void returned.refetch()
            }}
          >
            Try again
          </Button>
        </div>
      </div>
    )
  }

  const fin = inGate.data?.financing.requests ?? []
  const acc = inGate.data?.accreditation.requests ?? []
  const all = [...fin, ...acc]

  const byStatus = new Map<string, number>()
  for (const r of all) byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1)

  const forwardedTotal =
    (forwarded.data?.financing.total ?? 0) + (forwarded.data?.accreditation.total ?? 0)
  const returnedTotal =
    (returned.data?.financing.total ?? 0) + (returned.data?.accreditation.total ?? 0)
  const decided = forwardedTotal + returnedTotal
  const forwardRate = decided > 0 ? Math.round((forwardedTotal / decided) * 100) : null

  const withStats = all.filter((r) => r.submissionStats && r.submissionStats.total > 0)
  const avgChecklist =
    withStats.length > 0
      ? withStats.reduce((s, r) => s + (r.submissionStats?.total ?? 0), 0) / withStats.length
      : null

  const orgs = institutions.data?.institutions ?? []
  const activeServices = orgs.reduce((s, o) => s + o.stats.activeServices, 0)
  const accreditedOrgs = orgs.filter((o) => o.stats.liveAccreditations > 0).length

  const feeRows = fees.data?.fees ?? []
  const pendingFees = feeRows
    .filter((f) => f.status === 'ACCRUED' || f.status === 'INVOICED')
    .reduce((s, f) => s + f.amount, 0)
  const paidFees = feeRows.filter((f) => f.status === 'PAID').reduce((s, f) => s + f.amount, 0)

  const cards = [
    {
      icon: ClipboardCheck,
      label: 'In the gate now',
      value: String(fin.length + acc.length),
      sub: `${fin.length} financing · ${acc.length} accreditation`,
    },
    {
      icon: ArrowRightLeft,
      label: 'Forward rate',
      value: forwardRate != null ? `${forwardRate}%` : '—',
      sub: `${forwardedTotal} forwarded · ${returnedTotal} returned`,
    },
    {
      icon: ListChecks,
      label: 'Avg checklist size',
      value: avgChecklist != null ? avgChecklist.toFixed(1) : '—',
      sub: 'required items per in-gate request',
    },
    {
      icon: Landmark,
      label: 'Active services',
      value: String(activeServices),
      sub: `${orgs.length} financier institutions`,
    },
    {
      icon: LineChartIcon,
      label: 'Accredited orgs',
      value: String(accreditedOrgs),
      sub: 'live accreditations held',
    },
    {
      icon: Receipt,
      label: 'Pending fees',
      value: formatMoney(pendingFees),
      sub: `${formatMoney(paidFees)} collected to date`,
    },
  ]

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((c, i) => (
          <motion.div
            key={c.label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, delay: i * 0.03 }}
          >
            <div className="rounded-2xl border p-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <c.icon size={16} />
                </span>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {c.label}
                </p>
              </div>
              <p className="mt-3 text-2xl font-bold tabular-nums">
                {loading ? <Skeleton className="h-8 w-20 rounded-lg" /> : c.value}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{loading ? '…' : c.sub}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Status breakdown of the in-gate queue */}
      <div className="rounded-2xl border p-4 sm:p-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <LineChartIcon size={16} className="text-primary" /> In-gate requests by status
        </h2>
        {loading ? (
          <Skeleton className="mt-3 h-16 w-full rounded-xl" />
        ) : all.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Nothing in the gate right now — the queue is clear.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {[...byStatus.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([status, count]) => (
                <div key={status} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 truncate text-xs font-medium">{status.replaceAll('_', ' ').toLowerCase()}</span>
                  <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        status === 'SUBMITTED'
                          ? 'bg-amber-500'
                          : status === 'UNDER_PLATFORM_REVIEW'
                            ? 'bg-orange-500'
                            : 'bg-rose-400'
                      )}
                      style={{ width: `${Math.max(4, (count / all.length) * 100)}%` }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right text-xs font-semibold tabular-nums">{count}</span>
                </div>
              ))}
          </div>
        )}
        {loading && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 size={12} className="animate-spin" /> Gathering module statistics…
          </p>
        )}
      </div>
    </div>
  )
}
