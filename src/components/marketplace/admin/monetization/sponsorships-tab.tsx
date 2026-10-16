'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN · MONETIZATION — Sponsorships tab (SPONSOR-1).
//
// The operational view of paid pinned listings: every placement with its
// window/status/payment, KPI mini-row (active pins, gross spend net of
// cancellations) and the placement timeline. Revenue itself lives on the
// immutable fee ledger (event SPONSORSHIP) — reconcile it on the Revenue tab.
//
// API: GET /api/admin/sponsorships
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { CalendarDays, Loader2, Megaphone, RefreshCw, SearchX, Sparkles } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { formatDate } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { AdminEmptyState } from '../shared'

// ── API contract ─────────────────────────────────────────────────────────────

interface PlacementRow {
  id: string
  productId: string
  productTitle: string
  organizationName: string
  days: number
  amount: number
  currency: string
  status: string
  paymentMethod: string
  paymentStatus: string
  startsAt: string
  endsAt: string
  createdAt: string
  daysLeft: number
}

interface SponsorshipsResponse {
  placements: PlacementRow[]
  stats: { total: number; active: number; revenue: number }
}

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  EXPIRED: 'bg-muted text-muted-foreground',
  CANCELLED: 'bg-red-500/10 text-red-600 dark:text-red-400',
}

export function SponsorshipsTab() {
  const { data, loading, error, refetch } = useApi<SponsorshipsResponse>('/api/admin/sponsorships')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const rows = useMemo(() => {
    const all = data?.placements ?? []
    return statusFilter === 'all' ? all : all.filter((p) => p.status === statusFilter)
  }, [data, statusFilter])

  const stats = data?.stats

  return (
    <div className="space-y-4">
      {/* ── KPI mini-row ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Placements" value={stats ? String(stats.total) : '—'} icon={Megaphone} />
        <Kpi label="Active pins" value={stats ? String(stats.active) : '—'} icon={Sparkles} accent />
        <Kpi label="Gross spend" value={stats ? `$${stats.revenue.toFixed(2)}` : '—'} icon={CalendarDays} />
        <Kpi
          label="Ledger event"
          value="SPONSORSHIP"
          icon={Megaphone}
          hint="reconciles on Revenue"
        />
      </div>

      {/* ── Filter + refresh ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {['all', 'ACTIVE', 'EXPIRED', 'CANCELLED'].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                statusFilter === s
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
              )}
            >
              {s === 'all' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" className="rounded-lg" onClick={() => void refetch()}>
          <RefreshCw size={13} className="mr-1.5" /> Refresh
        </Button>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : error ? (
        <AdminEmptyState icon={SearchX} title="Couldn't load sponsorships" description={error}>
          <Button variant="outline" size="sm" className="rounded-lg" onClick={() => void refetch()}>Try again</Button>
        </AdminEmptyState>
      ) : rows.length === 0 ? (
        <AdminEmptyState
          icon={Megaphone}
          title="No sponsorship placements"
          description="Companies pin their approved catalog products from Selling → Sponsorships. Pricing is configured as a SPONSORSHIP fee rule (Fee Rules tab) or the 'sponsorship' platform setting."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Product</th>
                  <th className="px-4 py-3 font-semibold">Organization</th>
                  <th className="px-4 py-3 font-semibold">Window</th>
                  <th className="px-4 py-3 text-right font-semibold">Amount</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="max-w-56 px-4 py-3">
                      <p className="truncate font-medium">{p.productTitle}</p>
                      <p className="text-[11px] text-muted-foreground">{p.paymentMethod} · {p.paymentStatus}</p>
                    </td>
                    <td className="max-w-44 px-4 py-3">
                      <p className="truncate text-muted-foreground">{p.organizationName}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="whitespace-nowrap text-xs">
                        {p.days}d · {formatDate(p.startsAt)} → {formatDate(p.endsAt)}
                      </p>
                      {p.status === 'ACTIVE' && (
                        <p className="mt-0.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                          {p.daysLeft} day{p.daysLeft === 1 ? '' : 's'} left
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      ${p.amount.toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={cn('rounded-full text-[11px] font-semibold', STATUS_STYLE[p.status] ?? '')}>
                        {p.status.charAt(0) + p.status.slice(1).toLowerCase()}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function Kpi({
  label,
  value,
  icon: Icon,
  accent,
  hint,
}: {
  label: string
  value: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  accent?: boolean
  hint?: string
}) {
  return (
    <Card className={cn('rounded-2xl', accent && 'border-amber-500/40')}>
      <CardContent className="flex items-center gap-3 px-4 py-3">
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
            accent ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-primary/10 text-primary'
          )}
        >
          <Icon size={17} />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="truncate text-base font-bold leading-tight">{value}</p>
          {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  )
}
