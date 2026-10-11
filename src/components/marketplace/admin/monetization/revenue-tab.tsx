'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN · MONETIZATION — Revenue tab (Phase 11.3, task 11-c).
//
// The revenue console: the FeeAssessment ledger reconciled TO THE CENT against
// the three external money sources it mirrors (payout commissions, financing
// success fees, paid subscription invoices). Everything is per-currency —
// amounts are never summed across currencies. Includes:
//   • KPI cards (net per event, currency-labelled)
//   • per-event reconciliation cards with difference badges + the unreconciled
//     items (pre-Phase-11 "legacy" rows are expected and counted separately)
//   • monthly net buckets (CSS bars, one series per event × currency)
//   • the financier commissions card — the 11.3 commission-customization
//     visibility layer (custom FINANCING_SUCCESS rules vs the platform
//     default, from financierCommissionOverview)
//
// API: GET /api/admin/fees/reconcile · GET /api/admin/fees/export
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  CalendarRange,
  Download,
  Landmark,
  Loader2,
  RefreshCw,
  ScrollText,
  ShieldAlert,
  Undo2,
  Wallet,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { AdminEmptyState } from '../shared'

// ── API contract ─────────────────────────────────────────────────────────────

interface CurrencyReconRow {
  currency: string
  ledgerSum: number
  externalSum: number
  difference: number
  reconciled: boolean
}

interface UnreconciledItem {
  refType: string
  refId: string
  label: string
  amount: number
  currency: string
  createdAt: string
  legacy: boolean
}

interface EventRecon {
  event: string
  currencies: CurrencyReconRow[]
  ledgerCount: number
  unreconciled: UnreconciledItem[]
  unreconciledCount: number
  legacyCount: number
  note: string
}

interface FinancierRow {
  orgId: string
  orgName: string
  orgType: string
  rule: { id: string; version: number; dimension: string; value: number } | null
  platformDefault: { id: string; version: number; dimension: string; value: number } | null
  ledgerNet: { currency: string; amount: number }[]
  ledgerCount: number
}

interface ReconcileResponse {
  reconcile: {
    from: string | null
    to: string | null
    generatedAt: string
    phase11LiveAt: string | null
    events: EventRecon[]
    monthlyBuckets: {
      ym: string
      netByEvent: Record<string, Record<string, number>>
      netTotal: Record<string, number>
    }[]
    reversalCount: number
  }
  financiers: FinancierRow[]
}

// ── palette / formatting ─────────────────────────────────────────────────────

const fmt = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const EVENT_META: Record<string, { label: string; badge: string; bar: string; icon: typeof Landmark }> = {
  ORDER_COMMISSION: {
    label: 'Order commission',
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    bar: 'bg-emerald-500',
    icon: Wallet,
  },
  FINANCING_SUCCESS: {
    label: 'Financing success',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    bar: 'bg-amber-500',
    icon: Landmark,
  },
  SUBSCRIPTION_RENEWAL: {
    label: 'Subscription renewal',
    badge: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
    bar: 'bg-violet-500',
    icon: CalendarRange,
  },
}

const ORG_TYPE_BADGE: Record<string, string> = {
  BANK: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  MFI: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  EWALLET: 'bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-300',
}

/** Headline currency per event for the KPI cards (others shown muted below). */
const KPI_PREFER: Record<string, string> = {
  ORDER_COMMISSION: 'USD',
  FINANCING_SUCCESS: 'YER',
  SUBSCRIPTION_RENEWAL: 'USD',
}

const SCROLLBAR =
  '[scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-stone-300 dark:[&::-webkit-scrollbar-thumb]:bg-stone-700'

// ── the tab ──────────────────────────────────────────────────────────────────

