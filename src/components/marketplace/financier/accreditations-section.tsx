'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FINANCIER · ACCREDITATIONS — forwarded accreditation requests (flow 8 /
// DP-26): grant with validity + note, reject with note, revoke a live grant
// with a reason. Renewal is a NEW request after expiry/revocation.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  BadgeCheck,
  Ban,
  CheckCircle2,
  FileText,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Undo2,
  Users,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import type { AccreditationRequestDetailDTO, AccreditationRequestSummaryDTO } from '@/lib/types'
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
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  apiRequest,
  ACC_STATUS_MAP,
  ConditionTypeBadge,
  DOCUMENT_TYPE_LABELS,
  EmptyState,
  formatDate,
  formatMoney,
  GateMeter,
  LabeledValue,
  StatusBadge,
  SUBMISSION_STATUS_MAP,
  timeAgo,
  toastApiError,
} from '@/components/marketplace/financing/financing-shared'

type Decision = 'grant' | 'reject' | 'revoke' | null

export function AccreditationsSection() {
  const { data, loading, error, refetch } = useApi<{
    requests: AccreditationRequestSummaryDTO[]
    total: number
  }>('/api/financier/accreditations?limit=100')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (selectedId) {
    return (
      <AccreditationDetail
        requestId={selectedId}
        onBack={() => {
          setSelectedId(null)
          void refetch()
        }}
      />
    )
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    )
  }
  if (error) {
    return (
      <EmptyState icon={BadgeCheck} title="Could not load accreditations" description={error}>
        <Button variant="outline" className="rounded-xl" onClick={() => void refetch()}>
          Retry
        </Button>
      </EmptyState>
    )
  }

  const requests = data?.requests ?? []
  const pending = requests.filter((r) => ['FORWARDED_TO_FINANCIER', 'UNDER_FINANCIER_REVIEW'].includes(r.status))
  const decided = requests.filter((r) => !['FORWARDED_TO_FINANCIER', 'UNDER_FINANCIER_REVIEW'].includes(r.status))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-primary/5 px-4 py-3">
        <p className="flex items-center gap-2 text-xs font-medium text-foreground/80">
          <ShieldCheck size={15} className="text-primary" />
          Accredited companies unlock RFQ participation with you and auto-pass flagged requirements on your other services.
        </p>
        <span className="text-xs text-muted-foreground">{pending.length} awaiting decision</span>
      </div>

      {requests.length === 0 ? (
        <EmptyState
          icon={BadgeCheck}
          title="No accreditation requests"
          description="Forwarded accreditation program applications will appear here — grant, reject or revoke them."
        />
      ) : (
        <>
          {pending.length > 0 && (
            <div className="space-y-3">
              {pending.map((r) => (
                <motion.div key={r.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                  <Card className="transition-shadow hover:shadow-md">
                    <CardContent className="flex flex-col gap-3 p-4 sm:p-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-lg bg-muted px-2 py-1 font-mono text-xs font-bold">{r.number}</span>
                        <StatusBadge status={r.status} map={ACC_STATUS_MAP} />
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          <ShieldCheck size={10} /> Gate passed
                        </span>
                        <span className="ml-auto text-[11px] text-muted-foreground">forwarded {timeAgo(r.forwardedAt)}</span>
                      </div>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold">{r.serviceName}</p>
                          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Users size={11} /> {r.organizationName}
                            {r.scopeNotes && <span className="truncate">· “{r.scopeNotes}”</span>}
                          </p>
                        </div>
                        <Button size="sm" className="rounded-lg" onClick={() => setSelectedId(r.id)}>
                          Review <CheckCircle2 size={13} className="ml-1.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
          {decided.length > 0 && (
            <div>
              <p className="mb-2 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Decided</p>
              <div className="space-y-2">
                {decided.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedId(r.id)}
                    className="flex w-full flex-wrap items-center gap-2 rounded-xl border bg-card px-3.5 py-3 text-left transition-colors hover:bg-muted/50"
                  >
                    <span className="rounded-lg bg-muted px-2 py-0.5 font-mono text-[11px] font-bold">{r.number}</span>
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold">{r.organizationName}</span>
                    <StatusBadge status={r.status} map={ACC_STATUS_MAP} />
                    {r.isLive && r.validUntil && (
                      <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">valid to {formatDate(r.validUntil)}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function AccreditationDetail({ requestId, onBack }: { requestId: string; onBack: () => void }) {
  const { data, loading, error, refetch } = useApi<{ request: AccreditationRequestDetailDTO }>(
    `/api/financier/accreditations/${requestId}`
  )
  const [decision, setDecision] = useState<Decision>(null)
  const [busy, setBusy] = useState(false)

  const r = data?.request

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-40 rounded-xl" />
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }
  if (error || !r) {
    return (
      <div className="space-y-4">
        <Button variant="outline" className="rounded-xl" onClick={onBack}>
          <ArrowLeft size={14} className="mr-1.5" /> Back
        </Button>
        <EmptyState icon={FileText} title="Could not load the accreditation request" description={error ?? undefined} />
      </div>
    )
  }

  const actionable = ['FORWARDED_TO_FINANCIER', 'UNDER_FINANCIER_REVIEW'].includes(r.status)

  return (
    <div className="space-y-5">
      <Button variant="outline" className="rounded-xl" onClick={onBack}>
        <ArrowLeft size={14} className="mr-1.5" /> Back to accreditations
      </Button>

      <Card>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-muted px-2 py-1 font-mono text-sm font-bold">{r.number}</span>
            <StatusBadge status={r.status} map={ACC_STATUS_MAP} />
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              <ShieldCheck size={11} /> Gate passed · forwarded {formatDate(r.forwardedAt)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <LabeledValue label="Company">
              <span className="font-semibold">{r.organizationName}</span>
            </LabeledValue>
            <LabeledValue label="Program">
              <span className="font-semibold">{r.serviceName}</span>
            </LabeledValue>
            <LabeledValue label="Submitted by">
              <span className="font-semibold">{r.submittedBy.name}</span>
              <span className="block text-xs text-muted-foreground">{formatDate(r.submittedAt)}</span>
            </LabeledValue>
            <LabeledValue label="Status">
              {r.isLive ? (
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
                  <BadgeCheck size={13} /> Live until {formatDate(r.validUntil)}
                </span>
              ) : r.revokedAt ? (
                <span className="font-semibold text-rose-600">Revoked {formatDate(r.revokedAt)}</span>
              ) : (
                <span className="font-semibold">{ACC_STATUS_MAP[r.status]?.label ?? r.status}</span>
              )}
            </LabeledValue>
          </div>
          {r.scopeNotes && <p className="rounded-xl bg-muted/40 p-3 text-xs italic text-muted-foreground">Scope: “{r.scopeNotes}”</p>}
          {(r.decisionNote || r.revocationReason) && (
            <p className="text-xs text-muted-foreground">
              Last note: “{r.revocationReason ?? r.decisionNote}”
            </p>
          )}
          <GateMeter verified={r.gate.verified} waived={r.gate.waived} totalRequired={r.gate.totalRequired} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4 sm:p-6">
          <h3 className="text-sm font-bold">Platform-verified checklist</h3>
          <ul className="space-y-2">
            {r.submissions.map((s) => (
              <li key={s.id} className="rounded-xl border bg-background p-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <CheckCircle2
                    size={13}
                    className={cn(
                      'shrink-0',
                      s.status === 'VERIFIED'
                        ? 'text-emerald-600'
                        : s.status === 'WAIVED'
                          ? 'text-violet-500'
                          : s.status === 'REJECTED'
                            ? 'text-rose-500'
                            : 'text-muted-foreground/50'
                    )}
                  />
                  <p className="min-w-0 flex-1 text-[13px] font-semibold leading-snug">{s.requirement.template.title}</p>
                  <ConditionTypeBadge type={s.requirement.template.conditionType} />
                  <StatusBadge status={s.status} map={SUBMISSION_STATUS_MAP} />
                </div>
                <div className="mt-1.5 space-y-0.5 pl-[21px] text-[11.5px] text-muted-foreground">
                  {s.requirement.template.conditionType === 'DOCUMENT' && (
                    <p>
                      Document: {s.accountDocumentId ? 'attached from vault' : '—'} · expects{' '}
                      {DOCUMENT_TYPE_LABELS[s.requirement.template.documentType ?? ''] ?? 'any document'}
                    </p>
                  )}
                  {s.valueText && <p>Answer: “{s.valueText}”</p>}
                  {s.decisionNote && <p className="italic text-foreground/70">Platform note: “{s.decisionNote}”</p>}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {actionable && (
        <div className="flex flex-wrap gap-2">
          <Button className="rounded-xl" onClick={() => setDecision('grant')} disabled={busy}>
            <BadgeCheck size={14} className="mr-1.5" /> Grant accreditation
          </Button>
          <Button variant="outline" className="rounded-xl text-destructive hover:text-destructive" onClick={() => setDecision('reject')} disabled={busy}>
            <Ban size={14} className="mr-1.5" /> Reject
          </Button>
        </div>
      )}
      {r.isLive && (
        <Button variant="outline" className="rounded-xl text-destructive hover:text-destructive" onClick={() => setDecision('revoke')} disabled={busy}>
          <Undo2 size={14} className="mr-1.5" /> Revoke live grant
        </Button>
      )}

      <AccreditationDecisionDialog
        decision={decision}
        request={r}
        onOpenChange={(o) => !o && setDecision(null)}
        onDone={() => {
          setDecision(null)
          void refetch()
        }}
      />
    </div>
  )
}

function AccreditationDecisionDialog({
  decision,
  request,
  onOpenChange,
  onDone,
}: {
  decision: Decision
  request: AccreditationRequestSummaryDTO
  onOpenChange: (open: boolean) => void
  onDone: () => void
}) {
  const [validMonths, setValidMonths] = useState('12')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [initializedFor, setInitializedFor] = useState<Decision>(null)

  if (decision && initializedFor !== decision) {
    setInitializedFor(decision)
    setNote('')
    setValidMonths('12')
  }
  if (!decision && initializedFor !== null) setInitializedFor(null)

  const submit = async () => {
    setSubmitting(true)
    const base = `/api/financier/accreditations/${request.id}`
    let res: { ok: boolean; error?: string }
    if (decision === 'grant') {
      res = await apiRequest(`${base}/grant`, {
        method: 'POST',
        body: JSON.stringify({ note: note.trim() || null, validMonths: Number(validMonths) || undefined }),
      })
    } else if (decision === 'reject') {
      res = await apiRequest(`${base}/reject`, { method: 'POST', body: JSON.stringify({ note: note.trim() }) })
    } else {
      res = await apiRequest(`${base}/revoke`, { method: 'POST', body: JSON.stringify({ note: note.trim() }) })
    }
    setSubmitting(false)
    if (!res.ok) return toastApiError(res.error)
    toast({
      title:
        decision === 'grant'
          ? 'Accreditation granted'
          : decision === 'reject'
            ? 'Accreditation rejected'
            : 'Accreditation revoked',
      description:
        decision === 'grant'
          ? `${request.organizationName} is accredited for ${validMonths} months — RFQ participation + auto-pass are now live.`
          : decision === 'reject'
            ? 'The company has been notified with your note.'
            : 'The live grant was revoked — the reason is recorded.',
    })
    onDone()
  }

  const needsNote = decision === 'reject' || decision === 'revoke'

  return (
    <Dialog open={!!decision} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {decision === 'grant' ? `Grant — ${request.organizationName}` : decision === 'reject' ? 'Reject this application' : 'Revoke this accreditation'}
          </DialogTitle>
          <DialogDescription>
            {decision === 'grant'
              ? 'Grant-on-request (DP-26): the company is ACCREDITED from the moment you confirm; validity can be tuned.'
              : decision === 'reject'
                ? 'A rejection note is required — the company sees it with the decision.'
                : 'A revocation reason is required. RFQ participation and auto-pass benefits stop immediately.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3.5">
          {decision === 'grant' && (
            <div className="space-y-1.5">
              <Label htmlFor="acc-valid" className="text-xs">
                Validity (months)
              </Label>
              <Input
                id="acc-valid"
                type="number"
                min={1}
                max={60}
                className="h-9 rounded-lg"
                value={validMonths}
                onChange={(e) => setValidMonths(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                {request.validUntil ? `Service default would expire ${formatDate(request.validUntil)}.` : 'Falls back to the service validity when omitted.'}
              </p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="acc-note" className="text-xs">
              {decision === 'grant' ? 'Note (optional)' : 'Note (required)'}
            </Label>
            <Textarea
              id="acc-note"
              className="min-h-[80px] rounded-lg"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={decision === 'grant' ? 'e.g. Welcome to the program.' : 'e.g. Financial statements did not match the tax filings.'}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant={decision === 'grant' ? 'default' : 'destructive'}
            className="rounded-xl"
            onClick={() => void submit()}
            disabled={submitting || (needsNote && note.trim().length < 3)}
          >
            {submitting ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <RotateCcw size={14} className="mr-1.5" />}
            {decision === 'grant' ? 'Grant' : decision === 'reject' ? 'Reject' : 'Revoke'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
