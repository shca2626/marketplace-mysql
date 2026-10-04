'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FINANCIER AGREEMENTS — agreements created when applicants accept an offer
// (AGR- numbers). The financier reports external money movement as track-only
// events (D-002: the platform never touches financing money) and sets the
// reported funding status (REPORTED_FUNDED / REPORTED_SETTLED).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import {
  ArrowDownUp,
  CalendarClock,
  FileSignature,
  Loader2,
  Receipt,
  Wallet,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { formatDate } from '@/lib/format'
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
  type FinAgreement,
  AGREEMENT_STATUS_MAP,
  FUNDING_STATUS_MAP,
  StatusBadge,
  enumLabel,
  formatMoney,
  isoToDateInput,
} from './shared'

const EVENT_TYPES = ['DISBURSEMENT', 'REPAYMENT', 'EARLY_SETTLEMENT', 'LATE_FEE', 'NOTE'] as const

export function FinancierAgreementsTab({ isFinancier }: { isFinancier: boolean }) {
  const { data, loading, refetch } = useApi<{ agreements: FinAgreement[] }>(
    isFinancier ? '/api/financier/agreements' : null,
    { skip: !isFinancier }
  )
  const [eventFor, setEventFor] = useState<FinAgreement | null>(null)

  const agreements = data?.agreements ?? []

  const setFunding = async (agreement: FinAgreement, status: string) => {
    const res = await apiRequest(`/api/financier/agreements/${agreement.id}/funding-status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    })
    if (!res.ok) {
      toastApiError(res.error, 'Could not update the funding status')
      return
    }
    toast({ title: `Funding status → ${FUNDING_STATUS_MAP[status]?.label ?? status}` })
    void refetch()
  }

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : agreements.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-14 text-center">
          <FileSignature size={34} className="text-muted-foreground/40" />
          <p className="mt-3 text-sm font-semibold">No agreements yet</p>
          <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
            When an applicant accepts one of your offers, the agreement (AGR-) lands here — fund it, record
            disbursements and repayments, and report settlement. Money moves directly between you and the applicant.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {agreements.map((a) => (
            <Card key={a.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold text-primary">{a.number}</span>
                      <StatusBadge status={a.status} map={AGREEMENT_STATUS_MAP} />
                      <StatusBadge status={a.fundingStatus} map={FUNDING_STATUS_MAP} />
                    </div>
                    <p className="mt-1 text-sm">
                      <span className="font-medium">{a.service ?? 'Service'}</span>
                      <span className="text-muted-foreground">
                        {' '}· offer {a.offer ? formatMoney(a.offer.amount, a.offer.currency) : '—'}
                        {a.offer?.requestNumber ? ` on ${a.offer.requestNumber}` : ''}
                        {a.offer?.rateType ? ` · ${enumLabel(a.offer.rateType)}` : ''}
                        {a.offer?.ratePercent !== null && a.offer?.ratePercent !== undefined ? ` ${a.offer.ratePercent}%` : ''}
                      </span>
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock size={11} aria-hidden /> accepted {formatDate(a.acceptedAt)}
                      </span>
                      <span>tenor {a.offer?.tenorMonths ?? '—'} mo</span>
                      {a.fundedReportedAt && <span>funded {formatDate(a.fundedReportedAt)}</span>}
                      {a.settledReportedAt && <span>settled {formatDate(a.settledReportedAt)}</span>}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    <Button size="sm" className="h-8 rounded-lg text-xs" onClick={() => setEventFor(a)}>
                      <Receipt size={12} className="mr-1" /> Record event
                    </Button>
                    {a.fundingStatus !== 'REPORTED_FUNDED' && a.fundingStatus !== 'REPORTED_SETTLED' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-lg text-xs"
                        onClick={() => void setFunding(a, 'REPORTED_FUNDED')}
                      >
                        <Wallet size={12} className="mr-1" /> Report funded
                      </Button>
                    )}
                    {a.fundingStatus === 'REPORTED_FUNDED' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-lg text-xs"
                        onClick={() => void setFunding(a, 'REPORTED_SETTLED')}
                      >
                        <Wallet size={12} className="mr-1" /> Report settled
                      </Button>
                    )}
                  </div>
                </div>

                {/* event ledger */}
                {a.events.length > 0 && (
                  <details className="text-xs">
                    <summary className="flex cursor-pointer items-center gap-1.5 text-muted-foreground hover:text-foreground">
                      <ArrowDownUp size={12} aria-hidden /> {a.events.length} recorded event{a.events.length === 1 ? '' : 's'}
                    </summary>
                    <div className="mt-1.5 space-y-1">
                      {a.events.map((e) => (
                        <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-1.5">
                          <span className="font-medium">{enumLabel(e.type)}</span>
                          <span className="text-muted-foreground">
                            {formatDate(e.eventDate)}
                            {e.amount !== null ? ` · ${formatMoney(e.amount, a.offer?.currency)}` : ''}
                          </span>
                          {e.note && <span className="w-full text-muted-foreground/80">“{e.note}”</span>}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* record event dialog */}
      {eventFor && (
        <RecordEventDialog
          agreement={eventFor}
          onClose={() => setEventFor(null)}
          onSaved={() => {
            setEventFor(null)
            void refetch()
          }}
        />
      )}
    </div>
  )
}

function RecordEventDialog({
  agreement,
  onClose,
  onSaved,
}: {
  agreement: FinAgreement
  onClose: () => void
  onSaved: () => void
}) {
  const [type, setType] = useState<string>('DISBURSEMENT')
  const [eventDate, setEventDate] = useState(() => isoToDateInput(new Date().toISOString()))
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!eventDate) {
      toast({ title: 'Pick the event date', variant: 'destructive' })
      return
    }
    setBusy(true)
    const res = await apiRequest(`/api/financier/agreements/${agreement.id}/events`, {
      method: 'POST',
      body: JSON.stringify({
        type,
        eventDate: new Date(`${eventDate}T12:00:00`).toISOString(),
        ...(amount !== '' && Number(amount) > 0 ? { amount: Number(amount) } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    })
    setBusy(false)
    if (!res.ok) {
      toastApiError(res.error, 'Could not record the event')
      return
    }
    toast({ title: 'Event recorded', description: 'Track-only — no money moves on the platform.' })
    onSaved()
  }

  return (
    <Dialog open onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono">{agreement.number}</DialogTitle>
          <DialogDescription>
            Record external money movement — the platform tracks it for the record only.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3.5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="evt-type" className="text-xs">Event type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger id="evt-type" className="h-9 rounded-lg text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{enumLabel(t)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="evt-date" className="text-xs">Date</Label>
              <Input
                id="evt-date"
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="h-9 rounded-lg text-sm"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="evt-amount" className="text-xs">
              Amount ({agreement.offer?.currency ?? 'YER'}){' '}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="evt-amount"
              type="number"
              min={0}
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-9 rounded-lg text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="evt-note" className="text-xs">
              Note <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="evt-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Channel, reference, remarks…"
              className="min-h-[56px] rounded-lg text-sm"
              maxLength={500}
            />
          </div>
          <div className={cn('rounded-lg bg-muted/50 p-3 text-[11px] leading-relaxed text-muted-foreground')}>
            Offer on record: {agreement.offer ? formatMoney(agreement.offer.amount, agreement.offer.currency) : '—'} ·{' '}
            {agreement.offer?.requestNumber ?? '—'} · funded {agreement.fundedReportedAt ? formatDate(agreement.fundedReportedAt) : 'no'}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" className="rounded-lg" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" className="rounded-lg" disabled={busy}>
              {busy ? <Loader2 size={13} className="mr-1 animate-spin" /> : null} Record event
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
