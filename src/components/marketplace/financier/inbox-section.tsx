'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FINANCIER · REQUESTS INBOX (R-4) — only gate-passed (FORWARDED+) requests
// can ever be listed here; the API structurally excludes everything else.
// Drill-in detail: platform-verified checklist (read-only), open review,
// offer composer with installment builder, withdraw, decline-with-note.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Ban,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  Eye,
  FileText,
  HandCoins,
  Inbox,
  Loader2,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  User,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import type { FinancingOfferDTO, FinancingRequestDetailDTO, FinancingRequestSummaryDTO } from '@/lib/types'
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
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  apiRequest,
  ConditionTypeBadge,
  DOCUMENT_TYPE_LABELS,
  EmptyState,
  FIN_REQUEST_STATUS_MAP,
  formatDate,
  formatDateTime,
  formatMoney,
  GateMeter,
  isoToDateInput,
  LabeledValue,
  OFFER_STATUS_MAP,
  RATE_TYPE_LABELS,
  StatusBadge,
  SUBMISSION_STATUS_MAP,
  timeAgo,
  toastApiError,
} from '@/components/marketplace/financing/financing-shared'

// ── Inbox list ───────────────────────────────────────────────────────────────

export function InboxSection() {
  const { data, loading, error, refetch } = useApi<{
    requests: FinancingRequestSummaryDTO[]
    total: number
  }>('/api/financier/requests?limit=100')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    )
  }
  if (error) {
    return (
      <EmptyState icon={Inbox} title="Could not load the inbox" description={error}>
        <Button variant="outline" className="rounded-xl" onClick={() => void refetch()}>
          Retry
        </Button>
      </EmptyState>
    )
  }

  if (selectedId) {
    return (
      <FinancierRequestDetail
        requestId={selectedId}
        onBack={() => {
          setSelectedId(null)
          void refetch()
        }}
      />
    )
  }

  const requests = data?.requests ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-primary/5 px-4 py-3">
        <p className="flex items-center gap-2 text-xs font-medium text-foreground/80">
          <ShieldCheck size={15} className="text-primary" />
          Every request here passed the platform verification gate — incomplete applications can never reach your inbox.
        </p>
        <span className="text-xs text-muted-foreground">{data?.total ?? requests.length} total</span>
      </div>

      {requests.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No forwarded requests yet"
          description="When the platform forwards a verified application for one of your services, it lands here with its full verified checklist."
        />
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <motion.div key={r.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
              <RequestCard request={r} onOpen={() => setSelectedId(r.id)} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

export function RequestCard({ request: r, onOpen }: { request: FinancingRequestSummaryDTO; onOpen: () => void }) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-muted px-2 py-1 font-mono text-xs font-bold">{r.number}</span>
          <StatusBadge status={r.status} map={FIN_REQUEST_STATUS_MAP} />
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            <ShieldCheck size={10} /> Gate passed {r.forwardedAt ? timeAgo(r.forwardedAt) : ''}
          </span>
          {r.multiGroupId && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground">{r.multiGroupId}</span>
          )}
          <span className="ml-auto text-xs text-muted-foreground">{formatMoney(r.amountRequested, r.currency)}</span>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{r.serviceName}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <User size={11} /> {r.applicant.name}
                {r.organizationName && ` · ${r.organizationName}`}
              </span>
              {r.activityName && <span>· {r.activityName}</span>}
              {r.activityCity && <span>· {r.activityCity}</span>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {(r.offerCount ?? 0) > 0 && (
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10.5px] font-semibold text-violet-800 dark:bg-violet-950 dark:text-violet-300">
                {r.offerCount} offer{(r.offerCount ?? 0) === 1 ? '' : 's'}
              </span>
            )}
            <Button size="sm" className="rounded-lg" onClick={onOpen}>
              Review <Eye size={13} className="ml-1.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Request detail (drill-in) ───────────────────────────────────────────────

export function FinancierRequestDetail({ requestId, onBack }: { requestId: string; onBack: () => void }) {
  const { data, loading, error, refetch } = useApi<{ request: FinancingRequestDetailDTO }>(
    `/api/financier/requests/${requestId}`
  )
  const [openBusy, setOpenBusy] = useState(false)
  const [declineOpen, setDeclineOpen] = useState(false)

  const r = data?.request

  const openReview = async () => {
    if (!r) return
    setOpenBusy(true)
    const res = await apiRequest<{ request: FinancingRequestDetailDTO }>(`/api/financier/requests/${r.id}/open`, {
      method: 'POST',
    })
    setOpenBusy(false)
    if (!res.ok) return toastApiError(res.error)
    toast({ title: 'Review started', description: `${r.number} is now UNDER_FINANCIER_REVIEW.` })
    void refetch()
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-40 rounded-xl" />
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }
  if (error || !r) {
    return (
      <div className="space-y-4">
        <Button variant="outline" className="rounded-xl" onClick={onBack}>
          <ArrowLeft size={14} className="mr-1.5" /> Back to inbox
        </Button>
        <EmptyState icon={FileText} title="Could not load the request" description={error ?? undefined} />
      </div>
    )
  }

  const canOpen = r.status === 'FORWARDED_TO_FINANCIER'
  const actionable = ['FORWARDED_TO_FINANCIER', 'UNDER_FINANCIER_REVIEW', 'OFFERED'].includes(r.status)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" className="rounded-xl" onClick={onBack}>
          <ArrowLeft size={14} className="mr-1.5" /> Back to inbox
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          {canOpen && (
            <Button className="rounded-xl" onClick={() => void openReview()} disabled={openBusy}>
              {openBusy ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Eye size={14} className="mr-1.5" />}
              Start review
            </Button>
          )}
          {actionable && (
            <Button variant="outline" className="rounded-xl text-destructive hover:text-destructive" onClick={() => setDeclineOpen(true)}>
              <Ban size={14} className="mr-1.5" /> Decline
            </Button>
          )}
        </div>
      </div>

      {/* Header card */}
      <Card>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-muted px-2 py-1 font-mono text-sm font-bold">{r.number}</span>
            <StatusBadge status={r.status} map={FIN_REQUEST_STATUS_MAP} />
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              <ShieldCheck size={11} /> Gate passed · forwarded {formatDate(r.forwardedAt)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <LabeledValue label="Applicant">
              <span className="font-semibold">{r.applicant.name}</span>
              <span className="block text-xs text-muted-foreground">{r.organizationName ?? 'Individual'}</span>
            </LabeledValue>
            <LabeledValue label="Service">
              <span className="font-semibold">{r.serviceName}</span>
              <span className="block text-xs text-muted-foreground">{r.financierOrgName}</span>
            </LabeledValue>
            <LabeledValue label="Requested amount">
              <span className="font-bold text-primary">{formatMoney(r.amountRequested, r.currency)}</span>
              {r.tenorRequestedMonths != null && (
                <span className="block text-xs text-muted-foreground">
                  Asked for {r.tenorRequestedMonths} month{r.tenorRequestedMonths === 1 ? '' : 's'}
                </span>
              )}
            </LabeledValue>
            <LabeledValue label="Submitted">
              <span className="font-semibold">{formatDate(r.submittedAt)}</span>
              <span className="block text-xs text-muted-foreground">Consent: {r.consentAt ? formatDate(r.consentAt) : '—'}</span>
            </LabeledValue>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
            <LabeledValue label="Activity">{r.activityName ?? '—'}</LabeledValue>
            <LabeledValue label="City">{r.activityCity ?? '—'}</LabeledValue>
            <LabeledValue label="Purpose">{r.purpose ?? '—'}</LabeledValue>
            <LabeledValue label="Multi-group">{r.multiGroupId ?? '—'}</LabeledValue>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* Verified checklist */}
        <Card>
          <CardContent className="space-y-3 p-4 sm:p-6">
            <div>
              <h3 className="text-sm font-bold">Platform-verified checklist</h3>
              <p className="text-xs text-muted-foreground">
                The platform gate verified every required item before forwarding — verdicts are read-only to you.
              </p>
            </div>
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
                        Document: {s.accountDocumentId ? 'attached from the applicant vault' : '—'} · expects{' '}
                        {DOCUMENT_TYPE_LABELS[s.requirement.template.documentType ?? ''] ?? 'any document'}
                      </p>
                    )}
                    {s.valueText && <p>Answer: “{s.valueText}”</p>}
                    {s.valueNumber != null && <p>Value: {s.valueNumber.toLocaleString('en-US')}</p>}
                    {s.valueDate && <p>Date: {formatDate(s.valueDate)}</p>}
                    {s.decisionNote && (
                      <p className="italic text-foreground/70">Platform note: “{s.decisionNote}”</p>
                    )}
                    {s.verifiedAt && <p>Verified {formatDateTime(s.verifiedAt)}</p>}
                  </div>
                </li>
              ))}
              {r.submissions.length === 0 && (
                <p className="rounded-xl border border-dashed px-4 py-6 text-center text-xs text-muted-foreground">
                  No checklist was composed for this service.
                </p>
              )}
            </ul>
          </CardContent>
        </Card>

        {/* Offers column */}
        <div className="space-y-5">
          {actionable && <OfferComposer request={r} onSent={() => void refetch()} />}
          <OffersPanel offers={r.offers ?? []} onChanged={() => void refetch()} />
        </div>
      </div>

      <DeclineDialog open={declineOpen} onOpenChange={setDeclineOpen} requestId={r.id} onDeclined={onBack} />
    </div>
  )
}

