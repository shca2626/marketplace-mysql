'use client'

// ─────────────────────────────────────────────────────────────────────────────
// GATE DOSSIER — the platform reviewer's console on ONE request (FIN-7 core).
//
// The full file the gate reviewer needs to make a verdict: applicant profile
// snapshot (user + org), the activity/ask/guarantee fields (or accreditation
// scope), the applicant's vault documents with media previews, and the
// REQUIREMENTS VERDICT CONSOLE — one-click Verify (optimistic), note-required
// Reject / Waive — plus the aggregate actions: Start review / Return (reason)
// / Forward (blocked with a verbatim 409 blockingItems list until every
// required item is VERIFIED or WAIVED — R-4).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import {
  ArrowRightLeft,
  CalendarClock,
  CheckCircle2,
  Eye,
  FileSearch,
  Loader2,
  MapPin,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Wallet,
  XCircle,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { apiRequest, toastApiError, LabeledValue } from '../shared'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { formatDate, timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  FinancingStatusBadge,
  SUBMISSION_STATUS_MAP,
  categoryLabel,
  collateralLabel,
  conditionTypeLabel,
  documentTypeLabel,
  formatMoney,
} from '@/components/marketplace/financier/financing-status-badge'
import type { MyRequestDetailDTO, MyAccreditationDetailDTO } from '@/components/marketplace/financing/shared'
import {
  gateBlockersOf,
  submissionAnswer,
  str,
  type AccountDocumentDTO,
  type AdminDossierDTO,
  type GateBlocker,
  type SubmissionDTO,
} from './shared'

// ── Small pieces ─────────────────────────────────────────────────────────────

/** Required-only amber chip: "3 blocking" — THE GATE signal on every row. */
export function BlockingChip({ count, className }: { count: number; className?: string }) {
  if (count <= 0) {
    return (
      <span className={cn('rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300', className)}>
        Gate ready
      </span>
    )
  }
  return (
    <span className={cn('rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300', className)}>
      {count} blocking
    </span>
  )
}

function CountChip({ label, value, tone }: { label: string; value: number; tone: 'emerald' | 'amber' | 'neutral' }) {
  const tones = {
    emerald: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    neutral: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
  }
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums', tones[tone])}>
      {label} {value}
    </span>
  )
}

/** Submission-count summary chips: Verified n / Submitted n / Pending n. */
export function SubmissionCountChips({ counts }: { counts: Record<string, number> }) {
  return (
    <span className="flex flex-wrap gap-1">
      <CountChip label="Verified" value={counts.VERIFIED ?? 0} tone="emerald" />
      <CountChip label="Submitted" value={counts.SUBMITTED ?? 0} tone="amber" />
      <CountChip label="Pending" value={counts.PENDING ?? 0} tone="neutral" />
    </span>
  )
}

/** The 409 body rendered VERBATIM — the gate's own explanation of the block. */
function BlockingAlert({ message, blockers }: { message: string; blockers: GateBlocker[] }) {
  return (
    <Alert variant="destructive" className="items-start">
      <ShieldAlert size={18} className="mt-0.5" />
      <AlertTitle className="text-sm font-bold">Forward blocked — {message}</AlertTitle>
      <AlertDescription>
        <div>
          <p className="mt-0.5 text-xs">
            Every <span className="font-semibold">required</span> checklist item must be VERIFIED (or, when optional,
            WAIVED) before the file can reach the financier:
          </p>
          <ul className="mt-2 space-y-1">
            {blockers.map((b) => (
              <li
                key={b.submissionId}
                className="flex flex-wrap items-center gap-2 rounded-lg bg-destructive/10 px-2.5 py-1.5 text-xs"
              >
                <span className="font-semibold">{b.title}</span>
                <FinancingStatusBadge status={b.status} map={SUBMISSION_STATUS_MAP} />
                <span className="text-[11px] text-muted-foreground">required · {b.status.toLowerCase()}</span>
              </li>
            ))}
          </ul>
        </div>
      </AlertDescription>
    </Alert>
  )
}

