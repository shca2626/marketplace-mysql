'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN · MONETIZATION — Fee Ledger tab (Phase 11.3, task 11-c).
//
// The immutable FeeAssessment rows: filters by event / status / date window /
// limit, a KPI mini-row (applied vs reversals vs net-in-window, per currency),
// and the reversal action — a dialog with a mandatory reason (min 10 chars)
// that APPENDS a negative REVERSAL row. The original row is never touched.
//
// API: GET /api/admin/fees/ledger · POST /api/admin/fees/ledger/[id]/reverse
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { Loader2, RefreshCw, ScrollText, SearchX, ShieldAlert, Undo2 } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { formatDate } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { AdminEmptyState, apiRequest, toastApiError } from '../shared'

// ── API contract ─────────────────────────────────────────────────────────────

interface AssessmentRow {
  id: string
  idempotencyKey: string
  event: string
  ruleId: string | null
  ruleVersion: number | null
  ruleSnapshot: string | null
  actorType: string
  actorOrgId: string | null
  actorOrgName: string | null
  refType: string | null
  refId: string | null
  refLabel: string | null
  baseAmount: number
  currency: string
  fxRateToUsd: number
  amount: number
  status: string
  reversalOfId: string | null
  reversalReason: string | null
  assessedAt: string
}

interface LedgerResponse {
  assessments: AssessmentRow[]
  count: number
  summary: {
    event: string
    appliedCount: number
    reversalCount: number
    grossAmount: number
    reversalAmount: number
    netAmount: number
  }[]
  netByCurrency: { currency: string; amount: number }[]
}

// ── palette / formatting ─────────────────────────────────────────────────────

const EVENT_STYLE: Record<string, { label: string; badge: string }> = {
  ORDER_COMMISSION: {
    label: 'Order',
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  },
  FINANCING_SUCCESS: {
    label: 'Financing',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  },
  SUBSCRIPTION_RENEWAL: {
    label: 'Subscription',
    badge: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  },
  ACCREDITATION: {
    label: 'Accreditation',
    badge: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  },
  SPONSORSHIP: {
    label: 'Sponsorship',
    badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  },
  FINANCING_REFERRAL: {
    label: 'Referral',
    badge: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  },
}

const fmt = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const shortId = (id: string) => id.slice(0, 8)

interface RuleSnapshot {
  dimension?: string
  value?: number
}

/** "10% · v1" from the snapshot, "legacy" when no rule row backs the amount. */
function RuleChip({ row }: { row: AssessmentRow }) {
  if (!row.ruleId || row.ruleVersion == null) {
    return (
      <Badge className="rounded-full border-0 bg-stone-200 text-[11px] font-semibold text-stone-600 dark:bg-stone-800 dark:text-stone-400">
        legacy
      </Badge>
    )
  }
  let label = `v${row.ruleVersion}`
  try {
    const snap = JSON.parse(row.ruleSnapshot ?? '{}') as RuleSnapshot
    if (typeof snap.value === 'number') {
      label = snap.dimension === 'PERCENT' ? `${snap.value}% · v${row.ruleVersion}` : `flat ${fmt(snap.value)} · v${row.ruleVersion}`
    }
  } catch {
    /* snapshot unreadable — version alone is still honest */
  }
  return (
    <Badge className="rounded-full border-0 bg-orange-100 text-[11px] font-semibold text-orange-800 dark:bg-orange-950 dark:text-orange-300">
      {label}
    </Badge>
  )
}

// ── the tab ──────────────────────────────────────────────────────────────────

