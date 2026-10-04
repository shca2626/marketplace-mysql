'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FINANCIER INBOX — financing requests that passed THE PLATFORM GATE (R-4:
// the API structurally lists post-forward requests only). Open a request →
// dossier (activity + underwriting inputs + guarantee) + the service's
// composed checklist + existing offers, and compose a new offer with an
// installment schedule.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  CalendarClock,
  FileText,
  HandCoins,
  Inbox,
  Loader2,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  Undo2,
  UserRound,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { formatDate, timeAgo } from '@/lib/format'
import { apiRequest, LabeledValue, toastApiError } from '@/components/marketplace/admin/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  type FinOffer,
  type FinRequest,
  type FinServiceRequirement,
  ConditionTypeBadge,
  FIN_REQUEST_STATUS_MAP,
  OFFER_STATUS_MAP,
  StatusBadge,
  enumLabel,
  formatMoney,
  isoToDateInput,
} from './shared'

const INBOX_FILTERS = [
  { value: '', label: 'All' },
  { value: 'FORWARDED_TO_FINANCIER', label: 'Forwarded' },
  { value: 'UNDER_FINANCIER_REVIEW', label: 'In review' },
  { value: 'OFFERED', label: 'Offered' },
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'DECLINED', label: 'Declined' },
]

const RATE_TYPES = [
  { value: 'MURABAHA_ANNUAL', label: 'Murabaha annual' },
  { value: 'FIXED_ANNUAL', label: 'Fixed annual' },
  { value: 'FLAT_FEE', label: 'Flat fee' },
]

const COLLATERAL_TYPES = [
  'PERSONAL_GUARANTEE', 'BANK_GUARANTEE', 'GOLD', 'COMMERCIAL', 'MORTGAGE', 'CONVERTIBLE_SECURITIES', 'SELF_GUARANTEE', 'OTHER',
]

