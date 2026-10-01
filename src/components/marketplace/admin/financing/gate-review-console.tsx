'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN · FINANCING — GATE REVIEW CONSOLE (W-GATE-REVIEW — the heart of flow 4).
// One request's full dossier: applicant + service + ask, THE CHECKLIST with
// per-item VERIFY / REJECT / WAIVE verdicts (notes required on reject/waive —
// the applicant sees them), the gate completeness meter, RETURN (aggregate
// reason) and FORWARD (422 renders the blocking items clearly).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  BadgeCheck,
  Ban,
  Building2,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  FileWarning,
  FolderLock,
  Landmark,
  ListChecks,
  Loader2,
  Send,
  ShieldAlert,
  Undo2,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import type {
  AccountDocumentDTO,
  AdminGateDossierResponseDTO,
  FinancingRequestDetailDTO,
  PublicServiceDetailDTO,
  RequirementSubmissionDTO,
} from '@/lib/types'
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
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { apiRequest, toastApiError } from '../shared'
import {
  ACC_STATUS_MAP,
  ConditionTypeBadge,
  DOC_STATUS_MAP,
  DOCUMENT_TYPE_LABELS,
  FIN_REQUEST_STATUS_MAP,
  GateMeter,
  SUBMISSION_STATUS_MAP,
  StatusBadge,
  formatDate,
  formatMoney,
  timeAgo,
} from '../../financing/financing-shared'

interface GateMissingItemDTO {
  submissionId: string
  requirementId: string
  title: string
  status: string
  isRequired: boolean
}

type VerdictAction = 'VERIFY' | 'REJECT' | 'WAIVE'

