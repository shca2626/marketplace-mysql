'use client'

// ─────────────────────────────────────────────────────────────────────────────
// MY FINANCING — the buyer console's Financing & Accreditation page (FIN-6
// surface B, ?view=myfinancing). Two tabs:
//
//   Requests   — financing + accreditation requests (multiGroupId siblings
//               grouped visually), click-through to the full dossier: the
//               platform-gate state, THE CHECKLIST with per-item verdicts +
//               supply forms for missing items, offers with accept/decline,
//               and the request timeline.
//   Documents  — the DP-27 universal document vault: list with statuses,
//               upload (type + title + issuedAt), replace (old goes
//               inactive), replaced history.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileText,
  FileUp,
  HandCoins,
  Layers,
  Loader2,
  RefreshCcw,
  Send,
  ShieldCheck,
  Store,
  Undo2,
  X,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useMarketplace } from '@/store/marketplace'
import { useApi } from '@/hooks/use-api'
import { formatDate, timeAgo } from '@/lib/format'
import { apiRequest, LabeledValue, toastApiError } from '@/components/marketplace/admin/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  ACCREDITATION_STATUS_MAP,
  AccreditationRequest,
  ChecklistSubmissionDTO,
  DOCUMENT_TYPE_OPTIONS,
  DOCUMENT_STATUS_MAP,
  FinOffer,
  FinRequest,
  FIN_REQUEST_STATUS_MAP,
  OFFER_STATUS_MAP,
  SUBMISSION_STATUS_MAP,
  StatusBadge,
  VaultDocumentDTO,
  documentTypeLabel,
  enumLabel,
  formatMoney,
  uploadFinancingImage,
} from './shared'
import { ConditionTypeBadge } from './shared'
import { FinancingWizard } from './financing-wizard'

type Tab = 'requests' | 'documents'

