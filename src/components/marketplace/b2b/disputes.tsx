'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  CircleCheck,
  MessageSquareText,
  Scale,
  Send,
  ShieldQuestion,
  X,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useMarketplace } from '@/store/marketplace'
import { apiRequest } from './b2b-shared'
import type { DisputeDTO, OrderDTO } from '@/lib/types'
import { formatDate, formatUSD } from '@/lib/format'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

/**
 * DISPUTE RESOLUTION UI (settings: Dispute Resolution panel).
 *
 * One shared module serves all three roles:
 *  • buyer — raises disputes on orders, sees the timeline, can withdraw
 *  • seller — sees disputes against them, posts a response
 *  • admin  — mediation queue + records the outcome
 *
 * The available reasons/outcomes and the enable state come from /api/rfq-config
 * (disputes section) so the platform settings drive the forms.
 */

// ── Display maps ─────────────────────────────────────────────────────────────

export const DISPUTE_STATUS_MAP: Record<string, { label: string; badge: string }> = {
  OPEN: { label: 'Open', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  SELLER_RESPONDED: { label: 'Seller responded', badge: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300' },
  ESCALATED: { label: 'Escalated', badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' },
  RESOLVED: { label: 'Resolved', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  CLOSED: { label: 'Closed', badge: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
  CANCELLED: { label: 'Withdrawn', badge: 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400' },
}

export const DISPUTE_REASON_LABELS: Record<string, string> = {
  NOT_AS_DESCRIBED: 'Not as described',
  DAMAGED: 'Damaged',
  LATE_DELIVERY: 'Late delivery',
  WRONG_QUANTITY: 'Wrong quantity',
  QUALITY_ISSUE: 'Quality issue',
  PAYMENT_NOT_RECEIVED: 'Payment not received',
  OTHER: 'Other',
}

export const DISPUTE_OUTCOME_LABELS: Record<string, string> = {
  FULL_REFUND: 'Full refund',
  PARTIAL_REFUND: 'Partial refund',
  REPLACEMENT: 'Replacement',
  REPAIR: 'Repair',
  NO_ACTION: 'No action',
  SELLER_PENALTY: 'Seller penalty',
}

export interface DisputesPublicConfig {
  enabled: boolean
  windowDays: number
  reasons: string[]
  buyerCancelOwn: boolean
  sellerResponseDays: number
  showDisputeCount: boolean
}

// ── Raise dispute dialog (buyer) ─────────────────────────────────────────────

export function RaiseDisputeDialog({
  order,
  config,
  onCreated,
  children,
}: {
  order: OrderDTO
  config: DisputesPublicConfig | null
  onCreated?: (d: DisputeDTO) => void
  children: (open: () => void) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)

  const reasons = config?.reasons?.length ? config.reasons : Object.keys(DISPUTE_REASON_LABELS)
  const sellers = [...new Map(order.items.map((i) => [i.sellerId, i])).values()]
  const singleSeller = sellers.length === 1 ? sellers[0] : null

  const submit = async () => {
    if (!reason) {
      toast({ title: 'Pick a reason', description: 'What went wrong with this order?', variant: 'destructive' })
      return
    }
    if (description.trim().length < 10) {
      toast({ title: 'Add details', description: 'Describe the issue in at least 10 characters.', variant: 'destructive' })
      return
    }
    setBusy(true)
    const res = await apiRequest<{ dispute: DisputeDTO }>('/api/disputes', {
      method: 'POST',
      body: JSON.stringify({
        orderId: order.id,
        sellerId: singleSeller?.sellerId ?? undefined,
        reason,
        description: description.trim(),
        amount: amount ? Number(amount) : null,
      }),
    })
    setBusy(false)
    if (!res.ok) {
      toast({ title: 'Could not open dispute', description: res.error, variant: 'destructive' })
      return
    }
    toast({
      title: `Dispute ${res.data?.dispute.number} opened`,
      description: 'The seller has been notified and must respond within the response window.',
    })
    setOpen(false)
    setReason('')
    setDescription('')
    setAmount('')
    if (res.data) onCreated?.(res.data.dispute)
  }

  if (!config?.enabled) {
    return children(() =>
      toast({ title: 'Disputes are disabled', description: 'The platform is not accepting disputes right now.' })
    )
  }

  return (
    <>
      {children(() => setOpen(true))}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldQuestion size={18} className="text-rose-600" />
              Open a dispute
            </DialogTitle>
            <DialogDescription>
              Order #{order.id.slice(-8).toUpperCase()} · {formatUSD(order.total)}. The seller has{' '}
              {config.sellerResponseDays} day{config.sellerResponseDays === 1 ? '' : 's'} to respond; unresolved
              disputes escalate to platform admins.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="dispute-reason">Reason</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger id="dispute-reason" className="w-full rounded-xl">
                  <SelectValue placeholder="What went wrong?" />
                </SelectTrigger>
                <SelectContent>
                  {reasons.map((r) => (
                    <SelectItem key={r} value={r}>
                      {DISPUTE_REASON_LABELS[r] ?? r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dispute-description">What happened?</Label>
              <Textarea
                id="dispute-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="rounded-xl"
                placeholder="Describe the issue — condition on arrival, missing units, delays…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dispute-amount">Claimed amount (optional)</Label>
              <Input
                id="dispute-amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="rounded-xl"
                placeholder={`Up to ${formatUSD(order.total)}`}
              />
              <p className="text-xs text-muted-foreground">Used when the platform allows partial resolutions.</p>
            </div>
            {!singleSeller && (
              <p className="rounded-xl border border-dashed px-3 py-2 text-xs text-muted-foreground">
                This order spans multiple sellers — the dispute targets the seller of the first line item by default.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button className="rounded-full" disabled={busy} onClick={() => void submit()}>
              {busy ? 'Opening…' : 'Open dispute'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ── Dispute detail dialog (all roles; actions by role) ──────────────────────

export function DisputeDetailDialog({
  dispute,
  onChanged,
  autoOpen = false,
  children,
}: {
  dispute: DisputeDTO
  onChanged?: (d: DisputeDTO | null) => void
  autoOpen?: boolean // open on mount / dispute change (deep links)
  children: (open: () => void) => React.ReactNode
}) {
  const user = useMarketplace((s) => s.user)
  const [open, setOpen] = useState(autoOpen)
  const [seenAutoId, setSeenAutoId] = useState<string | null>(autoOpen ? dispute.id : null)
  // Render-time derived state (the established lint-clean pattern): when the
  // parent swaps in a new dispute while autoOpen, show it without an effect.
  if (autoOpen && seenAutoId !== dispute.id) {
    setSeenAutoId(dispute.id)
    setOpen(true)
  }
  const [response, setResponse] = useState('')
  const [outcome, setOutcome] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const isAdmin = user?.role === 'ADMIN'
  const isBuyer = user?.id === dispute.buyer.id
  const isSeller = user?.id === dispute.seller.id
  const openLike = ['OPEN', 'SELLER_RESPONDED', 'ESCALATED'].includes(dispute.status)

  const act = async (url: string, body?: string) => {
    setBusy(true)
    const res = await apiRequest<{ dispute: DisputeDTO }>(url, { method: 'POST', body })
    setBusy(false)
    if (!res.ok) {
      toast({ title: 'Action failed', description: res.error, variant: 'destructive' })
      return
    }
    return res.data?.dispute
  }

  const respond = async () => {
    if (response.trim().length < 10) {
      toast({ title: 'Write a response', description: 'At least 10 characters.', variant: 'destructive' })
      return
    }
    const d = await act(`/api/disputes/${dispute.id}/respond`, JSON.stringify({ response: response.trim() }))
    if (d) {
      toast({ title: 'Response sent', description: 'The buyer has been notified.' })
      setResponse('')
      setOpen(false)
      onChanged?.(d)
    }
  }

  const withdraw = async () => {
    const d = await act(`/api/disputes/${dispute.id}/cancel`)
    if (d) {
      toast({ title: 'Dispute withdrawn', description: `Dispute ${dispute.number} is closed.` })
      setOpen(false)
      onChanged?.(d)
    }
  }

  const resolve = async () => {
    if (!outcome) {
      toast({ title: 'Pick an outcome', description: 'How should this dispute be settled?', variant: 'destructive' })
      return
    }
    const d = await act(`/api/admin/disputes/${dispute.id}/resolve`, JSON.stringify({ outcome, note: note.trim() || null }))
    if (d) {
      toast({ title: 'Dispute resolved', description: `${DISPUTE_OUTCOME_LABELS[outcome] ?? outcome} recorded.` })
      setOutcome('')
      setNote('')
      setOpen(false)
      onChanged?.(d)
    }
  }

  const status = DISPUTE_STATUS_MAP[dispute.status]

  return (
    <>
      {children(() => setOpen(true))}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <Scale size={18} className="text-primary" />
              Dispute {dispute.number}
              <Badge className={cn('rounded-full border-0 text-[11px] font-semibold', status?.badge)}>
                {status?.label ?? dispute.status}
              </Badge>
            </DialogTitle>
            <DialogDescription>
              Order {dispute.orderNumber} · {formatUSD(dispute.orderTotal)} · raised {formatDate(dispute.createdAt)} by{' '}
              {dispute.buyer.name} against {dispute.seller.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Buyer's claim */}
            <div className="rounded-xl border bg-muted/30 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {DISPUTE_REASON_LABELS[dispute.reason] ?? dispute.reason}
                </p>
                {dispute.amount != null && (
                  <span className="text-xs font-semibold">{formatUSD(dispute.amount)} claimed</span>
                )}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm">{dispute.description}</p>
            </div>

            {/* Seller response */}
            {dispute.sellerResponse ? (
              <div className="rounded-xl border border-teal-500/30 bg-teal-500/5 p-4">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-teal-700 dark:text-teal-300">
                  <MessageSquareText size={13} /> Seller response
                  {dispute.sellerRespondedAt && (
                    <span className="font-normal normal-case text-muted-foreground">
                      · {formatDate(dispute.sellerRespondedAt)}
                    </span>
                  )}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm">{dispute.sellerResponse}</p>
              </div>
            ) : openLike ? (
              <div className="flex items-center gap-2 rounded-xl border border-dashed px-4 py-3 text-xs text-muted-foreground">
                <HourglassIcon /> Awaiting the seller&apos;s response
              </div>
            ) : null}

            {/* Resolution */}
            {(dispute.status === 'RESOLVED' || dispute.status === 'CLOSED') && dispute.outcome && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                  <CircleCheck size={13} /> {DISPUTE_OUTCOME_LABELS[dispute.outcome] ?? dispute.outcome}
                  {dispute.resolvedBy && (
                    <span className="font-normal normal-case text-muted-foreground">
                      · by {dispute.resolvedBy.name} · {dispute.resolvedAt ? formatDate(dispute.resolvedAt) : ''}
                    </span>
                  )}
                </p>
                {dispute.resolutionNote && (
                  <p className="mt-2 whitespace-pre-wrap text-sm">{dispute.resolutionNote}</p>
                )}
              </div>
            )}

            {/* Seller respond form */}
            {openLike && isSeller && !dispute.sellerResponse && (
              <div className="space-y-2 rounded-xl border p-4">
                <Label htmlFor={`resp-${dispute.id}`}>Your response</Label>
                <Textarea
                  id={`resp-${dispute.id}`}
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  rows={3}
                  className="rounded-xl"
                  placeholder="Explain what happened and how you propose to fix it…"
                />
                <Button size="sm" className="rounded-full" disabled={busy} onClick={() => void respond()}>
                  <Send size={13} className="mr-1.5" /> Send response
                </Button>
              </div>
            )}

            {/* Admin resolve form */}
            {openLike && isAdmin && (
              <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-primary">Mediate this dispute</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Outcome</Label>
                    <Select value={outcome} onValueChange={setOutcome}>
                      <SelectTrigger className="w-full rounded-xl">
                        <SelectValue placeholder="Pick an outcome" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(DISPUTE_OUTCOME_LABELS).map(([v, l]) => (
                          <SelectItem key={v} value={v}>
                            {l}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`note-${dispute.id}`}>Note (optional)</Label>
                    <Input
                      id={`note-${dispute.id}`}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className="rounded-xl"
                      placeholder="Reasoning shared with both parties"
                    />
                  </div>
                </div>
                <Button size="sm" className="rounded-full" disabled={busy} onClick={() => void resolve()}>
                  <CircleCheck size={13} className="mr-1.5" /> Record outcome
                </Button>
              </div>
            )}

            {/* Buyer withdraw */}
            {openLike && isBuyer && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  Resolved things directly with the seller? You can withdraw this dispute.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 rounded-full text-xs"
                  disabled={busy}
                  onClick={() => void withdraw()}
                >
                  <X size={12} className="mr-1" /> Withdraw
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function HourglassIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
      <path d="M5 22h14M5 2h14M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" />
    </svg>
  )
}

// ── Dispute card (compact list row) ──────────────────────────────────────────

export function DisputeCard({
  dispute,
  onOpen,
}: {
  dispute: DisputeDTO
  onOpen: (d: DisputeDTO) => void
}) {
  const status = DISPUTE_STATUS_MAP[dispute.status]
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      <Card
        className="cursor-pointer border-rose-500/20 transition-shadow hover:shadow-md"
        onClick={() => onOpen(dispute)}
      >
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-bold tracking-wide text-muted-foreground">
                {dispute.number}
              </span>
              <Badge className={cn('rounded-full border-0 text-[11px] font-semibold', status?.badge)}>
                {status?.label ?? dispute.status}
              </Badge>
            </div>
            <p className="mt-1 line-clamp-1 text-sm font-medium">
              {DISPUTE_REASON_LABELS[dispute.reason] ?? dispute.reason}
            </p>
            <p className="text-xs text-muted-foreground">
              Order {dispute.orderNumber} · {formatUSD(dispute.orderTotal)} · {formatDate(dispute.createdAt)}
            </p>
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
            <AlertTriangle size={15} />
          </span>
        </CardContent>
      </Card>
    </motion.div>
  )
}
