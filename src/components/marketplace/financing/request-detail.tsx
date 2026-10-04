'use client'

// ─────────────────────────────────────────────────────────────────────────────
// REQUEST DETAIL — the applicant's tracking view of one financing or
// accreditation request: the gate-first status machine as a stepper, the
// RETURNED banner (aggregate reason + per-item notes), the live requirements
// checklist (answerable while DRAFT/RETURNED), the offers section with accept /
// decline + installments, the multiGroupId sibling comparison strip and an
// audit-ish stamp timeline.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRightLeft,
  Ban,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock,
  HandCoins,
  History,
  Layers,
  Loader2,
  RotateCcw,
  Send,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { apiRequest, validityLeft } from '@/components/marketplace/b2b/b2b-shared'
import { formatDate, timeAgo } from '@/lib/format'
import {
  FinancingStatusBadge,
  OFFER_STATUS_MAP,
  formatMoney,
  categoryLabel,
  collateralLabel,
} from '@/components/marketplace/financier/financing-status-badge'
import {
  RequirementChecklist,
  answerOfSubmission,
  rowsFromSubmissions,
} from './checklist'
import type {
  AccountDocumentDTO,
  ChecklistAnswer,
  MyAccreditationDetailDTO,
  MyRequestDetailDTO,
  OfferDTO,
  SiblingSummaryDTO,
} from './shared'

// ── Status machines (client mirror of the server transition maps) ──────────

const FINANCING_STEPS = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_PLATFORM_REVIEW',
  'FORWARDED_TO_FINANCIER',
  'UNDER_FINANCIER_REVIEW',
  'OFFERED',
  'ACCEPTED',
] as const

const ACCREDITATION_STEPS = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_PLATFORM_REVIEW',
  'FORWARDED_TO_FINANCIER',
  'UNDER_FINANCIER_REVIEW',
  'ACCREDITED',
] as const

const NEGATIVE_TERMINALS = new Set(['DECLINED', 'REJECTED', 'EXPIRED', 'CANCELLED', 'REVOKED'])

function StatusStepper({ status, kind }: { status: string; kind: 'financing' | 'accreditation' }) {
  const steps = kind === 'financing' ? FINANCING_STEPS : ACCREDITATION_STEPS
  const idx = (steps as readonly string[]).indexOf(status)
  const terminal = idx === -1
  const returned = status === 'RETURNED_FOR_COMPLETION'

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-2" aria-label="Request status">
        {steps.map((s, i) => {
          const done = !terminal && i < idx
          const current = !terminal && i === idx
          return (
            <li key={s} className="flex items-center gap-1">
              <span
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors',
                  done && 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
                  current && 'border-primary bg-primary text-primary-foreground',
                  !done && !current && 'border-dashed text-muted-foreground'
                )}
                aria-current={current ? 'step' : undefined}
              >
                {done && <CheckCircle2 size={11} />}
                {s === 'DRAFT' && 'Draft'}
                {s === 'SUBMITTED' && 'Submitted'}
                {s === 'UNDER_PLATFORM_REVIEW' && 'Platform gate'}
                {s === 'FORWARDED_TO_FINANCIER' && 'Forwarded'}
                {s === 'UNDER_FINANCIER_REVIEW' && 'Financier review'}
                {s === 'OFFERED' && 'Offer received'}
                {s === 'ACCEPTED' && 'Accepted'}
                {s === 'ACCREDITED' && 'Accredited'}
              </span>
              {i < steps.length - 1 && <ArrowRightLeft size={11} className="text-muted-foreground/50" aria-hidden />}
            </li>
          )
        })}
        {returned && (
          <li className="flex items-center gap-1.5 rounded-full border border-amber-400 bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
            <RotateCcw size={11} /> Returned for completion — fix &amp; resubmit
          </li>
        )}
        {terminal && (
          <li className="flex items-center gap-1.5 rounded-full border border-rose-300 bg-rose-100 px-2.5 py-1 text-[11px] font-bold text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
            {NEGATIVE_TERMINALS.has(status) ? <XCircle size={11} /> : <Clock size={11} />}
            {status.replace(/_/g, ' ').toLowerCase()}
          </li>
        )}
      </ol>
      <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">
        Every application passes the <span className="font-semibold text-foreground">platform verification gate</span> —
        only complete, verified files reach the financier.
      </p>
    </div>
  )
}

