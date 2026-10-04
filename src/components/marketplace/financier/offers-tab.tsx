'use client'

// ─────────────────────────────────────────────────────────────────────────────
// OFFERS & AGREEMENTS — my sent offers + executed agreements (FIN-5 §6).
// Offers are derived from the inbox requests (only requests that carry offers
// are expanded — one detail fetch each). Agreements render with the frozen
// offer, the reported-events timeline and the platform fees; the Report event
// dialog posts DISBURSEMENT / REPAYMENT / EARLY_SETTLEMENT / LATE_FEE / NOTE
// rows (track-only — the platform never moves financing money).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  CalendarPlus,
  HandCoins,
  Loader2,
  Receipt,
  ScrollText,
  Send,
  ShieldAlert,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { apiRequest, toastApiError } from '../admin/shared'
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
import { formatDate, timeAgo } from '@/lib/format'
import {
  FEE_STATUS_MAP,
  FinancingStatusBadge,
  FUNDING_STATUS_MAP,
  AGREEMENT_STATUS_MAP,
  OFFER_STATUS_MAP,
  collateralLabel,
  formatMoney,
  rateTypeLabel,
  type FinancierAgreementDTO,
  type FinancierRequestDetailDTO,
  type FinancierRequestListItemDTO,
  type OfferDTO,
} from './financing-status-badge'

type OfferWithContext = OfferDTO & { requestNumber: string; organizationName: string | null }

const EVENT_TYPES = ['DISBURSEMENT', 'REPAYMENT', 'EARLY_SETTLEMENT', 'LATE_FEE', 'NOTE'] as const

const EVENT_LABELS: Record<string, string> = {
  DISBURSEMENT: 'Disbursement',
  REPAYMENT: 'Repayment',
  EARLY_SETTLEMENT: 'Early settlement',
  LATE_FEE: 'Late fee',
  NOTE: 'Note',
}

// ── Report event dialog ──────────────────────────────────────────────────────

