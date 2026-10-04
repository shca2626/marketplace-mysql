'use client'

// ─────────────────────────────────────────────────────────────────────────────
// REQUESTS INBOX — FORWARDED+ financing requests only (FIN-5 §4).
// The backend query is R-4-structural: pre-gate requests can never appear
// here. Rows open a dossier dialog: applicant snapshot, checklist verdicts,
// your offers, and the actions — open review / send offer / decline.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import {
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Eye,
  FileSearch,
  HandCoins,
  Inbox,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  SearchX,
  Send,
  ShieldAlert,
  Trash2,
  Wallet,
  XCircle,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { FilterChips, apiRequest, toastApiError } from '../admin/shared'
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
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { initials, formatDate, timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  FinancingStatusBadge,
  OFFER_STATUS_MAP,
  SUBMISSION_STATUS_MAP,
  collateralLabel,
  conditionTypeLabel,
  formatMoney,
  rateTypeLabel,
  type FinancierRequestDetailDTO,
  type FinancierRequestListItemDTO,
  type OfferDTO,
  type SubmissionDTO,
} from './financing-status-badge'

const COLLATERAL_OPTIONS = [
  'PERSONAL_GUARANTEE',
  'BANK_GUARANTEE',
  'GOLD',
  'COMMERCIAL',
  'MORTGAGE',
  'CONVERTIBLE_SECURITIES',
  'SELF_GUARANTEE',
  'OTHER',
] as const

// ── Helpers ──────────────────────────────────────────────────────────────────

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

/** Human summary of what the applicant submitted for a checklist row. */
function submissionValue(s: SubmissionDTO): string {
  if (s.accountDocumentId) return 'Document attached'
  if (s.valueText) {
    if (s.valueText === 'CONFIRMED') return 'Confirmed'
    return s.valueText
  }
  if (s.valueNumber != null) return String(s.valueNumber)
  if (s.valueDate) return formatDate(s.valueDate)
  if (s.template.conditionType === 'DECLARATION') return s.status === 'PENDING' ? 'Not answered' : 'Answered'
  return s.status === 'PENDING' ? 'Not answered' : '—'
}