export function RevenueTab() {
  const [draftFrom, setDraftFrom] = useState('')
  const [draftTo, setDraftTo] = useState('')
  const [applied, setApplied] = useState<{ from: string; to: string }>({ from: '', to: '' })

  const qs = useMemo(() => {
    const p = new URLSearchParams()
    if (applied.from) p.set('from', applied.from)
    if (applied.to) p.set('to', applied.to)
    const s = p.toString()
    return s ? `?${s}` : ''
  }, [applied])

  const { data, loading, error, refetch } = useApi<ReconcileResponse>(`/api/admin/fees/reconcile${qs}`)

  const applyRange = () => setApplied({ from: draftFrom, to: draftTo })
  const clearRange = () => {
    setDraftFrom('')
    setDraftTo('')
    setApplied({ from: '', to: '' })
  }

  const exportCsv = (type: 'ledger' | 'reconcile') => {
    const p = new URLSearchParams({ type })
    if (applied.from) p.set('from', applied.from)
    if (applied.to) p.set('to', applied.to)
    window.open(`/api/admin/fees/export?${p.toString()}`, '_blank', 'noopener')
    toast({ title: 'Export started', description: `The ${type} CSV download has started.` })
  }

  // Monthly buckets → one bar series per event × currency.
  const series = useMemo(() => {
    if (!data) return []
    const buckets = data.reconcile.monthlyBuckets
    const out: { event: string; currency: string; months: { ym: string; amount: number }[]; max: number }[] = []
    for (const ev of Object.keys(EVENT_META)) {
      const currencies = new Set<string>()
      for (const b of buckets) for (const c of Object.keys(b.netByEvent[ev] ?? {})) currencies.add(c)
      for (const currency of currencies) {
        const months = buckets.map((b) => ({ ym: b.ym, amount: b.netByEvent[ev]?.[currency] ?? 0 }))
        out.push({ event: ev, currency, months, max: Math.max(...months.map((m) => Math.abs(m.amount)), 1) })
      }
    }
    return out
  }, [data])

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 rounded-2xl" />
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-44 rounded-2xl" />
        ))}
      </div>
    )
  }
  if (error) {
    return (
      <AdminEmptyState icon={ShieldAlert} title="Couldn't load the revenue console" description={error}>
        <Button variant="outline" className="rounded-xl" onClick={() => void refetch()}>
          <RefreshCw size={13} className="mr-1" /> Retry
        </Button>
      </AdminEmptyState>
    )
  }

  const recon = data!.reconcile
  const financiers = data!.financiers
  const windowLabel = `${applied.from || 'start'} → ${applied.to || 'today'}`

  const kpi = (event: string) => {
    const ev = recon.events.find((e) => e.event === event)
    const rows = ev?.currencies ?? []
    const main = rows.find((r) => r.currency === KPI_PREFER[event]) ?? rows[0] ?? null
    const others = rows.filter((r) => r !== main)
    return { main, others, ledgerCount: ev?.ledgerCount ?? 0 }
  }
  const orderKpi = kpi('ORDER_COMMISSION')
  const financingKpi = kpi('FINANCING_SUCCESS')
  const subsKpi = kpi('SUBSCRIPTION_RENEWAL')

  return (
    <div className="space-y-4">
      {/* ── Window + exports ─────────────────────────────────────────────── */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor="rv-from" className="text-[11px] text-muted-foreground">From</Label>
              <Input
                id="rv-from"
                type="date"
                className="mt-1 h-9 w-40 rounded-xl"
                value={draftFrom}
                max={draftTo || undefined}
                onChange={(e) => setDraftFrom(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="rv-to" className="text-[11px] text-muted-foreground">To</Label>
              <Input
                id="rv-to"
                type="date"
                className="mt-1 h-9 w-40 rounded-xl"
                value={draftTo}
                min={draftFrom || undefined}
                onChange={(e) => setDraftTo(e.target.value)}
              />
            </div>
            <Button size="sm" className="rounded-xl" onClick={applyRange}>
              <CalendarRange size={14} className="mr-1" /> Apply
            </Button>
            {(applied.from || applied.to) && (
              <Button size="sm" variant="outline" className="rounded-xl" onClick={clearRange}>
                All time
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => void refetch()} disabled={loading}>
              {loading ? <Loader2 size={13} className="mr-1 animate-spin" /> : <RefreshCw size={13} className="mr-1" />}
              Refresh
            </Button>
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => exportCsv('ledger')}>
              <Download size={13} className="mr-1" /> Ledger CSV
            </Button>
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => exportCsv('reconcile')}>
              <Download size={13} className="mr-1" /> Reconcile CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── KPI cards (per-currency honest) ───────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard
          icon={Wallet}
          label="Net revenue"
          currency={orderKpi.main?.currency ?? 'USD'}
          value={orderKpi.main ? fmt(orderKpi.main.ledgerSum) : '0.00'}
          sub={`${orderKpi.ledgerCount} assessments · payout commissions`}
          others={orderKpi.others.map((o) => ({ currency: o.currency, amount: o.ledgerSum }))}
        />
        <KpiCard
          icon={Landmark}
          label="Net financing fees"
          currency={financingKpi.main?.currency ?? 'YER'}
          value={financingKpi.main ? fmt(financingKpi.main.ledgerSum) : '0.00'}
          sub={`${financingKpi.ledgerCount} assessments · success fees`}
          others={financingKpi.others.map((o) => ({ currency: o.currency, amount: o.ledgerSum }))}
        />
        <KpiCard
          icon={CalendarRange}
          label="Subscriptions"
          currency={subsKpi.main?.currency ?? 'USD'}
          value={subsKpi.main ? fmt(subsKpi.main.ledgerSum) : '0.00'}
          sub={`${subsKpi.ledgerCount} assessments · paid renewals`}
          others={subsKpi.others.map((o) => ({ currency: o.currency, amount: o.ledgerSum }))}
        />
        <div className="rounded-2xl border bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Reversals</p>
            <Undo2 size={15} className="shrink-0 text-primary" />
          </div>
          <p className="mt-1.5 text-2xl font-extrabold tabular-nums">{recon.reversalCount}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">appended negative rows in window</p>
        </div>
      </div>

      {/* ── Reconciliation to the cent ────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-xs font-semibold text-foreground/80">
        <ScrollText size={14} className="text-primary" /> Reconciliation to the cent ({windowLabel})
      </div>
      {recon.events.map((ev) => {
        const meta = EVENT_META[ev.event] ?? { label: ev.event, badge: 'bg-muted text-muted-foreground', bar: 'bg-stone-400', icon: ScrollText }
        const Icon = meta.icon
        return (
          <Card key={ev.event}>
            <CardHeader className="pb-3">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <Icon size={16} className="text-primary" />
                <Badge className={cn('rounded-full border-0 text-[11px] font-semibold', meta.badge)}>{meta.label}</Badge>
                <span className="font-normal text-muted-foreground">
                  {ev.ledgerCount} ledger row{ev.ledgerCount === 1 ? '' : 's'}
                </span>
              </CardTitle>
              <p className="text-xs leading-relaxed text-muted-foreground">{ev.note}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="overflow-hidden rounded-xl border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th scope="col" className="px-4 py-2.5 font-medium">Currency</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-medium">Ledger Σ</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-medium">External Σ</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-medium">Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ev.currencies.length === 0 ? (
                      <tr className="border-b last:border-0">
                        <td colSpan={4} className="px-4 py-4 text-center text-xs text-muted-foreground">
                          Nothing in this window — no assessments, no external items.
                        </td>
                      </tr>
                    ) : (
                      ev.currencies.map((c) => (
                        <tr key={c.currency} className="border-b transition-colors last:border-0 hover:bg-accent/50">
                          <td className="px-4 py-2.5 font-mono text-xs font-bold tracking-tight">{c.currency}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{fmt(c.ledgerSum)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{fmt(c.externalSum)}</td>
                          <td className="px-4 py-2.5 text-right">
                            {c.reconciled ? (
                              <Badge className="rounded-full border-0 bg-emerald-100 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                {fmt(c.difference)} · reconciled
                              </Badge>
                            ) : (
                              <Badge className="rounded-full border-0 bg-rose-100 text-[11px] font-semibold text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                                {c.difference > 0 ? '+' : ''}
                                {fmt(c.difference)} · unreconciled
                              </Badge>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {ev.unreconciledCount === 0 ? (
                <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  <span aria-hidden>✓</span> Every external item in this window has a matching assessment.
                </p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    {ev.unreconciledCount} external item{ev.unreconciledCount === 1 ? '' : 's'} without an assessment
                    {ev.legacyCount > 0 && (
                      <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                        {ev.legacyCount} legacy — created before the fee engine went live
                        {recon.phase11LiveAt ? ` (${recon.phase11LiveAt.slice(0, 10)})` : ''}
                      </span>
                    )}
                  </p>
                  <div className={cn('max-h-64 space-y-1.5 overflow-y-auto pr-1', SCROLLBAR)}>
                    {ev.unreconciled.map((u) => (
                      <div
                        key={`${u.refType}:${u.refId}`}
                        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border bg-muted/30 px-3 py-2"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="font-mono text-xs font-bold tracking-tight">{u.label}</span>
                          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{u.refType}</span>
                          {u.legacy && (
                            <Badge className="rounded-full border-0 bg-stone-200 text-[10px] font-semibold text-stone-600 dark:bg-stone-800 dark:text-stone-400">
                              pre-Phase-11
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs font-semibold tabular-nums">
                          {fmt(u.amount)} <span className="font-normal text-muted-foreground">{u.currency}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Unreconciled items are external money with no ledger row — pre-Phase-11 rows are expected legacy
                    carry-over; anything newer means an assessment hook did not fire.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        )
      })}

      {/* ── Monthly net buckets ───────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <CalendarRange size={16} className="text-primary" /> Monthly net by event
            <span className="font-normal text-muted-foreground">(ledger rows, net of reversals)</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {series.length === 0 ? (
            <p className="px-1 py-6 text-center text-xs text-muted-foreground">
              No assessments in this window yet — monthly buckets appear as fees land on the ledger.
            </p>
          ) : (
            <div className="space-y-5">
              {series.map((s) => {
                const meta = EVENT_META[s.event] ?? { label: s.event, bar: 'bg-stone-400' }
                return (
                  <div key={`${s.event}:${s.currency}`}>
                    <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-foreground/80">
                      <Badge className={cn('rounded-full border-0 text-[11px] font-semibold', EVENT_META[s.event]?.badge)}>
                        {meta.label}
                      </Badge>
                      <span className="font-mono text-[11px] font-bold tracking-tight text-muted-foreground">{s.currency}</span>
                    </p>
                    <div className="space-y-2">
                      {s.months.map((m) => {
                        const width = Math.max(2, Math.round((Math.abs(m.amount) / s.max) * 100))
                        return (
                          <div key={m.ym} className="flex items-center gap-3">
                            <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">{m.ym}</span>
                            <div className="h-5 flex-1 overflow-hidden rounded-lg bg-muted/60">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${width}%` }}
                                transition={{ duration: 0.4 }}
                                className={cn('h-full rounded-lg', meta.bar)}
                                style={{ minWidth: 4 }}
                              />
                            </div>
                            <span
                              className={cn(
                                'w-32 shrink-0 text-right text-xs tabular-nums',
                                m.amount < 0 ? 'font-semibold text-rose-600 dark:text-rose-400' : 'text-muted-foreground'
                              )}
                            >
                              {fmt(m.amount)}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Financier commissions (11.3 customization visibility) ─────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Landmark size={16} className="text-primary" /> Financier commissions
            <span className="font-normal text-muted-foreground">
              success-fee rules per financier — custom ORG rules override the platform default
            </span>
          </CardTitle>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Customization lives in the Fee Rules tab (ORG-scope FINANCING_SUCCESS rules). The net below is each
            financier&rsquo;s FINANCING_SUCCESS ledger revenue in the current window.
            {financiers[0]?.platformDefault
              ? ` Platform default: ${financiers[0].platformDefault.value}% per successful financing.`
              : ' No platform FINANCING_SUCCESS rule is active yet — financing fees still accrue through the legacy rate snapshot.'}
          </p>
        </CardHeader>
        <CardContent>
          {financiers.length === 0 ? (
            <p className="px-1 py-6 text-center text-xs text-muted-foreground">No financier organizations yet.</p>
          ) : (
            <div className="hidden overflow-x-auto rounded-2xl border md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="px-4 py-3 font-medium">Financier</th>
                    <th scope="col" className="px-4 py-3 font-medium">Success-fee rule</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">Ledger net (window)</th>
                  </tr>
                </thead>
                <tbody>
                  {financiers.map((f) => (
                    <tr key={f.orgId} className="border-b transition-colors last:border-0 hover:bg-accent/50">
                      <td className="px-4 py-3">
                        <p className="max-w-52 truncate text-xs font-medium">{f.orgName}</p>
                        <Badge
                          className={cn(
                            'mt-0.5 rounded-full border-0 text-[10px] font-semibold',
                            ORG_TYPE_BADGE[f.orgType] ?? 'bg-muted text-muted-foreground'
                          )}
                        >
                          {f.orgType}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {f.rule ? (
                          <Badge className="rounded-full border-0 bg-violet-100 text-[11px] font-semibold text-violet-800 dark:bg-violet-950 dark:text-violet-300">
                            {f.rule.dimension === 'PERCENT' ? `${f.rule.value}% custom` : `flat ${fmt(f.rule.value)} custom`} · v
                            {f.rule.version}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">platform default</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {f.ledgerNet.length === 0 ? (
                          <span className="text-xs text-muted-foreground">— ({f.ledgerCount} rows)</span>
                        ) : (
                          f.ledgerNet.map((n) => (
                            <p key={n.currency} className="text-xs font-semibold tabular-nums">
                              {fmt(n.amount)}{' '}
                              <span className="font-normal text-muted-foreground">
                                {n.currency} · {f.ledgerCount} rows
                              </span>
                            </p>
                          ))
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {/* Mobile stacked cards */}
          <div className="space-y-2.5 md:hidden">
            {financiers.map((f) => (
              <div key={f.orgId} className="rounded-2xl border p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{f.orgName}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge
                        className={cn(
                          'rounded-full border-0 text-[10px] font-semibold',
                          ORG_TYPE_BADGE[f.orgType] ?? 'bg-muted text-muted-foreground'
                        )}
                      >
                        {f.orgType}
                      </Badge>
                      {f.rule ? (
                        <Badge className="rounded-full border-0 bg-violet-100 text-[11px] font-semibold text-violet-800 dark:bg-violet-950 dark:text-violet-300">
                          {f.rule.dimension === 'PERCENT' ? `${f.rule.value}% custom` : `flat ${fmt(f.rule.value)} custom`}
                        </Badge>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">platform default</span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    {f.ledgerNet.length === 0 ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      f.ledgerNet.map((n) => (
                        <p key={n.currency} className="text-sm font-semibold tabular-nums">
                          {fmt(n.amount)} <span className="text-[11px] font-normal text-muted-foreground">{n.currency}</span>
                        </p>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  currency,
  value,
  sub,
  others,
}: {
  icon: typeof Landmark
  label: string
  currency: string
  value: string
  sub: string
  others: { currency: string; amount: number }[]
}) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label} <span className="font-mono text-[10px] text-muted-foreground/80">· {currency}</span>
        </p>
        <Icon size={15} className="shrink-0 text-primary" />
      </div>
      <p className="mt-1.5 truncate text-2xl font-extrabold tabular-nums">{value}</p>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>
      {others.length > 0 && (
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground/80">
          + {others.map((o) => `${fmt(o.amount)} ${o.currency}`).join(' · ')}
        </p>
      )}
    </div>
  )
}