function ReportEventDialog({
  agreement,
  onClose,
  onDone,
}: {
  agreement: FinancierAgreementDTO
  onClose: () => void
  onDone: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    type: 'DISBURSEMENT' as (typeof EVENT_TYPES)[number],
    eventDate: new Date().toISOString().slice(0, 10),
    amount: '',
    note: '',
  })

  const submit = async () => {
    if (!form.eventDate) {
      toast({ title: 'Pick the event date', variant: 'destructive' })
      return
    }
    if (form.type === 'DISBURSEMENT' && !form.amount) {
      toast({ title: 'A disbursement needs an amount', variant: 'destructive' })
      return
    }
    setSaving(true)
    const res = await apiRequest(`/api/financier/agreements/${agreement.id}/events`, {
      method: 'POST',
      body: JSON.stringify({
        type: form.type,
        eventDate: form.eventDate,
        amount: form.amount.trim() === '' ? null : Number(form.amount),
        note: form.note.trim() || null,
      }),
    })
    setSaving(false)
    if (!res.ok) return toastApiError(res.error, 'Event not reported')
    toast({
      title: `${EVENT_LABELS[form.type]} reported`,
      description:
        form.type === 'DISBURSEMENT'
          ? 'The agreement is marked as funded — the applicant has been notified.'
          : form.type === 'EARLY_SETTLEMENT'
            ? 'The agreement is marked as settled.'
            : 'The event was added to the timeline.',
    })
    onDone()
    onClose()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus size={17} className="text-primary" /> Report event — {agreement.number}
          </DialogTitle>
          <DialogDescription>
            Track-only ledger — money moves directly between you and the applicant, the platform
            only records.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Event type</Label>
            <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as never }))}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {EVENT_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ev-date">Event date</Label>
            <Input
              id="ev-date"
              type="date"
              value={form.eventDate}
              onChange={(e) => setForm((f) => ({ ...f, eventDate: e.target.value }))}
              className="rounded-xl"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ev-amount">
              Amount ({agreement.offer.currency})
              {form.type === 'DISBURSEMENT' ? ' (required)' : ' (optional)'}
            </Label>
            <Input
              id="ev-amount"
              type="number"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              className="rounded-xl"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ev-note">Note (optional)</Label>
            <Textarea
              id="ev-note"
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              rows={2}
              className="rounded-xl"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" className="rounded-xl" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" className="rounded-xl" onClick={submit} disabled={saving}>
            {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />} Report event
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Agreement card ───────────────────────────────────────────────────────────

function AgreementCard({
  agreement,
  onChanged,
}: {
  agreement: FinancierAgreementDTO
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [eventOpen, setEventOpen] = useState(false)
  const offer = agreement.offer

  return (
    <Card className="shadow-sm">
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              <span className="tabular-nums">{agreement.number}</span>
              <FinancingStatusBadge status={agreement.status} map={AGREEMENT_STATUS_MAP} />
              <FinancingStatusBadge status={agreement.fundingStatus} map={FUNDING_STATUS_MAP} />
            </p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {agreement.applicant?.organizationName ?? agreement.applicant?.requesterName ?? 'Applicant'} ·{' '}
              {agreement.serviceName} · accepted {timeAgo(agreement.acceptedAt)}
            </p>
          </div>
          <Button type="button" size="sm" className="shrink-0 rounded-xl" onClick={() => setEventOpen(true)} disabled={busy}>
            <CalendarPlus size={14} className="mr-1.5" /> Report event
          </Button>
        </div>

        {/* Frozen offer summary */}
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border bg-muted/30 p-3 text-sm sm:grid-cols-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Amount</p>
            <p className="mt-0.5 font-bold tabular-nums">{formatMoney(offer.amount, offer.currency)}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Rate</p>
            <p className="mt-0.5">
              {rateTypeLabel(offer.rateType) ?? '—'}
              {offer.ratePercent != null ? <span className="font-semibold tabular-nums"> {offer.ratePercent}%</span> : ''}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Tenor</p>
            <p className="mt-0.5"><span className="font-semibold tabular-nums">{offer.tenorMonths}</span> months</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Collateral</p>
            <p className="mt-0.5">{collateralLabel(offer.collateralRequired) ?? '—'}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Events timeline */}
          <div>
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Activity size={13} className="text-primary" /> Reported events
            </p>
            {agreement.events.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                No events reported yet — record the disbursement once funds move.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {agreement.events.map((e) => (
                  <li key={e.id} className="flex items-start gap-2.5 text-xs">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {EVENT_LABELS[e.type] ?? e.type}
                        {e.amount != null ? <span className="tabular-nums"> — {formatMoney(e.amount, offer.currency)}</span> : ''}
                        <span className="ml-1.5 font-normal text-muted-foreground">{formatDate(e.eventDate)}</span>
                      </p>
                      {e.note && <p className="text-muted-foreground">{e.note}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Fees */}
          <div>
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Receipt size={13} className="text-primary" /> Platform fees
            </p>
            {agreement.fees.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">No fees accrued on this agreement.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {agreement.fees.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-2 text-xs">
                    <span>
                      {f.type === 'SUCCESS' ? 'Success fee' : f.type} · {f.percentApplied}% of{' '}
                      {formatMoney(f.baseAmount, offer.currency)}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="font-semibold tabular-nums">{formatMoney(f.amount, offer.currency)}</span>
                      <FinancingStatusBadge status={f.status} map={FEE_STATUS_MAP} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {eventOpen && (
          <ReportEventDialog
            agreement={agreement}
            onClose={() => setEventOpen(false)}
            onDone={onChanged}
          />
        )}
      </CardContent>
    </Card>
  )
}

// ── The tab ──────────────────────────────────────────────────────────────────

export function OffersTab({ onChanged }: { onChanged: () => void }) {
  const { data: reqData, loading: reqLoading, error: reqError, refetch: refetchRequests } = useApi<{
    requests: FinancierRequestListItemDTO[]
  }>('/api/financier/requests')
  const requests = useMemo(() => reqData?.requests ?? [], [reqData])

  // Expand only the requests that actually carry offers (usually a handful).
  const idsWithOffers = requests.filter((r) => r.offerCount > 0).map((r) => r.id)
  const signature = idsWithOffers.join(',')
  const [offers, setOffers] = useState<OfferWithContext[]>([])
  const [offersLoading, setOffersLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!signature) {
        if (!cancelled) {
          setOffers([])
          setOffersLoading(false)
        }
        return
      }
      setOffersLoading(true)
      const results = await Promise.all(
        idsWithOffers.map((id) =>
          apiRequest<{ request: FinancierRequestDetailDTO }>(`/api/financier/requests/${id}`).then((r) =>
            r.ok ? r.data!.request : null
          )
        )
      )
      if (cancelled) return
      setOffers(
        results
          .filter((d): d is FinancierRequestDetailDTO => !!d)
          .flatMap((d) =>
            d.offers.map((o) => ({
              ...o,
              requestNumber: d.number,
              organizationName: d.request.organization?.name ?? null,
            }))
          )
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      )
      setOffersLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [signature])

  const { data: agrData, loading: agrLoading } = useApi<{ agreements: FinancierAgreementDTO[] }>(
    '/api/financier/agreements'
  )
  const agreements = useMemo(() => agrData?.agreements ?? [], [agrData])

  const [busyOfferId, setBusyOfferId] = useState<string | null>(null)
  const withdraw = async (offer: OfferWithContext) => {
    setBusyOfferId(offer.id)
    const res = await apiRequest(`/api/financier/offers/${offer.id}`, { method: 'PATCH' })
    setBusyOfferId(null)
    if (!res.ok) return toastApiError(res.error, 'Withdraw failed')
    toast({ title: 'Offer withdrawn', description: 'The slot is free for a revision.' })
    void refetchRequests()
    onChanged()
  }

  return (
    <div className="space-y-8">
      {/* My offers */}
      <section className="space-y-4">
        <h2 className="flex items-center gap-2.5 text-base font-bold">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Send size={15} />
          </span>{' '}
          My sent offers
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
            {offers.length}
          </span>
        </h2>

        {reqLoading || offersLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="skeleton-shimmer h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : reqError ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <ShieldAlert size={22} />
            </span>
            <p className="mt-3 text-sm font-semibold">Couldn&apos;t load your offers</p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">{reqError}</p>
            <Button variant="outline" className="mt-4 rounded-xl" onClick={() => void refetchRequests()}>
              Try again
            </Button>
          </div>
        ) : offers.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <HandCoins size={26} />
            </span>
            <p className="mt-4 text-sm font-semibold">No offers sent yet</p>
            <p className="mt-1 max-w-md text-xs text-muted-foreground">
              Open a request from the inbox and compose your first offer — up to five live offers
              per request, revisions included.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-hidden rounded-2xl border md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="px-4 py-3 font-medium">Request</th>
                    <th scope="col" className="px-4 py-3 font-medium">Offer</th>
                    <th scope="col" className="px-4 py-3 font-medium">Terms</th>
                    <th scope="col" className="px-4 py-3 font-medium">Status</th>
                    <th scope="col" className="px-4 py-3 font-medium">Valid until</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {offers.map((o) => (
                    <tr key={o.id} className="border-b transition-colors last:border-0 hover:bg-accent/50">
                      <td className="px-4 py-3.5">
                        <p className="font-semibold tabular-nums">{o.requestNumber}</p>
                        <p className="text-xs text-muted-foreground">{o.organizationName ?? 'Individual'}</p>
                      </td>
                      <td className="px-4 py-3.5 font-semibold tabular-nums">{formatMoney(o.amount, o.currency)}</td>
                      <td className="px-4 py-3.5 text-xs text-muted-foreground">
                        {o.tenorMonths} mo · {rateTypeLabel(o.rateType) ?? '—'}
                        {o.ratePercent != null ? ` ${o.ratePercent}%` : ''} · {o.installments.length} installments
                      </td>
                      <td className="px-4 py-3.5">
                        <FinancingStatusBadge status={o.status} map={OFFER_STATUS_MAP} />
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground">{o.validUntil ? formatDate(o.validUntil) : '—'}</td>
                      <td className="px-4 py-3.5 text-right">
                        {o.status === 'SENT' && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 rounded-lg text-xs text-muted-foreground hover:text-destructive"
                            disabled={busyOfferId === o.id}
                            onClick={() => void withdraw(o)}
                          >
                            Withdraw
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="space-y-3 md:hidden">
              {offers.map((o) => (
                <Card key={o.id} className="shadow-sm transition-all duration-200 hover:shadow-md">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold tabular-nums">{o.requestNumber}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground" title={`${o.organizationName ?? 'Individual'} · ${o.tenorMonths} months`}>
                          {o.organizationName ?? 'Individual'} · {o.tenorMonths} months
                        </p>
                      </div>
                      <FinancingStatusBadge status={o.status} map={OFFER_STATUS_MAP} />
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span className="font-bold tabular-nums text-foreground">{formatMoney(o.amount, o.currency)}</span>
                      <span>{o.validUntil ? `until ${formatDate(o.validUntil)}` : 'no expiry'}</span>
                    </div>
                    {o.status === 'SENT' && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-3 w-full rounded-lg text-xs"
                        disabled={busyOfferId === o.id}
                        onClick={() => void withdraw(o)}
                      >
                        Withdraw offer
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Agreements */}
      <section className="space-y-4">
        <h2 className="flex items-center gap-2.5 text-base font-bold">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ScrollText size={15} />
          </span>{' '}
          Agreements
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
            {agreements.length}
          </span>
        </h2>

        {agrLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 1 }).map((_, i) => (
              <Skeleton key={i} className="skeleton-shimmer h-48 w-full rounded-2xl" />
            ))}
          </div>
        ) : agreements.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ScrollText size={26} />
            </span>
            <p className="mt-4 text-sm font-semibold">No agreements yet</p>
            <p className="mt-1 max-w-md text-xs text-muted-foreground">
              When an applicant accepts one of your offers, the agreement appears here with its
              event timeline and platform fees.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {agreements.map((a) => (
              <AgreementCard key={a.id} agreement={a} onChanged={onChanged} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