export function FinancierInboxTab({ isFinancier }: { isFinancier: boolean }) {
  const [statusFilter, setStatusFilter] = useState('')
  const {
    data,
    loading,
    refetch: refetchInbox,
  } = useApi<{ requests: FinRequest[]; total: number }>(
    isFinancier ? `/api/financier/inbox${statusFilter ? `?status=${statusFilter}` : ''}` : null,
    { skip: !isFinancier }
  )
  const [detail, setDetail] = useState<FinRequest | null>(null)

  const requests = data?.requests ?? []

  const openRequest = async (request: FinRequest) => {
    if (request.status === 'FORWARDED_TO_FINANCIER') {
      const res = await apiRequest<{ request: FinRequest }>(`/api/financier/requests/${request.id}/open`, { method: 'POST' })
      if (res.ok && res.data) {
        toast({ title: 'Request opened', description: `${request.number} is now under your review.` })
        setDetail(res.data.request)
        void refetchInbox()
        return
      }
      toastApiError(res.error, 'Could not open the request')
      return
    }
    setDetail(request)
  }

  const onChanged = useCallback(() => {
    void refetchInbox()
    if (detail) {
      // refresh the row that backs the open drawer
      const fresh = requests.find((r) => r.id === detail.id)
      if (fresh) setDetail(fresh)
    }
  }, [refetchInbox, detail, requests])

  return (
    <div className="space-y-4">
      {/* status filter chips */}
      <div
        className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Filter requests by status"
      >
        {INBOX_FILTERS.map((f) => {
          const selected = statusFilter === f.value
          return (
            <button
              key={f.value || 'all'}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setStatusFilter(f.value)}
              className={cn(
                'shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors',
                selected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
              )}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-14 text-center">
          <Inbox size={34} className="text-muted-foreground/40" />
          <p className="mt-3 text-sm font-semibold">
            {statusFilter ? 'No requests with this status' : 'No financing requests yet'}
          </p>
          <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
            Only applications the platform verification gate has fully verified reach this inbox — incomplete
            or incorrect requests are returned to the applicant before you ever see them.
          </p>
        </div>
      ) : (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {/* desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3 font-medium">Request</th>
                    <th className="px-3 py-3 font-medium">Applicant</th>
                    <th className="px-3 py-3 font-medium">Service</th>
                    <th className="px-3 py-3 text-right font-medium">Amount</th>
                    <th className="px-3 py-3 text-center font-medium">Status</th>
                    <th className="px-3 py-3 font-medium">Submitted</th>
                    <th className="px-5 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.id} className="border-b transition-colors last:border-0 hover:bg-muted/30">
                      <td className="px-5 py-3">
                        <button
                          className="font-mono text-sm font-bold text-primary hover:underline"
                          onClick={() => void openRequest(r)}
                        >
                          {r.number}
                        </button>
                        <p className="text-xs text-muted-foreground">
                          {r.offerCount} offer{r.offerCount === 1 ? '' : 's'}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center gap-1 text-xs font-medium">
                          {r.organizationId ? (
                            <>
                              <FileText size={12} className="text-muted-foreground" aria-hidden /> Organization
                            </>
                          ) : (
                            <>
                              <UserRound size={12} className="text-muted-foreground" aria-hidden /> Individual
                            </>
                          )}
                        </span>
                      </td>
                      <td className="max-w-52 px-3 py-3">
                        <p className="line-clamp-1 text-sm font-medium">{r.service?.name ?? '—'}</p>
                        <p className="text-xs text-muted-foreground">{enumLabel(r.targetType)}</p>
                      </td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums">
                        {formatMoney(r.amountRequested, r.currency)}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <StatusBadge status={r.status} map={FIN_REQUEST_STATUS_MAP} />
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        {r.submittedAt ? timeAgo(r.submittedAt) : '—'}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Button size="sm" className="h-8 rounded-lg text-xs" onClick={() => void openRequest(r)}>
                          {r.status === 'FORWARDED_TO_FINANCIER' ? 'Open review' : 'View'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* mobile stacked cards */}
            <ul className="divide-y md:hidden">
              {requests.map((r) => (
                <li key={r.id} className="space-y-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <button className="font-mono text-sm font-bold text-primary" onClick={() => void openRequest(r)}>
                      {r.number}
                    </button>
                    <StatusBadge status={r.status} map={FIN_REQUEST_STATUS_MAP} />
                  </div>
                  <p className="text-sm font-medium">{r.service?.name ?? '—'}</p>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{r.organizationId ? 'Organization' : 'Individual'} · {formatMoney(r.amountRequested, r.currency)}</span>
                    <span>{r.submittedAt ? timeAgo(r.submittedAt) : ''}</span>
                  </div>
                  <Button size="sm" className="h-8 w-full rounded-lg text-xs" onClick={() => void openRequest(r)}>
                    {r.status === 'FORWARDED_TO_FINANCIER' ? 'Open review' : 'View'}
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* detail drawer */}
      {detail && (
        <RequestDetailDialog
          request={detail}
          onClose={() => {
            setDetail(null)
            onChanged()
          }}
          onChanged={onChanged}
        />
      )}
    </div>
  )
}

// ── Request detail + offer composer ─────────────────────────────────────────

function RequestDetailDialog({
  request,
  onClose,
  onChanged,
}: {
  request: FinRequest
  onClose: () => void
  onChanged: () => void
}) {
  const [offers, setOffers] = useState<FinOffer[] | null>(null)
  const [requirements, setRequirements] = useState<FinServiceRequirement[] | null>(null)
  const [offerFormOpen, setOfferFormOpen] = useState(false)
  const [busyOfferId, setBusyOfferId] = useState<string | null>(null)

  const loadOffers = useCallback(async () => {
    const res = await apiRequest<{ offers: FinOffer[] }>(`/api/financing/requests/${request.id}/offers`)
    if (res.ok && res.data) setOffers(res.data.offers)
    else setOffers([])
  }, [request.id])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      // Offers (the route's guard allows the financier post-gate) and the
      // service's composed checklist — same read the composer uses; non-admin
      // members of the org may lack access, in which case the section is
      // simply omitted.
      const [offersRes, reqRes] = await Promise.all([
        apiRequest<{ offers: FinOffer[] }>(`/api/financing/requests/${request.id}/offers`),
        request.service
          ? apiRequest<{ requirements: FinServiceRequirement[] }>(
              `/api/financier/services/${request.service.id}/requirements`
            )
          : Promise.resolve(null),
      ])
      if (cancelled) return
      setOffers(offersRes.ok && offersRes.data ? offersRes.data.offers : [])
      if (reqRes && reqRes.ok && reqRes.data) setRequirements(reqRes.data.requirements.filter((r) => r.isActive))
    })()
    return () => {
      cancelled = true
    }
  }, [request.id, request.service])

  const refresh = () => {
    void loadOffers()
    onChanged()
  }

  const sendOffer = async (offer: FinOffer) => {
    setBusyOfferId(offer.id)
    const res = await apiRequest<{ offer: FinOffer }>(`/api/financier/offers/${offer.id}/send`, { method: 'POST' })
    setBusyOfferId(null)
    if (!res.ok) {
      toastApiError(res.error, 'Could not send the offer')
      return
    }
    toast({ title: 'Offer sent', description: 'The applicant can now compare and accept it.' })
    refresh()
  }

  const withdrawOffer = async (offer: FinOffer) => {
    setBusyOfferId(offer.id)
    const res = await apiRequest<{ offer: FinOffer }>(`/api/financier/offers/${offer.id}/withdraw`, { method: 'POST' })
    setBusyOfferId(null)
    if (!res.ok) {
      toastApiError(res.error, 'Could not withdraw the offer')
      return
    }
    toast({ title: 'Offer withdrawn' })
    refresh()
  }

  const activeRequirements = requirements ?? []
  const offerable =
    request.status === 'FORWARDED_TO_FINANCIER' || request.status === 'UNDER_FINANCIER_REVIEW' || request.status === 'OFFERED'

  return (
    <Dialog open onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono">{request.number}</span>
            <StatusBadge status={request.status} map={FIN_REQUEST_STATUS_MAP} />
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
              {formatMoney(request.amountRequested, request.currency)}
            </span>
          </DialogTitle>
          <DialogDescription>
            {request.service?.name ?? 'Service'} · {request.organizationId ? 'Organization application' : 'Individual application'} ·{' '}
            {request.submittedAt ? `submitted ${formatDate(request.submittedAt)}` : 'not submitted'}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-5">
          {/* Platform gate banner */}
          <p className="flex items-start gap-2 rounded-xl bg-emerald-500/10 px-3.5 py-2.5 text-xs leading-relaxed text-emerald-700 dark:text-emerald-300">
            <ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden />
            The platform verification gate forwarded this request on{' '}
            {request.forwardedAt ? formatDate(request.forwardedAt) : '—'} — every required checklist item was
            verified or waived before it reached you.
          </p>

          {/* Dossier */}
          <section aria-label="Request dossier">
            <h3 className="mb-2.5 text-sm font-semibold">Request dossier</h3>
            <div className="grid gap-x-6 gap-y-3.5 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
              <LabeledValue label="Amount requested">
                <span className="font-semibold tabular-nums">{formatMoney(request.amountRequested, request.currency)}</span>
              </LabeledValue>
              <LabeledValue label="Tenor requested">
                {request.tenorRequestedMonths ? `${request.tenorRequestedMonths} months` : '—'}
              </LabeledValue>
              <LabeledValue label="Target">{enumLabel(request.targetType)}</LabeledValue>
              {request.purpose && (
                <div className="sm:col-span-2 lg:col-span-3">
                  <LabeledValue label="Purpose">
                    <p className="whitespace-pre-line leading-relaxed">{request.purpose}</p>
                  </LabeledValue>
                </div>
              )}
            </div>

            <div className="mt-3 grid gap-x-6 gap-y-3.5 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:col-span-2 lg:col-span-3">
                Activity
              </h4>
              <LabeledValue label="Activity">{enumLabel(request.activityStatus)}</LabeledValue>
              <LabeledValue label="Category">
                {request.activityCategoryOther ?? enumLabel(request.activityCategory)}
              </LabeledValue>
              <LabeledValue label="Years / since">
                {request.activityStartDate ? formatDate(request.activityStartDate) : '—'}
              </LabeledValue>
              <LabeledValue label="Activity name">{request.activityName ?? '—'}</LabeledValue>
              <LabeledValue label="Location">
                {[request.activityCity, request.activityDistrict].filter(Boolean).join(', ') || '—'}
              </LabeledValue>
              <LabeledValue label="Premises">{enumLabel(request.activityLocationType)}</LabeledValue>
              {request.activityDescription && (
                <div className="sm:col-span-2 lg:col-span-3">
                  <LabeledValue label="Description">
                    <p className="whitespace-pre-line leading-relaxed">{request.activityDescription}</p>
                  </LabeledValue>
                </div>
              )}
            </div>

            <div className="mt-3 grid gap-x-6 gap-y-3.5 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:col-span-2 lg:col-span-4">
                Underwriting inputs
              </h4>
              <LabeledValue label="Capital">
                <span className="tabular-nums">{formatMoney(request.capitalAmount, request.currency)}</span>
              </LabeledValue>
              <LabeledValue label="Own contribution">
                <span className="tabular-nums">{formatMoney(request.ownContributionAmount, request.currency)}</span>
              </LabeledValue>
              <LabeledValue label="Monthly capacity">
                <span className="tabular-nums">{formatMoney(request.monthlyInstallmentCapacity, request.currency)}</span>
              </LabeledValue>
              <LabeledValue label="Previous financing">
                {request.previousFinancing === null ? '—' : request.previousFinancing ? 'Yes' : 'No'}
              </LabeledValue>
              <LabeledValue label="Guarantee offered">{enumLabel(request.guaranteeType)}</LabeledValue>
              <LabeledValue label="Guarantee status">{enumLabel(request.guaranteeStatus)}</LabeledValue>
              {request.otherIncomeSources && (
                <div className="sm:col-span-2">
                  <LabeledValue label="Other income sources">{request.otherIncomeSources}</LabeledValue>
                </div>
              )}
              {request.applicantNotes && (
                <div className="sm:col-span-2 lg:col-span-4">
                  <LabeledValue label="Applicant notes">
                    <p className="whitespace-pre-line leading-relaxed">{request.applicantNotes}</p>
                  </LabeledValue>
                </div>
              )}
            </div>
          </section>

          {/* Checklist (composed for this service) */}
          {requirements !== null && (
            <section aria-label="Service requirements checklist">
              <h3 className="mb-2.5 text-sm font-semibold">
                Checklist
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  composed for this service — verified by the platform gate
                </span>
              </h3>
              <div className="space-y-1.5">
                {activeRequirements.length === 0 ? (
                  <p className="rounded-xl border border-dashed px-4 py-5 text-center text-xs text-muted-foreground">
                    This service has no composed requirements.
                  </p>
                ) : (
                  activeRequirements.map((r) => (
                    <div
                      key={r.id}
                      className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3.5 py-2.5"
                    >
                      <ConditionTypeBadge type={r.template?.conditionType ?? ''} />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {r.template?.title ?? r.conditionTemplateId}
                      </span>
                      <span
                        className={cn(
                          'rounded-full px-2 py-px text-[10px] font-bold uppercase tracking-wide',
                          r.isRequired ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {r.isRequired ? 'Required · verified' : 'Optional'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}

          {/* Offers */}
          <section aria-label="Offers">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">
                Offers
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {offers ? `${offers.length} on this request` : '…'}
                </span>
              </h3>
              {offerable && (
                <Button size="sm" className="h-8 rounded-lg text-xs" onClick={() => setOfferFormOpen((v) => !v)}>
                  <Plus size={13} className="mr-1" /> {offerFormOpen ? 'Close form' : 'New offer'}
                </Button>
              )}
            </div>

            {offerFormOpen && offerable && (
              <OfferForm
                request={request}
                existingCount={offers?.length ?? 0}
                onCreated={() => {
                  setOfferFormOpen(false)
                  refresh()
                }}
              />
            )}

            <div className="space-y-2">
              {offers === null ? (
                Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
              ) : offers.length === 0 ? (
                <p className="rounded-xl border border-dashed px-4 py-6 text-center text-xs text-muted-foreground">
                  No offers yet{offerable ? ' — compose one above.' : ' on this request.'}
                </p>
              ) : (
                offers.map((o) => (
                  <div key={o.id} className="space-y-2.5 rounded-xl border bg-card p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={o.status} map={OFFER_STATUS_MAP} />
                        <span className="text-sm font-bold tabular-nums">{formatMoney(o.amount, o.currency)}</span>
                        <span className="text-xs text-muted-foreground">
                          {o.rateType ? `${enumLabel(o.rateType)}${o.ratePercent !== null ? ` · ${o.ratePercent}%` : ''}` : ''}
                          {o.feeFlat !== null ? ` · fee ${formatMoney(o.feeFlat, o.currency)}` : ''}
                        </span>
                      </div>
                      <div className="flex gap-1.5">
                        {o.status === 'DRAFT' && (
                          <Button
                            size="sm"
                            className="h-8 rounded-lg text-xs"
                            disabled={busyOfferId === o.id}
                            onClick={() => void sendOffer(o)}
                          >
                            {busyOfferId === o.id ? <Loader2 size={12} className="mr-1 animate-spin" /> : <Send size={12} className="mr-1" />}
                            Send
                          </Button>
                        )}
                        {o.status === 'SENT' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 rounded-lg text-xs text-muted-foreground hover:text-destructive"
                            disabled={busyOfferId === o.id}
                            onClick={() => void withdrawOffer(o)}
                          >
                            {busyOfferId === o.id ? <Loader2 size={12} className="mr-1 animate-spin" /> : <Undo2 size={12} className="mr-1" />}
                            Withdraw
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4">
                      <span className="flex items-center gap-1">
                        <CalendarClock size={11} aria-hidden /> Tenor {o.tenorMonths} mo
                      </span>
                      <span>Valid until {o.validUntil ? formatDate(o.validUntil) : '—'}</span>
                      <span>Collateral {enumLabel(o.collateralRequired)}</span>
                      <span>{o.installments.length} installment{o.installments.length === 1 ? '' : 's'}</span>
                    </div>
                    {o.notes && <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs leading-relaxed">{o.notes}</p>}
                    {o.installments.length > 0 && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                          Installment schedule
                        </summary>
                        <div className="mt-1.5 space-y-1">
                          {o.installments.map((inst) => (
                            <div key={inst.id} className="flex justify-between rounded-lg bg-muted/40 px-3 py-1.5">
                              <span>#{inst.installmentNo} · {formatDate(inst.dueDate)}</span>
                              <span className="font-semibold tabular-nums">{formatMoney(inst.amount, o.currency)}</span>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Offer composer form ─────────────────────────────────────────────────────

function OfferForm({
  request,
  existingCount,
  onCreated,
}: {
  request: FinRequest
  existingCount: number
  onCreated: () => void
}) {
  const [amount, setAmount] = useState(String(request.amountRequested))
  const [rateType, setRateType] = useState('MURABAHA_ANNUAL')
  const [ratePercent, setRatePercent] = useState('')
  const [feeFlat, setFeeFlat] = useState('')
  const [tenorMonths, setTenorMonths] = useState(String(request.tenorRequestedMonths ?? 12))
  const [validUntil, setValidUntil] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 30)
    return isoToDateInput(d.toISOString())
  })
  const [collateralRequired, setCollateralRequired] = useState<string>('PERSONAL_GUARANTEE')
  const [notes, setNotes] = useState('')
  const [installments, setInstallments] = useState<{ dueDate: string; amount: string }[]>([
    { dueDate: '', amount: '' },
  ])
  const [saving, setSaving] = useState(false)

  const validInstallments = useMemo(
    () =>
      installments
        .map((i, idx) => ({ installmentNo: idx + 1, dueDate: i.dueDate, amount: Number(i.amount) }))
        .filter((i) => i.dueDate !== '' && Number.isFinite(i.amount) && i.amount > 0),
    [installments]
  )

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const amt = Number(amount)
    const tenor = parseInt(tenorMonths, 10)
    if (!Number.isFinite(amt) || amt <= 0) {
      toast({ title: 'Enter a valid offer amount', variant: 'destructive' })
      return
    }
    if (!Number.isFinite(tenor) || tenor < 1) {
      toast({ title: 'Enter a valid tenor in months', variant: 'destructive' })
      return
    }
    setSaving(true)
    const res = await apiRequest<{ offer: FinOffer }>('/api/financier/offers', {
      method: 'POST',
      body: JSON.stringify({
        requestId: request.id,
        amount: amt,
        rateType,
        ...(ratePercent !== '' ? { ratePercent: Number(ratePercent) } : {}),
        ...(feeFlat !== '' ? { feeFlat: Number(feeFlat) } : {}),
        tenorMonths: tenor,
        ...(validUntil ? { validUntil: new Date(`${validUntil}T23:59:00`).toISOString() } : {}),
        collateralRequired,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(validInstallments.length > 0 ? { installments: validInstallments } : {}),
      }),
    })
    setSaving(false)
    if (!res.ok || !res.data) {
      toastApiError(res.error, 'Could not create the offer')
      return
    }
    toast({
      title: `Offer drafted${existingCount > 0 ? ' (revision)' : ''}`,
      description: 'Review it below, then press Send to deliver it to the applicant.',
    })
    onCreated()
  }

  return (
    <form onSubmit={submit} className="mb-3 space-y-3.5 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
        <HandCoins size={14} aria-hidden /> Compose offer
        <span className="font-normal text-muted-foreground">
          — saved as a draft first, send it when you&apos;re ready
        </span>
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="offer-amount" className="text-xs">Amount ({request.currency})</Label>
          <Input
            id="offer-amount"
            type="number"
            min={0}
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="h-9 rounded-lg text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="offer-rate-type" className="text-xs">Rate type</Label>
          <Select value={rateType} onValueChange={setRateType}>
            <SelectTrigger id="offer-rate-type" className="h-9 rounded-lg text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RATE_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="offer-rate" className="text-xs">
            Rate (%) <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="offer-rate"
            type="number"
            min={0}
            max={100}
            step="any"
            value={ratePercent}
            onChange={(e) => setRatePercent(e.target.value)}
            placeholder="e.g. 24"
            className="h-9 rounded-lg text-sm"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="offer-fee" className="text-xs">
            Flat fee ({request.currency}) <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="offer-fee"
            type="number"
            min={0}
            step="any"
            value={feeFlat}
            onChange={(e) => setFeeFlat(e.target.value)}
            className="h-9 rounded-lg text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="offer-tenor" className="text-xs">Tenor (months)</Label>
          <Input
            id="offer-tenor"
            type="number"
            min={1}
            max={360}
            value={tenorMonths}
            onChange={(e) => setTenorMonths(e.target.value)}
            className="h-9 rounded-lg text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="offer-valid" className="text-xs">Valid until</Label>
          <Input
            id="offer-valid"
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            className="h-9 rounded-lg text-sm"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="offer-collateral" className="text-xs">Collateral required</Label>
          <Select value={collateralRequired} onValueChange={setCollateralRequired}>
            <SelectTrigger id="offer-collateral" className="h-9 rounded-lg text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COLLATERAL_TYPES.map((c) => (
                <SelectItem key={c} value={c}>{enumLabel(c)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="offer-notes" className="text-xs">
            Notes <span className="font-normal text-muted-foreground">(shown to the applicant)</span>
          </Label>
          <Textarea
            id="offer-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Terms, conditions, next steps…"
            className="min-h-[38px] rounded-lg text-sm"
            maxLength={1000}
          />
        </div>
      </div>

      {/* installments repeater */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs">
            Installment schedule <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 rounded-lg text-xs"
            onClick={() => setInstallments((prev) => [...prev, { dueDate: '', amount: '' }])}
          >
            <Plus size={12} className="mr-1" /> Add installment
          </Button>
        </div>
        <div className="space-y-1.5">
          {installments.map((inst, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-bold tabular-nums text-muted-foreground">
                {i + 1}
              </span>
              <Input
                type="date"
                value={inst.dueDate}
                onChange={(e) => setInstallments((prev) => prev.map((p, j) => (j === i ? { ...p, dueDate: e.target.value } : p)))}
                className="h-9 rounded-lg text-sm"
                aria-label={`Installment ${i + 1} due date`}
              />
              <Input
                type="number"
                min={0}
                step="any"
                value={inst.amount}
                onChange={(e) => setInstallments((prev) => prev.map((p, j) => (j === i ? { ...p, amount: e.target.value } : p)))}
                placeholder={`Amount (${request.currency})`}
                className="h-9 rounded-lg text-sm"
                aria-label={`Installment ${i + 1} amount`}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => setInstallments((prev) => prev.filter((_, j) => j !== i))}
                aria-label={`Remove installment ${i + 1}`}
              >
                <Trash2 size={14} />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" size="sm" className="rounded-lg text-xs" disabled={saving}>
          {saving ? <Loader2 size={12} className="mr-1 animate-spin" /> : <ArrowRight size={12} className="mr-1" />}
          Draft offer
        </Button>
      </div>
    </form>
  )
}
