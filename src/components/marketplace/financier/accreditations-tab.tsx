'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ACCREDITATIONS — forwarded accreditation requests + live grants (FIN-5 §5).
// Decisions: Open → Grant (validity comes from the program's months) /
// Reject (note required). Live grants show a validUntil countdown and can be
// revoked with a reason (RFQ participation with your institution locks again).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import {
  BadgeCheck,
  Ban,
  CheckCircle2,
  ChevronRight,
  Clock,
  Eye,
  FileSearch,
  Loader2,
  ShieldAlert,
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
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { formatDate, initials, timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  FinancingStatusBadge,
  SUBMISSION_STATUS_MAP,
  conditionTypeLabel,
  type FinancierAccreditationDTO,
  type FinancierServiceDTO,
  type SubmissionDTO,
} from './financing-status-badge'

type AccreditationDetail = FinancierAccreditationDTO & { submissions: SubmissionDTO[] }

function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  const ms = new Date(iso).getTime() - Date.now()
  return Math.ceil(ms / 86_400_000)
}

function submissionValue(s: SubmissionDTO): string {
  if (s.accountDocumentId) return 'Document attached'
  if (s.valueText) return s.valueText === 'CONFIRMED' ? 'Confirmed' : s.valueText
  if (s.valueNumber != null) return String(s.valueNumber)
  if (s.valueDate) return formatDate(s.valueDate)
  return s.status === 'PENDING' ? 'Not answered' : 'Answered'
}

// ── Decision dialogs ─────────────────────────────────────────────────────────

