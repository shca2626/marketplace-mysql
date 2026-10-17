'use client'

// ── COMPLAINT-1: buyer-side complaints console ──────────────────────────────
// My Account → Complaints & Reports: file a company trust report (optionally
// linked to one of your orders), track it through the lifecycle (OPEN →
// ORG_RESPONDED → RESOLVED/DISMISSED, or WITHDRAWN while open) and withdraw
// open reports. The FileComplaintDialog is reused from the Orders console so
// a problem order can be reported right where the buyer notices it.

import { useMemo, useState } from 'react'
import {
  Building2,
  CircleCheck,
  Flag,
  Loader2,
  MessageSquareText,
  Package,
  ShieldCheck,
  ShieldX,
  Undo2,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { formatUSD, timeAgo } from '@/lib/format'
import { apiRequest, EmptyState, StatusBadge, type BadgeMap } from '@/components/marketplace/b2b/b2b-shared'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

// ── API contracts ────────────────────────────────────────────────────────────

export interface ComplaintRow {
  id: string
  number: string
  targetOrgId: string
  targetOrgName: string
  targetOrgSlug: string
  raisedByName: string
  raisedByOrgName: string | null
  orderId: string | null
  orderRef: string | null
  orderTotal: number | null
  productTitle: string | null
  category: string
  subject: string
  body: string
  status: string
  orgResponse: string | null
  orgRespondedAt: string | null
  severity: string
  resolutionNote: string | null
  resolvedByName: string | null
  resolvedAt: string | null
  createdAt: string
}

export interface ComplaintContextDTO {
  orgs: { id: string; name: string }[]
  orders: { id: string; createdAt: string; total: number; sellerOrgIds: string[]; itemSummary: string }[]
  categories: { key: string; label: string }[]
}

export interface ComplaintsResponse {
  complaints: ComplaintRow[]
  context: ComplaintContextDTO
}

// ── shared maps ──────────────────────────────────────────────────────────────

export const COMPLAINT_STATUS_MAP: BadgeMap = {
  OPEN: { label: 'Open', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  ORG_RESPONDED: { label: 'Company responded', badge: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300' },
  RESOLVED: { label: 'Resolved', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  DISMISSED: { label: 'Dismissed', badge: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
  WITHDRAWN: { label: 'Withdrawn', badge: 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400' },
}

export const COMPLAINT_SEVERITY_MAP: BadgeMap = {
  NORMAL: { label: 'Normal', badge: 'bg-muted text-muted-foreground' },
  HIGH: { label: 'High priority', badge: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300' },
  CRITICAL: { label: 'Critical', badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' },
}

export const CATEGORY_LABEL: Record<string, string> = {
  MISLEADING_INFO: 'Misleading information',
  COUNTERFEIT: 'Counterfeit or fake goods',
  CONDUCT: 'Unprofessional conduct',
  PRICING: 'Pricing abuse or hidden fees',
  FULFILLMENT: 'Fulfillment failure',
  IP_INFRINGEMENT: 'IP infringement',
  OTHER: 'Other',
}

// ── main view ────────────────────────────────────────────────────────────────

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'live', label: 'Live' },
  { key: 'OPEN', label: 'Open' },
  { key: 'ORG_RESPONDED', label: 'Answered' },
  { key: 'closed', label: 'Closed' },
] as const

export function ComplaintsView() {
  const { data, loading, error, refetch } = useApi<ComplaintsResponse>('/api/complaints')
  const complaints = useMemo(() => data?.complaints ?? [], [data])
  const context = data?.context

  const [filter, setFilter] = useState<string>('all')
  const [fileOpen, setFileOpen] = useState(false)

  const filtered = useMemo(() => {
    if (filter === 'all') return complaints
    if (filter === 'live') return complaints.filter((c) => ['OPEN', 'ORG_RESPONDED'].includes(c.status))
    if (filter === 'closed') return complaints.filter((c) => ['RESOLVED', 'DISMISSED', 'WITHDRAWN'].includes(c.status))
    return complaints.filter((c) => c.status === filter)
  }, [complaints, filter])

  const stats = useMemo(
    () => ({
      open: complaints.filter((c) => c.status === 'OPEN').length,
      answered: complaints.filter((c) => c.status === 'ORG_RESPONDED').length,
      closed: complaints.filter((c) => ['RESOLVED', 'DISMISSED'].includes(c.status)).length,
    }),
    [complaints]
  )

  const withdraw = async (c: ComplaintRow) => {
    const res = await apiRequest(`/api/complaints/${c.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'withdraw' }),
    })
    if (!res.ok) {
      toast({ title: 'Withdraw failed', description: res.error ?? 'Please try again.', variant: 'destructive' })
      return
    }
    toast({ title: 'Complaint withdrawn', description: `${c.number} is closed and no longer tracked.` })
    void refetch()
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      {/* Intro + file CTA */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-extrabold">
            <Flag size={20} className="text-rose-500" /> Complaints & Reports
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Report a company for misleading information, counterfeits or conduct issues. Order problems with a
            refund in sight belong to the dispute flow on the order — this is the company-level trust report.
          </p>
        </div>
        <Button className="rounded-xl" onClick={() => setFileOpen(true)}>
          <Flag size={15} className="mr-1.5" /> File a complaint
        </Button>
      </div>

      {/* Mini stats */}
      <div className="flex flex-wrap gap-2.5">
        <MiniStat icon={Flag} label="Open" value={stats.open} tone="amber" />
        <MiniStat icon={MessageSquareText} label="Answered" value={stats.answered} tone="violet" />
        <MiniStat icon={ShieldCheck} label="Closed" value={stats.closed} tone="emerald" />
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
              filter === f.key
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <EmptyState icon={ShieldX} title="Couldn't load your complaints" description={error}>
          <Button variant="outline" className="rounded-xl" onClick={() => void refetch()}>
            Try again
          </Button>
        </EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Flag}
          title={complaints.length === 0 ? 'No complaints filed' : 'Nothing in this filter'}
          description={
            complaints.length === 0
              ? 'When a company misbehaves — misleading listings, counterfeits, conduct — file a report here and the platform trust & safety team will review it.'
              : 'Try another filter to see the rest of your complaints.'
          }
        >
          {complaints.length === 0 && context && context.orgs.length > 0 && (
            <Button className="rounded-xl" onClick={() => setFileOpen(true)}>
              <Flag size={15} className="mr-1.5" /> File your first complaint
            </Button>
          )}
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => (
            <ComplaintCard key={c.id} complaint={c} onWithdraw={() => void withdraw(c)} />
          ))}
        </div>
      )}

      {/* ── File dialog (self-sufficient: loads its own filing context) ── */}
      <FileComplaintDialog open={fileOpen} onOpenChange={setFileOpen} onFiled={() => void refetch()} />
    </div>
  )
}

// ── complaint card ───────────────────────────────────────────────────────────

export function ComplaintCard({
  complaint: c,
  onWithdraw,
  compact,
}: {
  complaint: ComplaintRow
  onWithdraw?: () => void
  compact?: boolean
}) {
  return (
    <Card className="rounded-2xl py-0 transition-shadow hover:shadow-sm">
      <CardContent className="space-y-3 px-4 py-4 sm:px-5">
        {/* Head: number, org, status */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="font-mono text-[11px] font-semibold text-muted-foreground">{c.number}</span>
          <span className="flex min-w-0 items-center gap-1.5 text-sm font-bold">
            <Building2 size={14} className="shrink-0 text-primary" />
            <span className="truncate">{c.targetOrgName}</span>
          </span>
          <StatusBadge status={c.status} map={COMPLAINT_STATUS_MAP} />
          {c.severity !== 'NORMAL' && <StatusBadge status={c.severity} map={COMPLAINT_SEVERITY_MAP} />}
          <span className="ml-auto text-[11px] text-muted-foreground">{timeAgo(c.createdAt)}</span>
        </div>

        {/* Subject + category + context chips */}
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">{c.subject}</p>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="rounded-full bg-muted px-2 py-0.5 font-medium">
              {CATEGORY_LABEL[c.category] ?? c.category}
            </span>
            {c.orderRef && (
              <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium">
                <Package size={10} /> {c.orderRef}
              </span>
            )}
            {c.productTitle && (
              <span className="max-w-56 truncate rounded-full bg-muted px-2 py-0.5 font-medium">{c.productTitle}</span>
            )}
            {c.raisedByOrgName && (
              <span className="rounded-full bg-muted px-2 py-0.5 font-medium">for {c.raisedByOrgName}</span>
            )}
          </div>
        </div>

        {/* Body */}
        {!compact && <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{c.body}</p>}

        {/* Org response */}
        {c.orgResponse && (
          <div className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-violet-700 dark:text-violet-300">
              <MessageSquareText size={12} /> Company response
              {c.orgRespondedAt && <span className="font-normal normal-case text-muted-foreground">· {timeAgo(c.orgRespondedAt)}</span>}
            </p>
            <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed">{c.orgResponse}</p>
          </div>
        )}

        {/* Resolution */}
        {(c.status === 'RESOLVED' || c.status === 'DISMISSED') && (
          <div
            className={cn(
              'rounded-xl border p-3',
              c.status === 'RESOLVED'
                ? 'border-emerald-500/25 bg-emerald-500/5'
                : 'border-border bg-muted/40'
            )}
          >
            <p
              className={cn(
                'flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide',
                c.status === 'RESOLVED' ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground'
              )}
            >
              {c.status === 'RESOLVED' ? <ShieldCheck size={12} /> : <ShieldX size={12} />}
              {c.status === 'RESOLVED' ? 'Platform resolution' : 'Dismissed by platform review'}
              {c.resolvedByName && (
                <span className="font-normal normal-case text-muted-foreground">· {c.resolvedByName}</span>
              )}
            </p>
            {c.resolutionNote && (
              <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed">{c.resolutionNote}</p>
            )}
          </div>
        )}

        {/* Actions */}
        {c.status === 'OPEN' && onWithdraw && (
          <div className="flex justify-end">
            <Button variant="outline" size="sm" className="rounded-lg text-xs" onClick={onWithdraw}>
              <Undo2 size={13} className="mr-1" /> Withdraw complaint
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── file dialog (shared with the Orders console) ─────────────────────────────

export function FileComplaintDialog({
  open,
  onOpenChange,
  onFiled,
  presetOrgId,
  presetOrderId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onFiled?: () => void
  /** pre-selected company (e.g. reporting right from an order card) */
  presetOrgId?: string
  /** pre-selected order */
  presetOrderId?: string
}) {
  // Filing context (companies/orders/categories) — fetched while the dialog
  // is open; the parent may pass nothing (self-sufficient dialog).
  const { data: ctxData, loading: ctxLoading } = useApi<ComplaintsResponse>(open ? '/api/complaints' : null)
  const ctx = ctxData?.context ?? null
  const [orgId, setOrgId] = useState(presetOrgId ?? '')
  const [orderId, setOrderId] = useState(presetOrderId ?? '')
  const [category, setCategory] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const orgOrders = useMemo(() => {
    if (!ctx) return []
    if (!orgId) return []
    return ctx.orders.filter((o) => o.sellerOrgIds.includes(orgId))
  }, [ctx, orgId])

  const selectedOrg = ctx?.orgs.find((o) => o.id === orgId)

  const reset = () => {
    setOrgId('')
    setOrderId('')
    setCategory('')
    setSubject('')
    setBody('')
  }

  const submit = async () => {
    if (!orgId || !category || !subject.trim() || !body.trim()) return
    setSubmitting(true)
    const res = await apiRequest<{ complaint: ComplaintRow }>('/api/complaints', {
      method: 'POST',
      body: JSON.stringify({
        targetOrgId: orgId,
        category,
        subject: subject.trim(),
        body: body.trim(),
        orderId: orderId || null,
      }),
    })
    setSubmitting(false)
    if (!res.ok || !res.data) {
      toast({ title: 'Could not file the complaint', description: res.error ?? 'Please try again.', variant: 'destructive' })
      return
    }
    toast({
      title: `Complaint ${res.data.complaint.number} filed`,
      description: `The platform trust & safety team has been notified.${selectedOrg ? ` ${selectedOrg.name} has been asked to respond.` : ''}`,
    })
    reset()
    onOpenChange(false)
    onFiled?.()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag size={18} className="text-rose-500" /> File a complaint
          </DialogTitle>
          <DialogDescription>
            Report a company to the platform trust & safety team. The company gets one chance to respond; the
            platform reviews the case and decides.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Company */}
          <div className="space-y-1.5">
            <Label>Company</Label>
            {ctxLoading && !ctx ? (
              <Skeleton className="h-10 w-full rounded-xl" />
            ) : (ctx?.orgs.length ?? 0) === 0 ? (
              <p className="rounded-xl border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground">
                You haven&apos;t transacted with any company yet — complaints are anchored to companies you have
                order history with. Place an order first, or use the contact channel on the store page.
              </p>
            ) : (
              <Select value={orgId} onValueChange={setOrgId} disabled={Boolean(presetOrgId)}>
                <SelectTrigger className="w-full rounded-xl">
                  <SelectValue placeholder="Which company?" />
                </SelectTrigger>
                <SelectContent>
                  {ctx!.orgs.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Optional linked order */}
          {orgId && orgOrders.length > 0 && (
            <div className="space-y-1.5">
              <Label>
                Linked order <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Select value={orderId} onValueChange={setOrderId}>
                <SelectTrigger className="w-full rounded-xl">
                  <SelectValue placeholder="No specific order" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No specific order</SelectItem>
                  {orgOrders.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.itemSummary} · {formatUSD(o.total)} · {timeAgo(o.createdAt)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Category */}
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full rounded-xl">
                <SelectValue placeholder="What is this about?" />
              </SelectTrigger>
              <SelectContent>
                {(ctx?.categories ?? Object.entries(CATEGORY_LABEL).map(([key, label]) => ({ key, label }))).map(
                  (c) => (
                    <SelectItem key={c.key} value={c.key}>
                      {c.label}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Subject */}
          <div className="space-y-1.5">
            <Label htmlFor="complaint-subject">Subject</Label>
            <Input
              id="complaint-subject"
              value={subject}
              maxLength={120}
              placeholder="One line — e.g. Panels not delivered after 6 weeks"
              className="rounded-xl"
              onChange={(e) => setSubject(e.target.value)}
            />
            <p className="text-right text-[10px] text-muted-foreground">{subject.length}/120</p>
          </div>

          {/* Body */}
          <div className="space-y-1.5">
            <Label htmlFor="complaint-body">What happened?</Label>
            <Textarea
              id="complaint-body"
              value={body}
              maxLength={4000}
              placeholder="Describe the issue with dates, amounts and any communication you had with the company…"
              className="min-h-28 rounded-xl"
              onChange={(e) => setBody(e.target.value)}
            />
            <p className="text-right text-[10px] text-muted-foreground">{body.length}/4000</p>
          </div>

          <p className="rounded-xl bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
            <CircleCheck size={12} className="mr-1 inline" />
            Filed complaints are visible to the company (with your name) and the platform trust &amp; safety team.
            Abusive or fraudulent reports may lead to account action.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="rounded-xl"
            disabled={!orgId || !category || subject.trim().length < 5 || body.trim().length < 20 || submitting}
            onClick={() => void submit()}
          >
            {submitting && <Loader2 size={15} className="mr-1.5 animate-spin" />} File complaint
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── mini stat ────────────────────────────────────────────────────────────────

function MiniStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  value: number
  tone: 'amber' | 'violet' | 'emerald'
}) {
  const tones = {
    amber: 'text-amber-600 dark:text-amber-400',
    violet: 'text-violet-600 dark:text-violet-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
  } as const
  return (
    <div className="flex min-w-32 items-center gap-2.5 rounded-xl border bg-muted/30 px-3 py-2">
      <Icon size={15} className={cn('shrink-0', tones[tone])} />
      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-sm font-bold leading-tight">{value}</p>
      </div>
    </div>
  )
}
