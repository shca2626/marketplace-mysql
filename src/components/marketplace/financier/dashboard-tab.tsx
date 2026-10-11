'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FINANCIER DASHBOARD — headline cards + recent activity (FIN-5 §1).
// Renders the exact shape of GET /api/financier/dashboard: counts are already
// R-4-safe server-side (pre-gate requests are structurally excluded).
// ─────────────────────────────────────────────────────────────────────────────

import {
  ArrowRight,
  BadgeCheck,
  ChevronRight,
  HandCoins,
  Inbox,
  Landmark,
  PackageSearch,
  RefreshCw,
  ScrollText,
} from 'lucide-react'
import { useMarketplace } from '@/store/marketplace'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { timeAgo } from '@/lib/format'
import {
  FinancingStatusBadge,
  formatMoney,
  type FinancierDashboardDTO,
} from './financing-status-badge'

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  onClick,
}: {
  icon: typeof Inbox
  label: string
  value: number | string
  hint?: string
  onClick?: () => void
}) {
  const inner = (
    <>
      <CardContent className="flex items-start justify-between gap-3 p-4 sm:p-6">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-extrabold tabular-nums tracking-tight">{value}</p>
          {hint && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
        <span
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary',
            'ring-1 ring-inset ring-primary/15 transition-all duration-200',
            'group-hover:bg-primary/15 group-hover:ring-primary/25'
          )}
        >
          <Icon size={19} />
        </span>
      </CardContent>
    </>
  )
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="group rounded-2xl border bg-card text-left shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {inner}
      </button>
    )
  }
  return <Card className="shadow-sm">{inner}</Card>
}

export function DashboardTab({
  data,
  refresh,
}: {
  data: FinancierDashboardDTO | null
  refresh: () => void
}) {
  const navigate = useMarketplace((s) => s.navigate)

  if (!data) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="skeleton-shimmer h-28 w-full rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="skeleton-shimmer h-60 w-full rounded-2xl" />
          <Skeleton className="skeleton-shimmer h-60 w-full rounded-2xl" />
        </div>
      </div>
    )
  }

  const requests = data.requests ?? {}
  const accreditations = data.accreditations ?? {}
  const agreements = data.agreements ?? {}
  const agreementTotal = Object.values(agreements).reduce((sum, n) => sum + n, 0)

  const forwarded = (requests.FORWARDED_TO_FINANCIER ?? 0) + (accreditations.FORWARDED_TO_FINANCIER ?? 0)
  const isEmpty =
    data.openRequests === 0 &&
    data.liveAccreditations === 0 &&
    data.offersPending === 0 &&
    agreementTotal === 0 &&
    data.recentRequests.length === 0 &&
    data.recentAccreditations.length === 0

  return (
    <div className="space-y-5">
      {/* Headline cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Inbox}
          label="Open requests"
          value={data.openRequests}
          hint={forwarded > 0 ? `${forwarded} newly forwarded` : 'Awaiting your first forwarded request'}
          onClick={() => navigate('financier', { financierTab: 'requests' })}
        />
        <StatCard
          icon={BadgeCheck}
          label="Live accreditations"
          value={data.liveAccreditations}
          hint={
            (accreditations.FORWARDED_TO_FINANCIER ?? 0) > 0
              ? `${accreditations.FORWARDED_TO_FINANCIER} awaiting your decision`
              : 'Vendors currently accredited'
          }
          onClick={() => navigate('financier', { financierTab: 'accreditations' })}
        />
        <StatCard
          icon={HandCoins}
          label="Offers pending"
          value={data.offersPending}
          hint="Sent and awaiting the applicant"
          onClick={() => navigate('financier', { financierTab: 'offers' })}
        />
        <StatCard
          icon={ScrollText}
          label="Agreements"
          value={agreementTotal}
          hint={
            agreements.ACTIVE != null
              ? `${agreements.ACTIVE} active`
              : 'Executed financing agreements'
          }
          onClick={() => navigate('financier', { financierTab: 'offers' })}
        />
      </div>

      {/* Friendly empty state */}
      {isEmpty && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-14 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground/60">
            <Landmark size={26} />
          </span>
          <p className="mt-4 text-sm font-semibold">Nothing in your inbox yet</p>
          <p className="mt-1 max-w-md text-xs text-muted-foreground">
            Publish your services with a clear requirements checklist — the platform verifies every
            application against it and forwards only complete, correct requests to you.
          </p>
        </div>
      )}

      {/* Recent activity */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between border-b py-4">
            <CardTitle className="text-base">Recent requests</CardTitle>
            <button
              type="button"
              onClick={() => navigate('financier', { financierTab: 'requests' })}
              className="flex items-center gap-1 rounded text-xs font-semibold text-primary transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            >
              View inbox <ArrowRight size={12} />
            </button>
          </CardHeader>
          <CardContent className="divide-y p-0">
            {data.recentRequests.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-10 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground/60">
                  <PackageSearch size={20} />
                </span>
                <p className="mt-3 text-xs text-muted-foreground">
                  No forwarded requests yet — they arrive after the platform gate verifies them.
                </p>
              </div>
            ) : (
              data.recentRequests.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => navigate('financier', { financierTab: 'requests' })}
                  className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors duration-150 hover:bg-accent/50 focus-visible:outline-none focus-visible:bg-accent/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      <span className="tabular-nums">{r.number}</span>
                      <FinancingStatusBadge status={r.status} />
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground" title={`${r.organizationName ?? 'Individual applicant'} · ${r.serviceName}`}>
                      {r.organizationName ?? 'Individual applicant'} · {r.serviceName}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums">{formatMoney(r.amountRequested, r.currency)}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {r.forwardedAt ? `forwarded ${timeAgo(r.forwardedAt)}` : '—'}
                    </p>
                  </div>
                  <ChevronRight size={14} className="shrink-0 text-muted-foreground/50" />
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between border-b py-4">
            <CardTitle className="text-base">Recent accreditations</CardTitle>
            <button
              type="button"
              onClick={() => navigate('financier', { financierTab: 'accreditations' })}
              className="flex items-center gap-1 rounded text-xs font-semibold text-primary transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            >
              View inbox <ArrowRight size={12} />
            </button>
          </CardHeader>
          <CardContent className="divide-y p-0">
            {data.recentAccreditations.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-10 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground/60">
                  <BadgeCheck size={20} />
                </span>
                <p className="mt-3 text-xs text-muted-foreground">
                  No accreditation activity yet — publish an accreditation program to receive applications.
                </p>
              </div>
            ) : (
              data.recentAccreditations.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => navigate('financier', { financierTab: 'accreditations' })}
                  className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors duration-150 hover:bg-accent/50 focus-visible:outline-none focus-visible:bg-accent/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      <span className="tabular-nums">{a.number}</span>
                      <FinancingStatusBadge status={a.status} />
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground" title={`${a.organizationName ?? '—'} · ${a.serviceName}`}>
                      {a.organizationName ?? '—'} · {a.serviceName}
                    </p>
                  </div>
                  <p
                    className={cn(
                      'shrink-0 text-[11px] text-muted-foreground'
                    )}
                  >
                    {a.forwardedAt ? `forwarded ${timeAgo(a.forwardedAt)}` : '—'}
                  </p>
                  <ChevronRight size={14} className="shrink-0 text-muted-foreground/50" />
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Silent refresh affordance for the headline numbers */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={refresh}
          className="inline-flex items-center gap-1.5 rounded text-xs font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <RefreshCw size={12} /> Refresh counts
        </button>
      </div>
    </div>
  )
}
