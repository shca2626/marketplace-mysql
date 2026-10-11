'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FEES — the platform commission console (FIN-7 sub-tab 5).
// ACCRUED when an offer is accepted → INVOICED → PAID (or WAIVED). The money
// itself is collected off-platform; this console tracks the lifecycle.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { Banknote, Ban, Loader2, Receipt, SearchX, Send } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { AdminEmptyState, FilterChips, apiRequest, toastApiError } from '../shared'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/format'
import {
  FEE_STATUS_MAP,
  FinancingStatusBadge,
  formatMoney,
} from '@/components/marketplace/financier/financing-status-badge'
import { cn } from '@/lib/utils'
import type { AdminFeeDTO } from './shared'

const STATUS_FILTERS = [
  { value: 'ALL', label: 'All' },
  { value: 'ACCRUED', label: 'Accrued' },
  { value: 'INVOICED', label: 'Invoiced' },
  { value: 'PAID', label: 'Paid' },
  { value: 'WAIVED', label: 'Waived' },
]

type FeeAction = 'invoice' | 'mark-paid' | 'waive'

const ACTION_COPY: Record<FeeAction, { title: string; description: string; cta: string }> = {
  invoice: {
    title: 'Send the invoice?',
    description: 'The fee moves from ACCRUED to INVOICED — you are confirming the invoice was issued to the financier.',
    cta: 'Mark invoiced',
  },
  'mark-paid': {
    title: 'Mark as paid?',
    description: 'The fee settles to PAID. Only do this once the money has actually been received (collected off-platform).',
    cta: 'Mark paid',
  },
  waive: {
    title: 'Waive this fee?',
    description: 'The fee is written off (WAIVED) — no money will be collected for it. This cannot be undone.',
    cta: 'Waive fee',
  },
}

export function FeesTab() {
  const [status, setStatus] = useState('ALL')
  const query = status === 'ALL' ? '' : `?status=${status}`
  const { data, loading, error, refetch } = useApi<{ fees: AdminFeeDTO[] }>(`/api/admin/financing/fees${query}`)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [pending, setPending] = useState<{ fee: AdminFeeDTO; action: FeeAction } | null>(null)

  const fees = data?.fees ?? []

  const runAction = async () => {
    if (!pending) return
    setBusyId(pending.fee.id)
    const res = await apiRequest<{ status: string }>(`/api/admin/financing/fees/${pending.fee.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: pending.action }),
    })
    setBusyId(null)
    if (!res.ok) return toastApiError(res.error, 'Fee update failed')
    toast({
      title: `Fee ${res.data?.status.toLowerCase()}`,
      description: `${pending.fee.agreementNumber} · ${formatMoney(pending.fee.amount)} → ${res.data?.status}.`,
    })
    setPending(null)
    void refetch()
  }

  return (
    <div className="space-y-4">
      <FilterChips options={STATUS_FILTERS} value={status} onChange={setStatus} ariaLabel="Filter fees by status" />

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <AdminEmptyState icon={SearchX} title="Couldn't load the fee ledger" description={error} />
      ) : fees.length === 0 ? (
        <AdminEmptyState
          icon={Banknote}
          title="No fees in this state"
          description="A fee accrues automatically when an applicant accepts a financing offer — it then moves ACCRUED → INVOICED → PAID here."
        />
      ) : (
        <div className="space-y-3">
          {fees.map((f) => (
            <Card key={f.id}>
              <CardContent className="space-y-2.5 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold tracking-wide text-muted-foreground">{f.agreementNumber}</span>
                  <Badge className="rounded-full border-0 bg-muted text-[11px] font-semibold text-muted-foreground">
                    {f.type.toLowerCase().replace(/_/g, ' ')}
                  </Badge>
                  <FinancingStatusBadge status={f.status} map={FEE_STATUS_MAP} />
                  <span className="ml-auto text-[11px] text-muted-foreground">accrued {formatDate(f.createdAt)}</span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{f.applicantOrganization ?? 'Applicant'}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {f.financierName ?? 'Financier'} · base {formatMoney(f.baseAmount)} · {f.percentApplied}% applied
                    </p>
                  </div>
                  <p className="text-lg font-extrabold tabular-nums">{formatMoney(f.amount)}</p>
                </div>

                {!['PAID', 'WAIVED'].includes(f.status) && (
                  <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
                    {f.status === 'ACCRUED' && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-xl"
                        disabled={busyId === f.id}
                        onClick={() => setPending({ fee: f, action: 'invoice' })}
                      >
                        <Send size={14} className="mr-1.5" /> Invoice
                      </Button>
                    )}
                    {f.status !== 'WAIVED' && (
                      <Button
                        type="button"
                        size="sm"
                        className="rounded-xl bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600"
                        disabled={busyId === f.id}
                        onClick={() => setPending({ fee: f, action: 'mark-paid' })}
                      >
                        {busyId === f.id ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Receipt size={14} className="mr-1.5" />}
                        Mark paid
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-xl text-muted-foreground"
                      disabled={busyId === f.id}
                      onClick={() => setPending({ fee: f, action: 'waive' })}
                    >
                      <Ban size={14} className="mr-1.5" /> Waive
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* action confirmation */}
      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Banknote size={17} className="text-primary" />
              {pending ? ACTION_COPY[pending.action].title : ''}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending
                ? `${ACTION_COPY[pending.action].description} Fee ${formatMoney(pending.fee.amount)} on ${pending.fee.agreementNumber}.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn(
                'rounded-xl',
                pending?.action === 'waive' && 'bg-destructive text-white hover:bg-destructive/90',
                pending?.action === 'mark-paid' && 'bg-emerald-600 text-white hover:bg-emerald-700'
              )}
              onClick={() => void runAction()}
              disabled={!!busyId}
            >
              {busyId && <Loader2 size={14} className="mr-1.5 animate-spin" />}
              {pending ? ACTION_COPY[pending.action].cta : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