export function MyFinancingView() {
  const navigate = useMarketplace((s) => s.navigate)
  const params = useMarketplace((s) => s.params)
  const user = useMarketplace((s) => s.user)
  const authChecked = useMarketplace((s) => s.authChecked)

  const [tab, setTab] = useState<Tab>((params.myfinancingTab as Tab) || 'requests')
  if (params.myfinancingTab === 'documents' && tab !== 'documents') setTab('documents')
  if ((!params.myfinancingTab || params.myfinancingTab === 'requests') && tab !== 'requests') setTab('requests')

  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardServiceIds, setWizardServiceIds] = useState<string[]>([])

  const openWizard = (ids: string[] = []) => {
    if (!user) {
      toast({ title: 'Sign in first', description: 'Sign in to apply for financing or accreditation.' })
      return
    }
    setWizardServiceIds(ids)
    setWizardOpen(true)
  }

  if (!authChecked) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight sm:text-[1.55rem]">Financing & Accreditation</h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Your financing requests and accreditation programs — every application passes the platform verification gate
            before it reaches a financier.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="rounded-xl" onClick={() => navigate('financing')}>
            <Store size={15} className="mr-1.5" /> Browse services
          </Button>
          <Button className="rounded-xl" onClick={() => openWizard([])}>
            <HandCoins size={15} className="mr-1.5" /> Apply for financing
          </Button>
        </div>
      </div>

      {/* tabs */}
      <div className="flex gap-2 border-b pb-px" role="tablist" aria-label="Financing sections">
        {(
          [
            { key: 'requests', label: 'My requests', icon: ClipboardCheck },
            { key: 'documents', label: 'Documents center', icon: FileText },
          ] as const
        ).map((t) => {
          const active = tab === t.key
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => navigate('myfinancing', { myfinancingTab: t.key })}
              className={cn(
                'relative flex items-center gap-1.5 rounded-t-lg px-3.5 py-2 text-sm font-semibold transition-colors',
                active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <t.icon size={14} aria-hidden /> {t.label}
              {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />}
            </button>
          )
        })}
      </div>

      {tab === 'requests' ? (
        <RequestsTab onApply={() => openWizard([])} />
      ) : (
        <DocumentsCenterTab />
      )}

      {/* wizard */}
      {wizardOpen && (
        <FinancingWizard open onClose={() => setWizardOpen(false)} initialServiceIds={wizardServiceIds} />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Requests tab — financing + accreditation lists with multi-group siblings
// ═══════════════════════════════════════════════════════════════════════════

function RequestsTab({ onApply }: { onApply: () => void }) {
  const { data: finData, loading: finLoading, refetch: refetchFin } = useApi<{ requests: FinRequest[] }>(
    '/api/financing/requests'
  )
  const { data: accData, loading: accLoading, refetch: refetchAcc } = useApi<{ requests: AccreditationRequest[] }>(
    '/api/financing/accreditation'
  )

  const [openFinId, setOpenFinId] = useState<string | null>(null)
  const [openAccId, setOpenAccId] = useState<string | null>(null)

  const refresh = useCallback(() => {
    void refetchFin()
    void refetchAcc()
  }, [refetchFin, refetchAcc])

  const finRequests = finData?.requests ?? []
  const accRequests = accData?.requests ?? []

  // group financing rows: standalone rows + multiGroupId sibling groups
  const finGroups = useMemo(() => {
    const groups: { label: string | null; requests: FinRequest[] }[] = []
    const byGroup = new Map<string, FinRequest[]>()
    for (const r of finRequests) {
      if (r.multiGroupId) {
        const arr = byGroup.get(r.multiGroupId) ?? []
        arr.push(r)
        byGroup.set(r.multiGroupId, arr)
      } else {
        groups.push({ label: null, requests: [r] })
      }
    }
    for (const [gid, reqs] of byGroup) {
      groups.push({ label: gid, requests: reqs.sort((a, b) => a.createdAt.localeCompare(b.createdAt)) })
    }
    return groups.sort((a, b) => b.requests[0].createdAt.localeCompare(a.requests[0].createdAt))
  }, [finRequests])

  return (
    <div className="space-y-6">
      {/* Financing requests */}
      <section aria-label="Financing requests">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <Banknote size={14} className="text-primary" /> Financing requests
            <span className="rounded-full bg-muted px-2 py-px text-[10px] font-bold tabular-nums text-muted-foreground">
              {finRequests.length}
            </span>
          </h2>
        </div>

        {finLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : finRequests.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed bg-card px-6 py-10 text-center">
            <Banknote size={30} className="text-muted-foreground/40" />
            <p className="mt-2.5 text-sm font-semibold">No financing requests yet</p>
            <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
              Apply to a financier service — the wizard reuses your profile and verified documents.
            </p>
            <Button size="sm" className="mt-4 rounded-xl text-xs" onClick={onApply}>
              Apply for financing
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {finGroups.map((g) => (
              <div key={g.label ?? g.requests[0].id} className={cn(g.label && 'rounded-2xl border-2 border-primary/25 p-3')}>
                {g.label && (
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
                    <Layers size={12} aria-hidden /> Multi-financier application
                    <span className="font-normal normal-case text-muted-foreground">
                      — one sibling per financier, compare offers side-by-side
                    </span>
                  </p>
                )}
                <div className={cn('overflow-hidden rounded-xl border bg-card', g.label && 'border-0')}>
                  <ul className="divide-y">
                    {g.requests.map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => setOpenFinId(r.id)}
                          className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                        >
                          <span className="font-mono text-xs font-bold text-primary">{r.number}</span>
                          <StatusBadge status={r.status} map={FIN_REQUEST_STATUS_MAP} />
                          <span className="min-w-0 flex-1 truncate text-sm">{r.service?.name ?? '—'}</span>
                          <span className="hidden truncate text-xs text-muted-foreground sm:inline">
                            {r.service?.financierOrgName}
                          </span>
                          <span className="text-sm font-semibold tabular-nums">
                            {formatMoney(r.amountRequested, r.currency)}
                          </span>
                          <span className="w-20 shrink-0 text-right text-[11px] text-muted-foreground">
                            {r.submittedAt ? timeAgo(r.submittedAt) : 'draft'}
                          </span>
                          <ArrowRight size={13} className="shrink-0 text-muted-foreground" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Accreditation requests */}
      <section aria-label="Accreditation requests">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <BadgeCheck size={14} className="text-primary" /> Accreditation requests
            <span className="rounded-full bg-muted px-2 py-px text-[10px] font-bold tabular-nums text-muted-foreground">
              {accRequests.length}
            </span>
          </h2>
        </div>

        {accLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 1 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : accRequests.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed bg-card px-6 py-8 text-center">
            <BadgeCheck size={28} className="text-muted-foreground/40" />
            <p className="mt-2 text-sm font-semibold">No accreditation requests</p>
            <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
              Accreditation qualifies your organization with a financier — approved vendors receive RFQ invitations.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            <ul className="divide-y">
              {accRequests.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setOpenAccId(r.id)}
                    className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                  >
                    <span className="font-mono text-xs font-bold text-primary">{r.number}</span>
                    <StatusBadge status={r.status} map={ACCREDITATION_STATUS_MAP} />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {r.organizationName ?? 'Organization'} → {r.service?.name ?? '—'}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {r.status === 'ACCREDITED' && r.validUntil ? `valid until ${r.validUntil.slice(0, 10)}` : r.submittedAt ? timeAgo(r.submittedAt) : 'draft'}
                    </span>
                    <ArrowRight size={13} className="shrink-0 text-muted-foreground" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {openFinId && (
        <FinancingRequestDetail
          id={openFinId}
          onClose={() => {
            setOpenFinId(null)
            refresh()
          }}
        />
      )}
      {openAccId && (
        <AccreditationRequestDetail
          id={openAccId}
          onClose={() => {
            setOpenAccId(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Financing request detail — the full dossier
// ═══════════════════════════════════════════════════════════════════════════

interface FinRequestDetail extends FinRequest {
  checklist: ChecklistSubmissionDTO[]
  gate: { complete: boolean; blocking: number }
  offers: FinOffer[]
}

function FinancingRequestDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const [detail, setDetail] = useState<FinRequestDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await apiRequest<{ request: FinRequestDetail }>(`/api/financing/requests/${id}`)
    if (res.ok && res.data) setDetail(res.data.request)
    else toastApiError(res.error, 'Could not load the request')
    setLoading(false)
  }, [id])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await apiRequest<{ request: FinRequestDetail }>(`/api/financing/requests/${id}`)
      if (cancelled) return
      if (res.ok && res.data) setDetail(res.data.request)
      else toastApiError(res.error, 'Could not load the request')
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  const refresh = () => void load()

  const doAction = async (key: string, url: string, title: string) => {
    setBusy(key)
    const res = await apiRequest(url, { method: 'POST' })
    setBusy(null)
    if (!res.ok) {
      toastApiError(res.error, title)
      return
    }
    toast({ title })
    refresh()
  }

  const gateVerified = (detail?.checklist ?? []).filter(
    (c) => c.status === 'VERIFIED' || c.status === 'WAIVED'
  ).length
  const gateTotal = (detail?.checklist ?? []).filter((c) => c.requirement.isRequired).length

  return (
    <DetailDialog onClose={onClose}>
      {loading || !detail ? (
        <div className="space-y-3 p-5">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      ) : (
        <div className="space-y-5 p-5 sm:p-6">
          {/* header */}
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-base font-bold text-primary">{detail.number}</span>
            <StatusBadge status={detail.status} map={FIN_REQUEST_STATUS_MAP} />
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-primary">
              {formatMoney(detail.amountRequested, detail.currency)}
            </span>
            <span className="ml-auto text-xs text-muted-foreground">
              {detail.service?.name} · {detail.service?.financierOrgName}
            </span>
          </div>
          {detail.multiGroupId && (
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-primary">
              <Layers size={12} aria-hidden /> Part of a multi-financier application group
            </p>
          )}

          {/* RETURNED banner + fix CTA */}
          {detail.status === 'RETURNED_FOR_COMPLETION' && detail.returnedReason && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
              <p className="flex items-start gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
                <Undo2 size={15} className="mt-0.5 shrink-0" aria-hidden />
                Returned for completion — {formatDate(detail.returnedAt!)}
              </p>
              <p className="mt-1.5 pl-6 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
                {detail.returnedReason}
              </p>
              <Button
                size="sm"
                className="mt-3 rounded-lg text-xs"
                disabled={busy === 'resubmit'}
                onClick={() => void doAction('resubmit', `/api/financing/requests/${detail.id}/resubmit`, 'Resubmitted — back in the gate')}
              >
                {busy === 'resubmit' ? <Loader2 size={12} className="mr-1 animate-spin" /> : <Send size={12} className="mr-1" />}
                Fix & resubmit
              </Button>
            </div>
          )}

          {/* gate banner */}
          {['SUBMITTED', 'UNDER_PLATFORM_REVIEW'].includes(detail.status) && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-500/10 px-4 py-3">
              <p className="flex min-w-0 items-start gap-2 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
                <ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden />
                Platform verification in progress — {gateVerified}/{gateTotal} required items verified.
                {detail.gate.blocking > 0 && ` ${detail.gate.blocking} item${detail.gate.blocking === 1 ? '' : 's'} still blocking the forward.`}
              </p>
              {detail.status === 'SUBMITTED' && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 rounded-lg text-[11px] text-muted-foreground hover:text-destructive"
                  disabled={busy === 'cancel'}
                  onClick={() => void doAction('cancel', `/api/financing/requests/${detail.id}/cancel`, 'Request cancelled')}
                >
                  Cancel request
                </Button>
              )}
            </div>
          )}
          {detail.status === 'FORWARDED_TO_FINANCIER' && (
            <p className="flex items-start gap-2 rounded-xl bg-emerald-500/10 px-3.5 py-2.5 text-xs leading-relaxed text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 size={14} className="mt-0.5 shrink-0" aria-hidden />
              The platform gate verified every required item and forwarded this request on{' '}
              {formatDate(detail.forwardedAt!)} — awaiting the financier&apos;s offer.
            </p>
          )}

          {/* dossier */}
          <section aria-label="Request dossier">
            <h3 className="mb-2.5 text-sm font-semibold">Request dossier</h3>
            <div className="grid gap-x-6 gap-y-3.5 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
              <LabeledValue label="Amount requested">
                <span className="font-semibold tabular-nums">{formatMoney(detail.amountRequested, detail.currency)}</span>
              </LabeledValue>
              <LabeledValue label="Tenor requested">
                {detail.tenorRequestedMonths ? `${detail.tenorRequestedMonths} months` : '—'}
              </LabeledValue>
              <LabeledValue label="Target">{enumLabel(detail.targetType)}</LabeledValue>
              {detail.purpose && (
                <div className="sm:col-span-2 lg:col-span-3">
                  <LabeledValue label="Purpose">
                    <p className="whitespace-pre-line leading-relaxed">{detail.purpose}</p>
                  </LabeledValue>
                </div>
              )}
            </div>

            <div className="mt-3 grid gap-x-6 gap-y-3.5 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:col-span-2 lg:col-span-3">
                Activity
              </h4>
              <LabeledValue label="Activity">{enumLabel(detail.activityStatus)}</LabeledValue>
              <LabeledValue label="Category">{detail.activityCategoryOther ?? enumLabel(detail.activityCategory)}</LabeledValue>
              <LabeledValue label="Since">{detail.activityStartDate ? formatDate(detail.activityStartDate) : '—'}</LabeledValue>
              <LabeledValue label="Activity name">{detail.activityName ?? '—'}</LabeledValue>
              <LabeledValue label="Location">
                {[detail.activityCity, detail.activityDistrict].filter(Boolean).join(', ') || '—'}
              </LabeledValue>
              <LabeledValue label="Premises">{enumLabel(detail.activityLocationType)}</LabeledValue>
              {detail.activityDescription && (
                <div className="sm:col-span-2 lg:col-span-3">
                  <LabeledValue label="Description">
                    <p className="whitespace-pre-line leading-relaxed">{detail.activityDescription}</p>
                  </LabeledValue>
                </div>
              )}
            </div>

            <div className="mt-3 grid gap-x-6 gap-y-3.5 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:col-span-2 lg:col-span-4">
                Underwriting inputs
              </h4>
              <LabeledValue label="Capital">
                <span className="tabular-nums">{formatMoney(detail.capitalAmount, detail.currency)}</span>
              </LabeledValue>
              <LabeledValue label="Own contribution">
                <span className="tabular-nums">{formatMoney(detail.ownContributionAmount, detail.currency)}</span>
              </LabeledValue>
              <LabeledValue label="Monthly capacity">
                <span className="tabular-nums">{formatMoney(detail.monthlyInstallmentCapacity, detail.currency)}</span>
              </LabeledValue>
              <LabeledValue label="Previous financing">
                {detail.previousFinancing === null ? '—' : detail.previousFinancing ? 'Yes' : 'No'}
              </LabeledValue>
              <LabeledValue label="Guarantee offered">{enumLabel(detail.guaranteeType)}</LabeledValue>
              <LabeledValue label="Guarantee status">{enumLabel(detail.guaranteeStatus)}</LabeledValue>
              {detail.otherIncomeSources && (
                <div className="sm:col-span-2">
                  <LabeledValue label="Other income sources">{detail.otherIncomeSources}</LabeledValue>
                </div>
              )}
              {detail.applicantNotes && (
                <div className="sm:col-span-2 lg:col-span-4">
                  <LabeledValue label="Applicant notes">
                    <p className="whitespace-pre-line leading-relaxed">{detail.applicantNotes}</p>
                  </LabeledValue>
                </div>
              )}
            </div>
          </section>

          {/* THE CHECKLIST */}
          <section aria-label="Requirements checklist">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">
                Verification checklist
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {gateVerified}/{gateTotal} required verified
                </span>
              </h3>
            </div>
            <div className="space-y-2">
              {detail.checklist.length === 0 ? (
                <p className="rounded-xl border border-dashed px-4 py-5 text-center text-xs text-muted-foreground">
                  No checklist yet — it is composed when the request is submitted.
                </p>
              ) : (
                detail.checklist.map((c) => (
                  <ChecklistVerdictRow key={c.id} item={c} parentStatus={detail.status} onChanged={refresh} />
                ))
              )}
            </div>
          </section>

          {/* Offers */}
          <section aria-label="Offers">
            <h3 className="mb-2.5 text-sm font-semibold">
              Offers
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {detail.offers.length} on this request
              </span>
            </h3>
            <div className="space-y-2">
              {detail.offers.length === 0 ? (
                <p className="rounded-xl border border-dashed px-4 py-5 text-center text-xs text-muted-foreground">
                  No offers yet — offers appear after the platform gate forwards your request to the financier.
                </p>
              ) : (
                detail.offers.map((o) => (
                  <OfferRow key={o.id} offer={o} onChanged={refresh} busy={busy} setBusy={setBusy} />
                ))
              )}
            </div>
          </section>

          {/* timeline */}
          <section aria-label="Timeline">
            <h3 className="mb-2.5 text-sm font-semibold">Timeline</h3>
            <ol className="space-y-0 rounded-xl border bg-card p-4">
              {[
                { label: 'Created', at: detail.createdAt },
                { label: 'Submitted to the gate', at: detail.submittedAt },
                { label: 'Platform review started', at: detail.platformReviewedAt },
                { label: 'Returned for completion', at: detail.returnedAt },
                { label: 'Forwarded to financier', at: detail.forwardedAt },
                { label: 'Closed', at: detail.closedAt },
              ]
                .filter((t) => t.at)
                .map((t, i, arr) => (
                  <li key={t.label} className="flex gap-3">
                    <span className="relative flex flex-col items-center">
                      <span className={cn('mt-1 h-2 w-2 rounded-full', i === arr.length - 1 ? 'bg-primary' : 'bg-muted-foreground/40')} />
                      {i < arr.length - 1 && <span className="w-px flex-1 bg-border" />}
                    </span>
                    <span className="flex min-w-0 flex-1 items-baseline justify-between gap-3 pb-3">
                      <span className="text-sm">{t.label}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatDate(t.at!)}</span>
                    </span>
                  </li>
                ))}
            </ol>
          </section>
        </div>
      )}
    </DetailDialog>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Checklist verdict row — status + decisionNote + supply form when editable
// ═══════════════════════════════════════════════════════════════════════════

function ChecklistVerdictRow({
  item,
  parentStatus,
  onChanged,
}: {
  item: ChecklistSubmissionDTO
  parentStatus: string
  onChanged: () => void
}) {
  const t = item.requirement.template
  const [supplying, setSupplying] = useState(false)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<{ text: string; number: string; date: string; docId: string }>({
    text: '',
    number: '',
    date: '',
    docId: '',
  })
  const { data: vault } = useApi<{ documents: VaultDocumentDTO[] }>(supplying ? '/api/financing/documents' : null, {
    skip: !supplying,
  })

  // the applicant may supply items while the request sits in the gate (or was returned)
  const canSupply =
    ['PENDING', 'REJECTED'].includes(item.status) &&
    ['SUBMITTED', 'UNDER_PLATFORM_REVIEW', 'RETURNED_FOR_COMPLETION'].includes(parentStatus)

  const supply = async () => {
    setBusy(true)
    const body: Record<string, unknown> = {}
    if (t.conditionType === 'DOCUMENT') body.accountDocumentId = draft.docId
    else if (t.conditionType === 'NUMBER') body.valueNumber = Number(draft.number)
    else if (t.conditionType === 'DATE') body.valueDate = draft.date
    else body.valueText = draft.text
    const res = await apiRequest(`/api/financing/submissions/${item.id}/supply`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    setBusy(false)
    if (!res.ok) {
      toastApiError(res.error, 'Could not supply the item')
      return
    }
    toast({ title: 'Item supplied', description: 'It is now awaiting platform verification.' })
    setSupplying(false)
    onChanged()
  }

  const usableDocs = (vault?.documents ?? []).filter(
    (d) => d.isActive && (!t.documentType || d.documentType === t.documentType)
  )

  return (
    <div
      className={cn(
        'rounded-xl border bg-card p-3.5',
        item.status === 'REJECTED' && 'border-destructive/50 bg-destructive/[0.04]'
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <ConditionTypeBadge type={t.conditionType} />
        <span className="min-w-0 flex-1 text-sm font-medium">{t.title}</span>
        <StatusBadge status={item.status} map={SUBMISSION_STATUS_MAP} />
        {!item.requirement.isRequired && (
          <span className="rounded-full bg-muted px-2 py-px text-[10px] font-bold uppercase text-muted-foreground">
            Optional
          </span>
        )}
      </div>

      {item.requirement.instructions && (
        <p className="mt-1 rounded-lg bg-muted/60 px-2.5 py-1.5 text-[11px] leading-relaxed">
          {item.requirement.instructions}
        </p>
      )}

      {/* decision note */}
      {item.decisionNote && (
        <p
          className={cn(
            'mt-1.5 rounded-lg px-3 py-2 text-xs leading-relaxed',
            item.status === 'REJECTED'
              ? 'bg-destructive/10 text-destructive'
              : item.status === 'VERIFIED'
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                : 'bg-muted text-muted-foreground'
          )}
        >
          <span className="font-semibold">Platform note: </span>
          {item.decisionNote}
        </p>
      )}

      {/* supplied value summary */}
      {item.status !== 'PENDING' && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {t.conditionType === 'DOCUMENT' && item.accountDocument && (
            <>
              Attached: <span className="font-medium text-foreground">{item.accountDocument.title ?? 'Document'}</span>
              {item.submittedAt ? ` · supplied ${timeAgo(item.submittedAt)}` : ''}
            </>
          )}
          {t.conditionType === 'NUMBER' && item.valueNumber !== null && <>Answer: {item.valueNumber}</>}
          {t.conditionType === 'DATE' && item.valueDate && <>Date: {formatDate(item.valueDate)}</>}
          {['TEXT', 'SELECT', 'MULTI_SELECT', 'DECLARATION'].includes(t.conditionType) && item.valueText && (
            <>Answer: {item.valueText.replaceAll(';', ', ')}</>
          )}
          {t.conditionType === 'PROFILE_FIELD' && <>Auto-checked from your profile</>}
          {item.verifiedByName && item.verifiedAt && (
            <span className="ml-2">· verified by {item.verifiedByName} {timeAgo(item.verifiedAt)}</span>
          )}
        </p>
      )}

      {/* supply / fix CTA */}
      {canSupply && !supplying && (
        <Button size="sm" variant="outline" className="mt-2 h-8 rounded-lg text-xs" onClick={() => setSupplying(true)}>
          {item.status === 'REJECTED' ? (
            <>
              <RefreshCcw size={12} className="mr-1" /> Fix this item
            </>
          ) : (
            <>
              <FileUp size={12} className="mr-1" /> Supply
            </>
          )}
        </Button>
      )}

      {/* the supply form */}
      {supplying && (
        <div className="mt-2.5 space-y-2 rounded-lg border bg-muted/30 p-3">
          {t.conditionType === 'DOCUMENT' ? (
            usableDocs.length > 0 ? (
              <div className="space-y-1.5">
                {usableDocs.map((d) => (
                  <label
                    key={d.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg border bg-card px-3 py-2 text-xs has-[button[data-state=checked]]:border-primary"
                  >
                    <input
                      type="radio"
                      name={`sup-${item.id}`}
                      className="accent-primary"
                      checked={draft.docId === d.id}
                      onChange={() => setDraft((s) => ({ ...s, docId: d.id }))}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {d.title ?? d.media.originalName}{' '}
                      <span className="text-muted-foreground">({documentTypeLabel(d.documentType)})</span>
                    </span>
                    <StatusBadge status={d.status} map={DOCUMENT_STATUS_MAP} />
                  </label>
                ))}
                <p className="text-[11px] text-muted-foreground">
                  Need a fresh document? Upload it in the{' '}
                  <span className="font-semibold">Documents center</span> tab, then pick it here.
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No {t.documentType ? documentTypeLabel(t.documentType).toLowerCase() : ''} document in your vault — upload
                one in the Documents center tab, then come back.
              </p>
            )
          ) : t.conditionType === 'PROFILE_FIELD' ? (
            <p className="text-xs text-muted-foreground">Checked automatically — complete your profile if it fails.</p>
          ) : t.conditionType === 'DECLARATION' ? (
            <label className="flex cursor-pointer items-center gap-2.5 text-xs">
              <Checkbox checked={draft.text === 'ACCEPTED'} onCheckedChange={(v) => setDraft((s) => ({ ...s, text: v === true ? 'ACCEPTED' : '' }))} />
              I confirm this declaration.
            </label>
          ) : t.conditionType === 'NUMBER' ? (
            <Input
              type="number"
              className="rounded-lg sm:max-w-48"
              min={t.validationMin ?? undefined}
              max={t.validationMax ?? undefined}
              value={draft.number}
              onChange={(e) => setDraft((s) => ({ ...s, number: e.target.value }))}
              placeholder="Number"
            />
          ) : t.conditionType === 'DATE' ? (
            <Input type="date" className="rounded-lg sm:max-w-48" value={draft.date} onChange={(e) => setDraft((s) => ({ ...s, date: e.target.value }))} />
          ) : t.conditionType === 'SELECT' ? (
            <RadioGroup value={draft.text} onValueChange={(v) => setDraft((s) => ({ ...s, text: v }))} className="grid gap-1.5 sm:grid-cols-2">
              {t.options.map((o) => (
                <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs has-[button[data-state=checked]]:border-primary">
                  <RadioGroupItem value={o.value} /> {o.value}
                </label>
              ))}
            </RadioGroup>
          ) : t.conditionType === 'MULTI_SELECT' ? (
            <div className="grid gap-1.5 sm:grid-cols-2">
              {t.options.map((o) => {
                const parts = draft.text.split(';').filter(Boolean)
                const checked = parts.includes(o.value)
                return (
                  <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs has-[button[data-state=checked]]:border-primary">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => {
                        const next = v === true ? [...parts, o.value] : parts.filter((p) => p !== o.value)
                        setDraft((s) => ({ ...s, text: next.join(';') }))
                      }}
                      aria-label={o.value}
                    />
                    {o.value}
                  </label>
                )
              })}
            </div>
          ) : (
            <Textarea
              className="min-h-14 rounded-lg text-sm"
              value={draft.text}
              onChange={(e) => setDraft((s) => ({ ...s, text: e.target.value }))}
              placeholder="Your answer"
              maxLength={500}
            />
          )}
          <div className="flex gap-2">
            <Button size="sm" className="h-8 rounded-lg text-xs" disabled={busy} onClick={() => void supply()}>
              {busy ? <Loader2 size={12} className="mr-1 animate-spin" /> : null} Submit item
            </Button>
            <Button size="sm" variant="ghost" className="h-8 rounded-lg text-xs" onClick={() => setSupplying(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Offer row — compare + accept/decline with validity countdown
// ═══════════════════════════════════════════════════════════════════════════

function OfferRow({
  offer,
  onChanged,
  busy,
  setBusy,
}: {
  offer: FinOffer
  onChanged: () => void
  busy: string | null
  setBusy: (v: string | null) => void
}) {
  const act = async (key: string, url: string, title: string) => {
    setBusy(key)
    const res = await apiRequest(url, { method: 'POST' })
    setBusy(null)
    if (!res.ok) {
      toastApiError(res.error, title)
      return
    }
    toast({ title })
    onChanged()
  }

  const valid = offer.validUntil ? new Date(offer.validUntil).getTime() - Date.now() : null
  const urgent = valid !== null && valid < 48 * 3_600_000 && valid > 0

  return (
    <div className="space-y-2.5 rounded-xl border bg-card p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={offer.status} map={OFFER_STATUS_MAP} />
          <span className="text-sm font-bold tabular-nums">{formatMoney(offer.amount, offer.currency)}</span>
          <span className="text-xs text-muted-foreground">
            {offer.rateType ? `${enumLabel(offer.rateType)}${offer.ratePercent !== null ? ` · ${offer.ratePercent}%` : ''}` : ''}
            {offer.feeFlat !== null ? ` · fee ${formatMoney(offer.feeFlat, offer.currency)}` : ''}
          </span>
        </div>
        {offer.status === 'SENT' && (
          <div className="flex gap-1.5">
            <Button
              size="sm"
              className="h-8 rounded-lg text-xs"
              disabled={busy === `accept-${offer.id}`}
              onClick={() => void act(`accept-${offer.id}`, `/api/financing/offers/${offer.id}/accept`, 'Offer accepted — agreement created')}
            >
              {busy === `accept-${offer.id}` ? <Loader2 size={12} className="mr-1 animate-spin" /> : <CheckCircle2 size={12} className="mr-1" />}
              Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 rounded-lg text-xs text-muted-foreground hover:text-destructive"
              disabled={busy === `decline-${offer.id}`}
              onClick={() => void act(`decline-${offer.id}`, `/api/financing/offers/${offer.id}/decline`, 'Offer declined')}
            >
              Decline
            </Button>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4">
        <span className="flex items-center gap-1">
          <Clock size={11} aria-hidden /> {offer.tenorMonths} mo
        </span>
        <span className={cn(urgent && 'font-semibold text-amber-600 dark:text-amber-400')}>
          {offer.validUntil ? `valid until ${formatDate(offer.validUntil)}` : 'no expiry'}
        </span>
        <span>Collateral {enumLabel(offer.collateralRequired)}</span>
        <span>
          {offer.installments.length} installment{offer.installments.length === 1 ? '' : 's'}
        </span>
      </div>
      {offer.notes && <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs leading-relaxed">{offer.notes}</p>}
      {offer.installments.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Installment schedule</summary>
          <div className="mt-1.5 space-y-1">
            {offer.installments.map((inst) => (
              <div key={inst.id} className="flex justify-between rounded-lg bg-muted/40 px-3 py-1.5">
                <span>
                  #{inst.installmentNo} · {formatDate(inst.dueDate)}
                </span>
                <span className="font-semibold tabular-nums">{formatMoney(inst.amount, offer.currency)}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Accreditation request detail
// ═══════════════════════════════════════════════════════════════════════════

interface AccRequestDetail extends AccreditationRequest {
  checklist: ChecklistSubmissionDTO[]
  gate: { complete: boolean; blocking: number }
}

function AccreditationRequestDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const [detail, setDetail] = useState<AccRequestDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await apiRequest<{ request: AccRequestDetail }>(`/api/financing/accreditation/${id}`)
    if (res.ok && res.data) setDetail(res.data.request)
    else toastApiError(res.error, 'Could not load the request')
    setLoading(false)
  }, [id])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await apiRequest<{ request: AccRequestDetail }>(`/api/financing/accreditation/${id}`)
      if (cancelled) return
      if (res.ok && res.data) setDetail(res.data.request)
      else toastApiError(res.error, 'Could not load the request')
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  const doAction = async (key: string, url: string, title: string) => {
    setBusy(key)
    const res = await apiRequest(url, { method: 'POST' })
    setBusy(null)
    if (!res.ok) {
      toastApiError(res.error, title)
      return
    }
    toast({ title })
    void load()
  }

  const gateVerified = (detail?.checklist ?? []).filter((c) => c.status === 'VERIFIED' || c.status === 'WAIVED').length
  const gateTotal = (detail?.checklist ?? []).filter((c) => c.requirement.isRequired).length

  return (
    <DetailDialog onClose={onClose}>
      {loading || !detail ? (
        <div className="space-y-3 p-5">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      ) : (
        <div className="space-y-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-base font-bold text-primary">{detail.number}</span>
            <StatusBadge status={detail.status} map={ACCREDITATION_STATUS_MAP} />
            <span className="ml-auto text-xs text-muted-foreground">
              {detail.service?.name} · {detail.service?.financierOrgName}
            </span>
          </div>

          <div className="grid gap-x-6 gap-y-3.5 rounded-xl border bg-card p-4 sm:grid-cols-2">
            <LabeledValue label="Organization">{detail.organizationName ?? '—'}</LabeledValue>
            <LabeledValue label="Submitted">{detail.submittedAt ? formatDate(detail.submittedAt) : '—'}</LabeledValue>
            {detail.scopeNotes && (
              <div className="sm:col-span-2">
                <LabeledValue label="Scope notes">
                  <p className="whitespace-pre-line leading-relaxed">{detail.scopeNotes}</p>
                </LabeledValue>
              </div>
            )}
            {detail.validUntil && detail.status === 'ACCREDITED' && (
              <div className="sm:col-span-2">
                <LabeledValue label="Accreditation valid until">
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">{formatDate(detail.validUntil)}</span>
                </LabeledValue>
              </div>
            )}
            {detail.decisionNote && (
              <div className="sm:col-span-2">
                <LabeledValue label="Financier decision note">{detail.decisionNote}</LabeledValue>
              </div>
            )}
            {detail.revocationReason && (
              <div className="sm:col-span-2">
                <LabeledValue label="Revocation reason">{detail.revocationReason}</LabeledValue>
              </div>
            )}
          </div>

          {detail.status === 'RETURNED_FOR_COMPLETION' && detail.returnedReason && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
              <p className="flex items-start gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
                <Undo2 size={15} className="mt-0.5 shrink-0" aria-hidden />
                Returned for completion — {formatDate(detail.returnedAt!)}
              </p>
              <p className="mt-1.5 pl-6 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
                {detail.returnedReason}
              </p>
              <Button
                size="sm"
                className="mt-3 rounded-lg text-xs"
                disabled={busy === 'resubmit'}
                onClick={() => void doAction('resubmit', `/api/financing/accreditation/${detail.id}/resubmit`, 'Resubmitted — back in the gate')}
              >
                {busy === 'resubmit' ? <Loader2 size={12} className="mr-1 animate-spin" /> : <Send size={12} className="mr-1" />}
                Fix & resubmit
              </Button>
            </div>
          )}

          {['SUBMITTED', 'UNDER_PLATFORM_REVIEW'].includes(detail.status) && (
            <p className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3.5 py-2.5 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
              <ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden />
              Platform verification in progress — {gateVerified}/{gateTotal} required items verified.
            </p>
          )}
          {detail.status === 'FORWARDED_TO_FINANCIER' && (
            <p className="flex items-start gap-2 rounded-xl bg-emerald-500/10 px-3.5 py-2.5 text-xs leading-relaxed text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 size={14} className="mt-0.5 shrink-0" aria-hidden />
              The platform gate verified this application and forwarded it on {formatDate(detail.forwardedAt!)} — awaiting
              the financier&apos;s decision.
            </p>
          )}

          {/* checklist */}
          <section aria-label="Requirements checklist">
            <h3 className="mb-2.5 text-sm font-semibold">
              Verification checklist
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {gateVerified}/{gateTotal} required verified
              </span>
            </h3>
            <div className="space-y-2">
              {detail.checklist.length === 0 ? (
                <p className="rounded-xl border border-dashed px-4 py-5 text-center text-xs text-muted-foreground">
                  No checklist yet — it is composed when the request is submitted.
                </p>
              ) : (
                detail.checklist.map((c) => (
                  <ChecklistVerdictRow key={c.id} item={c} parentStatus={detail.status} onChanged={() => void load()} />
                ))
              )}
            </div>
          </section>

          {/* timeline */}
          <section aria-label="Timeline">
            <h3 className="mb-2.5 text-sm font-semibold">Timeline</h3>
            <ol className="space-y-0 rounded-xl border bg-card p-4">
              {[
                { label: 'Created', at: detail.createdAt },
                { label: 'Submitted to the gate', at: detail.submittedAt },
                { label: 'Platform review started', at: detail.platformReviewedAt },
                { label: 'Returned for completion', at: detail.returnedAt },
                { label: 'Forwarded to financier', at: detail.forwardedAt },
                { label: 'Decision', at: detail.decidedAt },
                { label: 'Accredited', at: detail.accreditedAt },
                { label: 'Revoked', at: detail.revokedAt },
              ]
                .filter((t) => t.at)
                .map((t, i, arr) => (
                  <li key={t.label} className="flex gap-3">
                    <span className="relative flex flex-col items-center">
                      <span className={cn('mt-1 h-2 w-2 rounded-full', i === arr.length - 1 ? 'bg-primary' : 'bg-muted-foreground/40')} />
                      {i < arr.length - 1 && <span className="w-px flex-1 bg-border" />}
                    </span>
                    <span className="flex min-w-0 flex-1 items-baseline justify-between gap-3 pb-3">
                      <span className="text-sm">{t.label}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatDate(t.at!)}</span>
                    </span>
                  </li>
                ))}
            </ol>
          </section>
        </div>
      )}
    </DetailDialog>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Documents center tab — the DP-27 vault
// ═══════════════════════════════════════════════════════════════════════════

function DocumentsCenterTab() {
  const [showReplaced, setShowReplaced] = useState(false)
  const { data, loading, refetch } = useApi<{ documents: VaultDocumentDTO[] }>(
    `/api/financing/documents${showReplaced ? '?includeInactive=true' : ''}`
  )
  const [uploadOpen, setUploadOpen] = useState(false)

  const documents = data?.documents ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FileText size={18} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Document vault</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Upload once — the platform verifies each document once and every application reuses it.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={showReplaced} onCheckedChange={setShowReplaced} aria-label="Show replaced documents" />
            Show replaced
          </label>
          <Button className="rounded-xl" onClick={() => setUploadOpen(true)}>
            <FileUp size={15} className="mr-1.5" /> Upload document
          </Button>
        </div>
      </div>

      {loading && documents.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : documents.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed bg-card px-6 py-12 text-center">
          <FileText size={30} className="text-muted-foreground/40" />
          <p className="mt-2.5 text-sm font-semibold">Your vault is empty</p>
          <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
            Upload your ID, commercial registration, tax card or bank statements — they are reused by every financing
            application.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <ul className="divide-y">
            {documents.map((d) => (
              <VaultRow key={d.id} doc={d} onChanged={() => void refetch()} />
            ))}
          </ul>
        </div>
      )}

      {uploadOpen && <UploadDocumentDialog onClose={() => setUploadOpen(false)} onDone={() => void refetch()} />}
    </div>
  )
}

function VaultRow({ doc, onChanged }: { doc: VaultDocumentDTO; onChanged: () => void }) {
  const [replacing, setReplacing] = useState(false)
  return (
    <li className={cn('flex flex-wrap items-center gap-3 px-4 py-3.5', !doc.isActive && 'bg-muted/30 opacity-70')}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <FileText size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium">{doc.title ?? doc.media.originalName}</p>
          <Badge>{documentTypeLabel(doc.documentType)}</Badge>
          <StatusBadge status={doc.status} map={DOCUMENT_STATUS_MAP} />
          {!doc.isActive && (
            <span className="rounded-full bg-muted px-2 py-px text-[10px] font-bold uppercase text-muted-foreground">
              Replaced
            </span>
          )}
          {doc.organizationName && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Building2 size={11} aria-hidden /> {doc.organizationName}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {doc.media.originalName} · {Math.max(1, Math.round(doc.media.size / 1024))} KB
          {doc.issuedAt ? ` · issued ${formatDate(doc.issuedAt)}` : ''}
          {doc.expiresAt ? ` · expires ${formatDate(doc.expiresAt)}` : ''}
          {doc.reviewedAt ? ` · reviewed ${timeAgo(doc.reviewedAt)}` : ''}
        </p>
        {doc.note && (
          <p
            className={cn(
              'mt-1 rounded-lg px-2.5 py-1.5 text-[11px] leading-relaxed',
              doc.status === 'REJECTED' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'
            )}
          >
            {doc.note}
          </p>
        )}
      </div>
      {doc.isActive && (
        <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs" disabled={replacing} onClick={() => setReplacing(true)}>
          <RefreshCcw size={12} className="mr-1" /> Replace
        </Button>
      )}
      {replacing && (
        <ReplaceDocumentDialog
          doc={doc}
          onClose={() => setReplacing(false)}
          onDone={() => {
            setReplacing(false)
            onChanged()
          }}
        />
      )}
    </li>
  )
}

function ReplaceDocumentDialog({ doc, onClose, onDone }: { doc: VaultDocumentDTO; onClose: () => void; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const replace = async (file: File) => {
    setBusy(true)
    try {
      const asset = await uploadFinancingImage(file)
      if (!asset) return
      const res = await apiRequest(`/api/financing/documents/${doc.id}/replace`, {
        method: 'POST',
        body: JSON.stringify({ mediaId: asset.id, title: file.name }),
      })
      if (!res.ok) {
        toastApiError(res.error, 'Could not replace the document')
        return
      }
      toast({
        title: 'Document replaced',
        description: 'The new version enters verification as PENDING — the old one is kept as history.',
      })
      onDone()
    } catch (err) {
      toast({ title: 'Upload failed', description: err instanceof Error ? err.message : 'Unexpected error', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <DetailDialog onClose={onClose}>
      <div className="space-y-4 p-5">
        <div>
          <h3 className="text-sm font-bold">Replace document</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Replacing <span className="font-semibold text-foreground">{doc.title ?? doc.media.originalName}</span> (
            {documentTypeLabel(doc.documentType)}). The old version stays in your history (inactive) and the new one
            goes through verification again.
          </p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void replace(f)
          }}
          aria-label="Choose replacement file"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-8 text-center transition-colors hover:border-primary/50 hover:bg-primary/[0.03] disabled:opacity-60"
        >
          {busy ? (
            <Loader2 size={20} className="animate-spin text-primary" />
          ) : (
            <FileUp size={20} className="text-muted-foreground/60" />
          )}
          <span className="text-xs font-semibold">{busy ? 'Uploading…' : 'Choose the new file'}</span>
          <span className="text-[11px] text-muted-foreground">Images up to 8 MB (JPEG, PNG, WebP, GIF)</span>
        </button>
      </div>
    </DetailDialog>
  )
}

function UploadDocumentDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [documentType, setDocumentType] = useState('NATIONAL_ID')
  const [title, setTitle] = useState('')
  const [issuedAt, setIssuedAt] = useState('')
  const [busy, setBusy] = useState(false)

  const upload = async () => {
    if (!file) return
    setBusy(true)
    try {
      const asset = await uploadFinancingImage(file)
      if (!asset) return
      const res = await apiRequest<{ document: VaultDocumentDTO }>('/api/financing/documents', {
        method: 'POST',
        body: JSON.stringify({
          mediaId: asset.id,
          documentType,
          title: title.trim() || file.name,
          issuedAt: issuedAt || null,
        }),
      })
      if (!res.ok) {
        toastApiError(res.error, 'Could not file the document')
        return
      }
      toast({ title: 'Document filed', description: 'It enters the vault as PENDING until the platform verifies it.' })
      onDone()
      onClose()
    } catch (err) {
      toast({ title: 'Upload failed', description: err instanceof Error ? err.message : 'Unexpected error', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <DetailDialog onClose={onClose}>
      <div className="space-y-4 p-5">
        <div>
          <h3 className="text-sm font-bold">Upload a document</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Filed into your vault as PENDING — the platform verifies it once, then every application reuses it.
          </p>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            setFile(f ?? null)
            if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ''))
          }}
          aria-label="Choose file"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-center transition-colors hover:border-primary/50 hover:bg-primary/[0.03]"
        >
          {file ? (
            <>
              <CheckCircle2 size={20} className="text-primary" />
              <span className="truncate text-xs font-semibold">{file.name}</span>
              <span className="text-[11px] text-muted-foreground">{Math.max(1, Math.round(file.size / 1024))} KB — click to change</span>
            </>
          ) : (
            <>
              <FileUp size={20} className="text-muted-foreground/60" />
              <span className="text-xs font-semibold">Choose a file</span>
              <span className="text-[11px] text-muted-foreground">Images up to 8 MB (JPEG, PNG, WebP, GIF)</span>
            </>
          )}
        </button>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="d-type">Document type</Label>
            <Select value={documentType} onValueChange={setDocumentType}>
              <SelectTrigger id="d-type" className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="d-issued">Issued on</Label>
            <Input id="d-issued" type="date" className="rounded-xl" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="d-title">Title</Label>
            <Input
              id="d-title"
              className="rounded-xl"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Commercial registration 2026"
              maxLength={160}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" className="rounded-xl" onClick={onClose}>
            Cancel
          </Button>
          <Button className="rounded-xl" disabled={!file || busy} onClick={() => void upload()}>
            {busy ? (
              <>
                <Loader2 size={14} className="mr-1.5 animate-spin" /> Uploading…
              </>
            ) : (
              'File document'
            )}
          </Button>
        </div>
      </div>
    </DetailDialog>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Shared detail dialog shell
// ═══════════════════════════════════════════════════════════════════════════

function DetailDialog({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative flex max-h-[95vh] w-full flex-col overflow-hidden rounded-t-2xl bg-background shadow-2xl sm:max-h-[92vh] sm:max-w-3xl sm:rounded-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X size={15} />
        </button>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
