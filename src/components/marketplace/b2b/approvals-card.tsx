'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  BadgeCheck,
  Ban,
  Check,
  ClipboardCheck,
  Clock,
  Hourglass,
  Loader2,
  Pencil,
  ReceiptText,
  ShieldCheck,
  X,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import type { ApprovalRequestDTO, OrganizationDTO } from '@/lib/types'
import { formatDate, formatUSD } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'

/**
 * Approval workflow card for the Business Account view:
 * - Policy row: the org's approval threshold, editable by OWNER/ADMIN.
 * - Queue (approvers): pending requests with Approve/Reject + decision note.
 * - Track (buyers): their own requests and outcomes.
 */

interface ApprovalsResponse {
  approvals: ApprovalRequestDTO[]
  canDecide: boolean
  organizationId: string | null
}

const STATUS_CHIP: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  APPROVED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  CANCELLED: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
        type === 'ORDER'
          ? 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300'
          : 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300'
      )}
    >
      {type === 'ORDER' ? <ClipboardCheck size={11} /> : <ReceiptText size={11} />}
      {type === 'ORDER' ? 'Order' : 'Quote acceptance'}
    </span>
  )
}

function RequestBody({ request }: { request: ApprovalRequestDTO }) {
  return (
    <div className="space-y-2">
      {request.type === 'ORDER' && request.order ? (
        <ul className="space-y-1.5">
          {request.order.items.map((item, idx) => (
            <li key={idx} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-muted-foreground">
                <span className="font-medium text-foreground">{item.title}</span>
                {item.variantName ? <span className="text-xs"> · {item.variantName}</span> : null} × {item.quantity}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{formatUSD(item.price * item.quantity)}</span>
            </li>
          ))}
        </ul>
      ) : request.type === 'QUOTE_ACCEPT' && request.quote ? (
        <p className="text-sm text-muted-foreground">
          Accepting quote <span className="font-mono font-semibold text-foreground">{request.quote.number}</span>
          {request.quote.paymentTerms ? <> · {request.quote.paymentTerms}</> : null}
          {request.quote.validUntil ? (
            <> · valid until {new Date(request.quote.validUntil).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</>
          ) : null}
        </p>
      ) : null}
      {request.note && (
        <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs italic text-muted-foreground">“{request.note}”</p>
      )}
    </div>
  )
}

export function ApprovalsCard({
  org,
  myRole,
  onChanged,
}: {
  org: OrganizationDTO
  myRole?: string
  onChanged?: () => void
}) {
  const { data, loading, refetch } = useApi<ApprovalsResponse>('/api/approvals')
  const [deciding, setDeciding] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState<ApprovalRequestDTO | null>(null)
  const [dialogAction, setDialogAction] = useState<'APPROVE' | 'REJECT'>('APPROVE')
  const [decisionNote, setDecisionNote] = useState('')

  // ── Policy editing (OWNER/ADMIN) ──
  const canEditPolicy = myRole === 'OWNER' || myRole === 'ADMIN'
  const [editingPolicy, setEditingPolicy] = useState(false)
  const [thresholdInput, setThresholdInput] = useState('')
  const [savingPolicy, setSavingPolicy] = useState(false)

  useEffect(() => {
    if (data) onChanged?.()
  }, [data?.approvals.length])

  const pending = useMemo(() => (data?.approvals ?? []).filter((a) => a.status === 'PENDING'), [data])
  const history = useMemo(() => (data?.approvals ?? []).filter((a) => a.status !== 'PENDING'), [data])
  const myPending = useMemo(() => pending.filter((a) => a.requester?.id), [pending])

  const openDialog = (request: ApprovalRequestDTO, action: 'APPROVE' | 'REJECT') => {
    setDialogAction(action)
    setDecisionNote('')
    setDialogOpen(request)
  }

  const submitDecision = async () => {
    if (!dialogOpen) return
    setDeciding(dialogOpen.id)
    try {
      const res = await fetch(`/api/approvals/${dialogOpen.id}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: dialogAction, note: decisionNote.trim() || undefined }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Decision failed', description: json.error ?? 'Something went wrong', variant: 'destructive' })
        return
      }
      toast({
        title: dialogAction === 'APPROVE' ? 'Approved' : 'Rejected',
        description:
          dialogAction === 'APPROVE'
            ? `${dialogOpen.requester?.name ?? 'The requester'}'s ${dialogOpen.type === 'ORDER' ? 'order' : 'quote acceptance'} of ${formatUSD(dialogOpen.amount)} was approved.`
            : `The ${dialogOpen.type === 'ORDER' ? 'order was cancelled and restocked' : 'quote stays open for renegotiation'}.`,
      })
      setDialogOpen(null)
      void refetch()
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' })
    } finally {
      setDeciding(null)
    }
  }

  const savePolicy = async (clear: boolean) => {
    const parsed = clear ? null : Number.parseFloat(thresholdInput)
    if (!clear && (Number.isNaN(parsed) || parsed < 0)) {
      toast({ title: 'Invalid threshold', description: 'Enter a dollar amount of 0 or more', variant: 'destructive' })
      return
    }
    setSavingPolicy(true)
    try {
      const res = await fetch(`/api/organizations/${org.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalThreshold: parsed }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Could not save policy', description: json.error ?? 'Something went wrong', variant: 'destructive' })
        return
      }
      toast({
        title: clear ? 'Approvals turned off' : 'Approval policy updated',
        description: clear
          ? 'Team buyers can place orders without approval again.'
          : `Orders of ${formatUSD(parsed!)}+ placed by buyers now require approval.`,
      })
      setEditingPolicy(false)
      onChanged?.()
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' })
    } finally {
      setSavingPolicy(false)
    }
  }

  const threshold = org.approvalThreshold ?? null

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-primary" /> Purchase approvals
            {pending.length > 0 && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">
                {pending.length}
              </span>
            )}
          </span>
          <span className="text-xs font-normal text-muted-foreground">
            {data?.canDecide ? 'You can decide requests' : 'Your requests'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* ── Policy row ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 px-4 py-3">
          {editingPolicy ? (
            <div className="flex w-full flex-wrap items-end gap-2">
              <div className="min-w-40 flex-1 space-y-1">
                <Label htmlFor="approval-threshold" className="text-xs text-muted-foreground">
                  Approve orders at or above
                </Label>
                <Input
                  id="approval-threshold"
                  type="number"
                  min={0}
                  step="0.01"
                  value={thresholdInput}
                  onChange={(e) => setThresholdInput(e.target.value)}
                  placeholder="e.g. 500"
                  className="rounded-xl"
                  autoFocus
                />
              </div>
              <Button size="sm" className="rounded-xl" onClick={() => void savePolicy(false)} disabled={savingPolicy}>
                {savingPolicy ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Check size={14} className="mr-1" />}
                Save
              </Button>
              <Button size="sm" variant="outline" className="rounded-xl" onClick={() => void savePolicy(true)} disabled={savingPolicy}>
                Turn off
              </Button>
              <Button size="sm" variant="ghost" className="rounded-xl" onClick={() => setEditingPolicy(false)}>
                <X size={14} />
              </Button>
            </div>
          ) : (
            <>
              <p className="flex min-w-0 items-center gap-2 text-sm">
                {threshold !== null ? (
                  <>
                    <BadgeCheck size={15} className="shrink-0 text-primary" />
                    <span>
                      Orders of <span className="font-bold">{formatUSD(threshold)}+</span>{' '}
                      <span className="text-muted-foreground">placed by buyers need approval</span>
                    </span>
                  </>
                ) : (
                  <>
                    <Hourglass size={15} className="shrink-0 text-muted-foreground" />
                    <span className="text-muted-foreground">
                      Approvals are off — buyers order freely.
                    </span>
                  </>
                )}
              </p>
              {canEditPolicy && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-full text-xs"
                  onClick={() => {
                    setThresholdInput(threshold !== null ? String(threshold) : '')
                    setEditingPolicy(true)
                  }}
                >
                  <Pencil size={13} className="mr-1" /> Edit policy
                </Button>
              )}
            </>
          )}
        </div>

        {loading && !data ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : pending.length === 0 && history.length === 0 ? (
          <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            {data?.canDecide
              ? 'Nothing to approve right now — requests from team buyers will land here.'
              : threshold !== null
                ? `Your orders of ${formatUSD(threshold)}+ will be routed to an approver first.`
                : 'No approval requests yet.'}
          </p>
        ) : (
          <>
            {/* ── Pending queue / my pending requests ── */}
            <ul className="space-y-3">
              {(data?.canDecide ? pending : myPending).map((request) => (
                <motion.li
                  key={request.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl border p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <TypeBadge type={request.type} />
                        <span className="text-sm font-bold tabular-nums">{formatUSD(request.amount)}</span>
                        {request.order?.poNumber && (
                          <span className="font-mono text-xs text-muted-foreground">PO {request.order.poNumber}</span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {data?.canDecide ? (
                          <>
                            <span className="font-medium text-foreground">{request.requester?.name}</span> requested ·{' '}
                            {formatDate(request.createdAt)}
                          </>
                        ) : (
                          <>Requested · {formatDate(request.createdAt)}</>
                        )}
                      </p>
                    </div>
                    {data?.canDecide && (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          className="h-8 rounded-full text-xs"
                          onClick={() => openDialog(request, 'APPROVE')}
                          disabled={deciding === request.id}
                        >
                          <Check size={13} className="mr-1" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-full text-xs text-red-600 hover:text-red-700 dark:text-red-400"
                          onClick={() => openDialog(request, 'REJECT')}
                          disabled={deciding === request.id}
                        >
                          <Ban size={13} className="mr-1" /> Reject
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="mt-3">
                    <RequestBody request={request} />
                  </div>
                  {!data?.canDecide && (
                    <p className="mt-3 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                      <Clock size={12} /> Waiting for an approver in your organization
                    </p>
                  )}
                </motion.li>
              ))}
            </ul>

            {/* ── Decision history ── */}
            {history.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Recent decisions
                </p>
                <ul className="divide-y rounded-xl border">
                  {history.slice(0, 6).map((request) => (
                    <li key={request.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                      <span
                        className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', STATUS_CHIP[request.status])}
                      >
                        {request.status}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        <span className="font-medium">{request.requester?.name}</span>
                        <span className="text-muted-foreground">
                          {' '}
                          · {request.type === 'ORDER' ? 'order' : 'quote acceptance'} ·{' '}
                        </span>
                        <span className="font-semibold tabular-nums">{formatUSD(request.amount)}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {request.decidedAt ? formatDate(request.decidedAt) : ''}
                        {request.decidedBy?.name ? ` · ${request.decidedBy.name}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>

      {/* ── Decision confirm dialog ── */}
      <AlertDialog open={!!dialogOpen} onOpenChange={(o) => !o && setDialogOpen(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {dialogAction === 'APPROVE' ? 'Approve this request?' : 'Reject this request?'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  {dialogAction === 'APPROVE' ? (
                    <>
                      {dialogOpen?.type === 'ORDER'
                        ? "The held order will be released to the seller and charged as placed. You can't undo this."
                        : 'The quote will be accepted on behalf of your organization and competing quotes declined automatically.'}
                    </>
                  ) : (
                    <>
                      {dialogOpen?.type === 'ORDER'
                        ? 'The order will be cancelled and every item returned to stock.'
                        : 'The quote stays open — the requester can keep negotiating or ask for a revised offer.'}
                    </>
                  )}
                </p>
                {dialogOpen && (
                  <div className="rounded-lg border bg-muted/40 p-3">
                    <div className="flex items-center gap-2">
                      <TypeBadge type={dialogOpen.type} />
                      <span className="text-sm font-bold tabular-nums">{formatUSD(dialogOpen.amount)}</span>
                    </div>
                    <div className="mt-2">
                      <RequestBody request={dialogOpen} />
                    </div>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="decision-note" className="text-xs text-muted-foreground">
                    Note for the requester (optional)
                  </Label>
                  <Textarea
                    id="decision-note"
                    value={decisionNote}
                    onChange={(e) => setDecisionNote(e.target.value)}
                    placeholder={
                      dialogAction === 'APPROVE' ? 'e.g. Approved for the office refresh' : 'e.g. Over budget this quarter'
                    }
                    className="min-h-[64px] rounded-xl"
                    maxLength={500}
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              onClick={() => void submitDecision()}
              disabled={deciding === dialogOpen?.id}
              className={cn(
                dialogAction === 'REJECT' &&
                  'bg-red-600 text-white hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-500'
              )}
            >
              {deciding === dialogOpen?.id ? (
                <Loader2 size={14} className="mr-1.5 animate-spin" />
              ) : dialogAction === 'APPROVE' ? (
                <Check size={14} className="mr-1.5" />
              ) : (
                <Ban size={14} className="mr-1.5" />
              )}
              {dialogAction === 'APPROVE' ? 'Approve' : 'Reject'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