function DecisionDialog({
  accreditation,
  decision,
  validMonths,
  onClose,
  onDone,
}: {
  accreditation: AccreditationDetail
  decision: 'grant' | 'reject' | 'revoke'
  validMonths: number | null
  onClose: () => void
  onDone: () => void
}) {
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const needsNote = decision !== 'grant'
  const copy =
    decision === 'grant'
      ? {
          title: `Grant — ${accreditation.number}`,
          icon: <CheckCircle2 size={17} className="text-emerald-600 dark:text-emerald-400" />,
          description: `${
            accreditation.organizationName ?? 'This organization'
          } will be accredited until ${formatDate(
            new Date(Date.now() + (validMonths ?? 12) * 30 * 86_400_000).toISOString()
          )} (${validMonths ?? 12} months) — RFQ participation with your institution unlocks for them.`,
          cta: 'Grant accreditation',
        }
      : decision === 'reject'
        ? {
            title: `Reject — ${accreditation.number}`,
            icon: <XCircle size={17} className="text-destructive" />,
            description: 'The rejection note is required and is delivered to the applicant organization.',
            cta: 'Reject request',
          }
        : {
            title: `Revoke — ${accreditation.number}`,
            icon: <Ban size={17} className="text-destructive" />,
            description:
              'Revoking ends the live accreditation immediately. RFQ participation with your institution locks again. The reason is required.',
            cta: 'Revoke accreditation',
          }

  const submit = async () => {
    if (needsNote && note.trim().length < 3) {
      toast({ title: 'A note is required', variant: 'destructive' })
      return
    }
    setSaving(true)
    const res = await apiRequest(`/api/financier/accreditations/${accreditation.id}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision, note: note.trim() || null }),
    })
    setSaving(false)
    if (!res.ok) return toastApiError(res.error, 'Decision failed')
    toast({
      title:
        decision === 'grant'
          ? 'Accreditation granted'
          : decision === 'reject'
            ? 'Accreditation rejected'
            : 'Accreditation revoked',
      description:
        decision === 'grant'
          ? `${accreditation.organizationName ?? 'The organization'} is accredited — they have been notified.`
          : 'The applicant organization has been notified.',
    })
    onDone()
    onClose()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{copy.icon}{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="acc-note">{needsNote ? 'Note (required)' : 'Note (optional)'}</Label>
          <Textarea
            id="acc-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={
              decision === 'grant'
                ? 'e.g. Welcome to our approved-vendor program.'
                : 'e.g. Commercial registration expired during review.'
            }
            className="rounded-xl"
          />
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" className="rounded-xl" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            className="rounded-xl"
            variant={decision === 'grant' ? 'default' : 'destructive'}
            onClick={submit}
            disabled={saving}
          >
            {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />} {copy.cta}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Detail dialog ────────────────────────────────────────────────────────────

function AccreditationDetailDialog({
  accreditationId,
  services,
  onClose,
  onChanged,
}: {
  accreditationId: string | null
  services: FinancierServiceDTO[]
  onClose: () => void
  onChanged: () => void
}) {
  const { data, loading, error, refetch } = useApi<{ request: AccreditationDetail }>(
    accreditationId ? `/api/financier/accreditations/${accreditationId}` : null
  )
  const [busy, setBusy] = useState(false)
  const [decision, setDecision] = useState<'grant' | 'reject' | 'revoke' | null>(null)

  const detail = data?.request ?? null
  const service = detail ? services.find((s) => s.id === detail.serviceId) ?? null : null
  const validMonths = service?.accreditationValidMonths ?? null

  const openReview = async () => {
    if (!detail) return
    setBusy(true)
    const res = await apiRequest(`/api/financier/accreditations/${detail.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'open' }),
    })
    setBusy(false)
    if (!res.ok) return toastApiError(res.error, 'Could not open review')
    toast({ title: 'Opened for review' })
    void refetch()
    onChanged()
  }

  return (
    <Dialog open={!!accreditationId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        {/* Screen-reader title for the loading/error states (the loaded state
            renders its own visible header below) — keeps Radix a11y happy. */}
        {(loading || error || !detail) && (
          <DialogHeader className="sr-only">
            <DialogTitle>Accreditation dossier</DialogTitle>
            <DialogDescription>Loading the accreditation request.</DialogDescription>
          </DialogHeader>
        )}
        {loading && (
          <div className="space-y-3">
            <Skeleton className="skeleton-shimmer h-8 w-56" />
            <Skeleton className="skeleton-shimmer h-20 w-full rounded-xl" />
            <Skeleton className="skeleton-shimmer h-40 w-full rounded-xl" />
          </div>
        )}
        {!loading && error && (
          <div className="flex flex-col items-center py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <ShieldAlert size={22} />
            </span>
            <p className="mt-3 text-sm font-semibold">Couldn&apos;t load the accreditation</p>
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
                  {detail.organizationName ?? 'Unknown organization'}
                </span>
              </DialogTitle>
              <DialogDescription>
                Program: {detail.serviceName}
                {validMonths ? ` · validity ${validMonths} months on grant` : ''}
                {detail.forwardedAt ? ` · forwarded ${timeAgo(detail.forwardedAt)}` : ''}
              </DialogDescription>
            </DialogHeader>

            {detail.scopeNotes && (
              <p className="rounded-xl border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">Scope:</span> {detail.scopeNotes}
              </p>
            )}

            {detail.validUntil && detail.status === 'ACCREDITED' && (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300">
                Accredited{detail.accreditedAt ? ` ${formatDate(detail.accreditedAt)}` : ''} — valid until{' '}
                {formatDate(detail.validUntil)}
                {daysUntil(detail.validUntil) != null ? ` (${daysUntil(detail.validUntil)} days left)` : ''}.
              </p>
            )}

            {detail.revocationReason && (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
                Revoked{detail.revokedAt ? ` ${formatDate(detail.revokedAt)}` : ''} — {detail.revocationReason}
              </p>
            )}

            {/* Checklist */}
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

            <DialogFooter className="sticky bottom-0 -mx-6 -mt-4 -mb-6 flex-wrap items-center justify-between gap-2 rounded-b-lg border-t bg-background/95 px-6 pt-4 pb-6 backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:justify-between">
              <p className="text-xs text-muted-foreground">
                {detail.submittedBy ? `Submitted by ${detail.submittedBy.name}` : 'Submitted'}
                {detail.submittedAt ? ` ${timeAgo(detail.submittedAt)}` : ''}
              </p>
              <div className="flex flex-wrap gap-2">
                {detail.status === 'FORWARDED_TO_FINANCIER' && (
                  <Button type="button" variant="outline" className="rounded-xl" onClick={openReview} disabled={busy}>
                    <Eye size={14} className="mr-1.5" /> Open review
                  </Button>
                )}
                {['FORWARDED_TO_FINANCIER', 'UNDER_FINANCIER_REVIEW'].includes(detail.status) && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl text-destructive hover:text-destructive"
                      onClick={() => setDecision('reject')}
                    >
                      <XCircle size={14} className="mr-1.5" /> Reject
                    </Button>
                    <Button type="button" className="rounded-xl" onClick={() => setDecision('grant')}>
                      <BadgeCheck size={14} className="mr-1.5" /> Grant
                    </Button>
                  </>
                )}
                {detail.status === 'ACCREDITED' && (
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl text-destructive hover:text-destructive"
                    onClick={() => setDecision('revoke')}
                  >
                    <Ban size={14} className="mr-1.5" /> Revoke
                  </Button>
                )}
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>

      {detail && decision && (
        <DecisionDialog
          accreditation={detail}
          decision={decision}
          validMonths={validMonths}
          onClose={() => setDecision(null)}
          onDone={() => {
            void refetch()
            onChanged()
          }}
        />
      )}
    </Dialog>
  )
}

// ── The tab ──────────────────────────────────────────────────────────────────

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'FORWARDED_TO_FINANCIER', label: 'Forwarded' },
  { value: 'UNDER_FINANCIER_REVIEW', label: 'Under review' },
  { value: 'ACCREDITED', label: 'Accredited' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'REVOKED', label: 'Revoked' },
]