function addMonths(base: Date, months: number): string {
  const d = new Date(base)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

// ── Send-offer dialog (with the installments grid) ──────────────────────────

interface InstallmentDraft {
  dueDate: string
  amount: string
}

/** Equal-amount monthly schedule (remainder rides on the last row). */
function buildSchedule(tenor: number, amount: number): InstallmentDraft[] {
  const rows: InstallmentDraft[] = []
  const n = Math.max(1, Math.min(600, tenor))
  const base = Math.floor(amount / n)
  let remainder = amount - base * n
  for (let i = 1; i <= n; i++) {
    let rowAmount = base
    if (i === n && remainder > 0) {
      rowAmount += remainder
      remainder = 0
    }
    rows.push({ dueDate: addMonths(new Date(), i), amount: String(rowAmount) })
  }
  return rows
}

function SendOfferDialog({
  detail,
  onClose,
  onSent,
}: {
  detail: FinancierRequestDetailDTO
  onClose: () => void
  onSent: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    amount: String(detail.amountRequested),
    rateType: 'MURABAHA_ANNUAL',
    ratePercent: '',
    feeFlat: '',
    tenorMonths: String(
      (detail.underwriting.tenorRequestedMonths as number) ?? detail.offers[0]?.tenorMonths ?? 12
    ),
    collateralRequired: 'PERSONAL_GUARANTEE',
    validUntil: addMonths(new Date(), 1),
    notes: '',
  })
  // Equal-amount monthly schedule from the requested amount + tenor (the
  // remainder rides on the last row). Rebuilt on amount/tenor edits — manual
  // row edits are preserved until the next change or a Regenerate click.
  const [installments, setInstallments] = useState<InstallmentDraft[]>(() =>
    buildSchedule(
      Number(detail.underwriting.tenorRequestedMonths ?? detail.offers[0]?.tenorMonths ?? 12),
      detail.amountRequested
    )
  )

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K], rebuildSchedule = false) => {
    setForm((f) => {
      const next = { ...f, [key]: value }
      if (rebuildSchedule) {
        const t = Number(next.tenorMonths) || 0
        const a = Number(next.amount) || 0
        if (t > 0 && a > 0) setInstallments(buildSchedule(t, a))
      }
      return next
    })
  }

  const tenorNum = Number(form.tenorMonths) || 0
  const amountNum = Number(form.amount) || 0

  const total = installments.reduce((sum, i) => sum + (Number(i.amount) || 0), 0)

  const submit = async () => {
    if (!amountNum || amountNum <= 0) {
      toast({ title: 'Offer amount is required', variant: 'destructive' })
      return
    }
    if (!tenorNum || tenorNum < 1) {
      toast({ title: 'Tenor must be at least 1 month', variant: 'destructive' })
      return
    }
    if (installments.length === 0 || installments.some((i) => !(Number(i.amount) > 0)) || installments.some((i) => !i.dueDate)) {
      toast({ title: 'Complete the installment schedule', description: 'Every row needs a due date and a positive amount.', variant: 'destructive' })
      return
    }
    if (total < amountNum) {
      toast({
        title: 'Schedule totals less than the offer',
        description: `Add ${formatMoney(amountNum - total, detail.currency)} or raise the installment amounts.`,
        variant: 'destructive',
      })
      return
    }
    setSaving(true)
    const payload = {
      amount: amountNum,
      currency: detail.currency,
      rateType: form.rateType,
      ratePercent: form.ratePercent.trim() === '' ? null : Number(form.ratePercent),
      feeFlat: form.feeFlat.trim() === '' ? null : Number(form.feeFlat),
      tenorMonths: tenorNum,
      collateralRequired: form.collateralRequired,
      notes: form.notes.trim() || null,
      validUntil: form.validUntil || null,
      installments: installments.map((i, idx) => ({
        installmentNo: idx + 1,
        dueDate: i.dueDate,
        amount: Number(i.amount),
      })),
    }
    const res = await apiRequest<{ offer: OfferDTO }>(`/api/financier/requests/${detail.id}/offers`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (!res.ok) return toastApiError(res.error, 'Offer not sent')
    toast({
      title: 'Offer sent',
      description: `${formatMoney(amountNum, detail.currency)} over ${tenorNum} months — the applicant has been notified.`,
    })
    onSent()
    onClose()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send size={17} className="text-primary" /> Send an offer — {detail.number}
          </DialogTitle>
          <DialogDescription>
            The offer lands as SENT immediately and the applicant is notified. Up to 5 live offers
            per request — send revisions freely.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="off-amount">Amount ({detail.currency})</Label>
            <Input
              id="off-amount"
              type="number"
              value={form.amount}
              onChange={(e) => set('amount', e.target.value, true)}
              className="rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="off-tenor">Tenor (months)</Label>
            <Input
              id="off-tenor"
              type="number"
              min={1}
              value={form.tenorMonths}
              onChange={(e) => set('tenorMonths', e.target.value, true)}
              className="rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Rate type</Label>
            <Select value={form.rateType} onValueChange={(v) => set('rateType', v)}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MURABAHA_ANNUAL">Murabaha (annual)</SelectItem>
                <SelectItem value="FIXED_ANNUAL">Fixed (annual)</SelectItem>
                <SelectItem value="FLAT_FEE">Flat fee</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="off-rate">Rate (%)</Label>
            <Input
              id="off-rate"
              type="number"
              value={form.ratePercent}
              onChange={(e) => set('ratePercent', e.target.value)}
              placeholder="e.g. 24"
              className="rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="off-fee">Flat fee (optional)</Label>
            <Input
              id="off-fee"
              type="number"
              value={form.feeFlat}
              onChange={(e) => set('feeFlat', e.target.value)}
              className="rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Collateral required</Label>
            <Select value={form.collateralRequired} onValueChange={(v) => set('collateralRequired', v)}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COLLATERAL_OPTIONS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {collateralLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="off-valid">Valid until</Label>
            <Input
              id="off-valid"
              type="date"
              value={form.validUntil}
              onChange={(e) => set('validUntil', e.target.value)}
              className="rounded-xl"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="off-notes">Notes for the applicant</Label>
            <Textarea
              id="off-notes"
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={2}
              className="rounded-xl"
            />
          </div>
        </div>

        {/* Installments grid */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label className="flex items-center gap-1.5">
              <CalendarClock size={14} /> Installment schedule
            </Label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Total <span className="font-bold tabular-nums text-foreground">{formatMoney(total, detail.currency)}</span>
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 rounded-lg text-xs"
                onClick={() => setInstallments(buildSchedule(tenorNum, amountNum))}
              >
                <RefreshCw size={12} className="mr-1" /> Regenerate
              </Button>
            </div>
          </div>
          <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-xl border bg-muted/30 p-2">
            {installments.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-7 shrink-0 text-center text-xs font-semibold text-muted-foreground tabular-nums">
                  {i + 1}
                </span>
                <Input
                  type="date"
                  value={row.dueDate}
                  onChange={(e) =>
                    setInstallments((rows) => rows.map((r, j) => (j === i ? { ...r, dueDate: e.target.value } : r)))
                  }
                  className="h-9 rounded-lg"
                  aria-label={`Installment ${i + 1} due date`}
                />
                <Input
                  type="number"
                  value={row.amount}
                  onChange={(e) =>
                    setInstallments((rows) => rows.map((r, j) => (j === i ? { ...r, amount: e.target.value } : r)))
                  }
                  className="h-9 rounded-lg tabular-nums"
                  aria-label={`Installment ${i + 1} amount`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove installment ${i + 1}`}
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => setInstallments((rows) => rows.filter((_, j) => j !== i))}
                >
                  <Trash2 size={13} />
                </Button>
              </div>
            ))}
            {installments.length === 0 && (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                No rows — regenerate from the tenor or add one manually.
              </p>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-lg"
            onClick={() => setInstallments((rows) => [...rows, { dueDate: addMonths(new Date(), rows.length + 1), amount: '' }])}
          >
            <Plus size={14} className="mr-1" /> Add row
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Changing amount or tenor regenerates an equal monthly schedule — edit freely, the
            total must cover the offered amount.
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" className="rounded-xl" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" className="rounded-xl" onClick={submit} disabled={saving}>
            {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />} Send offer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Decline dialog ───────────────────────────────────────────────────────────

function DeclineDialog({
  requestId,
  number,
  onClose,
  onDone,
}: {
  requestId: string
  number: string
  onClose: () => void
  onDone: () => void
}) {
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async () => {
    if (note.trim().length < 3) {
      toast({ title: 'A decline note is required', description: 'The applicant sees this reason.', variant: 'destructive' })
      return
    }
    setSaving(true)
    const res = await apiRequest(`/api/financier/requests/${requestId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ note: note.trim() }),
    })
    setSaving(false)
    if (!res.ok) return toastApiError(res.error, 'Decline failed')
    toast({ title: `Request ${number} declined`, description: 'The applicant has been notified with your note.' })
    onDone()
    onClose()
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle size={17} className="text-destructive" /> Decline {number}
          </DialogTitle>
          <DialogDescription>
            Declining closes the request for your institution. The note is delivered to the
            applicant and kept in the audit trail.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="decline-note">Reason (required)</Label>
          <Textarea
            id="decline-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="e.g. Monthly installment capacity is below our threshold for this amount."
            className="rounded-xl"
          />
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" className="rounded-xl" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" className="rounded-xl" onClick={submit} disabled={saving}>
            {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />} Decline request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Request dossier dialog ───────────────────────────────────────────────────

function RequestDetailDialog({
  requestId,
  onClose,
  onChanged,
  onSendOffer,
}: {
  requestId: string | null
  onClose: () => void
  onChanged: () => void
  onSendOffer: (detail: FinancierRequestDetailDTO) => void
}) {
  const { data, loading, error, refetch } = useApi<{ request: FinancierRequestDetailDTO }>(
    requestId ? `/api/financier/requests/${requestId}` : null
  )
  const [busy, setBusy] = useState(false)
  const detail = data?.request ?? null

  const org = detail?.request.organization
  const requester = detail?.request.requester

  const openReview = async () => {
    if (!detail) return
    setBusy(true)
    const res = await apiRequest(`/api/financier/requests/${detail.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'open' }),
    })
    setBusy(false)
    if (!res.ok) return toastApiError(res.error, 'Could not open review')
    toast({ title: 'Request opened', description: 'It is now under your review.' })
    void refetch()
    onChanged()
  }

  const withdrawOffer = async (offer: OfferDTO) => {
    if (!detail) return
    setBusy(true)
    const res = await apiRequest(`/api/financier/offers/${offer.id}`, { method: 'PATCH' })
    setBusy(false)
    if (!res.ok) return toastApiError(res.error, 'Withdraw failed')
    toast({ title: 'Offer withdrawn', description: 'The slot is free for a revision.' })
    void refetch()
    onChanged()
  }

  return (
    <Dialog open={!!requestId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        {/* Screen-reader title for the loading/error states (the loaded state
            renders its own visible header below) — keeps Radix a11y happy. */}
        {(loading || error || !detail) && (
          <DialogHeader className="sr-only">
            <DialogTitle>Request dossier</DialogTitle>
            <DialogDescription>Loading the platform-verified request.</DialogDescription>
          </DialogHeader>
        )}
        {loading && (
          <div className="space-y-3">
            <Skeleton className="skeleton-shimmer h-8 w-56" />
            <Skeleton className="skeleton-shimmer h-24 w-full rounded-xl" />
            <Skeleton className="skeleton-shimmer h-40 w-full rounded-xl" />
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <ShieldAlert size={22} />
            </span>
            <p className="mt-3 text-sm font-semibold">Couldn&apos;t load the request</p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">{error}</p>
            <Button variant="outline" className="mt-4 rounded-xl" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        )}

        {!loading && detail && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2.5">
                <span className="tabular-nums">{detail.number}</span>
                <FinancingStatusBadge status={detail.status} />
                <span className="text-sm font-normal text-muted-foreground">
                  {org?.name ?? 'Individual applicant'}
                </span>
              </DialogTitle>
              <DialogDescription>
                Verified by the platform gate{detail.request.forwardedAt ? ` ${timeAgo(detail.request.forwardedAt)}` : ''} —
                every required checklist item below was checked before this reached you.
              </DialogDescription>
            </DialogHeader>

            {/* The ask */}
            <div className="grid grid-cols-2 gap-3 rounded-2xl border bg-muted/30 p-4 sm:grid-cols-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Amount</p>
                <p className="mt-0.5 text-sm font-bold tabular-nums">{formatMoney(detail.amountRequested, detail.currency)}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Tenor</p>
                <p className="mt-0.5 text-sm font-semibold">
                  {(detail.underwriting.tenorRequestedMonths as number) ?? '—'} months
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">City</p>
                <p className="mt-0.5 flex items-center gap-1 text-sm font-semibold">
                  <MapPin size={12} className="text-muted-foreground" /> {str(detail.activity.activityCity) ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Sector</p>
                <p className="mt-0.5 text-sm font-semibold">{str(detail.activity.activityCategory) ?? '—'}</p>
              </div>
              {detail.purpose && (
                <p className="col-span-2 text-sm text-muted-foreground sm:col-span-4">
                  <span className="font-semibold text-foreground">Purpose:</span> {detail.purpose}
                </p>
              )}
              {detail.request.applicantNotes && (
                <p className="col-span-2 text-sm text-muted-foreground sm:col-span-4">
                  <span className="font-semibold text-foreground">Applicant notes:</span> {detail.request.applicantNotes}
                </p>
              )}
            </div>

            {/* Applicant snapshot */}
            <div className="rounded-2xl border p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Wallet size={13} />
                </span>{' '}
                Applicant snapshot
              </p>
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Organization</p>
                  <p className="mt-0.5 font-semibold">{org?.name ?? '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Tax ID</p>
                  <p className="mt-0.5">{str(org?.taxId) ?? '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Registration</p>
                  <p className="mt-0.5">{str(org?.registrationNumber) ?? '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Industry</p>
                  <p className="mt-0.5">{str(org?.industry) ?? '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Activity</p>
                  <p className="mt-0.5">{str(detail.activity.activityName) ?? str(detail.activity.activityStatus) ?? '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Capital</p>
                  <p className="mt-0.5 tabular-nums">
                    {formatMoney(detail.underwriting.capitalAmount as number, detail.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Capacity / month</p>
                  <p className="mt-0.5 tabular-nums">
                    {formatMoney(detail.underwriting.monthlyInstallmentCapacity as number, detail.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Guarantee</p>
                  <p className="mt-0.5">
                    {collateralLabel(str(detail.guarantee.guaranteeType) ?? null) ?? '—'}
                  </p>
                </div>
                {requester && (
                  <p className="col-span-2 text-xs text-muted-foreground sm:col-span-4">
                    Contact: {requester.name} · {requester.email}
                    {requester.phone ? ` · ${requester.phone}` : ''}
                  </p>
                )}
              </div>
            </div>

            {/* Checklist verdicts */}
            <div className="rounded-2xl border">
              <p className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <FileSearch size={13} />
                </span>{' '}
                Checklist verdicts
              </p>
              {detail.submissions.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                  No checklist items were recorded on this request.
                </p>
              ) : (
                <ul className="divide-y">
                  {detail.submissions.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold">
                          <span className="truncate">{s.template.title}</span>
                          {!s.isRequired && (
                            <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold text-muted-foreground">
                              optional
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {conditionTypeLabel(s.template.conditionType)} · {submissionValue(s)}
                          {s.decisionNote ? ` · note: ${s.decisionNote}` : ''}
                        </p>
                      </div>
                      <FinancingStatusBadge status={s.status} map={SUBMISSION_STATUS_MAP} />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* My offers */}
            <div className="rounded-2xl border">
              <p className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <HandCoins size={13} />
                </span>{' '}
                Your offers (<span className="tabular-nums">{detail.offers.length}</span>)
              </p>
              {detail.offers.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                  No offers yet — send the first one below.
                </p>
              ) : (
                <ul className="divide-y">
                  {detail.offers.map((o) => (
                    <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 transition-colors duration-150 hover:bg-accent/40">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold tabular-nums">
                          {formatMoney(o.amount, o.currency)} · {o.tenorMonths} mo ·{' '}
                          {rateTypeLabel(o.rateType) ?? '—'}
                          {o.ratePercent != null ? ` ${o.ratePercent}%` : ''}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={o.notes ?? undefined}>
                          {o.installments.length} installments
                          {o.validUntil ? ` · valid until ${formatDate(o.validUntil)}` : ''}
                          {o.notes ? ` · ${o.notes}` : ''}
                        </p>
                      </div>
                      <FinancingStatusBadge status={o.status} map={OFFER_STATUS_MAP} />
                      {o.status === 'SENT' && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 rounded-lg text-xs text-muted-foreground hover:text-destructive"
                          disabled={busy}
                          onClick={() => void withdrawOffer(o)}
                        >
                          Withdraw
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Actions */}
            <DialogFooter className="sticky bottom-0 -mx-6 -mt-4 -mb-6 flex-wrap items-center justify-between gap-2 rounded-b-lg border-t bg-background/95 px-6 pt-4 pb-6 backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:justify-between">
              <p className="text-xs text-muted-foreground">
                Sent to you {detail.request.forwardedAt ? timeAgo(detail.request.forwardedAt) : 'recently'} · by{' '}
                {requester?.name ?? 'the applicant'}
              </p>
              <div className="flex flex-wrap gap-2">
                {detail.status === 'FORWARDED_TO_FINANCIER' && (
                  <Button type="button" variant="outline" className="rounded-xl" onClick={openReview} disabled={busy}>
                    <Eye size={14} className="mr-1.5" /> Open review
                  </Button>
                )}
                {['FORWARDED_TO_FINANCIER', 'UNDER_FINANCIER_REVIEW', 'OFFERED'].includes(detail.status) && (
                  <Button type="button" className="rounded-xl" onClick={() => onSendOffer(detail)}>
                    <Send size={14} className="mr-1.5" /> Send offer
                  </Button>
                )}
                {detail.status === 'UNDER_FINANCIER_REVIEW' && (
                  <DeclineButton requestId={detail.id} number={detail.number} onDone={() => void refetch()} onChanged={onChanged} />
                )}
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function DeclineButton({
  requestId,
  number,
  onDone,
  onChanged,
}: {
  requestId: string
  number: string
  onDone: () => void
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button type="button" variant="outline" className="rounded-xl text-destructive hover:text-destructive" onClick={() => setOpen(true)}>
        <XCircle size={14} className="mr-1.5" /> Decline
      </Button>
      {open && (
        <DeclineDialog
          requestId={requestId}
          number={number}
          onClose={() => setOpen(false)}
          onDone={() => {
            onDone()
            onChanged()
          }}
        />
      )}
    </>
  )
}

// ── The tab ──────────────────────────────────────────────────────────────────

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'FORWARDED_TO_FINANCIER', label: 'Forwarded' },
  { value: 'UNDER_FINANCIER_REVIEW', label: 'Under review' },
  { value: 'OFFERED', label: 'Offered' },
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'DECLINED', label: 'Declined' },
]

export function RequestsTab({ onChanged }: { onChanged: () => void }) {
  const { data, loading, error, refetch } = useApi<{ requests: FinancierRequestListItemDTO[] }>(
    '/api/financier/requests'
  )
  const requests = useMemo(() => data?.requests ?? [], [data])

  const [statusFilter, setStatusFilter] = useState('')
  const filtered = statusFilter ? requests.filter((r) => r.status === statusFilter) : requests
  const counts = requests.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1
    return acc
  }, {})

  const [openId, setOpenId] = useState<string | null>(null)
  const [openSeq, setOpenSeq] = useState(0)
  const [offerFor, setOfferFor] = useState<FinancierRequestDetailDTO | null>(null)

  const open = (id: string) => {
    setOpenId(id)
    setOpenSeq((s) => s + 1)
  }

  return (
    <div className="space-y-5">
      <FilterChips
        options={STATUS_FILTERS.map((f) => ({ ...f, count: f.value ? counts[f.value] : requests.length }))}
        value={statusFilter}
        onChange={setStatusFilter}
        ariaLabel="Filter requests by status"
      />

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="skeleton-shimmer h-20 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-12 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <ShieldAlert size={24} />
          </span>
          <p className="mt-4 text-sm font-semibold">Couldn&apos;t load your inbox</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">{error}</p>
          <Button variant="outline" className="mt-4 rounded-xl" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      )}

      {!loading && !error && requests.length === 0 && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-14 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Inbox size={26} />
          </span>
          <p className="mt-4 text-sm font-semibold">No verified requests yet</p>
          <p className="mt-1 max-w-md text-xs text-muted-foreground">
            Only applications that passed the platform verification gate reach this inbox — keep
            your services published and requirements clear.
          </p>
        </div>
      )}

      {!loading && !error && requests.length > 0 && filtered.length === 0 && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground/60">
            <SearchX size={22} />
          </span>
          <p className="mt-3 text-sm font-semibold">No requests match this filter</p>
        </div>
      )}

      {/* Desktop table */}
      {!loading && !error && filtered.length > 0 && (
        <div className="hidden overflow-hidden rounded-2xl border md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-medium">Request</th>
                <th scope="col" className="px-4 py-3 font-medium">Applicant</th>
                <th scope="col" className="px-4 py-3 font-medium">Service</th>
                <th scope="col" className="px-4 py-3 font-medium">Amount</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Offers</th>
                <th scope="col" className="px-4 py-3 font-medium">Forwarded</th>
                <th scope="col" className="w-10 px-4 py-3 font-medium">
                  <span className="sr-only">Open dossier</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => open(r.id)}
                  className="cursor-pointer border-b transition-colors last:border-0 hover:bg-accent/50"
                >
                  <td className="px-4 py-3.5 font-semibold tabular-nums">{r.number}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[10px] font-extrabold text-primary">
                        {initials(r.organizationName ?? r.requesterName)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{r.organizationName ?? 'Individual'}</p>
                        <p className="truncate text-xs text-muted-foreground">{r.requesterName}</p>
                      </div>
                    </div>
                  </td>
                  <td className="max-w-40 truncate px-4 py-3.5 text-muted-foreground">{r.serviceName}</td>
                  <td className="px-4 py-3.5 font-semibold tabular-nums">{formatMoney(r.amountRequested, r.currency)}</td>
                  <td className="px-4 py-3.5">
                    <FinancingStatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3.5 tabular-nums text-muted-foreground">
                    {r.offerCount > 0 ? `${r.offerCount} sent` : '—'}
                  </td>
                  <td className="px-4 py-3.5 text-muted-foreground" title={r.forwardedAt ?? undefined}>
                    {r.forwardedAt ? timeAgo(r.forwardedAt) : '—'}
                  </td>
                  <td className="w-10 px-4 py-3.5 text-muted-foreground/50">
                    <ChevronRight size={15} className="ml-auto" aria-hidden />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile stacked cards */}
      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-3 md:hidden">
          {filtered.map((r) => (
            <Card key={r.id} className="shadow-sm transition-all duration-200 hover:shadow-md">
              <CardContent className="p-4">
                <button
                  type="button"
                  onClick={() => open(r.id)}
                  className="w-full rounded-lg text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold tabular-nums">{r.number}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground" title={`${r.organizationName ?? 'Individual'} · ${r.serviceName}`}>
                        {r.organizationName ?? 'Individual'} · {r.serviceName}
                      </p>
                    </div>
                    <FinancingStatusBadge status={r.status} />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span className="font-bold tabular-nums text-foreground">
                      {formatMoney(r.amountRequested, r.currency)}
                    </span>
                    <span>
                      {r.offerCount > 0 ? `${r.offerCount} offer${r.offerCount === 1 ? '' : 's'}` : 'no offers'}
                      {r.forwardedAt ? ` · ${timeAgo(r.forwardedAt)}` : ''}
                    </span>
                    <ChevronRight size={14} className="shrink-0 text-muted-foreground/50" aria-hidden />
                  </div>
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <RequestDetailDialog
        key={`req-${openSeq}`}
        requestId={openId}
        onClose={() => setOpenId(null)}
        onChanged={() => {
          void refetch()
          onChanged()
        }}
        onSendOffer={(detail) => setOfferFor(detail)}
      />

      {offerFor && (
        <SendOfferDialog
          detail={offerFor}
          onClose={() => setOfferFor(null)}
          onSent={() => {
            void refetch()
            onChanged()
            // Re-open the dossier so the new offer is visible
            if (openId === offerFor.id) setOpenSeq((s) => s + 1)
          }}
        />
      )}
    </div>
  )
}
