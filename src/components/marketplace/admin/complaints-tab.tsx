'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN · OPERATIONS — Complaints console (COMPLAINT-1).
//
// The company trust-report queue: every complaint with its target org,
// complainant, category and context (order/product links), the org response
// and the triage state. Staff set severity (NORMAL/HIGH/CRITICAL) and close
// the case as RESOLVED (note required) or DISMISSED — the complainant is
// notified automatically.
//
// API: GET /api/admin/complaints  ·  PATCH /api/admin/complaints/[id]
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import {
  Flag,
  Loader2,
  MessageSquareText,
  RefreshCw,
  SearchX,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { formatDate } from '@/lib/format'
import { apiRequest } from '@/components/marketplace/b2b/b2b-shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { AdminEmptyState } from './shared'
import {
  CATEGORY_LABEL,
  COMPLAINT_SEVERITY_MAP,
  COMPLAINT_STATUS_MAP,
  type ComplaintRow,
} from '@/components/marketplace/complaints-view'

// ── API contract ─────────────────────────────────────────────────────────────

interface AdminComplaintsResponse {
  complaints: ComplaintRow[]
  stats: {
    total: number
    open: number
    orgResponded: number
    resolved: number
    dismissed: number
    withdrawn: number
    urgent: number
  }
}

const STATUS_FILTERS = ['all', 'OPEN', 'ORG_RESPONDED', 'RESOLVED', 'DISMISSED', 'WITHDRAWN'] as const
const SEVERITY_FILTERS = ['all', 'NORMAL', 'HIGH', 'CRITICAL'] as const

const FILTER_LABEL: Record<string, string> = {
  all: 'All',
  OPEN: 'Open',
  ORG_RESPONDED: 'Answered',
  RESOLVED: 'Resolved',
  DISMISSED: 'Dismissed',
  WITHDRAWN: 'Withdrawn',
  NORMAL: 'Normal',
  HIGH: 'High',
  CRITICAL: 'Critical',
}

export function ComplaintsTab() {
  const { data, loading, error, refetch } = useApi<AdminComplaintsResponse>('/api/admin/complaints')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [severityFilter, setSeverityFilter] = useState<string>('all')
  const [review, setReview] = useState<ComplaintRow | null>(null)

  const rows = useMemo(() => {
    const all = data?.complaints ?? []
    return all.filter(
      (c) =>
        (statusFilter === 'all' || c.status === statusFilter) &&
        (severityFilter === 'all' || c.severity === severityFilter)
    )
  }, [data, statusFilter, severityFilter])

  const stats = data?.stats

  return (
    <div className="space-y-4">
      {/* ── KPI row ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Total" value={stats ? String(stats.total) : '—'} icon={Flag} />
        <Kpi label="Open" value={stats ? String(stats.open) : '—'} icon={ShieldAlert} accent={Boolean(stats?.open)} />
        <Kpi
          label="Company responded"
          value={stats ? String(stats.orgResponded) : '—'}
          icon={MessageSquareText}
        />
        <Kpi
          label="Urgent (live)"
          value={stats ? String(stats.urgent) : '—'}
          icon={ShieldX}
          accent={Boolean(stats?.urgent)}
          hint="HIGH or CRITICAL still open"
        />
      </div>

      {/* ── Filters + refresh ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((s) => (
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
              {FILTER_LABEL[s]}
            </button>
          ))}
          <span className="mx-1 hidden w-px self-stretch bg-border sm:block" />
          {SEVERITY_FILTERS.map((s) => (
            <button
              key={`sev-${s}`}
              type="button"
              onClick={() => setSeverityFilter(s)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                severityFilter === s
                  ? 'border-rose-500/60 bg-rose-500/10 text-rose-600 dark:text-rose-400'
                  : 'border-border bg-background text-muted-foreground hover:border-rose-500/30 hover:text-foreground'
              )}
            >
              {FILTER_LABEL[s]}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" className="rounded-lg" onClick={() => void refetch()}>
          <RefreshCw size={13} className="mr-1.5" /> Refresh
        </Button>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : error ? (
        <AdminEmptyState icon={SearchX} title="Couldn't load complaints" description={error}>
          <Button variant="outline" size="sm" className="rounded-lg" onClick={() => void refetch()}>
            Try again
          </Button>
        </AdminEmptyState>
      ) : rows.length === 0 ? (
        <AdminEmptyState
          icon={Flag}
          title="No complaints"
          description="Company trust reports land here as soon as buyers or partners file them from their console."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Case</th>
                  <th className="px-4 py-3 font-semibold">Company</th>
                  <th className="px-4 py-3 font-semibold">Complainant</th>
                  <th className="px-4 py-3 font-semibold">Category</th>
                  <th className="px-4 py-3 font-semibold">Severity</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Filed</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <p className="font-mono text-[11px] font-semibold text-muted-foreground">{c.number}</p>
                      <p className="mt-0.5 max-w-56 truncate text-xs font-medium">{c.subject}</p>
                    </td>
                    <td className="max-w-40 px-4 py-3">
                      <p className="truncate text-xs">{c.targetOrgName}</p>
                    </td>
                    <td className="max-w-40 px-4 py-3">
                      <p className="truncate text-xs">{c.raisedByName}</p>
                      {c.raisedByOrgName && (
                        <p className="truncate text-[11px] text-muted-foreground">for {c.raisedByOrgName}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="max-w-40 truncate text-xs text-muted-foreground">
                        {CATEGORY_LABEL[c.category] ?? c.category}
                      </p>
                      {c.orderRef && <p className="max-w-40 truncate text-[11px] text-muted-foreground/70">{c.orderRef}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        className={cn(
                          'rounded-full text-[11px] font-semibold',
                          COMPLAINT_SEVERITY_MAP[c.severity]?.badge ?? ''
                        )}
                      >
                        {COMPLAINT_SEVERITY_MAP[c.severity]?.label ?? c.severity}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        className={cn(
                          'rounded-full text-[11px] font-semibold',
                          COMPLAINT_STATUS_MAP[c.status]?.badge ?? ''
                        )}
                      >
                        {COMPLAINT_STATUS_MAP[c.status]?.label ?? c.status}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-[11px] text-muted-foreground">
                      {formatDate(c.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="outline" size="sm" className="rounded-lg text-xs" onClick={() => setReview(c)}>
                        Review
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Review dialog ── */}
      {review && (
        <ReviewDialog
          complaint={review}
          onOpenChange={(v) => !v && setReview(null)}
          onDone={() => {
            setReview(null)
            void refetch()
          }}
        />
      )}
    </div>
  )
}

// ── review + triage dialog ──────────────────────────────────────────────────

function ReviewDialog({
  complaint,
  onOpenChange,
  onDone,
}: {
  complaint: ComplaintRow
  onOpenChange: (v: boolean) => void
  onDone: () => void
}) {
  const closed = ['RESOLVED', 'DISMISSED'].includes(complaint.status)
  const [outcome, setOutcome] = useState<'RESOLVED' | 'DISMISSED'>('RESOLVED')
  const [severity, setSeverity] = useState(complaint.severity)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    const res = await apiRequest(`/api/admin/complaints/${complaint.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ outcome, resolutionNote: note.trim(), severity }),
    })
    setSaving(false)
    if (!res.ok) {
      toast({ title: 'Update failed', description: res.error ?? 'Please try again.', variant: 'destructive' })
      return
    }
    toast({
      title: `Complaint ${complaint.number} ${closed ? 're-triaged' : outcome === 'RESOLVED' ? 'resolved' : 'dismissed'}`,
      description: closed
        ? `Severity set to ${severity}.`
        : 'The complainant has been notified of the decision.',
    })
    onDone()
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <Flag size={18} className="text-rose-500" /> {complaint.number}
            <Badge className={cn('rounded-full text-[11px] font-semibold', COMPLAINT_STATUS_MAP[complaint.status]?.badge ?? '')}>
              {COMPLAINT_STATUS_MAP[complaint.status]?.label ?? complaint.status}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {complaint.subject} — against <span className="font-semibold text-foreground">{complaint.targetOrgName}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5 text-sm">
          {/* Meta */}
          <div className="grid gap-2 rounded-xl bg-muted/40 p-3 text-xs sm:grid-cols-2">
            <p>
              <span className="text-muted-foreground">Complainant:</span>{' '}
              <span className="font-medium">{complaint.raisedByName}</span>
              {complaint.raisedByOrgName && <span className="text-muted-foreground"> (for {complaint.raisedByOrgName})</span>}
            </p>
            <p>
              <span className="text-muted-foreground">Category:</span>{' '}
              <span className="font-medium">{CATEGORY_LABEL[complaint.category] ?? complaint.category}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Filed:</span>{' '}
              <span className="font-medium">{formatDate(complaint.createdAt)}</span>
            </p>
            {complaint.orderRef && (
              <p>
                <span className="text-muted-foreground">Order:</span> <span className="font-medium">{complaint.orderRef}</span>
              </p>
            )}
            {complaint.productTitle && (
              <p>
                <span className="text-muted-foreground">Product:</span>{' '}
                <span className="font-medium">{complaint.productTitle}</span>
              </p>
            )}
          </div>

          {/* Body */}
          <div className="rounded-xl border p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">The report</p>
            <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed">{complaint.body}</p>
          </div>

          {/* Org response */}
          {complaint.orgResponse ? (
            <div className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-violet-700 dark:text-violet-300">
                Company response
              </p>
              <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed">{complaint.orgResponse}</p>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
              The company hasn&apos;t responded yet.
            </p>
          )}

          {/* Prior resolution */}
          {complaint.resolutionNote && (
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                Platform decision{complaint.resolvedByName ? ` · ${complaint.resolvedByName}` : ''}
              </p>
              <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed">{complaint.resolutionNote}</p>
            </div>
          )}

          {/* Triage controls */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Severity</Label>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger className="w-full rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NORMAL">Normal</SelectItem>
                  <SelectItem value="HIGH">High priority</SelectItem>
                  <SelectItem value="CRITICAL">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {!closed && (
              <div className="space-y-1.5">
                <Label>Decision</Label>
                <Select value={outcome} onValueChange={(v) => setOutcome(v as 'RESOLVED' | 'DISMISSED')}>
                  <SelectTrigger className="w-full rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RESOLVED">Resolve (with note)</SelectItem>
                    <SelectItem value="DISMISSED">Dismiss</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {!closed && (
            <div className="space-y-1.5">
              <Label htmlFor="complaint-note">Resolution note {outcome === 'RESOLVED' ? '(required)' : '(optional)'}</Label>
              <Textarea
                id="complaint-note"
                value={note}
                maxLength={4000}
                placeholder="What the platform decided and why — shown to the complainant…"
                className="min-h-24 rounded-xl"
                onChange={(e) => setNote(e.target.value)}
              />
              <p className="text-right text-[10px] text-muted-foreground">{note.length}/4000</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            className="rounded-xl"
            disabled={saving || (!closed && outcome === 'RESOLVED' && note.trim().length < 10)}
            onClick={() => void submit()}
          >
            {saving ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : <ShieldCheck size={15} className="mr-1.5" />}
            {closed ? 'Save severity' : 'Apply decision'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── KPI card (shared style with the monetization tabs) ──────────────────────

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
    <Card className={cn('rounded-2xl', accent && 'border-rose-500/40')}>
      <CardContent className="flex items-center gap-3 px-4 py-3">
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
            accent ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400' : 'bg-primary/10 text-primary'
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