// ── Decline dialog ───────────────────────────────────────────────────────────

function DeclineDialog({
  open,
  onOpenChange,
  requestId,
  onDeclined,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  requestId: string
  onDeclined: () => void
}) {
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    if (note.trim().length < 3) {
      toast({ title: 'A note is required', description: 'Tell the applicant why the application was declined.', variant: 'destructive' })
      return
    }
    setSubmitting(true)
    const res = await apiRequest(`/api/financier/requests/${requestId}/decline`, {
      method: 'POST',
      body: JSON.stringify({ note: note.trim() }),
    })
    setSubmitting(false)
    if (!res.ok) return toastApiError(res.error)
    toast({ title: 'Request declined', description: 'The applicant has been notified with your note.' })
    onOpenChange(false)
    onDeclined()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Decline this request</DialogTitle>
          <DialogDescription>Your note is shared with the applicant and recorded in the audit trail (DP-15).</DialogDescription>
        </DialogHeader>
        <Textarea
          className="min-h-[90px] rounded-lg"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. The requested amount exceeds our current exposure window for this sector."
          aria-label="Decline note"
        />
        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)} disabled={submitting}>
            Keep reviewing
          </Button>
          <Button variant="destructive" className="rounded-xl" onClick={() => void submit()} disabled={submitting}>
            {submitting && <Loader2 size={14} className="mr-1.5 animate-spin" />} Decline request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Offer composer ──────────────────────────────────────────────────────────

