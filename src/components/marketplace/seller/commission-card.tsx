'use client'

import { ReceiptText, BadgeCheck, FileText, Loader2 } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { formatDate, formatUSD } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
// PLATFORM COMMISSION — supplier transparency (intermediary model).
// Mirrors /api/seller/commission: what the platform earned on this supplier's
// DELIVERED orders (obligations), period statements and invoices with PDF
// downloads. Read-only — collection happens between the platform and the
// supplier; the legacy payout math next door is untouched.
// ─────────────────────────────────────────────────────────────────────────────

interface SellerCommissionData {
  triggerStage: string
  totalsByStatus: Record<string, { count: number; amount: number; collected: number }>
  obligations: {
    id: string
    orderId: string
    orderRef: string
    buyer: { id: string; name: string } | null
    baseAmount: number
    commissionRate: number
    amount: number
    collectedAmount: number
    status: string
    statementId: string | null
    createdAt: string
  }[]
  statements: {
    id: string
    number: string
    periodStart: string
    periodEnd: string
    obligationCount: number
    baseAmount: number
    amount: number
    status: string
    invoices: { id: string; number: string; amount: number; status: string; dueAt: string | null }[]
    createdAt: string
  }[]
}

const OBLIGATION_STATUS: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'Pending', className: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  INVOICED: { label: 'Invoiced', className: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300' },
  PARTIALLY_COLLECTED: { label: 'Partially paid', className: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  COLLECTED: { label: 'Paid', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  WAIVED: { label: 'Waived', className: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
  WRITE_OFF: { label: 'Written off', className: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
}

const STATEMENT_STATUS: Record<string, { label: string; className: string }> = {
  OPEN: { label: 'Open', className: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  ISSUED: { label: 'Invoiced', className: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300' },
  SETTLED: { label: 'Settled', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  CANCELLED: { label: 'Cancelled', className: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
}

export function SellerCommissionCard() {
  const { data, loading, error, refetch } = useApi<SellerCommissionData>('/api/seller/commission')

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ReceiptText size={16} className="text-primary" /> Platform commission
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Commission the platform earns on your delivered orders ({(data?.triggerStage ?? 'DELIVERED').toLowerCase()} is
          the successful stage). Buyer↔supplier settlement stays external — these are your commission obligations,
          statements and invoices.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed p-4">
            <p className="text-xs text-muted-foreground">{error}</p>
            <Button size="sm" variant="outline" className="h-8 rounded-full" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        ) : !data || data.obligations.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed py-10 text-center">
            <BadgeCheck size={28} className="text-muted-foreground/40" />
            <p className="mt-3 text-sm font-medium">No commission obligations yet</p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              When one of your orders is marked delivered, the platform records its commission here.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Totals strip */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(['PENDING', 'INVOICED', 'PARTIALLY_COLLECTED', 'COLLECTED'] as const).map((s) => {
                const t = data.totalsByStatus?.[s]
                return (
                  <div key={s} className="rounded-xl border p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {OBLIGATION_STATUS[s].label}
                    </p>
                    <p className="mt-1 text-sm font-bold tabular-nums">{formatUSD(t?.amount ?? 0)}</p>
                    <p className="text-[10px] text-muted-foreground">{t?.count ?? 0} order(s)</p>
                  </div>
                )
              })}
            </div>

            {/* Obligations list */}
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {data.obligations.map((o) => (
                <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {o.orderRef}
                      {o.buyer ? <span className="text-muted-foreground"> · {o.buyer.name}</span> : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Base {formatUSD(o.baseAmount)} · rate {o.commissionRate.toFixed(2)}% ·{' '}
                      {formatDate(o.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold tabular-nums text-primary">{formatUSD(o.amount)}</span>
                    <Badge className={cn('rounded-full text-[10px] font-semibold uppercase', OBLIGATION_STATUS[o.status]?.className ?? '')}>
                      {OBLIGATION_STATUS[o.status]?.label ?? o.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>

            {/* Statements + invoices */}
            {data.statements.length > 0 && (
              <div className="space-y-2 border-t pt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Statements & invoices
                </p>
                {data.statements.map((s) => (
                  <div key={s.id} className="rounded-xl border px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">
                          {s.number}
                          <span className="text-muted-foreground">
                            {' '}· {s.obligationCount} order(s) · {formatDate(s.periodStart)} – {formatDate(s.periodEnd)}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Base {formatUSD(s.baseAmount)} · commission {formatUSD(s.amount)}
                        </p>
                      </div>
                      <Badge className={cn('rounded-full text-[10px] font-semibold uppercase', STATEMENT_STATUS[s.status]?.className ?? '')}>
                        {STATEMENT_STATUS[s.status]?.label ?? s.status}
                      </Badge>
                    </div>
                    {s.invoices.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {s.invoices.map((inv) => (
                          <a
                            key={inv.id}
                            href={`/api/admin/commission/invoices/${inv.id}/pdf`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors hover:bg-muted"
                          >
                            <FileText size={11} />
                            {inv.number} · {formatUSD(inv.amount)}
                            {inv.status === 'PAID' ? ' · paid' : inv.dueAt ? ` · due ${formatDate(inv.dueAt)}` : ''}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