/** Note-required verdict dialog (reject / waive both demand a reason). */
function VerdictNoteDialog({
  submission,
  verdict,
  onClose,
  onSubmit,
}: {
  submission: SubmissionDTO
  verdict: 'reject' | 'waive'
  onClose: () => void
  onSubmit: (note: string) => Promise<void>
}) {
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const isReject = verdict === 'reject'
  const submit = async () => {
    if (note.trim().length < 3) {
      toast({
        title: isReject ? 'A rejection note is required' : 'A waiver note is required',
        description: 'The applicant sees this reason on the returned item.',
        variant: 'destructive',
      })
      return
    }
    setSaving(true)
    await onSubmit(note.trim())
    setSaving(false)
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isReject ? <XCircle size={17} className="text-destructive" /> : <ShieldQuestion size={17} className="text-primary" />}
            {isReject ? 'Reject' : 'Waive'} — {submission.template.title}
          </DialogTitle>
          <DialogDescription>
            {isReject
              ? 'The item is sent back to the applicant with your note — verified siblings keep their verdicts on resubmit.'
              : 'A waiver records that the platform deliberately does not require this optional evidence for this request.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="verdict-note">Note (required)</Label>
          <Textarea
            id="verdict-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={isReject ? 'e.g. Statement is missing page 3 — upload the complete document.' : 'e.g. Sufficient evidence already on file from the tax card.'}
            className="rounded-xl"
          />
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" className="rounded-xl" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={isReject ? 'destructive' : 'default'}
            className="rounded-xl"
            onClick={() => void submit()}
            disabled={saving}
          >
            {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />} {isReject ? 'Reject item' : 'Waive item'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Return dialog — aggregate reason sent to the applicant (status → RETURNED_FOR_COMPLETION). */
function ReturnDialog({
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
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async () => {
    if (reason.trim().length < 3) {
      toast({ title: 'A return reason is required', description: 'The applicant sees this aggregate reason.', variant: 'destructive' })
      return
    }
    setSaving(true)
    const res = await apiRequest(`/api/admin/financing/requests/${requestId}/return`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason.trim() }),
    })
    setSaving(false)
    if (!res.ok) return toastApiError(res.error, 'Return failed')
    toast({
      title: `Request ${number} returned`,
      description: 'The applicant was notified and can fix the flagged items — verified verdicts are preserved.',
    })
    onDone()
    onClose()
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw size={17} className="text-amber-600" /> Return {number} to the applicant
          </DialogTitle>
          <DialogDescription>
            The aggregate reason is shown to the applicant with every per-item decision note. Verified items keep
            their verdicts — only the flagged ones must be re-answered.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="return-reason">Reason (required)</Label>
          <Textarea
            id="return-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="e.g. The bank statement is unreadable and two declarations are missing."
            className="rounded-xl"
          />
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" className="rounded-xl" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" className="rounded-xl" onClick={() => void submit()} disabled={saving}>
            {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />} Return request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── The dossier ──────────────────────────────────────────────────────────────

export function GateDossier({
  requestId,
  onClose,
  onChanged,
}: {
  requestId: string
  onClose: () => void
  onChanged: () => void
}) {
  const { data, loading, error, refetch } = useApi<AdminDossierDTO>(`/api/admin/financing/requests/${requestId}`)
  const [busy, setBusy] = useState(false)
  // optimistic verdict mirror keyed by submission id — cleared on remount
  // (the parent renders <GateDossier key={requestId}>)
  const [overrides, setOverrides] = useState<Record<string, { status: string; decisionNote: string | null }>>({})
  const [noteFor, setNoteFor] = useState<{ submission: SubmissionDTO; verdict: 'reject' | 'waive' } | null>(null)
  const [returnOpen, setReturnOpen] = useState(false)
  const [forwardConfirm, setForwardConfirm] = useState(false)
  const [blocking, setBlocking] = useState<{ message: string; blockers: GateBlocker[] } | null>(null)

  const dossier = data ?? null
  const isFinancing = dossier?.requestType === 'FINANCING'
  const request = dossier?.request ?? null
  const fin = isFinancing ? (request as MyRequestDetailDTO | null) : null
  const acc = !isFinancing ? (request as MyAccreditationDetailDTO | null) : null
  const user = dossier?.applicant.user ?? null
  const org = dossier?.applicant.organization ?? null
  const documents = dossier?.documents ?? []
  const docById = new Map(documents.map((d) => [d.id, d]))

  // fresh submissions merged with optimistic verdict overrides
  const submissions = (request?.submissions ?? []).map((s) =>
    overrides[s.id] ? { ...s, ...overrides[s.id] } : s
  )
  const blockers = gateBlockersOf(submissions)
  const verdictable = ['SUBMITTED', 'UNDER_PLATFORM_REVIEW'].includes(request?.status ?? '')
  const doc = (id: string | null) => (id ? (docById.get(id) as AccountDocumentDTO | undefined) : undefined)

  // ── Actions ───────────────────────────────────────────────────────────────

  const startReview = async () => {
    if (!request) return
    setBusy(true)
    const res = await apiRequest(`/api/admin/financing/requests/${request.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'open' }),
    })
    setBusy(false)
    if (!res.ok) return toastApiError(res.error, 'Could not start the review')
    toast({ title: 'Review started', description: 'The request is now under platform review.' })
    void refetch()
    onChanged()
  }

  const verdict = async (submission: SubmissionDTO, v: 'verify' | 'reject' | 'waive', note: string | null) => {
    if (v === 'verify') {
      // one-click optimistic — reverted on failure
      setOverrides((o) => ({ ...o, [submission.id]: { status: 'VERIFIED', decisionNote: null } }))
    }
    const res = await apiRequest<{ status: string; autoForwarded: boolean }>(
      `/api/admin/financing/requests/${requestId}/submissions/${submission.id}`,
      { method: 'POST', body: JSON.stringify({ verdict: v, note }) }
    )
    if (!res.ok) {
      if (v === 'verify') {
        setOverrides((o) => {
          const next = { ...o }
          delete next[submission.id]
          return next
        })
      }
      toastApiError(res.error, 'Verdict not recorded')
      return
    }
    if (v !== 'verify') {
      setOverrides((o) => ({
        ...o,
        [submission.id]: { status: res.data?.status ?? v.toUpperCase(), decisionNote: note },
      }))
    }
    toast({
      title:
        v === 'verify'
          ? `Verified — ${submission.template.title}`
          : v === 'reject'
            ? `Rejected — ${submission.template.title}`
            : `Waived — ${submission.template.title}`,
      description:
        v === 'verify' && res.data?.autoForwarded
          ? 'All required items verified — the gate auto-forwarded the request to the financier.'
          : v === 'verify'
            ? 'The applicant was notified.'
            : 'The applicant was notified with your note.',
    })
    setBlocking(null)
    void refetch()
    onChanged()
  }

  const forward = async () => {
    setBusy(true)
    const res = await apiRequest<{ status: string }>(`/api/admin/financing/requests/${requestId}/forward`, {
      method: 'POST',
    })
    setBusy(false)
    setForwardConfirm(false)
    if (!res.ok) {
      // 409 → surface the verbatim blockingItems list
      const body = res.data as { blockingItems?: GateBlocker[] } | undefined
      setBlocking({ message: res.error ?? 'the file is incomplete', blockers: body?.blockingItems ?? [] })
      toast({
        title: 'Forward blocked by the gate',
        description: 'Complete the required items below and try again.',
        variant: 'destructive',
      })
      return
    }
    toast({
      title: `Request ${request?.number} forwarded`,
      description: 'Status → FORWARDED_TO_FINANCIER — the financier now sees the fully verified file.',
    })
    onChanged()
    onClose()
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
          {(loading || error || !dossier) && (
            <DialogHeader className="sr-only">
              <DialogTitle>Gate dossier</DialogTitle>
              <DialogDescription>Loading the application file for platform review.</DialogDescription>
            </DialogHeader>
          )}

          {loading && (
            <div className="space-y-3">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-44 w-full rounded-xl" />
              <Skeleton className="h-56 w-full rounded-xl" />
            </div>
          )}

          {!loading && (error || !dossier) && (
            <div className="flex flex-col items-center py-10 text-center">
              <ShieldAlert size={30} className="text-muted-foreground/40" />
              <p className="mt-3 text-sm font-semibold">Couldn&apos;t load the dossier</p>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">{error ?? 'Unknown error'}</p>
              <Button variant="outline" className="mt-4 rounded-xl" onClick={() => void refetch()}>
                Try again
              </Button>
            </div>
          )}

          {!loading && dossier && request && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2.5">
                  <span className="font-mono tabular-nums">{request.number}</span>
                  <FinancingStatusBadge status={request.status} />
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[11px] font-bold',
                      isFinancing
                        ? 'bg-primary/10 text-primary'
                        : 'bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-300'
                    )}
                  >
                    {isFinancing ? 'Financing' : 'Accreditation'}
                  </span>
                  <span className="text-sm font-normal text-muted-foreground">
                    {org?.name ?? 'Individual applicant'}
                  </span>
                </DialogTitle>
                <DialogDescription>
                  THE GATE dossier — submitted{' '}
                  {request.submittedAt ? `${formatDate(request.submittedAt)} (${timeAgo(request.submittedAt)})` : 'recently'} by{' '}
                  {user?.name ?? dossier.applicant.user?.email ?? 'the applicant'} · service {request.serviceName} ·{' '}
                  {request.financierName ?? 'Financier'}
                </DialogDescription>
              </DialogHeader>

              {blocking && <BlockingAlert message={blocking.message} blockers={blocking.blockers} />}

              {request.status === 'RETURNED_FOR_COMPLETION' && request.returnedReason && (
                <Alert className="border-amber-300 bg-amber-50/70 text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
                  <RotateCcw size={16} />
                  <AlertTitle className="text-sm font-semibold">Returned to the applicant</AlertTitle>
                  <AlertDescription className="text-xs text-amber-900/80 dark:text-amber-200/80">
                    {request.returnedReason}
                  </AlertDescription>
                </Alert>
              )}

              {/* The ask (financing) / scope (accreditation) */}
              <div className="grid grid-cols-2 gap-3 rounded-2xl border bg-muted/30 p-4 sm:grid-cols-4">
                {fin ? (
                  <>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Amount</p>
                      <p className="mt-0.5 text-sm font-bold tabular-nums">{formatMoney(fin.amountRequested, fin.currency)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Tenor</p>
                      <p className="mt-0.5 text-sm font-semibold">{fin.tenorRequestedMonths ?? '—'} months</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">City</p>
                      <p className="mt-0.5 flex items-center gap-1 text-sm font-semibold">
                        <MapPin size={12} className="text-muted-foreground" /> {str(fin.activityCity) ?? '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Sector</p>
                      <p className="mt-0.5 text-sm font-semibold">{categoryLabel(fin.serviceCategory)}</p>
                    </div>
                    {fin.purpose && (
                      <p className="col-span-2 text-sm text-muted-foreground sm:col-span-4">
                        <span className="font-semibold text-foreground">Purpose:</span> {fin.purpose}
                      </p>
                    )}
                    {fin.applicantNotes && (
                      <p className="col-span-2 text-sm text-muted-foreground sm:col-span-4">
                        <span className="font-semibold text-foreground">Applicant notes:</span> {fin.applicantNotes}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <div className="col-span-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Organization</p>
                      <p className="mt-0.5 text-sm font-semibold">{acc?.organizationName ?? '—'}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Accreditation valid until</p>
                      <p className="mt-0.5 text-sm font-semibold">{acc?.validUntil ? formatDate(acc.validUntil) : 'Set on grant'}</p>
                    </div>
                    {acc?.scopeNotes && (
                      <p className="col-span-2 text-sm text-muted-foreground sm:col-span-4">
                        <span className="font-semibold text-foreground">Scope:</span> {acc.scopeNotes}
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Applicant snapshot */}
              <div className="rounded-2xl border p-4">
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <Wallet size={14} className="text-primary" /> Applicant snapshot
                </p>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
                  <LabeledValue label="Name">{user?.name ?? '—'}</LabeledValue>
                  <LabeledValue label="Email">{user?.email ?? '—'}</LabeledValue>
                  <LabeledValue label="Phone">{str(user?.phone) ?? '—'}</LabeledValue>
                  <LabeledValue label="WhatsApp">{str(user?.whatsappNumber) ?? '—'}</LabeledValue>
                  <LabeledValue label="Date of birth">{user?.dateOfBirth ? formatDate(user.dateOfBirth) : '—'}</LabeledValue>
                  <LabeledValue label="Nationality">{str(user?.nationality) ?? '—'}</LabeledValue>
                  <LabeledValue label="Identity">
                    {user?.identityType && user?.identityNumber
                      ? `${user.identityType.replace(/_/g, ' ').toLowerCase()} · ${user.identityNumber}`
                      : (user?.identityNumber ?? '—')}
                  </LabeledValue>
                  <LabeledValue label="Marital status">{str(user?.maritalStatus)?.toLowerCase() ?? '—'}</LabeledValue>
                  <LabeledValue label="Organization">{org?.name ?? '—'}</LabeledValue>
                  <LabeledValue label="Tax ID">{str(org?.taxId) ?? '—'}</LabeledValue>
                  <LabeledValue label="Registration">{str(org?.registrationNumber) ?? '—'}</LabeledValue>
                  <LabeledValue label="Industry">{str(org?.industry) ?? '—'}</LabeledValue>
                  <LabeledValue label="Residence">
                    {[str(user?.residenceCity), str(user?.residenceDistrict), str(user?.residenceStreet)]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </LabeledValue>
                  <LabeledValue label="Residence type">
                    {str(user?.residenceType) ? str(user?.residenceType)!.toLowerCase().replace(/_/g, ' ') : '—'}
                  </LabeledValue>
                  <LabeledValue label="Website">{str(org?.website) ?? '—'}</LabeledValue>
                  <LabeledValue label="Org status">{org?.status.toLowerCase().replace(/_/g, ' ') ?? '—'}</LabeledValue>
                </div>
              </div>

              {/* Activity + underwriting + guarantee (financing only) */}
              {fin && (
                <div className="rounded-2xl border p-4">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <Eye size={14} className="text-primary" /> Activity, capacity &amp; guarantee
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
                    <LabeledValue label="Activity">{str(fin.activity?.activityName) ?? str(fin.activity?.activityStatus) ?? '—'}</LabeledValue>
                    <LabeledValue label="Started">{fin.activity?.activityStartDate ? formatDate(String(fin.activity.activityStartDate)) : '—'}</LabeledValue>
                    <LabeledValue label="Location">
                      {[
                        str(fin.activity?.activityCity),
                        str(fin.activity?.activityDistrict),
                        str(fin.activity?.activityLocationType),
                      ]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </LabeledValue>
                    <LabeledValue label="Category">{str(fin.activity?.activityCategory)?.toLowerCase().replace(/_/g, ' ') ?? '—'}</LabeledValue>
                    <LabeledValue label="Capital">{formatMoney(fin.underwriting?.capitalAmount as number, fin.currency)}</LabeledValue>
                    <LabeledValue label="Own contribution">
                      {formatMoney(fin.underwriting?.ownContributionAmount as number, fin.currency)}
                    </LabeledValue>
                    <LabeledValue label="Capacity / month">
                      {fin.underwriting?.monthlyInstallmentCapacity != null
                        ? `${formatMoney(fin.underwriting.monthlyInstallmentCapacity as number, fin.currency)}`
                        : '—'}
                    </LabeledValue>
                    <LabeledValue label="Guarantee">{collateralLabel(fin.guaranteeType) ?? '—'}</LabeledValue>
                    <LabeledValue label="Previous financing">
                      {fin.underwriting?.previousFinancing == null ? '—' : fin.underwriting.previousFinancing ? 'Yes' : 'No'}
                    </LabeledValue>
                    <div className="col-span-2 sm:col-span-3">
                      <LabeledValue label="Other income">{str(fin.underwriting?.otherIncomeSources) ?? '—'}</LabeledValue>
                    </div>
                    {str(fin.activity?.activityDescription) && (
                      <p className="col-span-2 text-sm text-muted-foreground sm:col-span-4">
                        <span className="font-semibold text-foreground">Activity description:</span>{' '}
                        {String(fin.activity.activityDescription)}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* THE VERDICT CONSOLE */}
              <div className="rounded-2xl border">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <FileSearch size={14} className="text-primary" /> Requirements verdict console
                  </p>
                  <div className="flex items-center gap-1.5">
                    <SubmissionCountChips counts={request.submissionCounts ?? {}} />
                    <BlockingChip count={blockers.length} />
                  </div>
                </div>
                {submissions.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                    No checklist items were recorded on this request.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {submissions.map((s) => {
                      const attachedDoc = doc(s.accountDocumentId)
                      const actionable = verdictable && ['SUBMITTED', 'REJECTED'].includes(s.status)
                      return (
                        <li key={s.id} className="px-4 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                            <div className="min-w-0 flex-1">
                              <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold">
                                <span className="truncate">{s.template.title}</span>
                                {!s.isRequired && (
                                  <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold text-muted-foreground">
                                    optional
                                  </span>
                                )}
                                {s.autoPassAccredited && (
                                  <span className="rounded-full bg-lime-100 px-1.5 py-px text-[10px] font-semibold text-lime-800 dark:bg-lime-950 dark:text-lime-300">
                                    auto-pass
                                  </span>
                                )}
                              </p>
                              <p className="mt-0.5 text-[11px] text-muted-foreground">
                                {conditionTypeLabel(s.template.conditionType)}
                                {s.template.documentType ? ` · ${documentTypeLabel(s.template.documentType)}` : ''} ·{' '}
                                {submissionAnswer(s)}
                                {s.verifiedAt ? ` · verified ${timeAgo(s.verifiedAt)}` : ''}
                              </p>
                              {s.decisionNote && (
                                <p
                                  className={cn(
                                    'mt-1 rounded-lg px-2 py-1 text-[11px]',
                                    s.status === 'REJECTED'
                                      ? 'bg-rose-100/80 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300'
                                      : 'bg-muted text-muted-foreground'
                                  )}
                                >
                                  <span className="font-semibold">Note:</span> {s.decisionNote}
                                </p>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5">
                              {attachedDoc && (
                                <span className="flex items-center gap-1.5" title={`${documentTypeLabel(attachedDoc.documentType)} — ${attachedDoc.media.originalName}`}>
                                  <img
                                    src={attachedDoc.media.urls.thumb}
                                    alt={attachedDoc.title ?? attachedDoc.documentType}
                                    className="h-8 w-8 rounded-md border object-cover"
                                    loading="lazy"
                                  />
                                  <FinancingStatusBadge status={attachedDoc.status} map={SUBMISSION_STATUS_MAP} />
                                </span>
                              )}
                              <FinancingStatusBadge status={s.status} map={SUBMISSION_STATUS_MAP} />
                              {actionable ? (
                                <>
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="h-7 rounded-lg bg-emerald-600 px-2.5 text-xs font-semibold text-white hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600"
                                    disabled={busy}
                                    onClick={() => void verdict(s, 'verify', null)}
                                  >
                                    <CheckCircle2 size={12} className="mr-1" /> Verify
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-7 rounded-lg px-2.5 text-xs font-semibold text-destructive hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                                    disabled={busy}
                                    onClick={() => setNoteFor({ submission: s, verdict: 'reject' })}
                                  >
                                    <XCircle size={12} className="mr-1" /> Reject
                                  </Button>
                                  {!s.isRequired && (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="h-7 rounded-lg px-2.5 text-xs"
                                      disabled={busy}
                                      onClick={() => setNoteFor({ submission: s, verdict: 'waive' })}
                                    >
                                      <ShieldQuestion size={12} className="mr-1" /> Waive
                                    </Button>
                                  )}
                                </>
                              ) : s.status === 'PENDING' && verdictable ? (
                                <span className="text-[11px] italic text-muted-foreground">awaiting applicant answer</span>
                              ) : null}
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>

              {/* Vault documents */}
              <div className="rounded-2xl border">
                <p className="flex items-center gap-1.5 border-b px-4 py-3 text-sm font-semibold">
                  <CalendarClock size={14} className="text-primary" /> Applicant vault ({documents.length})
                </p>
                {documents.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                    No active documents in this applicant&apos;s vault.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
                    {documents.map((d) => (
                      <a
                        key={d.id}
                        href={d.media.urls.full}
                        target="_blank"
                        rel="noreferrer"
                        className="group overflow-hidden rounded-xl border transition-shadow hover:shadow-md"
                        title={`${d.title ?? d.documentType} — open full document`}
                      >
                        <img
                          src={d.media.urls.medium}
                          alt={d.title ?? d.documentType}
                          className="h-24 w-full bg-muted object-cover object-top"
                          loading="lazy"
                        />
                        <div className="space-y-1 p-2">
                          <p className="truncate text-[11px] font-semibold">{d.title ?? documentTypeLabel(d.documentType)}</p>
                          <p className="flex items-center justify-between gap-1 text-[10px] text-muted-foreground">
                            <span className="truncate">{documentTypeLabel(d.documentType)}</span>
                            <FinancingStatusBadge status={d.status} map={SUBMISSION_STATUS_MAP} />
                          </p>
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions bar */}
              <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  {request.status === 'SUBMITTED' && 'Open the review to record verdicts.'}
                  {request.status === 'UNDER_PLATFORM_REVIEW' &&
                    (blockers.length > 0
                      ? `${blockers.length} required item${blockers.length > 1 ? 's' : ''} still block${blockers.length > 1 ? '' : 's'} the gate.`
                      : 'All required items verified — the gate is ready.')}
                  {request.status === 'RETURNED_FOR_COMPLETION' && 'Waiting for the applicant to fix and resubmit.'}
                </p>
                <div className="flex flex-wrap justify-end gap-2">
                  {request.status === 'SUBMITTED' && (
                    <Button type="button" variant="outline" className="rounded-xl" onClick={() => void startReview()} disabled={busy}>
                      {busy ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Eye size={14} className="mr-1.5" />}
                      Start review
                    </Button>
                  )}
                  {request.status === 'UNDER_PLATFORM_REVIEW' && (
                    <>
                      <Button type="button" variant="outline" className="rounded-xl text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950" onClick={() => setReturnOpen(true)} disabled={busy}>
                        <RotateCcw size={14} className="mr-1.5" /> Return to applicant
                      </Button>
                      <Button type="button" className="rounded-xl" onClick={() => setForwardConfirm(true)} disabled={busy}>
                        {busy ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <ArrowRightLeft size={14} className="mr-1.5" />}
                        Forward to financier
                      </Button>
                    </>
                  )}
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* note-required verdict dialog */}
      {noteFor && (
        <VerdictNoteDialog
          submission={noteFor.submission}
          verdict={noteFor.verdict}
          onClose={() => setNoteFor(null)}
          onSubmit={async (note) => {
            await verdict(noteFor.submission, noteFor.verdict, note)
            setNoteFor(null)
          }}
        />
      )}

      {/* return reason dialog */}
      {returnOpen && (
        <ReturnDialog
          requestId={requestId}
          number={request?.number ?? ''}
          onClose={() => setReturnOpen(false)}
          onDone={() => {
            onChanged()
            onClose()
          }}
        />
      )}

      {/* forward confirmation */}
      <AlertDialog open={forwardConfirm} onOpenChange={setForwardConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldCheck size={17} className="text-emerald-600 dark:text-emerald-400" /> Forward {request?.number} to the financier?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Forwarding hands the verified file to <span className="font-semibold">{request?.financierName ?? 'the financier'}</span>{' '}
              ({request?.serviceName}). The gate only allows this when <span className="font-semibold">every required item is
              VERIFIED (or waived when optional)</span> — the financier can then open it and compose an offer. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep in review</AlertDialogCancel>
            <AlertDialogAction className="rounded-xl" onClick={() => void forward()} disabled={busy}>
              {busy && <Loader2 size={14} className="mr-1.5 animate-spin" />} Forward request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
