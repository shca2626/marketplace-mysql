'use client'

// ─────────────────────────────────────────────────────────────────────────────
// BUYER STATEMENT (Phase 10 — lastplan v5 §10.8, buyer side)
//
// The buyer-obligation ledger for ONE agreement, rendered inside the buyer's
// agreements expanded card: installment schedule with paid/outstanding and
// aging chips, the payments history (allocation summary + reversal links),
// and the totals row (credit included when present). Read-only.
//
// Graceful-hidden: renders null on 403/404 or when there is nothing to show
// (no schedule) — it must never break the agreements card that hosts it.
// ─────────────────────────────────────────────────────────────────────────────

import { AlertTriangle, CalendarClock, CheckCircle2, ReceiptText, Undo2, Wallet } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { formatDate, formatDateTime, formatMoney } from '@/components/marketplace/financing/financing-shared'

interface StatementInstallment {
  installmentId: string
  installmentNo: number
  dueDate: string
  scheduled: number
  paid: number
  outstanding: number
  status: 'PAID' | 'PARTIAL' | 'OVERDUE' | 'DUE_SOON' | 'UPCOMING'
  daysLate: number
  agingBucket: 'CURRENT' | 'D1_30' | 'D31_60' | 'D61_90' | 'D90_PLUS'
}

interface StatementPayment {
  id: string
  receivedAt: string
  channel: string
  reference: string | null
  amount: number
  currency: string
  effectiveAmount: number
  status: string
  note: string | null
  reversalOfId: string | null
  reversalIds: string[]
  allocated: number
  unallocated: number
}

interface StatementData {
  agreementId: string
  agreementNumber: string
  currency: string
  npl: boolean
  installments: StatementInstallment[]
  payments: StatementPayment[]
  totals: {
    scheduled: number
    paid: number
    outstanding: number
    unallocatedCredit: number
    overdueAmount: number
  }
}

// warm semantic chips (NO blue/indigo)
const INST_STATUS_MAP: Record<StatementInstallment['status'], string> = {
  PAID: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  PARTIAL: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  OVERDUE: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  DUE_SOON: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  UPCOMING: 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400',
}

const AGING_MAP: Record<StatementInstallment['agingBucket'], string> = {
  CURRENT: 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400',
  D1_30: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  D31_60: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  D61_90: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  D90_PLUS: 'bg-rose-200 font-bold text-rose-900 dark:bg-rose-950 dark:text-rose-200',
}

const AGING_LABEL: Record<StatementInstallment['agingBucket'], string> = {
  CURRENT: 'Current',
  D1_30: '1–30d late',
  D31_60: '31–60d late',
  D61_90: '61–90d late',
  D90_PLUS: '90+d late',
}

function channelLabel(c: string): string {
  if (c === 'REVERSAL') return 'Reversal'
  return c.charAt(0) + c.slice(1).toLowerCase().replace('_', ' ')
}