export function AccreditationsTab({ onChanged }: { onChanged: () => void }) {
  const { data, loading, error, refetch } = useApi<{ accreditations: FinancierAccreditationDTO[] }>(
    '/api/financier/accreditations'
  )
  const accreditations = useMemo(() => data?.accreditations ?? [], [data])
  const { data: svcData } = useApi<{ services: FinancierServiceDTO[] }>('/api/financier/services')
  const services = svcData?.services ?? []

  const [statusFilter, setStatusFilter] = useState('')
  const filtered = statusFilter ? accreditations.filter((a) => a.status === statusFilter) : accreditations
  const counts = accreditations.reduce<Record<string, number>>((acc, a) => {
    acc[a.status] = (acc[a.status] ?? 0) + 1
    return acc
  }, {})

  const live = accreditations.filter(
    (a) => a.status === 'ACCREDITED' && (a.validUntil == null || new Date(a.validUntil).getTime() > Date.now())
  )

  const [openId, setOpenId] = useState<string | null>(null)
  const [openSeq, setOpenSeq] = useState(0)
  const open = (id: string) => {
    setOpenId(id)
    setOpenSeq((s) => s + 1)
  }

  return (
    <div className="space-y-5">
      {/* Live accreditations strip */}
      {live.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {live.map((a) => {
            const days = daysUntil(a.validUntil)
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => open(a.id)}
                className="group rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 text-left transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:border-emerald-900 dark:bg-emerald-950/40 dark:hover:border-emerald-800"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                    <BadgeCheck size={16} className="shrink-0 text-emerald-600 transition-transform duration-200 group-hover:scale-110 dark:text-emerald-400" />
                    <span className="truncate" title={a.organizationName ?? 'Organization'}>{a.organizationName ?? 'Organization'}</span>
                  </p>
                  <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300">
                    {a.number}
                  </span>
                </div>
                <p className="mt-1.5 truncate text-xs text-muted-foreground" title={a.serviceName}>{a.serviceName}</p>
                <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  <Clock size={12} />
                  {days != null ? `valid ${days} more ${days === 1 ? 'day' : 'days'}` : 'no expiry'} · until{' '}
                  {a.validUntil ? formatDate(a.validUntil) : '—'}
                </p>
              </button>
            )
          })}
        </div>
      )}

      <FilterChips
        options={STATUS_FILTERS.map((f) => ({ ...f, count: f.value ? counts[f.value] : accreditations.length }))}
        value={statusFilter}
        onChange={setStatusFilter}
        ariaLabel="Filter accreditations by status"
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
          <p className="mt-4 text-sm font-semibold">Couldn&apos;t load accreditations</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">{error}</p>
          <Button variant="outline" className="mt-4 rounded-xl" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      )}

      {!loading && !error && accreditations.length === 0 && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-14 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <BadgeCheck size={26} />
          </span>
          <p className="mt-4 text-sm font-semibold">No accreditation requests yet</p>
          <p className="mt-1 max-w-md text-xs text-muted-foreground">
            Companies apply to your accreditation programs — once the platform gate verifies them,
            they arrive here for your decision.
          </p>
        </div>
      )}

      {/* Desktop table */}
      {!loading && !error && filtered.length > 0 && (
        <div className="hidden overflow-hidden rounded-2xl border md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-medium">Request</th>
                <th scope="col" className="px-4 py-3 font-medium">Organization</th>
                <th scope="col" className="px-4 py-3 font-medium">Program</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Valid until</th>
                <th scope="col" className="px-4 py-3 font-medium">Forwarded</th>
                <th scope="col" className="w-10 px-4 py-3 font-medium">
                  <span className="sr-only">Open dossier</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => {
                const days = daysUntil(a.validUntil)
                return (
                  <tr
                    key={a.id}
                    onClick={() => open(a.id)}
                    className="cursor-pointer border-b transition-colors last:border-0 hover:bg-accent/50"
                  >
                    <td className="px-4 py-3.5 font-semibold tabular-nums">{a.number}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[10px] font-extrabold text-primary">
                          {initials(a.organizationName ?? 'Org')}
                        </span>
                        <span className="truncate font-medium">{a.organizationName ?? '—'}</span>
                      </div>
                    </td>
                    <td className="max-w-44 truncate px-4 py-3.5 text-muted-foreground">{a.serviceName}</td>
                    <td className="px-4 py-3.5">
                      <FinancingStatusBadge status={a.status} />
                    </td>
                    <td className="px-4 py-3.5">
                      {a.validUntil ? (
                        <span
                          className={cn(
                            'text-xs',
                            a.status === 'ACCREDITED' && days != null && days <= 30
                              ? 'font-semibold text-amber-700 dark:text-amber-400'
                              : 'text-muted-foreground'
                          )}
                        >
                          {formatDate(a.validUntil)}
                          {a.status === 'ACCREDITED' && days != null ? ` (${days}d)` : ''}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-muted-foreground" title={a.forwardedAt ?? undefined}>
                      {a.forwardedAt ? timeAgo(a.forwardedAt) : '—'}
                    </td>
                    <td className="w-10 px-4 py-3.5 text-muted-foreground/50">
                      <ChevronRight size={15} className="ml-auto" aria-hidden />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile stacked cards */}
      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-3 md:hidden">
          {filtered.map((a) => (
            <Card key={a.id} className="shadow-sm transition-all duration-200 hover:shadow-md">
              <CardContent className="p-4">
                <button
                  type="button"
                  onClick={() => open(a.id)}
                  className="w-full rounded-lg text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold tabular-nums">{a.number}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground" title={`${a.organizationName ?? '—'} · ${a.serviceName}`}>
                        {a.organizationName ?? '—'} · {a.serviceName}
                      </p>
                    </div>
                    <FinancingStatusBadge status={a.status} />
                  </div>
                  <p className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span className="truncate">
                      {a.validUntil ? `valid until ${formatDate(a.validUntil)}` : 'no validity yet'}
                      {a.forwardedAt ? ` · forwarded ${timeAgo(a.forwardedAt)}` : ''}
                    </span>
                    <ChevronRight size={14} className="shrink-0 text-muted-foreground/50" aria-hidden />
                  </p>
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AccreditationDetailDialog
        key={`acc-${openSeq}`}
        accreditationId={openId}
        services={services}
        onClose={() => setOpenId(null)}
        onChanged={() => {
          void refetch()
          onChanged()
        }}
      />
    </div>
  )
}
