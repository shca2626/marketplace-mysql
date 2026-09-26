'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN · FINANCING — FEES. Platform financing fees on accepted agreements
// (ACCRUED → INVOICED → PAID, invoiced externally — D-002). Mark-invoiced /
// mark-paid state actions mirror the Payout console.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import {
  BadgeCheck,
  Banknote,
  Loader2,
  Receipt,
  SearchX,
  ShieldAlert,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import type { FinancingFeeDTO } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { FilterChips, StatusBadge, apiRequest, toastApiError } from '../shared'
import { FEE_STATUS_MAP, formatDate, formatMoney } from '../../financing/financing-shared'

const STATUS_FILTERS = [
  { value: '', label: 'All fees' },
  { value: 'ACCRUED', label: 'Accrued' },
  { value: 'INVOICED', label: 'Invoiced' },
  { value: 'PAID', label: 'Paid' },
  { value: 'WAIVED', label: 'Waived' },
]

const TYPE_LABELS: Record<string, string> = {
  SUCCESS: 'Success fee',
  ORIGINATION: 'Origination fee',
  ACCREDITATION: 'Accreditation fee',
}

export function FeesSection() {
  const [statusFilter, setStatusFilter] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const query = new URLSearchParams()
  if (statusFilter) query.set('status', statusFilter)
  const { data, loading, error, refetch } = useApi<{ fees: FinancingFeeDTO[] }>(
    `/api/admin/financing/fees?${query.toString()}`
  )
  const fees = data?.fees ?? []

  const outstanding = fees
    .filter((f) => f.status === 'ACCRUED' || f.status === 'INVOICED')
    .reduce((s, f) => s + f.amount, 0)

  const mark = async (fee: FinancingFeeDTO, action: 'mark-invoiced' | 'mark-paid') => {
    setBusy(fee.id)
    const res = await apiRequest<{ fee: FinancingFeeDTO }>(`/api/admin/financing/fees/${fee.id}/${action}`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
    setBusy(null)
    if (!res.ok) {
      toastApiError(res.error, action === 'mark-invoiced' ? 'Could not mark invoiced' : 'Could not mark paid')
      return
    }
    toast({
      title: action === 'mark-invoiced' ? 'Fee marked invoiced' : 'Fee marked paid',
      description: `${res.data?.fee.agreement?.number ?? fee.agreement?.number ?? 'Agreement'} · ${formatMoney(fee.amount)}.`,
    })
    void refetch()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterChips
          options={STATUS_FILTERS}
          value={statusFilter}
          onChange={setStatusFilter}
          ariaLabel="Filter fees by status"
        />
        {fees.length > 0 && (
          <span className="shrink-0 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            {formatMoney(outstanding)} outstanding (accrued + invoiced)
          </span>
        )}
      </div>

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-12 text-center">
          <ShieldAlert size={34} className="text-muted-foreground/40" />
          <p className="mt-3 text-sm font-semibold">Couldn't load the fees</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">{error}</p>
          <Button variant="outline" className="mt-4 rounded-xl" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      )}

      {!loading && !error && fees.length === 0 && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-12 text-center">
          <SearchX size={34} className="text-muted-foreground/40" />
          <p className="mt-3 text-sm font-semibold">
            {statusFilter ? 'No fees with this status' : 'No financing fees yet'}
          </p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            {statusFilter
              ? 'Try another status filter.'
              : 'Fees accrue automatically when an applicant accepts an offer (SUCCESS) or is accredited.'}
          </p>
        </div>
      )}

      {!loading && !error && fees.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-2xl border md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-medium">Agreement</th>
                  <th scope="col" className="px-4 py-3 font-medium">Financier</th>
                  <th scope="col" className="px-4 py-3 font-medium">Type</th>
                  <th scope="col" className="px-4 py-3 font-medium">Base</th>
                  <th scope="col" className="px-4 py-3 font-medium">Rate</th>
                  <th scope="col" className="px-4 py-3 font-medium">Amount</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {fees.map((f) => (
                  <tr key={f.id} className="border-b transition-colors last:border-0 hover:bg-accent/50">
                    <td className="px-4 py-3.5">
                      <p className="font-semibold tabular-nums">{f.agreement?.number ?? f.agreementId.slice(-8)}</p>
                      <p className="max-w-[180px] truncate text-xs text-muted-foreground">
                        {f.agreement?.requestNumber ?? ''}
                      </p>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="max-w-[150px] truncate">{f.agreement?.financierOrgName ?? '—'}</p>
                      <p className="max-w-[150px] truncate text-xs text-muted-foreground">
                        {f.agreement?.applicantName ?? ''}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 text-xs font-medium">{TYPE_LABELS[f.type] ?? f.type}</td>
                    <td className="px-4 py-3.5 tabular-nums text-muted-foreground">{formatMoney(f.baseAmount)}</td>
                    <td className="px-4 py-3.5 tabular-nums text-muted-foreground">{f.percentApplied}%</td>
                    <td className="px-4 py-3.5 font-semibold tabular-nums">{formatMoney(f.amount)}</td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={f.status} map={FEE_STATUS_MAP} />
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {f.paidAt ? `paid ${formatDate(f.paidAt)}` : f.invoicedAt ? `invoiced ${formatDate(f.invoicedAt)}` : `accrued ${formatDate(f.createdAt)}`}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <FeeActions fee={f} busy={busy === f.id} onMark={mark} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile stacked cards */}
          <div className="space-y-3 md:hidden">
            {fees.map((f) => (
              <div key={f.id} className="rounded-2xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold tabular-nums">{f.agreement?.number ?? f.agreementId.slice(-8)}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {TYPE_LABELS[f.type] ?? f.type} · {f.agreement?.financierOrgName ?? '—'}
                    </p>
                  </div>
                  <StatusBadge status={f.status} map={FEE_STATUS_MAP} />
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>
                    {formatMoney(f.baseAmount)} × {f.percentApplied}% ={' '}
                    <span className="font-semibold text-foreground">{formatMoney(f.amount)}</span>
                  </span>
                  <FeeActions fee={f} busy={busy === f.id} onMark={mark} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function FeeActions({
  fee,
  busy,
  onMark,
}: {
  fee: FinancingFeeDTO
  busy: boolean
  onMark: (fee: FinancingFeeDTO, action: 'mark-invoiced' | 'mark-paid') => void
}) {
  if (fee.status === 'ACCRUED') {
    return (
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 rounded-lg" disabled={busy}>
            {busy ? <Loader2 size={13} className="mr-1 animate-spin" /> : <Receipt size={13} className="mr-1" />}
            Mark invoiced
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark the fee invoiced?</AlertDialogTitle>
            <AlertDialogDescription>
              {formatMoney(fee.amount)} on {fee.agreement?.number ?? 'the agreement'} — confirms you
              invoiced the financier externally.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction className="rounded-xl" onClick={() => onMark(fee, 'mark-invoiced')}>
              Mark invoiced
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )
  }
  if (fee.status === 'INVOICED') {
    return (
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" className="h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700" disabled={busy}>
            {busy ? <Loader2 size={13} className="mr-1 animate-spin" /> : <BadgeCheck size={13} className="mr-1" />}
            Mark paid
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark the fee paid?</AlertDialogTitle>
            <AlertDialogDescription>
              {formatMoney(fee.amount)} on {fee.agreement?.number ?? 'the agreement'} — the
              financier settled the invoice.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-emerald-600 hover:bg-emerald-700"
              onClick={() => onMark(fee, 'mark-paid')}
            >
              <Banknote size={13} className="mr-1" /> Mark paid
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )
  }
  return (
    <span className={cn('text-[11px] text-muted-foreground')}>
      {fee.status === 'PAID' ? 'Settled' : fee.status === 'WAIVED' ? 'Waived' : '—'}
    </span>
  )
}
