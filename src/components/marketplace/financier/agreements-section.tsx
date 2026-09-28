'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FINANCIER · AGREEMENTS — accepted offers: funding status reporting
// (PENDING → REPORTED_FUNDED → REPORTED_SETTLED) with typed money events
// (track-only ledger — D-002: the platform never touches financing money)
// + installment schedule + event timeline + close status.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { CalendarPlus, ChevronDown, Loader2, ScrollText, Users } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import type { FinancingAgreementDTO } from '@/lib/types'
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
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  AGREEMENT_STATUS_MAP,
  apiRequest,
  EmptyState,
  formatDate,
  formatDateTime,
  formatMoney,
  FUNDING_STATUS_MAP,
  isoToDateInput,
  LabeledValue,
  StatusBadge,
  toastApiError,
} from '@/components/marketplace/financing/financing-shared'

const EVENT_TYPES = ['DISBURSEMENT', 'REPAYMENT', 'EARLY_SETTLEMENT', 'LATE_FEE', 'NOTE'] as const

export function AgreementsSection() {
  const { data, loading, error, refetch } = useApi<{ agreements: FinancingAgreementDTO[] }>('/api/financier/agreements')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [eventFor, setEventFor] = useState<FinancingAgreementDTO | null>(null)

  const reportFunding = async (agreement: FinancingAgreementDTO, fundingStatus: 'REPORTED_FUNDED' | 'REPORTED_SETTLED') => {
    const res = await apiRequest(`/api/financier/agreements/${agreement.id}/funding-status`, {
      method: 'POST',
      body: JSON.stringify({
        fundingStatus,
        event: {
          type: fundingStatus === 'REPORTED_FUNDED' ? 'DISBURSEMENT' : 'EARLY_SETTLEMENT',
          eventDate: new Date().toISOString(),
          note: fundingStatus === 'REPORTED_FUNDED' ? 'Funding reported by the financier' : 'Settlement reported by the financier',
        },
      }),
    })
    if (!res.ok) return toastApiError(res.error)
    toast({
      title: fundingStatus === 'REPORTED_FUNDED' ? 'Funding reported' : 'Settlement reported',
      description: `${agreement.number} → ${fundingStatus === 'REPORTED_FUNDED' ? 'FUNDED' : 'SETTLED'} (a typed event was recorded).`,
    })
    void refetch()
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
    )
  }
  if (error) {
    return (
      <EmptyState icon={ScrollText} title="Could not load agreements" description={error}>
        <Button variant="outline" className="rounded-xl" onClick={() => void refetch()}>
          Retry
        </Button>
      </EmptyState>
    )
  }

  const agreements = data?.agreements ?? []

  return (
    <div className="space-y-4">
      <p className="rounded-2xl border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
        Money moves directly between you and the applicant — Vendora only records reported facts (track-only ledger, D-002).
      </p>
      {agreements.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No agreements yet"
          description="When an applicant accepts one of your offers, the agreement lands here with the frozen offer and installment schedule."
        />
      ) : (
        <div className="space-y-3">
          {agreements.map((a) => {
            const expanded = expandedId === a.id
            return (
              <Card key={a.id}>
                <CardContent className="p-4 sm:p-5">
                  <button
                    type="button"
                    className="flex w-full flex-wrap items-center gap-2 text-left"
                    onClick={() => setExpandedId(expanded ? null : a.id)}
                    aria-expanded={expanded}
                  >
                    <span className="rounded-lg bg-muted px-2 py-1 font-mono text-xs font-bold">{a.number}</span>
                    <StatusBadge status={a.fundingStatus} map={FUNDING_STATUS_MAP} />
                    <StatusBadge status={a.status} map={AGREEMENT_STATUS_MAP} />
                    <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                      {formatMoney(a.offer.amount, a.offer.currency)}
                      <ChevronDown size={14} className={cn('transition-transform', expanded && 'rotate-180')} />
                    </span>
                  </button>

                  <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                    <LabeledValue label="Request">
                      <span className="font-mono text-[11px] font-semibold">{a.request.number}</span>
                    </LabeledValue>
                    <LabeledValue label="Applicant">
                      <span className="inline-flex items-center gap-1 font-semibold">
                        <Users size={11} className="text-muted-foreground" />
                        {a.request.organizationName ?? a.request.applicantName}
                      </span>
                    </LabeledValue>
                    <LabeledValue label="Service">
                      <span className="font-semibold">{a.request.serviceName}</span>
                    </LabeledValue>
                    <LabeledValue label="Accepted">
                      <span className="font-semibold">{formatDate(a.acceptedAt)}</span>
                    </LabeledValue>
                  </div>

                  {expanded && (
                    <div className="mt-4 space-y-4">
                      {a.offer.installments.length > 0 && (
                        <div className="overflow-hidden rounded-xl border">
                          <table className="w-full text-left text-[11px]">
                            <caption className="bg-muted/60 px-2.5 py-1.5 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                              Installment schedule (frozen with the accepted offer — DP-20)
                            </caption>
                            <thead className="bg-muted/60 uppercase tracking-wide text-muted-foreground">
                              <tr>
                                <th className="px-2.5 py-1.5 font-semibold">#</th>
                                <th className="px-2.5 py-1.5 font-semibold">Due</th>
                                <th className="px-2.5 py-1.5 text-right font-semibold">Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {a.offer.installments.map((inst) => (
                                <tr key={inst.id} className="border-t bg-background">
                                  <td className="px-2.5 py-1.5 font-bold">{inst.installmentNo}</td>
                                  <td className="px-2.5 py-1.5">{formatDate(inst.dueDate)}</td>
                                  <td className="px-2.5 py-1.5 text-right font-semibold">{formatMoney(inst.amount, a.offer.currency)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {a.events.length > 0 && (
                        <div>
                          <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Event timeline</p>
                          <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1 [scrollbar-width:thin]">
                            {a.events.map((e) => (
                              <li key={e.id} className="rounded-lg border bg-muted/30 px-3 py-2 text-[11.5px]">
                                <span className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-full bg-background px-1.5 py-0.5 text-[10px] font-bold text-foreground/80">{e.type}</span>
                                  <span className="font-semibold">{formatDate(e.eventDate)}</span>
                                  {e.amount != null && <span className="ml-auto font-semibold">{formatMoney(e.amount, a.offer.currency)}</span>}
                                </span>
                                {e.note && <p className="mt-0.5 text-muted-foreground">{e.note}</p>}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {a.status === 'ACTIVE' && (
                        <div className="flex flex-wrap gap-2 border-t pt-3">
                          {a.fundingStatus === 'PENDING' && (
                            <Button size="sm" className="rounded-lg" onClick={() => void reportFunding(a, 'REPORTED_FUNDED')}>
                              Report funded
                            </Button>
                          )}
                          {a.fundingStatus === 'REPORTED_FUNDED' && (
                            <Button size="sm" className="rounded-lg" onClick={() => void reportFunding(a, 'REPORTED_SETTLED')}>
                              Report settled
                            </Button>
                          )}
                          <Button size="sm" variant="outline" className="rounded-lg" onClick={() => setEventFor(a)}>
                            <CalendarPlus size={12} className="mr-1" /> Add money event
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <EventDialog agreement={eventFor} onOpenChange={(o) => !o && setEventFor(null)} onSaved={() => void refetch()} />
    </div>
  )
}

function EventDialog({
  agreement,
  onOpenChange,
  onSaved,
}: {
  agreement: FinancingAgreementDTO | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [type, setType] = useState<string>('REPAYMENT')
  const [eventDate, setEventDate] = useState(() => isoToDateInput(new Date().toISOString()))
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [closeStatus, setCloseStatus] = useState('NONE')
  const [submitting, setSubmitting] = useState(false)
  const [initializedFor, setInitializedFor] = useState<string | null>(null)

  const key = agreement?.id ?? null
  if (agreement && initializedFor !== key) {
    setInitializedFor(key)
    setType('REPAYMENT')
    setEventDate(isoToDateInput(new Date().toISOString()))
    setAmount('')
    setNote('')
    setCloseStatus('NONE')
  }
  if (!agreement && initializedFor !== null) setInitializedFor(null)

  const submit = async () => {
    if (!agreement) return
    if (type === 'NOTE' && note.trim().length < 3) {
      toast({ title: 'A note is required', description: 'NOTE events carry their text as the payload.', variant: 'destructive' })
      return
    }
    setSubmitting(true)
    const res = await apiRequest(`/api/financier/agreements/${agreement.id}/events`, {
      method: 'POST',
      body: JSON.stringify({
        type,
        eventDate: eventDate ? new Date(`${eventDate}T12:00:00`).toISOString() : undefined,
        amount: amount.trim() ? Number(amount) : null,
        note: note.trim() || null,
        ...(closeStatus !== 'NONE' ? { status: closeStatus } : {}),
      }),
    })
    setSubmitting(false)
    if (!res.ok) return toastApiError(res.error)
    toast({
      title: 'Event recorded',
      description: `${type} on ${agreement.number}${closeStatus !== 'NONE' ? ` — agreement ${closeStatus.toLowerCase()}` : ''}.`,
    })
    onOpenChange(false)
    onSaved()
  }

  return (
    <Dialog open={!!agreement} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report a money event — {agreement?.number}</DialogTitle>
          <DialogDescription>
            Track-only facts ({formatDateTime(agreement?.createdAt)}) — disbursements, repayments, late fees or notes. No money moves on Vendora.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Event type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="h-9 rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.charAt(0) + t.slice(1).toLowerCase().replace('_', ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ev-date" className="text-xs">
              Date
            </Label>
            <Input id="ev-date" type="date" className="h-9 rounded-lg" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ev-amount" className="text-xs">
              Amount ({agreement?.offer.currency ?? 'YER'})
            </Label>
            <Input id="ev-amount" type="number" min="0" className="h-9 rounded-lg" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="optional" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Close agreement</Label>
            <Select value={closeStatus} onValueChange={setCloseStatus}>
              <SelectTrigger className="h-9 rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">Keep active</SelectItem>
                <SelectItem value="COMPLETED">Mark completed</SelectItem>
                <SelectItem value="DEFAULTED">Mark defaulted</SelectItem>
                <SelectItem value="CANCELLED">Mark cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ev-note" className="text-xs">
              Note
            </Label>
            <Textarea id="ev-note" className="min-h-[54px] rounded-lg" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional context for this event" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button className="rounded-xl" onClick={() => void submit()} disabled={submitting}>
            {submitting && <Loader2 size={14} className="mr-1.5 animate-spin" />} Record event
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