export function LedgerTab() {
  const [event, setEvent] = useState('all')
  const [status, setStatus] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [limit, setLimit] = useState('100')

  const qs = useMemo(() => {
    const p = new URLSearchParams()
    if (event !== 'all') p.set('event', event)
    if (status !== 'all') p.set('status', status)
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    p.set('limit', limit)
    return p.toString()
  }, [event, status, from, to, limit])

  const { data, loading, error, refetch } = useApi<LedgerResponse>(`/api/admin/fees/ledger?${qs}`)

  const rows = data?.assessments ?? []
  const appliedCount = (data?.summary ?? []).reduce((acc, s) => acc + s.appliedCount, 0)
  const reversalCount = (data?.summary ?? []).reduce((acc, s) => acc + s.reversalCount, 0)
  const netByCurrency = data?.netByCurrency ?? []

  // Reversal dialog state
  const [reverseFor, setReverseFor] = useState<AssessmentRow | null>(null)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submitReversal = async () => {
    if (!reverseFor) return
    if (reason.trim().length < 10) {
      toast({
        title: 'Reason too short',
        description: 'A reversal reason of at least 10 characters is required — it is permanent ledger evidence.',
        variant: 'destructive',
      })
      return
    }
    setSubmitting(true)
    const res = await apiRequest<{ assessment: AssessmentRow }>(`/api/admin/fees/ledger/${reverseFor.id}/reverse`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason.trim() }),
    })
    setSubmitting(false)
    if (!res.ok) {
      toastApiError(res.error, 'Reversal failed')
      return
    }
    toast({
      title: 'Assessment reversed',
      description: `A negative REVERSAL row was appended for ${fmt(reverseFor.amount)} ${reverseFor.currency} — the original row is untouched.`,
    })
    setReverseFor(null)
    setReason('')
    void refetch()
  }

  return (
    <div className="space-y-4">
      {/* ── KPI mini-row ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Applied</p>
          <p className="mt-1.5 text-2xl font-extrabold tabular-nums">{data ? appliedCount : '—'}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">assessments in window</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Reversals</p>
          <p className="mt-1.5 text-2xl font-extrabold tabular-nums">{data ? reversalCount : '—'}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">appended negative rows</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Net in window</p>
          <p className="mt-1.5 truncate text-lg font-extrabold tabular-nums">
            {data ? (
              netByCurrency.length > 0 ? (
                netByCurrency.map((c) => (
                  <span key={c.currency} className="mr-2 inline-block">
                    {fmt(c.amount)} <span className="text-xs font-semibold text-muted-foreground">{c.currency}</span>
                  </span>
                ))
              ) : (
                '0.00'
              )
            ) : (
              '—'
            )}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">per currency — never summed across</p>
        </div>
      </div>

      {/* ── Filters + table ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <ScrollText size={16} className="text-primary" /> Fee ledger
            <span className="ml-auto flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-lg"
                onClick={() => void refetch()}
                disabled={loading}
                aria-label="Refresh the fee ledger"
              >
                {loading ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <RefreshCw size={13} className="mr-1.5" />}
                Refresh
              </Button>
            </span>
          </CardTitle>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <div>
              <Label htmlFor="fl-event" className="text-[11px] text-muted-foreground">Event</Label>
              <Select value={event} onValueChange={setEvent}>
                <SelectTrigger id="fl-event" className="mt-1 h-9 rounded-xl text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All events</SelectItem>
                  <SelectItem value="ORDER_COMMISSION">Order commission</SelectItem>
                  <SelectItem value="FINANCING_SUCCESS">Financing success</SelectItem>
                  <SelectItem value="SUBSCRIPTION_RENEWAL">Subscription renewal</SelectItem>
                  <SelectItem value="ACCREDITATION">Accreditation</SelectItem>
                  <SelectItem value="SPONSORSHIP">Sponsorship / featuring</SelectItem>
                  <SelectItem value="FINANCING_REFERRAL">Financing referral / service</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="fl-status" className="text-[11px] text-muted-foreground">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="fl-status" className="mt-1 h-9 rounded-xl text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="APPLIED">Applied</SelectItem>
                  <SelectItem value="REVERSAL">Reversal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="fl-from" className="text-[11px] text-muted-foreground">From</Label>
              <Input
                id="fl-from"
                type="date"
                className="mt-1 h-9 rounded-xl text-xs"
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="fl-to" className="text-[11px] text-muted-foreground">To</Label>
              <Input
                id="fl-to"
                type="date"
                className="mt-1 h-9 rounded-xl text-xs"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="fl-limit" className="text-[11px] text-muted-foreground">Rows</Label>
              <Select value={limit} onValueChange={setLimit}>
                <SelectTrigger id="fl-limit" className="mt-1 h-9 rounded-xl text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="200">200</SelectItem>
                  <SelectItem value="500">500</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && !data ? (
            <div className="space-y-2.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-xl" />
              ))}
            </div>
          ) : error ? (
            <AdminEmptyState icon={ShieldAlert} title="Couldn't load the fee ledger" description={error}>
              <Button variant="outline" className="rounded-xl" onClick={() => void refetch()}>
                Try again
              </Button>
            </AdminEmptyState>
          ) : rows.length === 0 ? (
            <AdminEmptyState
              icon={SearchX}
              title="No assessments match"
              description="Every fee the platform charges writes exactly one assessment row. Payout, financing-accept and renewal events land here as they happen."
            />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto rounded-2xl border md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th scope="col" className="px-4 py-3 font-medium">Assessed</th>
                      <th scope="col" className="px-4 py-3 font-medium">Event</th>
                      <th scope="col" className="px-4 py-3 font-medium">Actor</th>
                      <th scope="col" className="px-4 py-3 font-medium">Ref</th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">Base → fee</th>
                      <th scope="col" className="px-4 py-3 font-medium">Rule</th>
                      <th scope="col" className="px-4 py-3 font-medium">Status</th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b transition-colors last:border-0 hover:bg-accent/50">
                        <td className="px-4 py-3 text-xs text-muted-foreground" title={new Date(r.assessedAt).toISOString()}>
                          {formatDate(r.assessedAt)}
                          <span className="ml-1 opacity-70">
                            {new Date(r.assessedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            className={cn(
                              'shrink-0 rounded-full border-0 text-[11px] font-semibold',
                              EVENT_STYLE[r.event]?.badge ?? 'bg-muted text-muted-foreground'
                            )}
                          >
                            {EVENT_STYLE[r.event]?.label ?? r.event}
                          </Badge>
                        </td>
                        <td className="max-w-44 px-4 py-3">
                          <p className="truncate text-xs font-medium">{r.actorOrgName ?? '—'}</p>
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{r.actorType}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-mono text-xs font-semibold tracking-tight">
                            {r.refLabel ?? (r.refId ? shortId(r.refId) : '—')}
                          </p>
                          {r.refType && <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{r.refType}</p>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <p className="tabular-nums">
                            {fmt(r.baseAmount)} <span className="text-[11px] text-muted-foreground">{r.currency}</span>
                          </p>
                          <p
                            className={cn(
                              'tabular-nums text-xs font-semibold',
                              r.amount < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-foreground'
                            )}
                          >
                            → {fmt(r.amount)} <span className="text-[11px] font-normal text-muted-foreground">{r.currency}</span>
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <RuleChip row={r} />
                        </td>
                        <td className="px-4 py-3">
                          {r.status === 'REVERSAL' ? (
                            <Badge
                              className="rounded-full border-0 bg-rose-100 text-[11px] font-semibold text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                              title={`Reversal of ${r.reversalOfId ? shortId(r.reversalOfId) : 'the original'}${r.reversalReason ? ` — "${r.reversalReason}"` : ''}`}
                            >
                              Reversal
                            </Badge>
                          ) : (
                            <Badge className="rounded-full border-0 bg-emerald-100 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              Applied
                            </Badge>
                          )}
                          {r.status === 'REVERSAL' && r.reversalOfId && (
                            <p className="mt-0.5 text-[11px] text-muted-foreground">of {shortId(r.reversalOfId)}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {r.status === 'APPLIED' && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 rounded-lg"
                              onClick={() => setReverseFor(r)}
                              aria-label={`Reverse assessment ${shortId(r.id)}`}
                            >
                              <Undo2 size={13} className="mr-1.5" /> Reverse
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile + tablet stacked cards */}
              <div className="space-y-2.5 md:hidden">
                {rows.map((r) => (
                  <div key={r.id} className="rounded-2xl border p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge
                            className={cn(
                              'shrink-0 rounded-full border-0 text-[11px] font-semibold',
                              EVENT_STYLE[r.event]?.badge ?? 'bg-muted text-muted-foreground'
                            )}
                          >
                            {EVENT_STYLE[r.event]?.label ?? r.event}
                          </Badge>
                          {r.status === 'REVERSAL' ? (
                            <Badge className="rounded-full border-0 bg-rose-100 text-[11px] font-semibold text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                              Reversal{r.reversalOfId ? ` of ${shortId(r.reversalOfId)}` : ''}
                            </Badge>
                          ) : (
                            <Badge className="rounded-full border-0 bg-emerald-100 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              Applied
                            </Badge>
                          )}
                          <RuleChip row={r} />
                        </div>
                        <p className="mt-1.5 font-mono text-xs font-semibold tracking-tight">
                          {r.refLabel ?? (r.refId ? shortId(r.refId) : '—')}
                          {r.refType ? <span className="ml-1 font-sans text-[11px] font-normal text-muted-foreground">{r.refType}</span> : null}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {r.actorOrgName ?? r.actorType} · {formatDate(r.assessedAt)}
                        </p>
                        {r.status === 'REVERSAL' && r.reversalReason && (
                          <p className="mt-1 line-clamp-2 text-[11px] italic text-muted-foreground">“{r.reversalReason}”</p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="tabular-nums text-sm font-semibold">
                          {fmt(r.amount)} <span className="text-[11px] font-normal text-muted-foreground">{r.currency}</span>
                        </p>
                        <p className="text-[11px] tabular-nums text-muted-foreground">of {fmt(r.baseAmount)}</p>
                        {r.status === 'APPLIED' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-1.5 h-8 rounded-lg"
                            onClick={() => setReverseFor(r)}
                            aria-label={`Reverse assessment ${shortId(r.id)}`}
                          >
                            <Undo2 size={13} className="mr-1" /> Reverse
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <p className="mt-3 text-xs text-muted-foreground">
                {rows.length} row{rows.length === 1 ? '' : 's'} shown (newest first). Reversals append a negative row —
                net revenue is always the plain sum over the ledger.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Reversal dialog ────────────────────────────────────────────────── */}
      <Dialog open={!!reverseFor} onOpenChange={(open) => { if (!open) { setReverseFor(null); setReason('') } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reverse this assessment?</DialogTitle>
            <DialogDescription>
              {reverseFor && (
                <>
                  A negative <span className="font-semibold">REVERSAL</span> row will be appended for{' '}
                  {fmt(reverseFor.amount)} {reverseFor.currency} ({EVENT_STYLE[reverseFor.event]?.label ?? reverseFor.event} on{' '}
                  {reverseFor.refLabel ?? (reverseFor.refId ? shortId(reverseFor.refId) : 'no ref')}). The original row is
                  never modified — the pair nets to zero in every total.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reversal-reason">Reason (required, min 10 characters)</Label>
            <Textarea
              id="reversal-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Payout PY-2026-000010 was generated against cancelled order items — commission not owed."
              className="min-h-24 rounded-xl"
              aria-describedby="reversal-reason-count"
            />
            <p
              id="reversal-reason-count"
              className={cn(
                'text-right text-[11px]',
                reason.trim().length >= 10 ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-400'
              )}
            >
              {reason.trim().length} / 10 characters minimum
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => { setReverseFor(null); setReason('') }} disabled={submitting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="rounded-xl"
              onClick={() => void submitReversal()}
              disabled={submitting || reason.trim().length < 10}
            >
              {submitting ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Undo2 size={14} className="mr-1.5" />}
              Append reversal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