export function BuyerStatement({ agreementId, currency }: { agreementId: string; currency: string }) {
  // 403/404 (not the applicant / not found) hide the block entirely.
  const { data, loading, error } = useApi<{ statement: StatementData }>(
    `/api/financing/agreements/${agreementId}/statement`
  )

  if (loading) {
    return (
      <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
        <Skeleton className="h-4 w-40 rounded-md" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    )
  }
  if (error || !data?.statement) return null
  const s = data.statement
  if (s.installments.length === 0) return null
  const c = s.currency || currency

  return (
    <div className="space-y-3 rounded-xl border bg-muted/30 p-3">
      {/* ── Heading + NPL flag ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <ReceiptText size={12} className="text-primary" /> Installment statement
        </h4>
        {s.npl && (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-200 px-2 py-0.5 text-[10px] font-bold text-rose-900 dark:bg-rose-950 dark:text-rose-200">
            <AlertTriangle size={10} /> Non-performing (90+ days)
          </span>
        )}
      </div>

      {/* ── Schedule table ─────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-lg border">
        <Table className="w-full text-left text-[11px]">
          <TableHeader className="bg-muted/60 uppercase tracking-wide text-muted-foreground">
            <TableRow>
              <TableHead className="px-2 py-1.5 font-semibold">#</TableHead>
              <TableHead className="px-2 py-1.5 font-semibold">Due</TableHead>
              <TableHead className="px-2 py-1.5 text-right font-semibold">Amount</TableHead>
              <TableHead className="px-2 py-1.5 text-right font-semibold">Paid</TableHead>
              <TableHead className="px-2 py-1.5 text-right font-semibold">Outstanding</TableHead>
              <TableHead className="px-2 py-1.5 font-semibold">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {s.installments.map((inst) => (
              <TableRow key={inst.installmentId} className="bg-background">
                <TableCell className="px-2 py-1.5 font-bold">{inst.installmentNo}</TableCell>
                <TableCell className="px-2 py-1.5">
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock size={10} className="text-muted-foreground" />
                    {formatDate(inst.dueDate)}
                  </span>
                </TableCell>
                <TableCell className="px-2 py-1.5 text-right font-mono">{formatMoney(inst.scheduled, c)}</TableCell>
                <TableCell className="px-2 py-1.5 text-right font-mono text-emerald-700 dark:text-emerald-400">
                  {inst.paid > 0 ? formatMoney(inst.paid, c) : '—'}
                </TableCell>
                <TableCell className={cn('px-2 py-1.5 text-right font-mono', inst.outstanding > 0 && 'font-semibold')}>
                  {inst.outstanding > 0 ? formatMoney(inst.outstanding, c) : '—'}
                </TableCell>
                <TableCell className="px-2 py-1.5">
                  <span className="flex flex-wrap items-center gap-1">
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                        INST_STATUS_MAP[inst.status]
                      )}
                    >
                      {inst.status === 'DUE_SOON' ? 'Due soon' : inst.status.charAt(0) + inst.status.slice(1).toLowerCase()}
                    </span>
                    {inst.agingBucket !== 'CURRENT' && (
                      <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold', AGING_MAP[inst.agingBucket])}>
                        {AGING_LABEL[inst.agingBucket]}
                      </span>
                    )}
                  </span>
                </TableCell>
              </TableRow>
            ))}
            {/* totals row */}
            <TableRow className="border-t-2 bg-muted/50 font-bold">
              <TableCell className="px-2 py-1.5" colSpan={2}>
                Totals
              </TableCell>
              <TableCell className="px-2 py-1.5 text-right font-mono">{formatMoney(s.totals.scheduled, c)}</TableCell>
              <TableCell className="px-2 py-1.5 text-right font-mono">{formatMoney(s.totals.paid, c)}</TableCell>
              <TableCell className="px-2 py-1.5 text-right font-mono">{formatMoney(s.totals.outstanding, c)}</TableCell>
              <TableCell className="px-2 py-1.5 text-[10px] text-muted-foreground">
                {s.totals.overdueAmount > 0 && (
                  <span className="font-bold text-rose-700 dark:text-rose-400">{formatMoney(s.totals.overdueAmount, c)} overdue</span>
                )}
                {s.totals.unallocatedCredit > 0.009 && (
                  <span className="block text-amber-600">
                    credit {formatMoney(s.totals.unallocatedCredit, c)}
                  </span>
                )}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {/* ── Payments history ──────────────────────────────────────────────── */}
      {s.payments.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Payments received</h4>
          <ul className="max-h-40 space-y-1.5 overflow-y-auto pr-1 [scrollbar-width:thin]">
            {s.payments.map((p) => {
              const isReversal = p.reversalOfId != null
              return (
                <li
                  key={p.id}
                  className={cn('flex flex-wrap items-center gap-2 rounded-lg border bg-background px-2.5 py-2 text-[11px]', isReversal && 'border-rose-200 dark:border-rose-900')}
                >
                  <span
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-md',
                      isReversal ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                    )}
                  >
                    {isReversal ? <Undo2 size={10} /> : <CheckCircle2 size={10} />}
                  </span>
                  <span className="font-semibold">{channelLabel(p.channel)}</span>
                  <span className="text-muted-foreground">{formatDate(p.receivedAt)}</span>
                  <span className={cn('ml-auto font-mono font-semibold', isReversal && 'text-rose-700 dark:text-rose-400')}>
                    {isReversal ? '−' : ''}
                    {formatMoney(p.currency === c ? p.amount : p.effectiveAmount, p.currency === c ? p.currency : c)}
                  </span>
                  <span className="w-full text-[10px] text-muted-foreground">
                    applied {formatMoney(p.allocated, c)}
                    {p.unallocated > 0.009 && ` · credit ${formatMoney(p.unallocated, c)}`}
                    {p.reversalIds.length > 0 && ` · ${p.reversalIds.length} reversal(s)`}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <p className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
        <Wallet size={11} className="mt-0.5 shrink-0" />
        Reported by your financier from their payment rails — updated {formatDateTime(new Date().toISOString())}.
      </p>
    </div>
  )
}
