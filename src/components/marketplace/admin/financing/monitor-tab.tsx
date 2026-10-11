'use client'

// ─────────────────────────────────────────────────────────────────────────────
// MONITOR — the read-only oversight view (FIN-7 sub-tab 4).
// Combines the two admin-authorized, platform-wide sources:
//   • GET /api/admin/financing/queue (unfiltered) — every request in the gate
//     across BOTH families (SUBMITTED / UNDER_PLATFORM_REVIEW / RETURNED).
//   • GET /api/admin/financing/fees — the executed agreements + their fee
//     lifecycle (the only post-forward surface admin can enumerate today).
// NOTE (backend gap, logged for FIN-8/9): there is no dedicated admin monitor
// endpoint that lists every financing request in post-forward statuses — the
// financier inbox is staff-guarded (R-4) and the applicant list is org-
// scoped by design. Deals surface here via the agreement/fee join.
// ─────────────────────────────────────────────────────────────────────────────

import { Info, Layers, ScrollText, SearchX } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { AdminEmptyState } from '../shared'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate, timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  FEE_STATUS_MAP,
  FinancingStatusBadge,
  formatMoney,
} from '@/components/marketplace/financier/financing-status-badge'
import { BlockingChip } from './gate-dossier'
import type { AdminFeeDTO, GateQueueResponse, GateQueueRow } from './shared'

type QueueRow = GateQueueRow & { kind: 'financing' | 'accreditation' }

