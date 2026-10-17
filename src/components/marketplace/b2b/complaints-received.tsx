'use client'

// ── COMPLAINT-1: Selling → Complaints (received) ────────────────────────────
// The company-side view of trust reports filed against this organization:
// every complaint with the complainant, category and context, one response
// per complaint (posted by OWNER/ADMIN or members holding org.offers.manage),
// and the platform decision once the case is closed.

import { useMemo, useState } from 'react'
import {
  Building2,
  Flag,
  Loader2,
  MessageSquareText,
  Send,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { timeAgo } from '@/lib/format'
import { apiRequest, EmptyState, StatusBadge, type BadgeMap } from './b2b-shared'
import {
  CATEGORY_LABEL,
  COMPLAINT_SEVERITY_MAP,
  COMPLAINT_STATUS_MAP,
  type ComplaintRow,
} from '@/components/marketplace/complaints-view'
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
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

// ── API contract ─────────────────────────────────────────────────────────────

interface ReceivedResponse {
  complaints: ComplaintRow[]
}

// ── section ──────────────────────────────────────────────────────────────────

export function ComplaintsReceivedSub({ organizationId, orgName }: { organizationId: string; orgName: string }) {
  const { data, loading, error, refetch } = useApi<ReceivedResponse>(
    `/api/complaints/org?organizationId=${organizationId}`
  )
  const complaints = useMemo(() => data?.complaints ?? [], [data])

  const [respondTo, setRespondTo] = useState<ComplaintRow | null>(null)

  const stats = useMemo(
    () => ({
      open: complaints.filter((c) => c.status === 'OPEN').length,
      answered: complaints.filter((c) => c.status === 'ORG_RESPONDED').length,
      urgent: complaints.filter((c) => c.severity !== 'NORMAL' && ['OPEN', 'ORG_RESPONDED'].includes(c.status)).length,
    }),
    [complaints]
  )

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="flex flex-wrap items-stretch gap-2.5">
        <MiniStat icon={Flag} label="Received" value={complaints.length} tone="neutral" />
        <MiniStat icon={ShieldAlert} label="Awaiting response" value={stats.open} tone="amber" />
        <MiniStat icon={MessageSquareText} label="Answered" value={stats.answered} tone="violet" />
        <MiniStat icon={ShieldX} label="Urgent" value={stats.urgent} tone="rose" />
      </div>

      {complaints.length > 0 && stats.open > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3.5 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
          <strong className="font-bold">{stats.open} complaint{stats.open === 1 ? '' : 's'} awaiting your response.</strong>{' '}
          Each complaint allows a single company response — make it count. Unanswered complaints stay in the
          platform trust &amp; safety queue.
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <EmptyState icon={ShieldX} title="Couldn't load complaints" description={error}>
          <Button variant="outline" className="rounded-xl" onClick={() => void refetch()}>
            Try again
          </Button>
        </EmptyState>
      ) : complaints.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title={`No complaints against ${orgName}`}
          description="When someone files a trust report against your company it appears here — you get one response per complaint and the platform reviews the case."
        />
      ) : (
        <div className="space-y-3">
          {complaints.map((c) => (
            <Card key={c.id} className="rounded-2xl py-0 transition-shadow hover:shadow-sm">
              <CardContent className="space-y-3 px-4 py-4 sm:px-5">
                {/* Head */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="font-mono text-[11px] font-semibold text-muted-foreground">{c.number}</span>
                  <StatusBadge status={c.status} map={COMPLAINT_STATUS_MAP} />
                  {c.severity !== 'NORMAL' && <StatusBadge status={c.severity} map={COMPLAINT_SEVERITY_MAP} />}
                  <span className="ml-auto text-[11px] text-muted-foreground">{timeAgo(c.createdAt)}</span>
                </div>

                {/* Subject + who */}
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold">{c.subject}</p>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="rounded-full bg-muted px-2 py-0.5 font-medium">
                      {CATEGORY_LABEL[c.category] ?? c.category}
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 font-medium">
                      <Building2 size={10} className="mr-1 inline" />
                      from {c.raisedByName}
                      {c.raisedByOrgName ? ` · ${c.raisedByOrgName}` : ''}
                    </span>
                    {c.orderRef && (
                      <span className="max-w-56 truncate rounded-full bg-muted px-2 py-0.5 font-medium">{c.orderRef}</span>
                    )}
                  </div>
                </div>

                {/* Body */}
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{c.body}</p>

                {/* Our response */}
                {c.orgResponse && (
                  <div className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-violet-700 dark:text-violet-300">
                      Your response
                      {c.orgRespondedAt && (
                        <span className="font-normal normal-case text-muted-foreground"> · {timeAgo(c.orgRespondedAt)}</span>
                      )}
                    </p>
                    <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed">{c.orgResponse}</p>
                  </div>
                )}

                {/* Platform decision */}
                {(c.status === 'RESOLVED' || c.status === 'DISMISSED') && (
                  <div
                    className={cn(
                      'rounded-xl border p-3',
                      c.status === 'RESOLVED' ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-border bg-muted/40'
                    )}
                  >
                    <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      {c.status === 'RESOLVED' ? 'Resolved by the platform' : 'Dismissed by the platform'}
                      {c.resolvedByName ? ` · ${c.resolvedByName}` : ''}
                    </p>
                    {c.resolutionNote && (
                      <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed">{c.resolutionNote}</p>
                    )}
                  </div>
                )}

                {/* Respond CTA */}
                {c.status === 'OPEN' && (
                  <div className="flex justify-end">
                    <Button size="sm" className="rounded-lg text-xs" onClick={() => setRespondTo(c)}>
                      <Send size={13} className="mr-1.5" /> Respond
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Respond dialog ── */}
      {respondTo && (
        <RespondDialog
          complaint={respondTo}
          organizationId={organizationId}
          onOpenChange={(v) => !v && setRespondTo(null)}
          onDone={() => {
            setRespondTo(null)
            void refetch()
          }}
        />
      )}
    </div>
  )
}

// ── respond dialog ────────────────────────────────────────────────────────────

function RespondDialog({
  complaint,
  organizationId,
  onOpenChange,
  onDone,
}: {
  complaint: ComplaintRow
  organizationId: string
  onOpenChange: (v: boolean) => void
  onDone: () => void
}) {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  const submit = async () => {
    setSending(true)
    const res = await apiRequest(`/api/complaints/${complaint.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'respond', organizationId, message: message.trim() }),
    })
    setSending(false)
    if (!res.ok) {
      toast({ title: 'Could not send the response', description: res.error ?? 'Please try again.', variant: 'destructive' })
      return
    }
    toast({
      title: 'Response sent',
      description: `${complaint.number} moves to the platform review queue — the complainant has been notified.`,
    })
    onDone()
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquareText size={18} className="text-violet-500" /> Respond to {complaint.number}
          </DialogTitle>
          <DialogDescription>
            Your single formal response to this complaint — the complainant and the platform review team will see
            it. State facts, dates and what you&apos;ve done (or will do) to make it right.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-xl border p-3 text-xs">
            <p className="font-semibold">{complaint.subject}</p>
            <p className="mt-1 line-clamp-3 text-muted-foreground">{complaint.body}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="org-response">Your response</Label>
            <Textarea
              id="org-response"
              value={message}
              maxLength={4000}
              placeholder="What happened from your side, and how you propose to resolve it…"
              className="min-h-32 rounded-xl"
              onChange={(e) => setMessage(e.target.value)}
            />
            <p className="text-right text-[10px] text-muted-foreground">{message.length}/4000</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="rounded-xl"
            disabled={message.trim().length < 10 || sending}
            onClick={() => void submit()}
          >
            {sending ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : <Send size={15} className="mr-1.5" />}
            Send response
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── small pieces ─────────────────────────────────────────────────────────────

function MiniStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  value: number
  tone: 'neutral' | 'amber' | 'violet' | 'rose'
}) {
  const tones = {
    neutral: 'text-muted-foreground',
    amber: 'text-amber-600 dark:text-amber-400',
    violet: 'text-violet-600 dark:text-violet-400',
    rose: 'text-rose-600 dark:text-rose-400',
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
