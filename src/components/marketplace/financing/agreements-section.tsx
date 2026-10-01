'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FINANCING · AGREEMENTS (applicant) — my agreements list with the frozen
// offer, installment schedule, platform fees and the money-event timeline
// (track-only, reported by the financier).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { motion } from 'framer-motion'
import { CalendarClock, ChevronDown, CircleDollarSign, ScrollText, Wallet } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import type { FinancingAgreementDTO } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import {
  AGREEMENT_STATUS_MAP,
  EmptyState,
  FEE_STATUS_MAP,
  formatDate,
  formatDateTime,
  formatMoney,
  FUNDING_STATUS_MAP,
  LabeledValue,
  RATE_TYPE_LABELS,
  StatusBadge,
  timeAgo,
} from '@/components/marketplace/financing/financing-shared'

export function AgreementsSection() {
  const { data, loading, error, refetch } = useApi<{ agreements: FinancingAgreementDTO[] }>('/api/financing/agreements')
  const [expanded, setExpanded] = useState<string | null>(null)

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
      <EmptyState icon={ScrollText} title="Could not load your agreements" description={error}>
        <Button variant="outline" className="rounded-xl" onClick={() => void refetch()}>
          Retry
        </Button>
      </EmptyState>
    )
  }

  const agreements = data?.agreements ?? []
  if (agreements.length === 0) {
    return (
      <EmptyState
        icon={ScrollText}
        title="No agreements yet"
        description="Accepting an offer creates your agreement here — with the frozen installment schedule the financier reported."
      />
    )
  }

  return (
    <div className="space-y-3">
      {agreements.map((a) => {
        const open = expanded === a.id
        return (
          <motion.div key={a.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
            <Card className="transition-shadow hover:shadow-md">
              <CardContent className="space-y-3 p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-lg bg-muted px-2 py-1 font-mono text-xs font-bold">{a.number}</span>
                  <StatusBadge status={a.status} map={AGREEMENT_STATUS_MAP} />
                  <StatusBadge status={a.fundingStatus} map={FUNDING_STATUS_MAP} />
                  <span className="ml-auto font-mono text-sm font-bold">
                    {formatMoney(a.offer.amount, a.offer.currency)}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{a.request.serviceName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {a.request.financierOrgName} · from request {a.request.number} · accepted {formatDate(a.acceptedAt)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[10.5px] font-semibold">
                  {a.offer.ratePercent != null && (
                    <span className="rounded-full bg-muted px-2 py-0.5">
                      {a.offer.rateType ? (RATE_TYPE_LABELS[a.offer.rateType] ?? a.offer.rateType) : 'Rate'} {a.offer.ratePercent}%
                    </span>
                  )}
                  <span className="rounded-full bg-muted px-2 py-0.5">{a.offer.tenorMonths} months</span>
                  <span className="rounded-full bg-muted px-2 py-0.5">{a.offer.installments.length} installments</span>
                  {/* FIN-008: label the platform's success fee explicitly and keep
                      the financier's flat fee visible — two different fees, one
                      word before. */}
                  {a.offer.feeFlat != null && (
                    <span className="rounded-full bg-muted px-2 py-0.5">
                      Financier fee {formatMoney(a.offer.feeFlat, a.offer.currency)}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                    <CircleDollarSign size={10} /> Vendora platform fee {formatMoney(a.fees[0]?.amount ?? 0, a.offer.currency)}
                    {a.fees[0]?.percentApplied != null && a.fees[0].percentApplied > 0 ? ` (${a.fees[0].percentApplied}%)` : ''}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 w-full rounded-xl"
                  onClick={() => setExpanded(open ? null : a.id)}
                >
                  {open ? 'Hide' : 'View'} schedule & events
                  <ChevronDown size={14} className={cn('ml-1.5 transition-transform', open && 'rotate-180')} />
                </Button>

                {open && (
                  <div className="space-y-4 pt-1">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                      <LabeledValue label="Offer">{formatMoney(a.offer.amount, a.offer.currency)}</LabeledValue>
                      <LabeledValue label="Tenor">{a.offer.tenorMonths} months</LabeledValue>
                      <LabeledValue label="Collateral">{a.offer.collateralRequired ?? 'None stated'}</LabeledValue>
                      <LabeledValue label="Platform fee status">
                        <span className="inline-flex items-center gap-1.5">
                          {a.fees[0] && <StatusBadge status={a.fees[0].status} map={FEE_STATUS_MAP} />}
                          {!a.fees[0] && '—'}
                        </span>
                      </LabeledValue>
                    </div>

                    <div className="overflow-hidden rounded-xl border">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="h-9 text-[11px]">#</TableHead>
                            <TableHead className="h-9 text-[11px]">Due date</TableHead>
                            <TableHead className="h-9 text-[11px] text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {a.offer.installments.map((inst) => (
                            <TableRow key={inst.id}>
                              <TableCell className="py-2 text-xs font-semibold">{inst.installmentNo}</TableCell>
                              <TableCell className="py-2 text-xs">{formatDate(inst.dueDate)}</TableCell>
                              <TableCell className="py-2 text-right font-mono text-xs">
                                {formatMoney(inst.amount, a.offer.currency)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Money events</h4>
                      {a.events.length === 0 ? (
                        <p className="mt-1.5 rounded-lg border border-dashed px-3 py-3 text-center text-xs text-muted-foreground">
                          The financier reports disbursements and repayments here — track-only, no money moves on the
                          platform.
                        </p>
                      ) : (
                        <ol className="mt-2 space-y-2">
                          {a.events.map((e) => (
                            <li key={e.id} className="flex items-start gap-3 rounded-xl border px-3 py-2.5 text-xs">
                              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                <Wallet size={13} />
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold">
                                  {e.type.replaceAll('_', ' ').toLowerCase()}
                                  {e.amount != null && ` — ${formatMoney(e.amount, a.offer.currency)}`}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                  <CalendarClock size={10} className="mr-1 inline" />
                                  {formatDate(e.eventDate)} · reported {timeAgo(e.createdAt)}
                                  {e.note ? ` · ${e.note}` : ''}
                                </p>
                              </div>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )
      })}
    </div>
  )
}
