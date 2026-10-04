'use client'

import { useState } from 'react'
import {
  ArrowLeftRight,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  Paperclip,
  RefreshCcw,
  ShieldCheck,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { formatDate, formatUSD, timeAgo } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { AdminEmptyState, SearchInput, apiRequest, toastApiError, useDebounced } from './shared'
import type { Settlement } from '../settlement-card'

/** Admin listing adds buyer + supplier-count context to the base settlement. */
interface AdminSettlement extends Settlement {
  buyer: { id: string; name: string } | null
  sellerCount: number
}

const STATUS_STYLES: Record<string, string> = {
  DECLARED: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  CONFIRMED: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300',
  DISPUTED: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN · EXTERNAL SETTLEMENTS — platform oversight of buyer↔supplier money
// that settles OUTSIDE the platform (intermediary model). One reference per
// order: DECLARED → CONFIRMED (counterpart/admin) or DISPUTED → CONFIRMED
// (admin). Evidence documents are attached by the parties.
// ─────────────────────────────────────────────────────────────────────────────

interface SettlementsResponse {
  total: number
  page: number
  pages: number
  totalsByStatus: Record<string, number>
  settlements: AdminSettlement[]
}

const STATUS_FILTERS = ['DECLARED', 'CONFIRMED', 'DISPUTED'] as const

const METHOD_LABELS: Record<string, string> = {
  WIRE: 'Bank wire',
  TRANSFER: 'Transfer',
  CHEQUE: 'Cheque',
  CASH: 'Cash',
  OTHER: 'Other',
}

export function SettlementsTab() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<string>('')
  const [page, setPage] = useState(1)
  const [busyId, setBusyId] = useState<string | null>(null)
  const debounced = useDebounced(search, 300)

  const query = new URLSearchParams()
  if (debounced) query.set('q', debounced)
  if (status) query.set('status', status)
  query.set('page', String(page))
  query.set('limit', '20')

  const { data, loading, error, refetch } = useApi<SettlementsResponse>(
    `/api/admin/settlements?${query.toString()}`
  )

  const confirm = async (orderId: string) => {
    setBusyId(orderId)
    try {
      const res = await apiRequest(`/api/orders/${orderId}/settlement/confirm`, { method: 'POST' })
      if (!res.ok) {
        toastApiError(res.error, 'Could not confirm')
        return
      }
      toast({ title: 'Settlement confirmed', description: 'The record is now fully evidenced.' })
      await refetch()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Summary chips */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="border-dashed">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Declared</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{data?.totalsByStatus?.DECLARED ?? 0}</p>
            <p className="text-[11px] text-muted-foreground">awaiting confirmation</p>
          </CardContent>
        </Card>
        <Card className="border-dashed">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Confirmed</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {data?.totalsByStatus?.CONFIRMED ?? 0}
            </p>
            <p className="text-[11px] text-muted-foreground">fully evidenced</p>
          </CardContent>
        </Card>
        <Card className="border-dashed">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Disputed</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-destructive">
              {data?.totalsByStatus?.DISPUTED ?? 0}
            </p>
            <p className="text-[11px] text-muted-foreground">needs admin resolution</p>
          </CardContent>
        </Card>
        <Card className="border-dashed">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Model</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
              <ShieldCheck size={14} className="text-primary" /> Intermediary
            </p>
            <p className="text-[11px] text-muted-foreground">no platform custody</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center justify-between gap-3 text-base">
            <span className="flex items-center gap-2">
              <ArrowLeftRight size={16} className="text-primary" /> External settlements
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Order, PO or reference…" ariaLabel="Search settlements" />
              <div className="flex gap-1">
                <Button size="sm" variant={status === '' ? 'default' : 'outline'} className="h-8 rounded-full text-xs" onClick={() => { setStatus(''); setPage(1) }}>
                  All
                </Button>
                {STATUS_FILTERS.map((s) => (
                  <Button key={s} size="sm" variant={status === s ? 'default' : 'outline'} className="h-8 rounded-full text-xs" onClick={() => { setStatus(s); setPage(1) }}>
                    {s.charAt(0) + s.slice(1).toLowerCase()}
                  </Button>
                ))}
                <Button size="sm" variant="ghost" className="h-8 rounded-full" onClick={() => void refetch()} aria-label="Refresh">
                  <RefreshCcw size={13} />
                </Button>
              </div>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : error ? (
            <AdminEmptyState icon={ArrowLeftRight} title="Couldn't load settlements" description={error} />
          ) : !data || data.settlements.length === 0 ? (
            <div className="flex flex-col items-center rounded-xl border border-dashed py-12 text-center">
              <ArrowLeftRight size={32} className="text-muted-foreground/40" />
              <p className="mt-3 text-sm font-medium">No external settlements recorded</p>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                Company buyers checking out with external settlement — or any buyer declaring one from their orders
                page — will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.settlements.map((s) => (
                <div key={s.id} className="rounded-xl border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-mono text-xs font-bold tracking-wide">{s.orderRef}</p>
                        <Badge className={cn('rounded-full text-[10px] font-semibold uppercase', STATUS_STYLES[s.status] ?? '')}>
                          {s.status.toLowerCase()}
                        </Badge>
                        <Badge variant="outline" className="rounded-full text-[10px] uppercase">
                          {METHOD_LABELS[s.method] ?? s.method}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm">
                        <span className="font-medium">{s.buyer?.name ?? 'Buyer'}</span>
                        <span className="text-muted-foreground">
                          {' '}→ {s.sellerCount} supplier{s.sellerCount === 1 ? '' : 's'} ·{' '}
                          {formatUSD(s.orderTotal)} (order {s.orderStatus.toLowerCase()})
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Reference {s.reference ?? '—'} · declared by {s.declaredBy?.name ?? '—'} {timeAgo(s.declaredAt)}
                        {s.confirmedBy ? ` · confirmed by ${s.confirmedBy.name}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {s.evidence.length > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          <Paperclip size={10} /> {s.evidence.length} proof(s)
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">no proof yet</span>
                      )}
                      {s.status !== 'CONFIRMED' && (
                        <Button
                          size="sm"
                          className="h-8 rounded-full text-xs"
                          disabled={busyId === s.orderId}
                          onClick={() => confirm(s.orderId)}
                        >
                          <BadgeCheck size={13} className="mr-1" />
                          {s.status === 'DISPUTED' ? 'Resolve & confirm' : 'Confirm'}
                        </Button>
                      )}
                    </div>
                  </div>
                  {s.status === 'DISPUTED' && s.note && (
                    <p className="mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      Disputed: {s.note}
                    </p>
                  )}
                  {s.evidence.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {s.evidence.map((ev) => (
                        <a
                          key={ev.id}
                          href={`${ev.url}?download=${encodeURIComponent(ev.name)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-7 max-w-[220px] items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors hover:bg-muted"
                        >
                          <Paperclip size={10} className="shrink-0" />
                          <span className="truncate">{ev.name}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {/* Pagination */}
              {data.pages > 1 && (
                <div className="flex items-center justify-between pt-1">
                  <p className="text-xs text-muted-foreground">
                    Page {data.page} of {data.pages} · {data.total} record(s)
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-8 rounded-full" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                      <ChevronLeft size={13} /> Prev
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 rounded-full" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>
                      Next <ChevronRight size={13} />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
