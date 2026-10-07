'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FINANCING · MY REQUESTS (W-MY-REQ) — cards with the status timeline, the
// multiGroup comparison view (W-MULTI-COMPARE), the gate-aware request detail
// with per-item verdicts + RETURNED resupply, offers with installment schedules
// and accept/decline actions.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  CircleDollarSign,
  Clock3,
  Crown,
  Eye,
  FileText,
  HandCoins,
  Hourglass,
  Inbox,
  Landmark,
  ListChecks,
  RefreshCw,
  Send,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import type {
  FinancingOfferDTO,
  FinancingRequestDetailDTO,
  FinancingRequestSummaryDTO,
  RequirementSubmissionDTO,
} from '@/lib/types'
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
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
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
  LabeledValue,
  OFFER_STATUS_MAP,
  RATE_TYPE_LABELS,
  ScopeBadge,
  StatusBadge,
  StatusStepper,
  SUBMISSION_STATUS_MAP,
  timeAgo,
  toastApiError,
} from '@/components/marketplace/financing/financing-shared'

const FIN_TIMELINE = [
  { key: 'DRAFT', label: 'Draft' },
  { key: 'SUBMITTED', label: 'Submitted' },
  { key: 'UNDER_PLATFORM_REVIEW', label: 'Platform gate' },
  { key: 'FORWARDED_TO_FINANCIER', label: 'Forwarded' },
  { key: 'UNDER_FINANCIER_REVIEW', label: 'Financier review' },
  { key: 'OFFERED', label: 'Offered' },
  { key: 'ACCEPTED', label: 'Accepted' },
]

const STATUS_INDEX: Record<string, number> = {
  DRAFT: 0,
  SUBMITTED: 1,
  UNDER_PLATFORM_REVIEW: 2,
  RETURNED_FOR_COMPLETION: 2,
  FORWARDED_TO_FINANCIER: 3,
  UNDER_FINANCIER_REVIEW: 4,
  OFFERED: 5,
  ACCEPTED: 6,
  DECLINED: 6,
  CANCELLED: 6,
  EXPIRED: 6,
}

// ── Section ──────────────────────────────────────────────────────────────────

export function RequestsSection({ initialRequestId }: { initialRequestId?: string }) {
  const { data, loading, error, refetch } = useApi<{
    requests: FinancingRequestSummaryDTO[]
    groups: { multiGroupId: string; requests: FinancingRequestSummaryDTO[] }[]
  }>('/api/financing/requests')
  const [openId, setOpenId] = useState<string | null>(initialRequestId ?? null)
  // Phase 5 — side-by-side sibling comparison (W-MULTI-COMPARE for real)
  const [compareGroup, setCompareGroup] = useState<string | null>(null)

  // Deep link / parent handoff: follow the initialRequestId prop (React's
  // documented adjust-state-when-props-change pattern — no effect needed).
  const [prevInitial, setPrevInitial] = useState<string | null>(initialRequestId ?? null)
  if ((initialRequestId ?? null) !== prevInitial) {
    setPrevInitial(initialRequestId ?? null)
    setOpenId(initialRequestId ?? null)
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    )
  }
  if (error) {
    return (
      <EmptyState icon={Inbox} title="Could not load your requests" description={error}>
        <Button variant="outline" className="rounded-xl" onClick={() => void refetch()}>
          Retry
        </Button>
      </EmptyState>
    )
  }

  if (openId) {
    return (
      <RequestDetail
        requestId={openId}
        onBack={() => {
          setOpenId(null)
          void refetch()
        }}
      />
    )
  }

  const requests = data?.requests ?? []
  const groups = data?.groups ?? []
  const compareGroupData = compareGroup ? groups.find((g) => g.multiGroupId === compareGroup) : null

  const active = requests.filter((r) => !['ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED'].includes(r.status))
  const inGate = requests.filter((r) => ['SUBMITTED', 'UNDER_PLATFORM_REVIEW', 'RETURNED_FOR_COMPLETION'].includes(r.status))
  const offered = requests.filter((r) => r.status === 'OFFERED')
  const accepted = requests.filter((r) => r.status === 'ACCEPTED')

  const stats = [
    { label: 'Active applications', value: active.length, icon: Hourglass },
    { label: 'In platform gate', value: inGate.length, icon: ShieldCheck },
    { label: 'With offers', value: offered.length, icon: HandCoins },
    { label: 'Accepted', value: accepted.length, icon: CheckCircle2 },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <s.icon size={14} className="text-primary" />
              <span className="text-[11px] font-semibold uppercase tracking-wide">{s.label}</span>
            </div>
            <p className="mt-1.5 text-2xl font-bold">{s.value}</p>
          </div>
        ))}
      </div>

      {groups.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold">Multi-financier groups</h3>
          {groups.map((g) => (
            <Card key={g.multiGroupId}>
              <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs font-bold">{g.multiGroupId}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {g.requests.length} sibling request{g.requests.length === 1 ? '' : 's'} — one per financier
                    </p>
                  </div>
                  <Button variant="outline" size="sm" className="h-10 rounded-xl" onClick={() => setCompareGroup(g.multiGroupId)}>
                    <ListChecks size={13} className="mr-1.5" /> Compare offers
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {g.requests.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setOpenId(r.id)}
                      className="flex items-center gap-2 rounded-xl border bg-muted/20 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/50"
                    >
                      <Landmark size={12} className="text-primary" />
                      <span className="min-w-0">
                        <span className="block font-bold">{r.financierOrgName}</span>
                        <span className="block text-muted-foreground">{r.number}</span>
                      </span>
                      <StatusBadge status={r.status} map={FIN_REQUEST_STATUS_MAP} />
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {requests.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No financing applications yet"
          description="Browse financing services and apply — your profile and document vault make every following application faster."
        />
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <motion.div key={r.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
              <RequestCard request={r} onOpen={() => setOpenId(r.id)} />
            </motion.div>
          ))}
        </div>
      )}

      {/* Phase 5 — side-by-side sibling offers comparison */}
      <SiblingCompareDialog
        group={compareGroupData ?? null}
        onClose={() => setCompareGroup(null)}
        onPick={(requestId) => {
          setCompareGroup(null)
          setOpenId(requestId)
        }}
      />
    </div>
  )
}