export function GateReviewConsole({ requestId, onBack }: { requestId: string; onBack: () => void }) {
  const { data, loading, error, refetch } = useApi<AdminGateDossierResponseDTO>(
    `/api/admin/financing/gate/${requestId}`
  )

  // Platform-wide vault docs — joined to checklist DOCUMENT answers by id.
  const { data: docsData } = useApi<{ documents: AccountDocumentDTO[] }>(
    '/api/admin/financing/documents'
  )
  const docsById = useMemo(() => {
    const m = new Map<string, AccountDocumentDTO>()
    for (const d of docsData?.documents ?? []) m.set(d.id, d)
    return m
  }, [docsData])

  const request = data?.request
  const isFin = data?.requestType === 'FINANCING'
  const fin = isFin ? (request as FinancingRequestDetailDTO) : null

  // Public service directory detail (envelope {service}) — amount range card.
  const { data: serviceData } = useApi<{ service: PublicServiceDetailDTO }>(
    request ? `/api/financing/services/${request.serviceId}` : null,
    { skip: !request }
  )
  const service = serviceData?.service

  // Verdict dialog state
  const [verdict, setVerdict] = useState<
    { submission: RequirementSubmissionDTO; action: VerdictAction } | null
  >(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  // Return dialog state
  const [returnOpen, setReturnOpen] = useState(false)
  const [returnReason, setReturnReason] = useState('')

  // Forward state (422 missing list)
  const [forwarding, setForwarding] = useState(false)
  const [missing, setMissing] = useState<GateMissingItemDTO[] | null>(null)

  // Start-review state (SUBMITTED → UNDER_PLATFORM_REVIEW before return)
  const [starting, setStarting] = useState(false)

  if (loading || !request) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" className="rounded-lg text-muted-foreground" onClick={onBack}>
          <ArrowLeft size={14} className="mr-1" /> Back to queue
        </Button>
        {error ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-12 text-center">
            <ShieldAlert size={34} className="text-muted-foreground/40" />
            <p className="mt-3 text-sm font-semibold">Couldn't load the dossier</p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">{error}</p>
            <Button variant="outline" className="mt-4 rounded-xl" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <>
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-64 w-full rounded-2xl" />
          </>
        )}
      </div>
    )
  }

  const statusMap = isFin ? FIN_REQUEST_STATUS_MAP : ACC_STATUS_MAP
  const status = request.status
  const preForward = ['SUBMITTED', 'UNDER_PLATFORM_REVIEW', 'RETURNED_FOR_COMPLETION'].includes(status)
  const canStartReview = status === 'SUBMITTED'
  const canReturn = status === 'UNDER_PLATFORM_REVIEW'
  const forwarded = !!request.forwardedAt
  const gate = request.gate
  const submissions = request.submissions

  // ── Actions ──────────────────────────────────────────────────────────────

  const refresh = () => {
    void refetch()
    setMissing(null)
  }

  const submitVerdict = async () => {
    if (!verdict) return
    if (verdict.action !== 'VERIFY' && note.trim().length < 3) {
      toast({
        title: verdict.action === 'REJECT' ? 'A rejection note is required' : 'A waiver note is required',
        description: 'The applicant sees this note on their checklist — explain the decision.',
        variant: 'destructive',
      })
      return
    }
    setBusy(true)
    const res = await apiRequest<{ submission: RequirementSubmissionDTO; autoForwarded: boolean }>(
      `/api/admin/financing/submissions/${verdict.submission.id}`,
      {
        method: 'POST',
        body: JSON.stringify({
          action: verdict.action,
          ...(verdict.action === 'VERIFY' ? { note: note.trim() || undefined } : { note: note.trim() }),
        }),
      }
    )
    setBusy(false)
    if (!res.ok) {
      toastApiError(res.error, 'Verdict failed')
      return
    }
    toast({
      title:
        verdict.action === 'VERIFY'
          ? 'Item verified'
          : verdict.action === 'REJECT'
            ? 'Item rejected'
            : 'Item waived',
      description: `“${verdict.submission.requirement.template.title}” · ${
        verdict.action === 'VERIFY' ? 'passed platform verification' : 'the applicant was notified'
      }.${res.data?.autoForwarded ? ' All items complete — the request auto-forwarded to the financier.' : ''}`,
    })
    setVerdict(null)
    setNote('')
    refresh()
  }

  const startReview = async () => {
    setStarting(true)
    const res = await apiRequest(`/api/admin/financing/requests/${requestId}/start-review`, {
      method: 'POST',
    })
    setStarting(false)
    if (!res.ok) {
      toastApiError(res.error, 'Could not start the review')
      return
    }
    toast({
      title: 'Platform review started',
      description: `${request.number} is now under platform review — verdicts, return and forward are live.`,
    })
    refresh()
  }

  const submitReturn = async () => {
    if (returnReason.trim().length < 3) {
      toast({
        title: 'A return reason is required',
        description: 'Explain what the applicant must fix before resubmitting.',
        variant: 'destructive',
      })
      return
    }
    setBusy(true)
    const res = await apiRequest(`/api/admin/financing/requests/${requestId}/return`, {
      method: 'POST',
      body: JSON.stringify({ reason: returnReason.trim() }),
    })
    setBusy(false)
    if (!res.ok) {
      toastApiError(res.error, 'Return failed')
      return
    }
    toast({
      title: 'Request returned',
      description: `${request.number} is back with the applicant — they were notified with your reason.`,
    })
    setReturnOpen(false)
    setReturnReason('')
    refresh()
  }

  const forward = async () => {
    setForwarding(true)
    setMissing(null)
    const res = await fetch(`/api/admin/financing/requests/${requestId}/forward`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    const json = (await res.json().catch(() => ({}))) as {
      error?: string
      missing?: GateMissingItemDTO[]
    }
    setForwarding(false)
    if (res.status === 422 && json.missing) {
      setMissing(json.missing)
      toast({
        title: 'The gate refused to forward',
        description: `${json.missing.length} required item${json.missing.length === 1 ? '' : 's'} still incomplete.`,
        variant: 'destructive',
      })
      return
    }
    if (!res.ok) {
      toastApiError(json.error, 'Forward failed')
      return
    }
    toast({
      title: 'Gate passed — forwarded',
      description: `${request.number} is now in ${request.financierOrgName}'s inbox and their staff was notified.`,
    })
    refresh()
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" className="rounded-lg text-muted-foreground" onClick={onBack}>
        <ArrowLeft size={14} className="mr-1" /> Back to queue
      </Button>

      {/* Header */}
      <Card className="overflow-hidden">
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span
                className={cn(
                  'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold',
                  isFin ? 'bg-primary/10 text-primary' : 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300'
                )}
              >
                {isFin ? 'FIN' : 'ACC'}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg font-bold tabular-nums">{request.number}</h1>
                  <StatusBadge status={status} map={statusMap} />
                  {forwarded && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      Gate passed
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {isFin ? 'Financing request' : 'Accreditation request'} · submitted{' '}
                  {timeAgo(request.submittedAt ?? request.createdAt)}
                  {request.consentAt ? ' · consent signed' : ''}
                </p>
              </div>
            </div>
            {request.expiresAt && <ExpiryBadge expiresAt={request.expiresAt} />}
          </div>

          <GateMeter verified={gate.verified} waived={gate.waived} totalRequired={gate.totalRequired} />

          {(request.returnedReason || forwarded) && (
            <div className="grid gap-2 sm:grid-cols-2">
              {request.returnedReason && (
                <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                  <Undo2 size={12} className="mr-1 inline" />
                  Returned {timeAgo(request.returnedAt)}: {request.returnedReason}
                </p>
              )}
              {forwarded && (
                <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                  <Send size={12} className="mr-1 inline" />
                  Forwarded {timeAgo(request.forwardedAt)} to {request.financierOrgName}
                  {request.platformReviewedAt ? ` · platform review ${formatDate(request.platformReviewedAt)}` : ''}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Checklist (2/3) */}
        <Card className="lg:col-span-2">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <ListChecks size={16} className="text-primary" />
                Requirements checklist
              </h2>
              <span className="text-xs text-muted-foreground">
                {submissions.length} item{submissions.length === 1 ? '' : 's'} · {gate.totalRequired} required
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {submissions.map((s, i) => (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, delay: i * 0.03 }}
                >
                  <ChecklistRow
                    submission={s}
                    doc={s.accountDocumentId ? docsById.get(s.accountDocumentId) : undefined}
                    disabled={!preForward}
                    onVerdict={(action) => {
                      setVerdict({ submission: s, action })
                      setNote('')
                    }}
                  />
                </motion.div>
              ))}
              {submissions.length === 0 && (
                <p className="rounded-xl border border-dashed px-4 py-6 text-center text-xs text-muted-foreground">
                  No requirements attached to this request's service.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Dossier column (1/3) */}
        <div className="space-y-5">
          <Card>
            <CardContent className="space-y-3 p-4 sm:p-6">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Building2 size={16} className="text-primary" /> Applicant
              </h2>
              <div className="space-y-2.5 text-sm">
                <DossierField label="Name">
                  {isFin ? fin!.applicant.name : (request as { submittedBy: { name: string } }).submittedBy.name}
                </DossierField>
                <DossierField label="Email">
                  {isFin ? fin!.applicant.email : (request as { submittedBy: { email: string } }).submittedBy.email}
                </DossierField>
                <DossierField label="Organization">
                  {isFin
                    ? (fin!.organizationName ?? 'Individual (no organization)')
                    : (request as { organizationName: string }).organizationName}
                </DossierField>
                <DossierField label="Vault documents">
                  {docsData
                    ? `${
                        docsData.documents.filter((d) =>
                          isFin
                            ? // FIN-007: an individual applicant has organizationId null — a naive
                              // `d.organizationId === fin.organizationId` matches EVERY org-less
                              // (personal) document platform-wide. Null-check first so only the
                              // applicant's own docs and their actual org's docs count.
                              d.userId === fin!.applicant.id ||
                              (fin!.organizationId !== null && d.organizationId === fin!.organizationId)
                            : (request as { organizationId: string | null }).organizationId !== null &&
                                d.organizationId ===
                                  (request as { organizationId: string | null }).organizationId ||
                              d.userId === (request as { submittedBy: { id: string } }).submittedBy.id
                        ).length
                      } on file`
                    : '…'}
                </DossierField>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4 sm:p-6">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Landmark size={16} className="text-primary" /> Service & ask
              </h2>
              <div className="space-y-2.5 text-sm">
                <DossierField label="Financier">{request.financierOrgName}</DossierField>
                <DossierField label="Service">
                  {request.serviceName}
                  {service ? (
                    <span className="ml-1 text-xs text-muted-foreground">({service.currency})</span>
                  ) : null}
                </DossierField>
                {service && (service.amountMin != null || service.amountMax != null) && (
                  <DossierField label="Service range">
                    {service.amountMin != null ? formatMoney(service.amountMin, service.currency) : '—'} –{' '}
                    {service.amountMax != null ? formatMoney(service.amountMax, service.currency) : '—'}
                  </DossierField>
                )}
                {isFin && (
                  <>
                    <DossierField label="Ask">
                      <span className="font-semibold">{formatMoney(fin!.amountRequested, fin!.currency)}</span>
                    </DossierField>
                    <DossierField label="Activity">
                      {fin!.activityName ?? '—'}
                      {fin!.activityCity ? ` · ${fin!.activityCity}` : ''}
                    </DossierField>
                    <DossierField label="Purpose">{fin!.purpose ?? '—'}</DossierField>
                  </>
                )}
                {!isFin && (
                  <DossierField label="Scope">
                    {(request as { scopeNotes: string | null }).scopeNotes ?? '—'}
                  </DossierField>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Gate actions */}
      <Card className={cn('overflow-hidden', !preForward && 'opacity-90')}>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ClipboardCheck size={16} className="text-primary" /> Forward gate
          </h2>

          {missing && missing.length > 0 && (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-950/60">
              <p className="text-sm font-semibold text-rose-800 dark:text-rose-200">
                {missing.length} item{missing.length === 1 ? '' : 's'} still incomplete — the request cannot be forwarded
              </p>
              <ul className="mt-2 space-y-1.5">
                {missing.map((m) => (
                  <li key={m.submissionId} className="flex items-center gap-2 text-xs text-rose-700 dark:text-rose-300">
                    <FileWarning size={13} className="shrink-0" />
                    <span className="font-medium">{m.title}</span>
                    <StatusBadge status={m.status} map={SUBMISSION_STATUS_MAP} />
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-rose-600 dark:text-rose-400">
                Verify or waive every required item, or return the request to the applicant.
              </p>
            </div>
          )}

          {forwarded ? (
            <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              <CheckCircle2 size={12} className="mr-1 inline" /> This request passed the gate and now lives in{' '}
              {request.financierOrgName}&apos;s inbox. Platform review recorded
              {request.platformReviewedAt ? ` ${formatDate(request.platformReviewedAt)}` : ''}.
            </p>
          ) : preForward ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                {gate.canForward
                  ? 'Every required item is verified or waived — ready to forward.'
                  : `${gate.verified + gate.waived} of ${gate.totalRequired} required items verified.`}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {canStartReview && (
                  <Button
                    variant="outline"
                    className="rounded-xl"
                    disabled={starting || busy}
                    title="Open the request for platform review — unlocks verdicts and the return action"
                    onClick={() => void startReview()}
                  >
                    {starting ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <ClipboardCheck size={14} className="mr-1.5" />}
                    Start review
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="rounded-xl"
                  disabled={!canReturn || busy}
                  title={canReturn ? 'Send back to the applicant with an aggregate reason' : 'Only a request under platform review can be returned'}
                  onClick={() => setReturnOpen(true)}
                >
                  <Undo2 size={14} className="mr-1.5" /> Return to applicant…
                </Button>
                <Button
                  className="rounded-xl"
                  disabled={forwarding || busy}
                  onClick={() => void forward()}
                >
                  {forwarding ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Send size={14} className="mr-1.5" />}
                  Forward to financier
                </Button>
              </div>
            </div>
          ) : (
            <p className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
              This request is closed for platform review (status {status}).
            </p>
          )}
        </CardContent>
      </Card>

      {/* Verdict dialog (VERIFY note optional · REJECT/WAIVE note required) */}
      <Dialog
        open={!!verdict}
        onOpenChange={(v) => {
          if (!v) {
            setVerdict(null)
            setNote('')
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {verdict?.action === 'VERIFY' && <BadgeCheck size={17} className="text-emerald-600" />}
              {verdict?.action === 'REJECT' && <Ban size={17} className="text-rose-600" />}
              {verdict?.action === 'WAIVE' && <Undo2 size={17} className="text-primary" />}
              {verdict?.action === 'VERIFY' ? 'Verify item' : verdict?.action === 'REJECT' ? 'Reject item' : 'Waive item'}
            </DialogTitle>
            <DialogDescription>
              “{verdict?.submission.requirement.template.title}”
              {verdict?.action === 'VERIFY'
                ? ' — confirm the answer or document meets the requirement.'
                : verdict?.action === 'REJECT'
                  ? ' — the applicant must re-supply this item and will see your note.'
                  : ' — skip this item for this request (the applicant will see your note).'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="verdict-note" className="text-xs">
              Note {verdict?.action === 'VERIFY' ? '(optional)' : '(required — min 3 characters)'}
            </Label>
            <Textarea
              id="verdict-note"
              className="min-h-[72px] rounded-lg"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                verdict?.action === 'REJECT'
                  ? 'e.g. The statement is older than 6 months — upload the current one.'
                  : verdict?.action === 'WAIVE'
                    ? 'e.g. Not applicable for this applicant segment.'
                    : 'Optional context for the audit trail…'
              }
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => {
              setVerdict(null)
              setNote('')
            }} disabled={busy}>
              Cancel
            </Button>
            <Button
              className="rounded-xl"
              disabled={busy}
              variant={verdict?.action === 'REJECT' ? 'destructive' : 'default'}
              onClick={() => void submitVerdict()}
            >
              {busy && <Loader2 size={14} className="mr-1.5 animate-spin" />}
              {verdict?.action === 'VERIFY' ? 'Verify' : verdict?.action === 'REJECT' ? 'Reject' : 'Waive'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Return dialog (aggregate reason required) */}
      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Return {request.number} to the applicant</DialogTitle>
            <DialogDescription>
              The request goes back with your reason; verified items stay verified. The applicant
              fixes the flagged items and resubmits into this queue.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="return-reason" className="text-xs">
              Reason (required — min 3 characters)
            </Label>
            <Textarea
              id="return-reason"
              className="min-h-[72px] rounded-lg"
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              placeholder="e.g. Two documents are unreadable and the bank statement is 8 months old."
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => setReturnOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" className="rounded-xl" disabled={busy} onClick={() => void submitReturn()}>
              {busy && <Loader2 size={14} className="mr-1.5 animate-spin" />} Return request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Checklist row ─────────────────────────────────────────────────────────────

function ChecklistRow({
  submission: s,
  doc,
  disabled,
  onVerdict,
}: {
  submission: RequirementSubmissionDTO
  doc?: AccountDocumentDTO
  disabled: boolean
  onVerdict: (action: VerdictAction) => void
}) {
  const t = s.requirement.template
  const canVerify = s.status === 'SUBMITTED'
  const canReject = s.status === 'SUBMITTED'
  const canWaive = ['PENDING', 'SUBMITTED', 'REJECTED'].includes(s.status)

  return (
    <div
      className={cn(
        'rounded-xl border p-3.5 transition-colors',
        s.status === 'VERIFIED' && 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/20',
        s.status === 'REJECTED' && 'border-rose-200 bg-rose-50/40 dark:border-rose-900 dark:bg-rose-950/20',
        s.status === 'WAIVED' && 'border-violet-200 bg-violet-50/30 dark:border-violet-900 dark:bg-violet-950/20'
      )}
    >
      {/* Title line */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            <span className="truncate">{t.title}</span>
            <ConditionTypeBadge type={t.conditionType} />
            {s.requirement.isRequired ? (
              <Badge variant="outline" className="rounded-full border-rose-300 px-1.5 text-[10px] font-semibold text-rose-700 dark:border-rose-800 dark:text-rose-300">
                Required
              </Badge>
            ) : (
              <Badge variant="outline" className="rounded-full px-1.5 text-[10px] font-semibold text-muted-foreground">
                Optional
              </Badge>
            )}
            {t.code && <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t.code}</span>}
          </p>
          {t.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t.description}</p>}
        </div>
        <StatusBadge status={s.status} map={SUBMISSION_STATUS_MAP} />
      </div>

      {/* Answer preview */}
      <div className="mt-2.5 rounded-lg bg-muted/40 px-3 py-2">
        <AnswerPreview submission={s} doc={doc} />
      </div>

      {/* Decision note (the applicant sees these) */}
      {s.decisionNote && (
        <p
          className={cn(
            'mt-2 rounded-lg px-2.5 py-1.5 text-[11px] font-medium',
            s.status === 'REJECTED'
              ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
              : s.status === 'VERIFIED'
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                : 'bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300'
          )}
        >
          {s.status === 'REJECTED' ? <FileWarning size={11} className="mr-1 inline" /> : <CheckCircle2 size={11} className="mr-1 inline" />}
          Platform note: {s.decisionNote}
        </p>
      )}

      {/* Meta + actions */}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          {s.submittedAt ? `supplied ${timeAgo(s.submittedAt)}` : 'never supplied'}
          {s.verifiedAt ? ` · decided ${timeAgo(s.verifiedAt)}` : ''}
        </p>
        {disabled ? (
          <span className="text-[11px] text-muted-foreground">Gate closed</span>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            {canVerify && (
              <Button size="sm" className="h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700" onClick={() => onVerdict('VERIFY')}>
                <BadgeCheck size={13} className="mr-1" /> Verify
              </Button>
            )}
            {canReject && (
              <Button size="sm" variant="outline" className="h-8 rounded-lg text-rose-600 hover:text-rose-700" onClick={() => onVerdict('REJECT')}>
                <Ban size={13} className="mr-1" /> Reject…
              </Button>
            )}
            {canWaive && (
              <Button size="sm" variant="outline" className="h-8 rounded-lg" onClick={() => onVerdict('WAIVE')}>
                <Undo2 size={13} className="mr-1" /> Waive…
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Typed answer preview ─────────────────────────────────────────────────────

function AnswerPreview({ submission: s, doc }: { submission: RequirementSubmissionDTO; doc?: AccountDocumentDTO }) {
  const t = s.requirement.template

  if (t.conditionType === 'DOCUMENT') {
    if (!s.accountDocumentId) {
      return <span className="text-xs text-muted-foreground">No vault document attached yet.</span>
    }
    if (!doc) {
      return <span className="text-xs text-muted-foreground">Vault document {s.accountDocumentId.slice(-8)}…</span>
    }
    return (
      <div className="flex flex-wrap items-center gap-2.5">
        {doc.media?.url ? (
          <img
            src={doc.media.url}
            alt={`${DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType} preview`}
            className="h-10 w-10 shrink-0 rounded-md border object-cover"
          />
        ) : (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-muted">
            <FolderLock size={15} className="text-muted-foreground" />
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold">
            {doc.title ?? doc.media?.originalName ?? DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType}
          </p>
          <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <StatusBadge status={doc.status} map={DOC_STATUS_MAP} />
            {doc.organizationName ? `@ ${doc.organizationName}` : 'personal vault'}
            {doc.expiresAt && <span>· expires {formatDate(doc.expiresAt)}</span>}
          </p>
        </div>
        {doc.media?.url && (
          <a
            href={doc.media.url}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            <ExternalLink size={11} /> View
          </a>
        )}
      </div>
    )
  }

  if (t.conditionType === 'PROFILE_FIELD') {
    return (
      <span className="text-xs">
        <span className="font-semibold">{s.valueText ?? '—'}</span>
        <span className="ml-1.5 text-muted-foreground">(auto-evaluated from the profile)</span>
      </span>
    )
  }
  if (t.conditionType === 'DECLARATION') {
    return (
      <span className="text-xs">
        {s.valueText ? (
          <span className="font-semibold text-emerald-700 dark:text-emerald-400">Declared — “{s.valueText}”</span>
        ) : (
          <span className="text-muted-foreground">Not confirmed yet.</span>
        )}
      </span>
    )
  }
  if (t.conditionType === 'NUMBER') {
    return (
      <span className="text-xs">
        <span className="font-semibold tabular-nums">{s.valueNumber != null ? s.valueNumber.toLocaleString('en-US') : '—'}</span>
        {(t.validationMin != null || t.validationMax != null) && (
          <span className="ml-1.5 text-muted-foreground">
            (valid {t.validationMin ?? '−∞'}–{t.validationMax ?? '∞'})
          </span>
        )}
      </span>
    )
  }
  if (t.conditionType === 'DATE') {
    return (
      <span className="text-xs">
        {s.valueDate ? (
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <Calendar size={12} className="text-muted-foreground" /> {formatDate(s.valueDate)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </span>
    )
  }
  if (t.conditionType === 'MULTI_SELECT' && s.valueText) {
    return (
      <span className="flex flex-wrap gap-1.5">
        {s.valueText.split(',').map((v) => (
          <Badge key={v} variant="outline" className="rounded-full text-[10px] font-semibold">
            {v.trim()}
          </Badge>
        ))}
      </span>
    )
  }
  return (
    <span className="text-xs">
      {s.valueText ? <span className="font-medium">{s.valueText}</span> : <span className="text-muted-foreground">—</span>}
    </span>
  )
}

// ── Small atoms ──────────────────────────────────────────────────────────────

function DossierField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-0.5 break-words text-sm">{children}</div>
    </div>
  )
}

function ExpiryBadge({ expiresAt }: { expiresAt: string }) {
  const ms = new Date(expiresAt).getTime() - Date.now()
  const days = Math.ceil(ms / 86_400_000)
  if (ms <= 0) {
    return (
      <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[10.5px] font-semibold text-rose-800 dark:bg-rose-950 dark:text-rose-300">
        Expired
      </span>
    )
  }
  return (
    <span
      className={cn(
        'rounded-full px-2.5 py-1 text-[10.5px] font-semibold',
        days <= 7
          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
          : 'bg-muted text-muted-foreground'
      )}
      title={formatDate(expiresAt)}
    >
      Expires in {days}d
    </span>
  )
}