// ── Offer card ──────────────────────────────────────────────────────────────

function OfferCard({
  offer,
  currency,
  onAccept,
  onDecline,
  busy,
}: {
  offer: OfferDTO & { agreement?: { id: string; number: string; status: string; fundingStatus: string } | null }
  currency: string
  onAccept?: () => void
  onDecline?: () => void
  busy?: boolean
}) {
  const [confirmDecline, setConfirmDecline] = useState(false)
  const validity = validityLeft(offer.validUntil)
  const monthly =
    offer.installments.length > 0
      ? offer.installments.reduce((s, i) => s + i.amount, 0) / offer.installments.length
      : offer.tenorMonths > 0
        ? offer.amount / offer.tenorMonths
        : null
  const total = offer.installments.reduce((s, i) => s + i.amount, 0)

  return (
    <Card className={cn('shadow-sm', offer.status === 'SENT' && 'ring-1 ring-primary/30')}>
      <CardContent className="space-y-3.5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-lg font-extrabold tabular-nums">{formatMoney(offer.amount, currency)}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {offer.ratePercent != null ? `${offer.ratePercent}% ${offer.rateType?.toLowerCase().replace(/_/g, ' ') ?? ''}` : 'Rate on request'}
              {offer.feeFlat != null ? ` · ${formatMoney(offer.feeFlat, currency)} fee` : ''}
              {offer.collateralRequired ? ` · collateral: ${collateralLabel(offer.collateralRequired)}` : ''}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <FinancingStatusBadge status={offer.status} map={OFFER_STATUS_MAP} />
            {offer.validUntil && offer.status === 'SENT' && (
              <span
                className={cn(
                  'flex items-center gap-1 text-[11px] font-semibold',
                  validity.expired ? 'text-rose-600 dark:text-rose-400' : validity.urgent ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
                )}
              >
                <CalendarClock size={11} /> {validity.expired ? 'Expired' : validity.text}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-muted/50 px-2 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Tenor</p>
            <p className="text-sm font-bold tabular-nums">{offer.tenorMonths} mo</p>
          </div>
          <div className="rounded-xl bg-muted/50 px-2 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">≈ Monthly</p>
            <p className="text-sm font-bold tabular-nums">{monthly != null ? formatMoney(Math.round(monthly), currency) : '—'}</p>
          </div>
          <div className="rounded-xl bg-muted/50 px-2 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Total</p>
            <p className="text-sm font-bold tabular-nums">{total > 0 ? formatMoney(total, currency) : '—'}</p>
          </div>
        </div>

        {offer.notes && <p className="text-xs leading-relaxed text-muted-foreground">“{offer.notes}”</p>}

        {offer.installments.length > 0 && (
          <Collapsible>
            <CollapsibleTrigger className="flex w-full items-center justify-center gap-1.5 rounded-lg py-1 text-xs font-semibold text-primary hover:underline">
              Installment schedule ({offer.installments.length}) <ChevronDown size={13} />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-8 text-xs">#</TableHead>
                      <TableHead className="h-8 text-xs">Due</TableHead>
                      <TableHead className="h-8 text-right text-xs">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {offer.installments.map((inst) => (
                      <TableRow key={inst.id}>
                        <TableCell className="py-1.5 text-xs tabular-nums">{inst.installmentNo}</TableCell>
                        <TableCell className="py-1.5 text-xs">{formatDate(inst.dueDate)}</TableCell>
                        <TableCell className="py-1.5 text-right text-xs font-semibold tabular-nums">
                          {formatMoney(inst.amount, currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {offer.agreement && (
          <p className="flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50/60 px-3 py-2 text-xs font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
            <CheckCircle2 size={13} /> Agreement {offer.agreement.number} · {offer.agreement.fundingStatus.replace(/_/g, ' ').toLowerCase()}
          </p>
        )}

        {offer.status === 'SENT' && (onAccept || onDecline) && (
          <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
            {onDecline && (
              <AlertDialog open={confirmDecline} onOpenChange={setConfirmDecline}>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl text-destructive hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                    disabled={busy}
                  >
                    <XCircle size={14} className="mr-1" /> Decline
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Decline this offer?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {formatMoney(offer.amount, currency)} over {offer.tenorMonths} months will be declined. The
                      financier may send a revised offer — or use it as feedback.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep offer</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-white hover:bg-destructive/90"
                      onClick={onDecline}
                      disabled={busy}
                    >
                      Decline offer
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {onAccept && (
              <Button size="sm" className="rounded-xl" onClick={onAccept} disabled={busy}>
                {busy ? <Loader2 size={14} className="mr-1 animate-spin" /> : <CheckCircle2 size={14} className="mr-1" />}
                Accept offer
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Sibling comparison strip (multiGroupId — DP-25) ────────────────────────

function SiblingCompare({
  siblings,
  currentId,
  onAccept,
  busyId,
}: {
  siblings: SiblingSummaryDTO[]
  currentId: string
  onAccept: (offerId: string, sibling: MyRequestDetailDTO) => void
  busyId: string | null
}) {
  const [active, setActive] = useState<string>(currentId)
  const [details, setDetails] = useState<Record<string, MyRequestDetailDTO | 'loading' | 'error'>>({})

  useEffect(() => {
    let alive = true
    const load = async (sib: SiblingSummaryDTO) => {
      if (details[sib.id]) return
      setDetails((d) => ({ ...d, [sib.id]: 'loading' }))
      const res = await apiRequest<{ request: MyRequestDetailDTO }>(`/api/financing/requests/${sib.id}`)
      if (!alive) return
      setDetails((d) => ({ ...d, [sib.id]: res.ok && res.data ? res.data.request : 'error' }))
    }
    for (const sib of siblings) void load(sib)
    return () => {
      alive = false
    }
  }, [siblings])

  const tabs = [{ id: currentId, number: 'This request' }, ...siblings.map((s) => ({ id: s.id, number: s.number }))]
  const currentDetail = details[active]

  return (
    <Card className="shadow-sm">
      <CardHeader className="border-b py-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers size={16} className="text-primary" /> Multi-financier comparison
          <span className="rounded-full bg-muted px-1.5 text-[11px] font-bold tabular-nums text-muted-foreground">
            {siblings.length + 1} financiers
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        <div className="flex flex-wrap gap-1.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActive(t.id)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                active === t.id ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t.id === currentId ? 'This request' : t.number}
            </button>
          ))}
        </div>
        <div className="mt-3">
          {currentDetail == null || currentDetail === 'loading' ? (
            <Skeleton className="h-40 w-full rounded-xl" />
          ) : currentDetail === 'error' ? (
            <p className="text-xs text-muted-foreground">Could not load this sibling request.</p>
          ) : (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <FinancingStatusBadge status={currentDetail.status} />
                <span className="font-semibold">{currentDetail.financierName ?? 'Financier'}</span>
                <span className="text-xs text-muted-foreground">{currentDetail.serviceName}</span>
              </div>
              {currentDetail.offers.filter((o) => o.status === 'SENT').length === 0 ? (
                <p className="rounded-xl border border-dashed px-4 py-5 text-center text-xs text-muted-foreground">
                  {['FORWARDED_TO_FINANCIER', 'UNDER_FINANCIER_REVIEW'].includes(currentDetail.status)
                    ? 'No offer yet — the financier is reviewing your verified file.'
                    : currentDetail.status === 'OFFERED'
                      ? 'The sent offer expired or was withdrawn.'
                      : 'No offer on this sibling.'}
                </p>
              ) : (
                currentDetail.offers
                  .filter((o) => o.status === 'SENT')
                  .map((o) => (
                    <OfferCard
                      key={o.id}
                      offer={o}
                      currency={currentDetail.currency}
                      busy={busyId === o.id}
                      onAccept={() => onAccept(o.id, currentDetail)}
                    />
                  ))
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ── Timeline ────────────────────────────────────────────────────────────────

function StampTimeline({
  stamps,
}: {
  stamps: { label: string; at: string | null }[]
}) {
  const present = stamps.filter((s) => s.at)
  if (present.length === 0) return null
  return (
    <Card className="shadow-sm">
      <CardHeader className="border-b py-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <History size={16} className="text-primary" /> Progress record
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y">
          {present.map((s) => (
            <li key={s.label} className="flex items-center justify-between gap-4 px-5 py-2.5">
              <span className="text-sm">{s.label}</span>
              <span className="shrink-0 text-xs text-muted-foreground" title={s.at ?? ''}>
                {formatDate(s.at!)} · {timeAgo(s.at!)}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

// ── The detail view ─────────────────────────────────────────────────────────

export function RequestDetail({
  request,
  isAccreditation,
  documents,
  onBack,
  onChanged,
  onManageDocuments,
}: {
  request: MyRequestDetailDTO | MyAccreditationDetailDTO
  isAccreditation: boolean
  documents: AccountDocumentDTO[]
  onBack: () => void
  onChanged: () => void
  onManageDocuments: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [busyOfferId, setBusyOfferId] = useState<string | null>(null)
  // local answer mirror for optimistic checklist updates (keyed by submission
  // id; reset via remount — both parents render <RequestDetail key={id} …>)
  const [localAnswers, setLocalAnswers] = useState<Record<string, ChecklistAnswer>>({})
  // accreditation RETURNED: answers are held client-side until resubmit
  const [accAnswers, setAccAnswers] = useState<Record<string, ChecklistAnswer>>({})

  const fin = !isAccreditation ? (request as MyRequestDetailDTO) : null
  const acc = isAccreditation ? (request as MyAccreditationDetailDTO) : null
  const editable = ['DRAFT', 'RETURNED_FOR_COMPLETION'].includes(request.status)
  const rows = useMemo(() => rowsFromSubmissions(request.submissions ?? []), [request.submissions])
  const unansweredRequired = rows.filter(
    (r) =>
      r.isRequired &&
      r.conditionType !== 'PROFILE_FIELD' &&
      !['SUBMITTED', 'VERIFIED', 'WAIVED'].includes(r.status ?? 'PENDING')
  )

  const patchFinancingAnswer = async (submissionId: string, answer: ChecklistAnswer) => {
    if (!fin) return
    setLocalAnswers((a) => ({ ...a, [submissionId]: answer }))
    const res = await apiRequest(`/api/financing/requests/${fin.id}/submissions/${submissionId}`, {
      method: 'PATCH',
      body: JSON.stringify(answer),
    })
    if (!res.ok) {
      setLocalAnswers((a) => {
        const next = { ...a }
        delete next[submissionId]
        return next
      })
      toast({ title: 'Answer rejected', description: res.error, variant: 'destructive' })
      return
    }
    onChanged()
  }

  const lifecycle = async (action: 'submit' | 'cancel' | 'resubmit') => {
    if (busy) return
    if (action === 'submit' && unansweredRequired.length > 0) {
      toast({
        title: `${unansweredRequired.length} required item${unansweredRequired.length > 1 ? 's' : ''} still unanswered`,
        description: unansweredRequired.map((r) => r.title).join(' · '),
        variant: 'destructive',
      })
      return
    }
    setBusy(true)
    const url = isAccreditation
      ? `/api/accreditation/requests/${request.id}`
      : `/api/financing/requests/${request.id}`
    const payload =
      action === 'resubmit' && isAccreditation
        ? {
            action,
            answers: rows
              .filter((r) => r.conditionType !== 'PROFILE_FIELD' && accAnswers[r.key])
              .map((r) => ({ submissionId: r.key, answer: accAnswers[r.key] })),
          }
        : { action }
    const res = await apiRequest<{ status: string }>(url, { method: 'PATCH', body: JSON.stringify(payload) })
    setBusy(false)
    if (!res.ok) {
      toast({ title: 'Action failed', description: res.error, variant: 'destructive' })
      return
    }
    toast({
      title:
        action === 'submit'
          ? 'Submitted to the platform gate'
          : action === 'resubmit'
            ? 'Resubmitted — verified items keep their verdicts'
            : 'Request cancelled',
      description:
        action === 'submit'
          ? 'The platform verifies every requirement before forwarding your file to the financier.'
          : undefined,
    })
    onChanged()
  }

  const offerAction = async (offerId: string, verb: 'accept' | 'decline') => {
    if (!fin) return
    setBusyOfferId(offerId)
    const res = await apiRequest<{ status: string }>(`/api/financing/offers/${offerId}/${verb}`, { method: 'POST' })
    setBusyOfferId(null)
    if (!res.ok) {
      toast({ title: verb === 'accept' ? 'Could not accept' : 'Could not decline', description: res.error, variant: 'destructive' })
      return
    }
    toast({
      title: verb === 'accept' ? 'Offer accepted' : 'Offer declined',
      description:
        verb === 'accept'
          ? 'Sibling offers were declined automatically and the agreement is being recorded — the financier reports funding status from here on.'
          : undefined,
    })
    onChanged()
  }

  const currentAnswers: Record<string, ChecklistAnswer> = {}
  for (const s of request.submissions ?? []) currentAnswers[s.id] = localAnswers[s.id] ?? answerOfSubmission(s)

  const sentOffers = (fin?.offers ?? []).filter((o) => o.status === 'SENT')
  const otherOffers = (fin?.offers ?? []).filter((o) => o.status !== 'SENT')

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft size={13} /> Back to my requests
          </button>
          <h2 className="flex flex-wrap items-center gap-2.5 text-xl font-bold tracking-tight">
            <span className="font-mono">{request.number}</span>
            <FinancingStatusBadge status={request.status} />
            {request.multiGroupId && (
              <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                <Layers size={11} /> {request.siblings.length + 1} financiers · group
              </span>
            )}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {request.serviceName} · {request.financierName ?? 'Financier'} ·{' '}
            {fin ? `${formatMoney(fin.amountRequested, fin.currency)} over ${fin.tenorRequestedMonths ?? '—'} mo` : 'Accreditation program'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {request.status === 'DRAFT' && (
            <>
              <Button variant="outline" className="rounded-xl" onClick={() => void lifecycle('cancel')} disabled={busy}>
                Cancel draft
              </Button>
              <Button className="rounded-xl" onClick={() => void lifecycle('submit')} disabled={busy || unansweredRequired.length > 0}>
                {busy ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Send size={14} className="mr-1.5" />}
                Submit for verification
              </Button>
            </>
          )}
          {request.status === 'RETURNED_FOR_COMPLETION' && (
            <Button className="rounded-xl" onClick={() => void lifecycle('resubmit')} disabled={busy || unansweredRequired.length > 0}>
              {busy ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <RotateCcw size={14} className="mr-1.5" />}
              Resubmit ({unansweredRequired.length > 0 ? `${unansweredRequired.length} items left` : 'ready'})
            </Button>
          )}
        </div>
      </div>

      {/* Expiry / validity chips */}
      {acc?.status === 'ACCREDITED' && acc.validUntil && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50/70 px-4 py-2.5 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
          <ShieldCheck size={15} className="text-emerald-600 dark:text-emerald-400" />
          <span className="font-semibold">Accredited</span>
          <span className="text-muted-foreground">· valid until</span>
          <span className="font-semibold tabular-nums">{formatDate(acc.validUntil)}</span>
          <span className="text-xs text-muted-foreground">({validityLeft(acc.validUntil).text || 'expiring'})</span>
        </div>
      )}
      {acc?.status === 'REVOKED' && acc.revocationReason && (
        <div className="flex flex-wrap items-start gap-2 rounded-xl border border-rose-300 bg-rose-50/70 px-4 py-2.5 text-sm dark:border-rose-900 dark:bg-rose-950/30">
          <Ban size={15} className="mt-0.5 text-rose-600 dark:text-rose-400" />
          <span>
            <span className="font-semibold">Accreditation revoked</span>
            <span className="text-muted-foreground"> — {acc.revocationReason}</span>
          </span>
        </div>
      )}
      {request.expiresAt && ['SUBMITTED', 'UNDER_PLATFORM_REVIEW', 'FORWARDED_TO_FINANCIER', 'UNDER_FINANCIER_REVIEW', 'OFFERED'].includes(request.status) && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border px-4 py-2 text-xs text-muted-foreground">
          <Clock size={13} /> Application expires {formatDate(request.expiresAt)}
        </div>
      )}

      <StatusStepper status={request.status} kind={isAccreditation ? 'accreditation' : 'financing'} />

      {/* RETURNED banner */}
      {request.status === 'RETURNED_FOR_COMPLETION' && (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50/70 p-4 dark:border-amber-900 dark:bg-amber-950/20">
          <p className="flex items-center gap-2 text-sm font-bold text-amber-900 dark:text-amber-200">
            <AlertTriangle size={16} /> Returned by the platform gate — fix the items below and resubmit
          </p>
          {request.returnedReason && (
            <p className="mt-1.5 text-sm leading-relaxed text-amber-900/90 dark:text-amber-200/90">
              {request.returnedReason}
            </p>
          )}
          {rows.filter((r) => r.decisionNote).length > 0 && (
            <ul className="mt-2.5 space-y-1.5">
              {rows
                .filter((r) => r.decisionNote)
                .map((r) => (
                  <li
                    key={r.key}
                    className={cn(
                      'rounded-lg px-2.5 py-1.5 text-xs',
                      r.status === 'REJECTED'
                        ? 'bg-rose-100/80 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300'
                        : 'bg-background/70 text-muted-foreground'
                    )}
                  >
                    <span className="font-semibold">{r.title}:</span> {r.decisionNote}
                  </li>
                ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-amber-800/80 dark:text-amber-300/70">
            Verified items keep their verdicts — you only re-answer what was rejected or missing.
          </p>
        </div>
      )}

      {/* The checklist */}
      <Card className="shadow-sm">
        <CardHeader className="border-b py-4">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <ShieldCheck size={16} className="text-primary" /> Requirements checklist
            <span className="rounded-full bg-muted px-1.5 text-[11px] font-bold tabular-nums text-muted-foreground">
              {request.submissionCounts ? Object.values(request.submissionCounts).reduce((s, n) => s + n, 0) : rows.length} items
            </span>
            {editable && (
              <span className="rounded-full bg-amber-100 px-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                Answerable now
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <RequirementChecklist
            rows={rows}
            answers={
              isAccreditation
                ? { ...currentAnswers, ...accAnswers }
                : currentAnswers
            }
            onAnswer={
              isAccreditation
                ? (key, answer) => setAccAnswers((a) => ({ ...a, [key]: answer }))
                : (key, answer) => void patchFinancingAnswer(key, answer)
            }
            editable={editable}
            documents={documents}
            onManageDocuments={onManageDocuments}
          />
        </CardContent>
      </Card>

      {/* Offers (financing only) */}
      {fin && fin.offers.length > 0 && (
        <Card className="shadow-sm">
          <CardHeader className="border-b py-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <HandCoins size={16} className="text-primary" /> Offers ({fin.offers.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 p-4 lg:grid-cols-2">
            {sentOffers.map((o) => (
              <OfferCard
                key={o.id}
                offer={o}
                currency={fin.currency}
                busy={busyOfferId === o.id}
                onAccept={() => void offerAction(o.id, 'accept')}
                onDecline={() => void offerAction(o.id, 'decline')}
              />
            ))}
            {otherOffers.map((o) => (
              <OfferCard key={o.id} offer={o} currency={fin.currency} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Sibling comparison */}
      {fin && fin.multiGroupId && fin.siblings.length > 0 && (
        <SiblingCompare
          siblings={fin.siblings}
          currentId={fin.id}
          busyId={busyOfferId}
          onAccept={(offerId) => void offerAction(offerId, 'accept')}
        />
      )}

      {/* Application snapshot (financing) */}
      {fin && (
        <Card className="shadow-sm">
          <CardHeader className="border-b py-4">
            <CardTitle className="text-base">Application details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-x-8 gap-y-1 p-5 sm:grid-cols-2">
            {[
              ['Amount requested', formatMoney(fin.amountRequested, fin.currency)],
              ['Tenor', fin.tenorRequestedMonths ? `${fin.tenorRequestedMonths} months` : '—'],
              ['Purpose', fin.purpose ?? '—'],
              ['Activity', fin.activity?.activityName ?? fin.activity?.activityStatus ?? '—'],
              ['City', (fin.activity?.activityCity as string) ?? '—'],
              [
                'Capital / contribution',
                fin.underwriting?.capitalAmount != null || fin.underwriting?.ownContributionAmount != null
                  ? `${formatMoney((fin.underwriting.capitalAmount as number) ?? 0, fin.currency)} / ${formatMoney((fin.underwriting.ownContributionAmount as number) ?? 0, fin.currency)}`
                  : '—',
              ],
              [
                'Installment capacity',
                fin.underwriting?.monthlyInstallmentCapacity != null
                  ? `${formatMoney(fin.underwriting.monthlyInstallmentCapacity as number, fin.currency)} / mo`
                  : '—',
              ],
              ['Guarantee', collateralLabel(fin.guaranteeType) ?? '—'],
              ['Linked target', fin.targetType === 'WORKING_CAPITAL' ? 'General working capital' : `${fin.targetType} · ${fin.targetId ?? ''}`],
              ['Category', categoryLabel(fin.serviceCategory)],
            ].map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-4 border-b border-dashed py-1.5 text-sm last:border-0">
                <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
                <span className="text-right font-medium">{value}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Accreditation snapshot */}
      {acc && (
        <Card className="shadow-sm">
          <CardHeader className="border-b py-4">
            <CardTitle className="text-base">Accreditation details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-x-8 gap-y-1 p-5 sm:grid-cols-2">
            {[
              ['Organization', acc.organizationName ?? '—'],
              ['Scope', acc.scopeNotes ?? '—'],
              ['Valid until', acc.validUntil ? formatDate(acc.validUntil) : '—'],
              ['Accredited at', acc.accreditedAt ? formatDate(acc.accreditedAt) : '—'],
              ['Decision note', acc.decisionNote ?? '—'],
            ].map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-4 border-b border-dashed py-1.5 text-sm last:border-0">
                <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
                <span className="text-right font-medium">{value}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      <StampTimeline
        stamps={[
          { label: 'Created', at: request.createdAt },
          { label: 'Submitted', at: request.submittedAt },
          ...(fin
            ? [{ label: 'Returned by platform', at: fin.returnedAt }, { label: 'Platform reviewed', at: fin.gate?.platformReviewedAt ?? null }]
            : [{ label: 'Returned by platform', at: null }]),
          { label: 'Forwarded to financier', at: request.forwardedAt },
          { label: 'Decided', at: acc?.decidedAt ?? fin?.closedAt ?? null },
        ]}
      />
    </div>
  )
}