// ── Phase 5: side-by-side multi-financier offers comparison (DP-25 surface) ──

function SiblingCompareDialog({
  group,
  onClose,
  onPick,
}: {
  group: { multiGroupId: string; requests: FinancingRequestSummaryDTO[] } | null
  onClose: () => void
  onPick: (requestId: string) => void
}) {
  const siblings = group?.requests ?? []
  // The "best" column: lowest installment total among SENT offers.
  const bestOfferId = useMemo(() => {
    const totals = siblings
      .map((r) => r.bestOffer)
      .filter((o): o is NonNullable<FinancingRequestSummaryDTO['bestOffer']> => !!o && (o.installmentTotal ?? Infinity) > 0)
    if (totals.length < 2) return null
    return totals.reduce((best, o) => ((o.installmentTotal ?? Infinity) < (best.installmentTotal ?? Infinity) ? o : best)).id
  }, [siblings])

  if (!group) return null

  const rows: { label: string; render: (r: FinancingRequestSummaryDTO) => React.ReactNode }[] = [
    {
      label: 'Status',
      render: (r) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={r.status} map={FIN_REQUEST_STATUS_MAP} />
          <span className="font-mono text-[10px] text-muted-foreground">{r.number}</span>
        </div>
      ),
    },
    {
      label: 'Financier',
      render: (r) => (
        <span className="flex items-center gap-1.5 font-semibold">
          <Landmark size={13} className="text-primary" /> {r.financierOrgName}
        </span>
      ),
    },
    {
      label: 'Service',
      render: (r) => <span className="text-muted-foreground">{r.serviceName}</span>,
    },
    {
      label: 'Offered amount',
      render: (r) => (r.bestOffer ? <span className="font-bold">{formatMoney(r.bestOffer.amount)}</span> : <MutedDash />),
    },
    {
      label: 'Rate',
      render: (r) =>
        r.bestOffer?.ratePercent ? (
          <span>
            {r.bestOffer.ratePercent}%{' '}
            <span className="text-[10px] text-muted-foreground">
              {r.bestOffer.rateType ? (RATE_TYPE_LABELS[r.bestOffer.rateType] ?? r.bestOffer.rateType) : ''}
            </span>
          </span>
        ) : (
          <MutedDash />
        ),
    },
    {
      label: 'Flat fee',
      render: (r) => (r.bestOffer?.feeFlat ? <span>{formatMoney(r.bestOffer.feeFlat)}</span> : <MutedDash />),
    },
    {
      label: 'Tenor',
      render: (r) => (r.bestOffer?.tenorMonths ? <span>{r.bestOffer.tenorMonths} months</span> : <MutedDash />),
    },
    {
      label: 'Installments',
      render: (r) =>
        r.bestOffer?.installmentCount ? (
          <span>
            {r.bestOffer.installmentCount} ×{' '}
            {r.bestOffer.installmentTotal
              ? formatMoney(Math.round(r.bestOffer.installmentTotal / r.bestOffer.installmentCount))
              : ''}
          </span>
        ) : (
          <MutedDash />
        ),
    },
    {
      label: 'Total payable',
      render: (r) =>
        r.bestOffer?.installmentTotal ? (
          <span className={cn('font-bold', r.bestOffer.id === bestOfferId && 'text-emerald-600 dark:text-emerald-400')}>
            {formatMoney(r.bestOffer.installmentTotal)}
          </span>
        ) : (
          <MutedDash />
        ),
    },
    {
      label: 'Valid until',
      render: (r) =>
        r.bestOffer?.validUntil ? <span>{formatDate(r.bestOffer.validUntil)}</span> : <MutedDash />,
    },
  ]

  return (
    <Dialog open={!!group} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListChecks size={17} className="text-primary" /> Compare financier offers
          </DialogTitle>
          <DialogDescription>
            {group.multiGroupId} — the same application sent to {siblings.length} financiers. Accepting one offer
            automatically declines every other — including the siblings here.
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 w-32 bg-background p-2 text-left align-bottom text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  &nbsp;
                </th>
                {siblings.map((r) => (
                  <th key={r.id} className="min-w-[150px] p-2 text-left align-bottom">
                    <span className="flex items-center gap-1.5 text-sm font-bold">
                      {r.financierOrgName}
                      {r.bestOffer?.id === bestOfferId && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                          <Crown size={9} /> Lowest total
                        </span>
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-t">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-background p-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    {row.label}
                  </th>
                  {siblings.map((r) => (
                    <td key={r.id} className="p-2 align-top">
                      {row.render(r)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-t">
                <th scope="row" className="sticky left-0 z-10 bg-background p-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Action
                </th>
                {siblings.map((r) => (
                  <td key={r.id} className="p-2">
                    <Button
                      size="sm"
                      variant={r.bestOffer ? 'default' : 'outline'}
                      className="h-8 rounded-lg text-xs"
                      onClick={() => onPick(r.id)}
                    >
                      {r.bestOffer ? (
                        <>
                          <Eye size={12} className="mr-1" /> Review &amp; accept
                        </>
                      ) : (
                        <>
                          <Eye size={12} className="mr-1" /> Open
                        </>
                      )}
                    </Button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <ShieldCheck size={12} className="mt-0.5 shrink-0 text-primary" />
          Offers are binding once sent — the installment schedule freezes into the agreement at acceptance. Compare
          totals, not just rates: fees and tenor change what you actually pay.
        </p>
      </DialogContent>
    </Dialog>
  )
}

function MutedDash() {
  return <span className="text-muted-foreground/40">—</span>
}

function RequestCard({ request: r, onOpen }: { request: FinancingRequestSummaryDTO; onOpen: () => void }) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-muted px-2 py-1 font-mono text-xs font-bold">{r.number}</span>
          <StatusBadge status={r.status} map={FIN_REQUEST_STATUS_MAP} />
          {r.multiGroupId && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground" title="Multi-financier group">
              {r.multiGroupId}
            </span>
          )}
          {(r.offerCount ?? 0) > 0 && (
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10.5px] font-semibold text-violet-800 dark:bg-violet-950 dark:text-violet-300">
              {r.offerCount} offer{(r.offerCount ?? 0) === 1 ? '' : 's'}
            </span>
          )}
          {r.bestOffer && (
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10.5px] font-semibold text-primary">
              latest {formatMoney(r.bestOffer.amount, r.currency)}
            </span>
          )}
          <span className="ml-auto font-mono text-xs font-bold">{formatMoney(r.amountRequested, r.currency)}</span>
        </div>

        <div>
          <p className="truncate text-sm font-bold">{r.serviceName}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {r.financierOrgName}
            {r.organizationName ? ` · for ${r.organizationName}` : ' · individual'}
            {r.activityName ? ` · ${r.activityName}` : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>created {timeAgo(r.createdAt)}{r.submittedAt ? ` · submitted ${timeAgo(r.submittedAt)}` : ''}</span>
          <Button size="sm" className="h-10 rounded-lg" onClick={onOpen}>
            Open <Eye size={13} className="ml-1.5" />
          </Button>
        </div>

        {r.status === 'RETURNED_FOR_COMPLETION' && r.returnedReason && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
            <AlertTriangle size={12} className="mr-1 inline" /> Returned by the platform: {r.returnedReason}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ── Request detail ───────────────────────────────────────────────────────────

export function RequestDetail({ requestId, onBack }: { requestId: string; onBack: () => void }) {
  const { data, loading, error, refetch } = useApi<{ request: FinancingRequestDetailDTO }>(
    `/api/financing/requests/${requestId}`
  )
  const r = data?.request
  const [acceptOffer, setAcceptOffer] = useState<FinancingOfferDTO | null>(null)
  const [busy, setBusy] = useState(false)
  const [resupplyOpen, setResupplyOpen] = useState(false)

  const actOnOffer = async (offer: FinancingOfferDTO, action: 'accept' | 'decline') => {
    if (action === 'accept') {
      setAcceptOffer(offer)
      return
    }
    setBusy(true)
    const res = await apiRequest(`/api/financing/requests/${requestId}/offers/${offer.id}/decline`, { method: 'POST' })
    setBusy(false)
    if (!res.ok) return toastApiError(res.error, 'Could not decline the offer')
    toast({ title: 'Offer declined' })
    setAcceptOffer(null)
    void refetch()
  }

  const confirmAccept = async () => {
    if (!acceptOffer) return
    setBusy(true)
    const res = await apiRequest<{ agreement?: { number: string }; agreementId?: string | null; approvalRequested?: boolean }>(
      `/api/financing/requests/${requestId}/offers/${acceptOffer.id}/accept`,
      { method: 'POST' }
    )
    setBusy(false)
    if (!res.ok) return toastApiError(res.error, 'Could not accept the offer')
    if (res.data?.approvalRequested) {
      toast({
        title: 'Sent for approval',
        description: `This offer is at or above your organization's approval threshold — an approver must release it before the agreement is created. Track it in the business console → Purchase approvals.`,
      })
    } else {
      toast({
        title: 'Offer accepted 🎉',
        description: `Agreement created — other offers were declined automatically.`,
      })
    }
    setAcceptOffer(null)
    void refetch()
  }

  const cancelRequest = async () => {
    if (!r) return
    setBusy(true)
    const res = await apiRequest(`/api/financing/requests/${r.id}/cancel`, { method: 'POST' })
    setBusy(false)
    if (!res.ok) return toastApiError(res.error, 'Could not cancel')
    toast({ title: 'Request cancelled' })
    void refetch()
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-44 rounded-xl" />
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }
  if (error || !r) {
    return (
      <EmptyState icon={AlertTriangle} title="Could not load the request" description={error ?? 'Not found'}>
        <Button variant="outline" className="rounded-xl" onClick={onBack}>
          <ArrowLeft size={14} className="mr-1.5" /> Back to my requests
        </Button>
      </EmptyState>
    )
  }

  const terminal = ['ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED'].includes(r.status)
  const canCancel = ['DRAFT', 'SUBMITTED', 'UNDER_PLATFORM_REVIEW', 'RETURNED_FOR_COMPLETION'].includes(r.status)
  const rejectedItems = r.submissions.filter((s) => s.status === 'REJECTED')
  const offers = (r.offers ?? []) as FinancingOfferDTO[]
  const siblingsNote = r.multiGroupId ? `Part of group ${r.multiGroupId}` : null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" className="h-11 w-11 rounded-xl" onClick={onBack} aria-label="Back">
            <ChevronLeft size={18} />
          </Button>
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-center gap-2 font-mono text-lg font-bold">
              {r.number} <StatusBadge status={r.status} map={FIN_REQUEST_STATUS_MAP} />
            </h2>
            <p className="truncate text-xs text-muted-foreground">
              {r.serviceName} · {r.financierOrgName}
              {siblingsNote ? ` · ${siblingsNote}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {r.status === 'RETURNED_FOR_COMPLETION' && (
            <Button className="h-11 rounded-xl" onClick={() => setResupplyOpen(true)}>
              <RefreshCw size={14} className="mr-1.5" /> Fix & resubmit
            </Button>
          )}
          {canCancel && (
            <Button variant="outline" className="h-11 rounded-xl" disabled={busy} onClick={cancelRequest}>
              <Ban size={14} className="mr-1.5" /> Cancel request
            </Button>
          )}
        </div>
      </div>

      {/* status timeline */}
      <Card>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <StatusStepper
            steps={FIN_TIMELINE}
            current={STATUS_INDEX[r.status] ?? 0}
          />
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] text-muted-foreground sm:grid-cols-4">
            <span>Created {formatDate(r.createdAt)}</span>
            {r.submittedAt && <span>Submitted {formatDateTime(r.submittedAt)}</span>}
            {r.forwardedAt && <span>Forwarded {formatDateTime(r.forwardedAt)}</span>}
            {r.expiresAt && !terminal && <span>Expires {formatDate(r.expiresAt)}</span>}
          </div>
          {r.status === 'RETURNED_FOR_COMPLETION' && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 dark:border-rose-900 dark:bg-rose-950/40">
              <p className="text-xs font-bold text-rose-800 dark:text-rose-300">
                <AlertTriangle size={13} className="mr-1 inline" /> Returned by the platform for completion
              </p>
              <p className="mt-1 text-xs text-rose-700 dark:text-rose-300/90">{r.returnedReason}</p>
              {rejectedItems.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-rose-700 dark:text-rose-300/90">
                  {rejectedItems.map((s) => (
                    <li key={s.id}>
                      • <span className="font-semibold">{s.requirement.template.title}</span>
                      {s.decisionNote ? ` — ${s.decisionNote}` : ''}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-[11px] text-rose-600/90 dark:text-rose-400/90">
                Verified items stay verified — fix only what was rejected or missing.
              </p>
            </div>
          )}
          {['SUBMITTED', 'UNDER_PLATFORM_REVIEW'].includes(r.status) && (
            <p className="flex items-center gap-2 rounded-xl border bg-primary/5 px-3.5 py-3 text-xs font-medium text-foreground/80">
              <ShieldCheck size={15} className="shrink-0 text-primary" />
              The platform verification gate is reviewing your file — the financier sees it only after every required
              item passes.
            </p>
          )}
        </CardContent>
      </Card>

      {/* gate + checklist */}
      <Card>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold">Requirements checklist</h3>
            {r.gate.totalRequired > 0 && (
              <span className="text-[11px] font-semibold text-muted-foreground">
                {r.gate.verified + r.gate.waived} of {r.gate.totalRequired} required verified
              </span>
            )}
          </div>
          <GateMeter verified={r.gate.verified} waived={r.gate.waived} totalRequired={r.gate.totalRequired} />
          <div className="space-y-2">
            {r.submissions.map((s) => (
              <ChecklistVerdictRow key={s.id} sub={s} />
            ))}
            {r.submissions.length === 0 && (
              <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                The checklist is generated when the request is submitted.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* the ask */}
      <Card>
        <CardContent className="grid grid-cols-2 gap-x-4 gap-y-3 p-4 sm:grid-cols-4 sm:p-6">
          <LabeledValue label="Amount requested">
            <span className="font-mono font-bold">{formatMoney(r.amountRequested, r.currency)}</span>
          </LabeledValue>
          <LabeledValue label="Activity">{r.activityName ?? '—'}</LabeledValue>
          <LabeledValue label="City">{r.activityCity ?? '—'}</LabeledValue>
          <LabeledValue label="Purpose">
            <span className="line-clamp-2" title={r.purpose ?? ''}>{r.purpose ?? '—'}</span>
          </LabeledValue>
        </CardContent>
      </Card>

      {/* offers */}
      <Card>
        <CardContent className="space-y-3 p-4 sm:p-6">
          <h3 className="text-sm font-bold">Offers</h3>
          {offers.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
              No offers yet{r.forwardedAt ? ' — offers appear here once the financier responds.' : ' — offers appear after the gate forwards your request.'}
            </p>
          ) : (
            <div className="space-y-3">
              {offers.map((o) => (
                <div key={o.id} className="rounded-2xl border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={o.status} map={OFFER_STATUS_MAP} />
                    <span className="font-mono text-sm font-bold">{formatMoney(o.amount, o.currency)}</span>
                    {o.ratePercent != null && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-semibold">
                        {o.rateType ? (RATE_TYPE_LABELS[o.rateType] ?? o.rateType) : 'Rate'} {o.ratePercent}%
                      </span>
                    )}
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-semibold">{o.tenorMonths} months</span>
                    {o.feeFlat ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-semibold">Fee {formatMoney(o.feeFlat, o.currency)}</span>
                    ) : null}
                    <span className="ml-auto text-[11px] text-muted-foreground">by {o.createdBy.name} · {timeAgo(o.createdAt)}</span>
                  </div>

                  {o.notes && <p className="mt-2 text-xs text-muted-foreground">{o.notes}</p>}
                  {o.collateralRequired && (
                    <p className="mt-1 text-[11px] text-muted-foreground">Collateral: {o.collateralRequired}</p>
                  )}

                  {o.installments.length > 0 && (
                    <div className="mt-3 overflow-hidden rounded-xl border">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="h-9 text-[11px]">#</TableHead>
                            <TableHead className="h-9 text-[11px]">Due date</TableHead>
                            <TableHead className="h-9 text-[11px] text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {o.installments.map((inst) => (
                            <TableRow key={inst.id}>
                              <TableCell className="py-2 text-xs font-semibold">{inst.installmentNo}</TableCell>
                              <TableCell className="py-2 text-xs">{formatDate(inst.dueDate)}</TableCell>
                              <TableCell className="py-2 text-right font-mono text-xs">{formatMoney(inst.amount, o.currency)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <CalendarClock size={11} />
                      {o.validUntil ? `valid until ${formatDate(o.validUntil)}` : 'no explicit validity'}
                    </span>
                    {o.status === 'SENT' && (
                      <div className="flex items-center gap-2">
                        {o.pendingApproval ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            <Hourglass size={12} /> Awaiting your organization's approval
                          </span>
                        ) : (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-10 rounded-xl"
                              disabled={busy}
                              onClick={() => void actOnOffer(o, 'decline')}
                            >
                              <XCircle size={14} className="mr-1.5" /> Decline
                            </Button>
                            <Button size="sm" className="h-10 rounded-xl" disabled={busy} onClick={() => void actOnOffer(o, 'accept')}>
                              <CheckCircle2 size={14} className="mr-1.5" /> Accept offer
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* accept confirmation */}
      <Dialog open={!!acceptOffer} onOpenChange={(open) => !open && setAcceptOffer(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Accept this offer?</DialogTitle>
            <DialogDescription>
              {acceptOffer && (
                <>
                  {formatMoney(acceptOffer.amount, acceptOffer.currency)} over {acceptOffer.tenorMonths} months from{' '}
                  {r.financierOrgName}. Accepting creates your agreement ({acceptOffer.installments.length} installments)
                  and automatically declines every other offer — including offers on sibling requests.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setAcceptOffer(null)}>
              Not yet
            </Button>
            <Button className="rounded-xl" disabled={busy} onClick={confirmAccept}>
              {busy ? <Clock3 size={14} className="mr-1.5 animate-spin" /> : <CheckCircle2 size={14} className="mr-1.5" />}
              Accept & create agreement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* resupply dialog for RETURNED requests (keyed — fresh state per open) */}
      <ResupplyDialog
        key={`resupply-${resupplyOpen}`}
        open={resupplyOpen}
        onOpenChange={setResupplyOpen}
        requestId={r.id}
        items={rejectedItems}
        onDone={() => {
          setResupplyOpen(false)
          void refetch()
        }}
      />
    </div>
  )
}

// ── Checklist verdict row (read-only for the applicant) ───────────────────────

function ChecklistVerdictRow({ sub: s }: { sub: RequirementSubmissionDTO }) {
  const t = s.requirement.template
  const kind = t.conditionType
  let answerDisplay: string | null = null
  if (kind === 'DOCUMENT' && s.accountDocumentId) answerDisplay = `vault document attached (${t.documentType ? DOCUMENT_TYPE_LABELS[t.documentType] ?? t.documentType : 'document'})`
  else if (kind === 'PROFILE_FIELD') answerDisplay = 'auto-evaluated from your account'
  else if (kind === 'DECLARATION') answerDisplay = s.valueText
  else if (s.valueNumber != null) answerDisplay = String(s.valueNumber)
  else if (s.valueDate) answerDisplay = formatDate(s.valueDate)
  else if (s.valueText) answerDisplay = s.valueText

  return (
    <div className="rounded-xl border p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <ConditionTypeBadge type={kind} />
        <ScopeBadge scope={t.scope} />
        {s.requirement.isRequired && <span className="text-[11px] font-bold text-primary">✱ required</span>}
        <span className="ml-auto flex items-center gap-2">
          <StatusBadge status={s.status} map={SUBMISSION_STATUS_MAP} />
        </span>
      </div>
      <p className="mt-1.5 text-sm font-semibold">{t.title}</p>
      {s.requirement.instructions && <p className="mt-0.5 text-xs text-muted-foreground">{s.requirement.instructions}</p>}
      {answerDisplay && (
        <p className="mt-1.5 rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs">
          <span className="font-semibold text-muted-foreground">Your answer:</span> {answerDisplay}
        </p>
      )}
      {s.decisionNote && (
        <p
          className={cn(
            'mt-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium',
            s.status === 'REJECTED'
              ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
              : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
          )}
        >
          Platform note: {s.decisionNote}
        </p>
      )}
      {s.verifiedAt && <p className="mt-1 text-[10.5px] text-muted-foreground">verified {formatDateTime(s.verifiedAt)}</p>}
    </div>
  )
}

// ── Resupply dialog (RETURNED → fix rejected items → back to review) ─────────

interface ResupplyAnswer {
  valueText: string
  valueNumber: string
  valueDate: string
  accountDocumentId: string
  confirmed: boolean
  multi: string[]
}

function ResupplyDialog({
  open,
  onOpenChange,
  requestId,
  items,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  requestId: string
  items: RequirementSubmissionDTO[]
  onDone: () => void
}) {
  const [answers, setAnswers] = useState<Record<string, ResupplyAnswer>>({})
  const [busy, setBusy] = useState(false)
  const { data: vaultData } = useApi<{ documents: import('@/lib/types').AccountDocumentDTO[] }>(open ? '/api/documents' : null)

  const setAnswer = (id: string, patch: Partial<ResupplyAnswer>) =>
    setAnswers((prev) => ({ ...prev, [id]: { valueText: '', valueNumber: '', valueDate: '', accountDocumentId: '', confirmed: false, multi: [], ...prev[id], ...patch } }))

  const submit = async () => {
    const payload = items.map((s) => {
      const a = answers[s.id]
      const kind = s.requirement.template.conditionType
      const base: Record<string, unknown> = { requirementId: s.serviceRequirementId }
      if (kind === 'DOCUMENT') base.accountDocumentId = a?.accountDocumentId || null
      else if (kind === 'DECLARATION') base.confirmed = !!a?.confirmed
      else if (kind === 'NUMBER') base.valueNumber = a?.valueNumber ? Number(a.valueNumber) : null
      else if (kind === 'DATE') base.valueDate = a?.valueDate || null
      else if (kind === 'MULTI_SELECT') base.valueText = (a?.multi ?? []).join(', ')
      else base.valueText = a?.valueText || null
      return base
    })
    setBusy(true)
    const res = await apiRequest(`/api/financing/requests/${requestId}/resubmit`, {
      method: 'POST',
      body: JSON.stringify({ answers: payload }),
    })
    setBusy(false)
    if (!res.ok) return toastApiError(res.error, 'Could not resubmit')
    toast({ title: 'Resubmitted', description: 'Back in the platform gate — verified items were preserved.' })
    onDone()
  }

  const missing = items.filter((s) => {
    const a = answers[s.id]
    const kind = s.requirement.template.conditionType
    if (kind === 'DOCUMENT') return !a?.accountDocumentId
    if (kind === 'DECLARATION') return !a?.confirmed
    if (kind === 'NUMBER') return !a?.valueNumber
    if (kind === 'DATE') return !a?.valueDate
    if (kind === 'MULTI_SELECT') return (a?.multi ?? []).length === 0
    return !a?.valueText?.trim()
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Fix & resubmit</DialogTitle>
          <DialogDescription>
            Re-supply the rejected items below — verified answers stay as they are.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {items.length === 0 && (
            <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
              No rejected items — resubmitting sends the request straight back to the platform gate.
            </p>
          )}
          {items.map((s) => {
            const t = s.requirement.template
            const a = answers[s.id]
            return (
              <div key={s.id} className="rounded-xl border p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <ConditionTypeBadge type={t.conditionType} />
                  <p className="text-sm font-semibold">{t.title}</p>
                </div>
                {s.decisionNote && (
                  <p className="mt-1 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] font-medium text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                    Rejection note: {s.decisionNote}
                  </p>
                )}
                <div className="mt-2.5">
                  {t.conditionType === 'DOCUMENT' && (
                    <VaultSelect
                      docs={vaultData?.documents ?? []}
                      documentType={t.documentType}
                      value={a?.accountDocumentId ?? ''}
                      onChange={(v) => setAnswer(s.id, { accountDocumentId: v })}
                    />
                  )}
                  {t.conditionType === 'DECLARATION' && (
                    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border bg-background px-3 py-2.5 text-xs">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[var(--primary)]"
                        checked={!!a?.confirmed}
                        onChange={(e) => setAnswer(s.id, { confirmed: e.target.checked })}
                      />
                      {t.description ?? 'I confirm this declaration.'}
                    </label>
                  )}
                  {t.conditionType === 'TEXT' && (
                    <textarea
                      rows={2}
                      className="w-full rounded-lg border bg-background px-3 py-2 text-xs"
                      value={a?.valueText ?? ''}
                      onChange={(e) => setAnswer(s.id, { valueText: e.target.value })}
                      placeholder="Your corrected answer"
                    />
                  )}
                  {t.conditionType === 'NUMBER' && (
                    <input
                      type="number"
                      className="h-10 w-full rounded-lg border bg-background px-3 text-xs"
                      value={a?.valueNumber ?? ''}
                      onChange={(e) => setAnswer(s.id, { valueNumber: e.target.value })}
                      placeholder={t.validationMin != null ? `between ${t.validationMin} and ${t.validationMax ?? '∞'}` : 'Number'}
                    />
                  )}
                  {t.conditionType === 'DATE' && (
                    <input
                      type="date"
                      className="h-10 w-full rounded-lg border bg-background px-3 text-xs"
                      value={a?.valueDate ?? ''}
                      onChange={(e) => setAnswer(s.id, { valueDate: e.target.value })}
                    />
                  )}
                  {t.conditionType === 'SELECT' && (
                    <select
                      className="h-10 w-full rounded-lg border bg-background px-3 text-xs"
                      value={a?.valueText ?? ''}
                      onChange={(e) => setAnswer(s.id, { valueText: e.target.value })}
                    >
                      <option value="">Choose…</option>
                      {t.options.map((o) => (
                        <option key={o.id} value={o.value}>
                          {o.value}
                        </option>
                      ))}
                    </select>
                  )}
                  {t.conditionType === 'MULTI_SELECT' && (
                    <div className="grid gap-1.5 rounded-lg border bg-background px-3 py-2.5 sm:grid-cols-2">
                      {t.options.map((o) => {
                        const checked = (a?.multi ?? []).includes(o.value)
                        return (
                          <label key={o.id} className="flex cursor-pointer items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-[var(--primary)]"
                              checked={checked}
                              onChange={(e) =>
                                setAnswer(s.id, {
                                  multi: e.target.checked
                                    ? [...(a?.multi ?? []), o.value]
                                    : (a?.multi ?? []).filter((x) => x !== o.value),
                                })
                              }
                            />
                            {o.value}
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="rounded-xl" disabled={busy || missing.length > 0} onClick={submit}>
            {busy ? <Clock3 size={14} className="mr-1.5 animate-spin" /> : <Send size={14} className="mr-1.5" />}
            Resubmit {missing.length > 0 ? `(${missing.length} left)` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function VaultSelect({
  docs,
  documentType,
  value,
  onChange,
}: {
  docs: import('@/lib/types').AccountDocumentDTO[]
  documentType: string | null
  value: string
  onChange: (id: string) => void
}) {
  const matching = useMemo(
    () => (documentType ? docs.filter((d) => d.documentType === documentType && d.status !== 'REJECTED') : docs),
    [docs, documentType]
  )
  return (
    <select
      className="h-10 w-full rounded-lg border bg-background px-3 text-xs"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Pick a vault document…</option>
      {matching.map((d) => (
        <option key={d.id} value={d.id}>
          {d.title ?? d.media?.originalName ?? d.documentType} ({d.status})
        </option>
      ))}
    </select>
  )
}

// ── Multi-group compare view (W-MULTI-COMPARE) ───────────────────────────────

export function MultiGroupCompare({
  group,
  onOpen,
}: {
  group: { multiGroupId: string; requests: FinancingRequestSummaryDTO[] }
  onOpen: (id: string) => void
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="font-mono text-sm font-bold">{group.multiGroupId}</p>
            <p className="text-[11px] text-muted-foreground">{group.requests.length} sibling requests — one wizard session</p>
          </div>
          <CircleDollarSign size={18} className="text-primary" />
        </div>
        <Separator />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {group.requests.map((r) => (
            <div key={r.id} className="rounded-2xl border p-4">
              <p className="truncate text-sm font-bold">{r.financierOrgName}</p>
              <p className="truncate text-xs text-muted-foreground">{r.serviceName} · {r.number}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusBadge status={r.status} map={FIN_REQUEST_STATUS_MAP} />
                {r.bestOffer && (
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10.5px] font-semibold text-primary">
                    {formatMoney(r.bestOffer.amount, r.currency)}
                  </span>
                )}
              </div>
              <Button variant="outline" size="sm" className="mt-3 h-10 w-full rounded-xl" onClick={() => onOpen(r.id)}>
                Open sibling
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