interface InstallmentRow {
  dueDate: string
  amount: string
}

function OfferComposer({ request: r, onSent }: { request: FinancingRequestDetailDTO; onSent: () => void }) {
  // FIN-009: prefill from the applicant's own ask — amount AND tenor.
  const [amount, setAmount] = useState(String(r.amountRequested))
  const [rateType, setRateType] = useState('MURABAHA_ANNUAL')
  const [ratePercent, setRatePercent] = useState('')
  const [feeFlat, setFeeFlat] = useState('')
  const [tenor, setTenor] = useState(
    r.tenorRequestedMonths && r.tenorRequestedMonths >= 1 ? String(r.tenorRequestedMonths) : '12'
  )
  const [collateral, setCollateral] = useState('')
  const [notes, setNotes] = useState('')
  const [validUntil, setValidUntil] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 14)
    return isoToDateInput(d.toISOString())
  })
  const [rows, setRows] = useState<InstallmentRow[]>([])
  const [submitting, setSubmitting] = useState<'draft' | 'send' | null>(null)

  const genSchedule = () => {
    const amt = Number(amount)
    const months = Number(tenor)
    if (!amt || !months) {
      toast({ title: 'Amount and tenor first', description: 'Enter the offered amount and tenor to generate a schedule.', variant: 'destructive' })
      return
    }
    const monthly = Math.round((amt / months) * 100) / 100
    const next: InstallmentRow[] = []
    const start = new Date()
    for (let i = 1; i <= months; i++) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, start.getDate())
      next.push({ dueDate: isoToDateInput(d.toISOString()), amount: String(monthly) })
    }
    setRows(next)
    toast({ title: `Schedule generated — ${months} installments`, description: `≈ ${formatMoney(monthly, r.currency)} per month. Tweak any row.` })
  }

  const submit = async (send: boolean) => {
    const amt = Number(amount)
    if (!amt || amt <= 0) {
      toast({ title: 'Offer amount required', description: 'Enter the amount you are offering.', variant: 'destructive' })
      return
    }
    const months = Number(tenor)
    if (!months || months < 1) {
      toast({ title: 'Tenor required', description: 'Enter the tenor in months (1–120).', variant: 'destructive' })
      return
    }
    // FIN-006: the API caps collateralRequired at 24 chars — validate here so
    // the send never dead-ends on a silent 400.
    if (collateral.trim().length > 24) {
      toast({
        title: 'Collateral note too long',
        description: `Keep it under 25 characters (${collateral.trim().length}/24) — details belong in the notes field.`,
        variant: 'destructive',
      })
      return
    }
    setSubmitting(send ? 'send' : 'draft')
    const res = await apiRequest<{ offer: FinancingOfferDTO }>('/api/financier/offers', {
      method: 'POST',
      body: JSON.stringify({
        requestId: r.id,
        amount: amt,
        tenorMonths: months,
        rateType: rateType || null,
        ratePercent: ratePercent.trim() ? Number(ratePercent) : null,
        feeFlat: feeFlat.trim() ? Number(feeFlat) : null,
        collateralRequired: collateral.trim() || null,
        notes: notes.trim() || null,
        validUntil: validUntil ? new Date(`${validUntil}T12:00:00`).toISOString() : null,
        installments: rows
          .filter((row) => row.dueDate && row.amount)
          .map((row, i) => ({ installmentNo: i + 1, dueDate: new Date(`${row.dueDate}T12:00:00`).toISOString(), amount: Number(row.amount) })),
        send,
      }),
    })
    setSubmitting(null)
    if (!res.ok) return toastApiError(res.error)
    toast({
      title: send ? 'Offer sent' : 'Offer saved as draft',
      description: send
        ? `${r.number} is now OFFERED — the applicant can accept it.`
        : 'Finish and send it whenever you are ready (drafts are invisible to the applicant).',
    })
    onSent()
  }

  return (
    <Card>
      <CardContent className="space-y-3.5 p-4 sm:p-5">
        <div className="flex items-center gap-1.5">
          <HandCoins size={15} className="text-primary" />
          <h3 className="text-sm font-bold">Compose an offer</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="off-amount" className="text-xs">
              Amount ({r.currency})
            </Label>
            <Input id="off-amount" type="number" min="0" className="h-9 rounded-lg" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="off-tenor" className="text-xs">
              Tenor (months)
            </Label>
            <Input id="off-tenor" type="number" min="1" max="120" className="h-9 rounded-lg" value={tenor} onChange={(e) => setTenor(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Rate type</Label>
            <Select value={rateType} onValueChange={setRateType}>
              <SelectTrigger className="h-9 rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(RATE_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="off-rate" className="text-xs">
              Rate (%)
            </Label>
            <Input id="off-rate" type="number" min="0" step="0.01" className="h-9 rounded-lg" value={ratePercent} onChange={(e) => setRatePercent(e.target.value)} placeholder="e.g. 18" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="off-fee" className="text-xs">
              Flat fee
            </Label>
            <Input id="off-fee" type="number" min="0" className="h-9 rounded-lg" value={feeFlat} onChange={(e) => setFeeFlat(e.target.value)} placeholder="optional" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="off-valid" className="text-xs">
              Valid until
            </Label>
            <Input id="off-valid" type="date" className="h-9 rounded-lg" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </div>
          <div className="col-span-2 space-y-1">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="off-collateral" className="text-xs">
                Collateral required
              </Label>
              <span
                className={`text-[10px] tabular-nums ${
                  collateral.length > 24 ? 'font-semibold text-destructive' : 'text-muted-foreground'
                }`}
              >
                {collateral.length}/24
              </span>
            </div>
            <Input
              id="off-collateral"
              className="h-9 rounded-lg"
              maxLength={40}
              value={collateral}
              onChange={(e) => setCollateral(e.target.value)}
              aria-describedby={collateral.length > 24 ? 'off-collateral-hint' : undefined}
              placeholder="e.g. GOLD — assigned deposit"
            />
            {collateral.length > 24 && (
              <p id="off-collateral-hint" className="text-[11px] text-destructive">
                Too long for the offer record — move details to the notes field.
              </p>
            )}
          </div>
          <div className="col-span-2 space-y-1">
            <Label htmlFor="off-notes" className="text-xs">
              Notes for the applicant
            </Label>
            <Textarea id="off-notes" className="min-h-[54px] rounded-lg" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Conditions, covenants or context (optional)" />
          </div>
        </div>

        {/* Installments builder */}
        <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold">
              Installment schedule <span className="font-normal text-muted-foreground">({rows.length} rows)</span>
            </p>
            <div className="flex gap-1.5">
              <Button type="button" size="sm" variant="outline" className="h-7 rounded-lg text-[11px]" onClick={genSchedule}>
                <CalendarPlus size={11} className="mr-1" /> Generate
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 rounded-lg text-[11px]"
                onClick={() => setRows((rs) => [...rs, { dueDate: '', amount: '' }])}
              >
                <Plus size={11} className="mr-1" /> Add row
              </Button>
            </div>
          </div>
          {rows.length > 0 && (
            <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1 [scrollbar-width:thin]">
              {rows.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-6 shrink-0 text-center text-[11px] font-bold text-muted-foreground">{i + 1}</span>
                  <Input
                    type="date"
                    className="h-8 flex-1 rounded-lg text-xs"
                    value={row.dueDate}
                    onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, dueDate: e.target.value } : x)))}
                    aria-label={`Installment ${i + 1} due date`}
                  />
                  <Input
                    type="number"
                    min="0"
                    className="h-8 w-28 shrink-0 rounded-lg text-xs"
                    value={row.amount}
                    onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                    aria-label={`Installment ${i + 1} amount`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 rounded-lg text-muted-foreground hover:text-destructive"
                    aria-label={`Remove installment ${i + 1}`}
                    onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
              ))}
            </div>
          )}
          {rows.length === 0 && (
            <p className="text-[11px] text-muted-foreground">
              Optional — generate an equal monthly schedule from the amount + tenor, or add rows by hand. Due dates must ascend.
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="rounded-xl" onClick={() => void submit(false)} disabled={submitting !== null}>
            {submitting === 'draft' && <Loader2 size={14} className="mr-1.5 animate-spin" />} Save draft
          </Button>
          <Button className="rounded-xl" onClick={() => void submit(true)} disabled={submitting !== null}>
            {submitting === 'send' ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Send size={14} className="mr-1.5" />}
            Send offer
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Offers list (with withdraw) ──────────────────────────────────────────────

export function OffersPanel({ offers, onChanged }: { offers: FinancingOfferDTO[]; onChanged: () => void }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const sorted = useMemo(() => [...offers].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [offers])

  const withdraw = async (offer: FinancingOfferDTO) => {
    setBusyId(offer.id)
    const res = await apiRequest(`/api/financier/offers/${offer.id}/withdraw`, { method: 'POST' })
    setBusyId(null)
    if (!res.ok) return toastApiError(res.error)
    toast({ title: 'Offer withdrawn', description: 'The applicant can no longer accept it.' })
    onChanged()
  }

  if (sorted.length === 0) return null

  return (
    <Card>
      <CardContent className="space-y-2.5 p-4 sm:p-5">
        <h3 className="text-sm font-bold">Offers on this request ({sorted.length})</h3>
        <ul className="space-y-2">
          {sorted.map((o) => (
            <li key={o.id} className="rounded-xl border bg-background">
              <button
                type="button"
                className="flex w-full flex-wrap items-center gap-2 p-3 text-left"
                onClick={() => setExpandedId(expandedId === o.id ? null : o.id)}
                aria-expanded={expandedId === o.id}
              >
                <span className="text-sm font-bold">{formatMoney(o.amount, o.currency)}</span>
                <StatusBadge status={o.status} map={OFFER_STATUS_MAP} />
                <span className="text-[11px] text-muted-foreground">
                  {o.tenorMonths} mo{o.rateType ? ` · ${RATE_TYPE_LABELS[o.rateType] ?? o.rateType}${o.ratePercent != null ? ` ${o.ratePercent}%` : ''}` : ''}
                </span>
                <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
                  {o.validUntil ? `valid to ${formatDate(o.validUntil)}` : 'no expiry'}
                  <ChevronDown size={13} className={cn('transition-transform', expandedId === o.id && 'rotate-180')} />
                </span>
              </button>
              {expandedId === o.id && (
                <div className="space-y-2 border-t bg-muted/30 p-3">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11.5px] sm:grid-cols-3">
                    <p>
                      <span className="text-muted-foreground">Fee flat: </span>
                      <span className="font-semibold">{o.feeFlat != null ? formatMoney(o.feeFlat, o.currency) : '—'}</span>
                    </p>
                    <p>
                      <span className="text-muted-foreground">Collateral: </span>
                      <span className="font-semibold">{o.collateralRequired ?? '—'}</span>
                    </p>
                    <p>
                      <span className="text-muted-foreground">Sent: </span>
                      <span className="font-semibold">{formatDateTime(o.sentAt)}</span>
                    </p>
                  </div>
                  {o.notes && <p className="rounded-lg border bg-background p-2 text-xs italic text-muted-foreground">“{o.notes}”</p>}
                  {o.installments.length > 0 && (
                    <div className="overflow-hidden rounded-lg border">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-muted/60 uppercase tracking-wide text-muted-foreground">
                          <tr>
                            <th className="px-2.5 py-1.5 font-semibold">#</th>
                            <th className="px-2.5 py-1.5 font-semibold">Due</th>
                            <th className="px-2.5 py-1.5 text-right font-semibold">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {o.installments.map((inst) => (
                            <tr key={inst.id} className="border-t bg-background">
                              <td className="px-2.5 py-1.5 font-bold">{inst.installmentNo}</td>
                              <td className="px-2.5 py-1.5">{formatDate(inst.dueDate)}</td>
                              <td className="px-2.5 py-1.5 text-right font-semibold">{formatMoney(inst.amount, o.currency)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {o.status === 'SENT' && (
                    <Button size="sm" variant="outline" className="rounded-lg text-xs text-destructive hover:text-destructive" disabled={busyId === o.id} onClick={() => void withdraw(o)}>
                      {busyId === o.id ? <Loader2 size={12} className="mr-1 animate-spin" /> : <Ban size={12} className="mr-1" />}
                      Withdraw offer
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