export function MonitorTab() {
  const queue = useApi<GateQueueResponse>('/api/admin/financing/queue')
  const fees = useApi<{ fees: AdminFeeDTO[] }>('/api/admin/financing/fees')

  const rows: QueueRow[] = [
    ...(queue.data?.financing ?? []).map((r) => ({ ...r, kind: 'financing' as const })),
    ...(queue.data?.accreditation ?? []).map((r) => ({ ...r, kind: 'accreditation' as const })),
  ]
  const feeRows = fees.data?.fees ?? []
  const totalBlocking = rows.reduce((s, r) => s + r.blockingCount, 0)
  const accruedUnsettled = feeRows
    .filter((f) => f.status !== 'PAID' && f.status !== 'WAIVED')
    .reduce((s, f) => s + f.amount, 0)

  const loading = queue.loading || fees.loading

  return (
    <div className="space-y-5">
      <Alert className="items-start">
        <Info size={16} className="mt-0.5" />
        <AlertTitle className="text-sm font-semibold">Read-only oversight</AlertTitle>
        <AlertDescription className="text-xs leading-relaxed">
          This view aggregates every admin-authorized platform-wide source: the full gate queue (both request families,
          all pre-forward statuses) and the executed agreements with their fee lifecycle. Financier-side states after
          forwarding are governed by R-4 — the financier inbox is the authoritative view there.
        </AlertDescription>
      </Alert>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'In the gate', value: String(rows.length), hint: 'pre-forward, both families' },
          {
            label: 'Blocking items',
            value: String(totalBlocking),
            hint: totalBlocking > 0 ? 'required, awaiting verdicts' : 'gate clear',
            warn: totalBlocking > 0,
          },
          { label: 'Executed agreements', value: String(feeRows.length), hint: 'via the fee ledger' },
          { label: 'Unsettled fees', value: formatMoney(accruedUnsettled), hint: 'accrued or invoiced' },
        ].map((kpi) => (
          <Card key={kpi.label} className="shadow-sm">
            <CardContent className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{kpi.label}</p>
              <p
                className={cn(
                  'mt-1 text-xl font-extrabold tabular-nums',
                  kpi.warn && 'text-amber-600 dark:text-amber-400'
                )}
              >
                {loading && rows.length === 0 ? '—' : kpi.value}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{kpi.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Gate traffic */}
      <Card className="shadow-sm">
        <CardHeader className="border-b py-4">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Layers size={16} className="text-primary" /> Gate traffic — every tracked request
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {queue.loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-xl" />
              ))}
            </div>
          ) : queue.error ? (
            <AdminEmptyState icon={SearchX} title="Couldn't load the gate traffic" description={queue.error} />
          ) : rows.length === 0 ? (
            <AdminEmptyState
              icon={ScrollText}
              title="No tracked requests"
              description="Financing and accreditation applications appear here the moment they are submitted."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="h-10 text-xs">Number</TableHead>
                    <TableHead className="h-10 text-xs">Type</TableHead>
                    <TableHead className="h-10 text-xs">Applicant</TableHead>
                    <TableHead className="h-10 text-xs">Service / financier</TableHead>
                    <TableHead className="h-10 text-right text-xs">Amount</TableHead>
                    <TableHead className="h-10 text-xs">Submitted</TableHead>
                    <TableHead className="h-10 text-xs">Gate</TableHead>
                    <TableHead className="h-10 text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="py-2 font-mono text-xs font-semibold">{r.number}</TableCell>
                      <TableCell className="py-2">
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
                      </TableCell>
                      <TableCell className="max-w-40 truncate py-2 text-xs">
                        <span className="font-semibold">{r.organizationName ?? 'Individual'}</span>
                        <span className="text-muted-foreground"> · {r.requester?.name ?? '—'}</span>
                      </TableCell>
                      <TableCell className="max-w-52 truncate py-2 text-xs text-muted-foreground">
                        {r.serviceName} · {r.financierName ?? '—'}
                      </TableCell>
                      <TableCell className="py-2 text-right text-xs font-semibold tabular-nums">
                        {r.kind === 'financing' ? formatMoney(r.amountRequested, r.currency) : '—'}
                      </TableCell>
                      <TableCell className="py-2 text-xs text-muted-foreground" title={r.submittedAt ?? ''}>
                        {r.submittedAt ? timeAgo(r.submittedAt) : '—'}
                      </TableCell>
                      <TableCell className="py-2">
                        <BlockingChip count={r.blockingCount} />
                      </TableCell>
                      <TableCell className="py-2">
                        <FinancingStatusBadge status={r.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Agreements & fees */}
      <Card className="shadow-sm">
        <CardHeader className="border-b py-4">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <ScrollText size={16} className="text-primary" /> Executed agreements &amp; fee ledger
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {fees.loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-xl" />
              ))}
            </div>
          ) : fees.error ? (
            <AdminEmptyState icon={SearchX} title="Couldn't load the fee ledger" description={fees.error} />
          ) : feeRows.length === 0 ? (
            <AdminEmptyState
              icon={ScrollText}
              title="No executed agreements yet"
              description="When an applicant accepts an offer, the agreement lands here with its fee (ACCRUED → INVOICED → PAID)."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="h-10 text-xs">Agreement</TableHead>
                    <TableHead className="h-10 text-xs">Applicant org</TableHead>
                    <TableHead className="h-10 text-xs">Financier</TableHead>
                    <TableHead className="h-10 text-xs">Fee type</TableHead>
                    <TableHead className="h-10 text-right text-xs">Base</TableHead>
                    <TableHead className="h-10 text-right text-xs">%</TableHead>
                    <TableHead className="h-10 text-right text-xs">Fee</TableHead>
                    <TableHead className="h-10 text-xs">Created</TableHead>
                    <TableHead className="h-10 text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {feeRows.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="py-2 font-mono text-xs font-semibold">{f.agreementNumber}</TableCell>
                      <TableCell className="max-w-40 truncate py-2 text-xs">{f.applicantOrganization ?? '—'}</TableCell>
                      <TableCell className="max-w-40 truncate py-2 text-xs text-muted-foreground">{f.financierName ?? '—'}</TableCell>
                      <TableCell className="py-2 text-xs">{f.type.toLowerCase().replace(/_/g, ' ')}</TableCell>
                      <TableCell className="py-2 text-right text-xs tabular-nums">{formatMoney(f.baseAmount)}</TableCell>
                      <TableCell className="py-2 text-right text-xs tabular-nums">{f.percentApplied}%</TableCell>
                      <TableCell className="py-2 text-right text-xs font-semibold tabular-nums">{formatMoney(f.amount)}</TableCell>
                      <TableCell className="py-2 text-xs text-muted-foreground" title={f.createdAt}>
                        {formatDate(f.createdAt)}
                      </TableCell>
                      <TableCell className="py-2">
                        <FinancingStatusBadge status={f.status} map={FEE_STATUS_MAP} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
