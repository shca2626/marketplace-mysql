'use client'

import {
  ArrowDownToLine,
  Banknote,
  CheckCircle2,
  Landmark,
  ReceiptText,
  Wallet,
} from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { formatDate, formatUSD, timeAgo } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

// GET /api/seller/earnings — settlement summary for the signed-in vendor.
interface SellerEarnings {
  commissionRate: number
  pending: { itemCount: number; gross: number; commission: number; net: number }
  lifetime: { payouts: number; paidOut: number; commissionPaid: number }
  payouts: {
    id: string
    number: string
    itemCount: number
    grossAmount: number
    commission: number
    netAmount: number
    status: 'PENDING' | 'PAID' | 'CANCELLED'
    paidAt: string | null
    createdAt: string
  }[]
}

const PAYOUT_STATUS: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'In review', className: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  PAID: { label: 'Paid', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  CANCELLED: { label: 'Cancelled', className: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
}

export function SellerEarningsTab() {
  const { data, loading, error, refetch } = useApi<SellerEarnings>('/api/seller/earnings')

  // ── Error state ──
  if (error) {
    return (
      <Card className="flex flex-col items-center border-dashed py-16 text-center">
        <Wallet size={40} className="text-muted-foreground/40" />
        <h2 className="mt-4 text-lg font-semibold">Couldn&apos;t load your earnings</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" className="mt-5 rounded-full" onClick={() => void refetch()}>
          Try again
        </Button>
      </Card>
    )
  }

  // ── Loading skeletons ──
  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }

  const { commissionRate, pending, lifetime, payouts } = data

  return (
    <div className="space-y-6">
      {/* ── Hero stat tiles ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="border-emerald-500/30">
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Pending net payout
              </p>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Wallet size={15} />
              </span>
            </div>
            <p className="mt-3 truncate text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatUSD(pending.net)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {pending.itemCount} paid item{pending.itemCount === 1 ? '' : 's'} · gross {formatUSD(pending.gross)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Platform commission
              </p>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Landmark size={15} />
              </span>
            </div>
            <p className="mt-3 text-2xl font-bold tabular-nums">{commissionRate}%</p>
            <p className="mt-1 text-xs text-muted-foreground">platform default · deducted from each sale</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Lifetime paid out
              </p>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Banknote size={15} />
              </span>
            </div>
            <p className="mt-3 truncate text-2xl font-bold tabular-nums">{formatUSD(lifetime.paidOut)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              net transferred to your account
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Payouts
              </p>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ReceiptText size={15} />
              </span>
            </div>
            <p className="mt-3 text-2xl font-bold tabular-nums">{lifetime.payouts}</p>
            <p className="mt-1 text-xs text-muted-foreground">lifetime payout batches</p>
          </CardContent>
        </Card>
      </div>

      {/* ── How payouts work ── */}
      <Card className="border-dashed">
        <CardContent className="p-5">
          <p className="text-sm font-semibold">How payouts work</p>
          <div className="mt-4 grid gap-5 sm:grid-cols-3">
            {[
              {
                icon: CheckCircle2,
                title: 'Buyers pay the platform',
                body: 'Orders are paid by card or bank transfer through Vendora — you never chase invoices.',
              },
              {
                icon: Landmark,
                title: 'We settle net of commission',
                body: `Each batch deducts the ${commissionRate}% platform commission — your pending balance already reflects it.`,
              },
              {
                icon: ArrowDownToLine,
                title: 'Wired to your account',
                body: 'When a payout is marked paid, the net amount is wired to your account on file.',
              },
            ].map((step, i) => (
              <div key={step.title} className="flex gap-3.5 sm:flex-col">
                <div className="flex items-center gap-3 sm:gap-0">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <step.icon size={16} />
                  </span>
                  <span className="font-mono text-xs font-bold text-muted-foreground sm:hidden">
                    Step {i + 1}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    <span className="mr-1.5 hidden font-mono text-xs text-muted-foreground sm:inline">
                      {i + 1}.
                    </span>
                    {step.title}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Payout history ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ReceiptText size={16} className="text-primary" /> Payout history
            <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              {payouts.length}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {payouts.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <Wallet size={40} className="text-muted-foreground/40" />
              <p className="mt-4 font-semibold">No payouts yet</p>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                Your first payout batch appears here once paid orders are settled and released by the
                platform.
              </p>
            </div>
          ) : (
            payouts.map((p) => {
              const status = PAYOUT_STATUS[p.status] ?? {
                label: p.status,
                className: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
              }
              return (
                <div key={p.id} className="rounded-xl border p-4 transition-colors hover:border-primary/40">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="rounded-md bg-muted px-2 py-1 font-mono text-xs font-bold tracking-wide">
                        {p.number}
                      </span>
                      <span className="text-xs text-muted-foreground">created {timeAgo(p.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      {p.paidAt && (
                        <span className="text-xs text-muted-foreground">paid {formatDate(p.paidAt)}</span>
                      )}
                      <Badge className={cn('rounded-full text-[11px] font-semibold', status.className)}>
                        {status.label}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1.5 text-sm">
                    <span className="text-xs text-muted-foreground">
                      {p.itemCount} item{p.itemCount === 1 ? '' : 's'}
                    </span>
                    <span className="text-muted-foreground">
                      Gross{' '}
                      <span className="font-semibold tabular-nums text-foreground">
                        {formatUSD(p.grossAmount)}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      − commission{' '}
                      <span className="tabular-nums">{formatUSD(p.commission)}</span>
                    </span>
                    <span
                      className={cn(
                        'ml-auto text-base font-bold tabular-nums',
                        p.status === 'PAID' && 'text-emerald-600 dark:text-emerald-400'
                      )}
                    >
                      Net {formatUSD(p.netAmount)}
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>
    </div>
  )
}
