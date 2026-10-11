'use client'

import { useState } from 'react'
import {
  Ban,
  Coins,
  DatabaseZap,
  FileText,
  PiggyBank,
  ReceiptText,
  RefreshCcw,
  Send,
  Wallet,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { formatDate, formatUSD } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  AdminEmptyState,
  SearchInput,
  apiRequest,
  toastApiError,
  useDebounced,
} from './shared'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN · COMMISSION — the intermediary monetization console. Obligations are
// created when orders reach DELIVERED (the successful stage); they group into
// period statements, are billed via CIV invoices (PDF) and tracked through
// collection (partial → collected / waived / written off).
// ─────────────────────────────────────────────────────────────────────────────

interface ObligationsResponse {
  total: number
  page: number
  pages: number
  totalsByStatus: Record<string, { count: number; amount: number }>
  candidates: {
    seller: { id: string; name: string; storeName: string | null; email: string }
    obligationCount: number
    baseAmount: number
    amount: number
  }[]
  obligations: {
    id: string
    orderId: string
    orderRef: string
    buyer: { id: string; name: string } | null
    sellerId: string
    baseAmount: number
    commissionRate: number
    amount: number
    collectedAmount: number
    status: string
    statementId: string | null
    createdAt: string
  }[]
}

interface StatementsResponse {
  total: number
  statements: {
    id: string
    number: string
    seller: { id: string; name: string; storeName: string | null; email: string }
    periodStart: string
    periodEnd: string
    obligationCount: number
    baseAmount: number
    amount: number
    status: string
    issuedAt: string | null
    invoices: { id: string; number: string; amount: number; status: string; dueAt: string | null; createdAt: string }[]
    createdAt: string
  }[]
}

const OBLIGATION_FILTERS = ['PENDING', 'INVOICED', 'PARTIALLY_COLLECTED', 'COLLECTED', 'WAIVED', 'WRITE_OFF'] as const

const OBLIGATION_BADGE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  INVOICED: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  PARTIALLY_COLLECTED: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  COLLECTED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  WAIVED: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
  WRITE_OFF: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
}

const STATEMENT_BADGE: Record<string, string> = {
  OPEN: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  ISSUED: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  SETTLED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  CANCELLED: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
}

const statusLabel = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ')

export function CommissionTab() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [backfilling, setBackfilling] = useState(false)
  const [collectFor, setCollectFor] = useState<ObligationsResponse['obligations'][number] | null>(null)
  const [collectAmount, setCollectAmount] = useState('')
  const debounced = useDebounced(search, 300)

  const query = new URLSearchParams()
  if (debounced) query.set('q', debounced)
  if (status) query.set('status', status)

  const obligationsApi = useApi<ObligationsResponse>(`/api/admin/commission/obligations?${query.toString()}`)
  const statementsApi = useApi<StatementsResponse>('/api/admin/commission/statements?limit=10')

  const obligations = obligationsApi.data
  const refreshAll = async () => {
    await Promise.all([obligationsApi.refetch(), statementsApi.refetch()])
  }

  const generateStatement = async (sellerId: string) => {
    setBusyId(sellerId)
    try {
      const res = await apiRequest<{ statement: { number: string } }>('/api/admin/commission/statements/generate', {
        method: 'POST',
        body: JSON.stringify({ sellerId }),
      })
      if (!res.ok || !res.data) {
        toastApiError(res.error, 'Could not prepare statement')
        return
      }
      toast({ title: `Statement ${res.data.statement.number} prepared`, description: 'Obligations grouped — issue the invoice when ready.' })
      await refreshAll()
    } finally {
      setBusyId(null)
    }
  }

  const issueInvoice = async (statementId: string) => {
    setBusyId(statementId)
    try {
      const res = await apiRequest<{ invoice: { number: string } }>(`/api/admin/commission/statements/${statementId}/issue-invoice`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      if (!res.ok || !res.data) {
        toastApiError(res.error, 'Could not issue invoice')
        return
      }
      toast({ title: `Invoice ${res.data.invoice.number} issued`, description: 'The supplier was notified and can download the PDF.' })
      await refreshAll()
    } finally {
      setBusyId(null)
    }
  }

  const cancelStatement = async (statementId: string) => {
    setBusyId(statementId)
    try {
      const res = await apiRequest(`/api/admin/commission/statements/${statementId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        toastApiError(res.error, 'Could not cancel')
        return
      }
      toast({ title: 'Statement cancelled', description: 'Obligations released back to pending.' })
      await refreshAll()
    } finally {
      setBusyId(null)
    }
  }

  const collect = async () => {
    if (!collectFor) return
    const amount = Number(collectAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ title: 'Enter a positive amount', variant: 'destructive' })
      return
    }
    setBusyId(collectFor.id)
    try {
      const res = await apiRequest(`/api/admin/commission/obligations/${collectFor.id}/collect`, {
        method: 'POST',
        body: JSON.stringify({ amount }),
      })
      if (!res.ok) {
        toastApiError(res.error, 'Could not record collection')
        return
      }
      toast({ title: 'Collection recorded', description: `${formatUSD(amount)} marked as received.` })
      setCollectFor(null)
      setCollectAmount('')
      await refreshAll()
    } finally {
      setBusyId(null)
    }
  }

  const adjust = async (obligationId: string, action: 'WAIVE' | 'WRITE_OFF') => {
    setBusyId(obligationId)
    try {
      const res = await apiRequest(`/api/admin/commission/obligations/${obligationId}/adjust`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        toastApiError(res.error, 'Could not adjust obligation')
        return
      }
      toast({ title: action === 'WAIVE' ? 'Obligation waived' : 'Obligation written off' })
      await refreshAll()
    } finally {
      setBusyId(null)
    }
  }

  const backfill = async () => {
    setBackfilling(true)
    try {
      const res = await apiRequest<{ ordersScanned: number; created: number }>('/api/admin/commission/backfill', {
        method: 'POST',
      })
      if (!res.ok || !res.data) {
        toastApiError(res.error, 'Backfill failed')
        return
      }
      toast({
        title: 'Backfill complete',
        description: `${res.data.created} obligation(s) created from ${res.data.ordersScanned} delivered order(s).`,
      })
      await refreshAll()
    } finally {
      setBackfilling(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="border-dashed">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Pending</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
              {formatUSD(obligations?.totalsByStatus?.PENDING?.amount ?? 0)}
            </p>
            <p className="text-[11px] text-muted-foreground">{obligations?.totalsByStatus?.PENDING?.count ?? 0} obligation(s)</p>
          </CardContent>
        </Card>
        <Card className="border-dashed">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Invoiced</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{formatUSD(obligations?.totalsByStatus?.INVOICED?.amount ?? 0)}</p>
            <p className="text-[11px] text-muted-foreground">awaiting supplier payment</p>
          </CardContent>
        </Card>
        <Card className="border-dashed">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Collected</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatUSD(obligations?.totalsByStatus?.COLLECTED?.amount ?? 0)}
            </p>
            <p className="text-[11px] text-muted-foreground">lifetime platform revenue</p>
          </CardContent>
        </Card>
        <Card className="border-dashed">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Trigger</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
              <Coins size={14} className="text-primary" /> DELIVERED
            </p>
            <p className="text-[11px] text-muted-foreground">successful stage</p>
          </CardContent>
        </Card>
      </div>

      {/* Obligations */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center justify-between gap-3 text-base">
            <span className="flex items-center gap-2">
              <ReceiptText size={16} className="text-primary" /> Commission obligations
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput value={search} onChange={setSearch} placeholder="PO or buyer…" ariaLabel="Search obligations" />
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant={status === '' ? 'default' : 'outline'} className="h-8 rounded-full text-xs" onClick={() => setStatus('')}>
                  All
                </Button>
                {OBLIGATION_FILTERS.map((s) => (
                  <Button key={s} size="sm" variant={status === s ? 'default' : 'outline'} className="h-8 rounded-full text-xs" onClick={() => setStatus(s)}>
                    {statusLabel(s)}
                  </Button>
                ))}
                <Button size="sm" variant="ghost" className="h-8 rounded-full" onClick={() => void obligationsApi.refetch()} aria-label="Refresh">
                  <RefreshCcw size={13} />
                </Button>
              </div>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Backfill banner */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Orders delivered <strong>before</strong> this module existed have no obligations — backfill scans them
              (idempotent, safe to re-run).
            </p>
            <Button size="sm" variant="outline" className="h-8 rounded-full text-xs" onClick={backfill} disabled={backfilling}>
              <DatabaseZap size={13} className="mr-1.5" /> {backfilling ? 'Scanning…' : 'Backfill delivered orders'}
            </Button>
          </div>

          {/* Statement candidates */}
          {obligations && obligations.candidates.length > 0 && (
            <div className="mb-4 space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                <PiggyBank size={13} /> Ready to statement
              </p>
              {obligations.candidates.map((c) => (
                <div key={c.seller.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{c.seller.storeName ?? c.seller.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.obligationCount} obligation(s) · base {formatUSD(c.baseAmount)} · commission{' '}
                      <span className="font-semibold text-foreground">{formatUSD(c.amount)}</span>
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="h-8 rounded-full text-xs"
                    disabled={busyId === c.seller.id}
                    onClick={() => generateStatement(c.seller.id)}
                  >
                    <Send size={12} className="mr-1" /> Prepare statement
                  </Button>
                </div>
              ))}
            </div>
          )}

          {obligationsApi.loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : obligationsApi.error ? (
            <AdminEmptyState icon={ReceiptText} title="Couldn't load obligations" description={obligationsApi.error} />
          ) : !obligations || obligations.obligations.length === 0 ? (
            <div className="flex flex-col items-center rounded-xl border border-dashed py-12 text-center">
              <ReceiptText size={32} className="text-muted-foreground/40" />
              <p className="mt-3 text-sm font-medium">No commission obligations yet</p>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                When an order is marked delivered, an obligation per supplier is created automatically — or run the
                backfill above for historical delivered orders.
              </p>
            </div>
          ) : (
            <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
              {obligations.obligations.map((o) => (
                <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {o.orderRef}
                      {o.buyer ? <span className="text-muted-foreground"> · {o.buyer.name}</span> : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Base {formatUSD(o.baseAmount)} · rate {o.commissionRate.toFixed(2)}% · {formatDate(o.createdAt)}
                      {o.collectedAmount > 0 ? ` · collected ${formatUSD(o.collectedAmount)}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold tabular-nums text-primary">{formatUSD(o.amount)}</span>
                    <Badge className={cn('rounded-full text-[10px] font-semibold uppercase', OBLIGATION_BADGE[o.status] ?? '')}>
                      {statusLabel(o.status)}
                    </Badge>
                    {(o.status === 'PENDING' || o.status === 'INVOICED' || o.status === 'PARTIALLY_COLLECTED') && (
                      <>
                        <Button
                          size="sm"
                          className="h-7 rounded-full text-xs"
                          disabled={busyId === o.id}
                          onClick={() => {
                            setCollectFor(o)
                            setCollectAmount(String((o.amount - o.collectedAmount).toFixed(2)))
                          }}
                        >
                          <Wallet size={11} className="mr-1" /> Collect
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 rounded-full text-xs text-muted-foreground"
                          disabled={busyId === o.id}
                          onClick={() => adjust(o.id, 'WAIVE')}
                          title="Waive this obligation (goodwill)"
                        >
                          Waive
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Statements & invoices */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText size={16} className="text-primary" /> Statements & invoices
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Period groupings per supplier — issue a CIV invoice to bill them (PDF download included).
          </p>
        </CardHeader>
        <CardContent>
          {statementsApi.loading ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : statementsApi.error ? (
            <AdminEmptyState icon={FileText} title="Couldn't load statements" description={statementsApi.error} />
          ) : !statementsApi.data || statementsApi.data.statements.length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-8 text-center text-xs text-muted-foreground">
              No statements prepared yet — use “Prepare statement” above when a supplier has pending obligations.
            </p>
          ) : (
            <div className="space-y-3">
              {statementsApi.data.statements.map((s) => (
                <div key={s.id} className="rounded-xl border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-mono text-xs font-bold tracking-wide">{s.number}</p>
                        <Badge className={cn('rounded-full text-[10px] font-semibold uppercase', STATEMENT_BADGE[s.status] ?? '')}>
                          {statusLabel(s.status)}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm">
                        <span className="font-medium">{s.seller.storeName ?? s.seller.name}</span>
                        <span className="text-muted-foreground">
                          {' '}· {s.obligationCount} order(s) · {formatDate(s.periodStart)} – {formatDate(s.periodEnd)}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Base {formatUSD(s.baseAmount)} · commission <span className="font-semibold text-foreground">{formatUSD(s.amount)}</span>
                        {s.issuedAt ? ` · issued ${formatDate(s.issuedAt)}` : ''}
                      </p>
                    </div>
                    {s.status === 'OPEN' && (
                      <div className="flex gap-2">
                        <Button size="sm" className="h-8 rounded-full text-xs" disabled={busyId === s.id} onClick={() => issueInvoice(s.id)}>
                          <Send size={12} className="mr-1" /> Issue invoice
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 rounded-full text-xs text-destructive hover:text-destructive"
                          disabled={busyId === s.id}
                          onClick={() => cancelStatement(s.id)}
                        >
                          <Ban size={12} className="mr-1" /> Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                  {s.invoices.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {s.invoices.map((inv) => (
                        <a
                          key={inv.id}
                          href={`/api/admin/commission/invoices/${inv.id}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                          className={cn(
                            'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors hover:bg-muted',
                            inv.status === 'PAID' && 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400'
                          )}
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
        </CardContent>
      </Card>

      {/* Collect dialog */}
      <Dialog open={!!collectFor} onOpenChange={(open) => !open && setCollectFor(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Record commission collection</DialogTitle>
            <DialogDescription>
              {collectFor
                ? `${collectFor.orderRef} — ${formatUSD(collectFor.amount)} due${collectFor.collectedAmount > 0 ? `, ${formatUSD(collectFor.collectedAmount)} already collected` : ''}.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="collect-amount">Amount received (USD)</Label>
            <Input
              id="collect-amount"
              type="number"
              min="0.01"
              step="0.01"
              value={collectAmount}
              onChange={(e) => setCollectAmount(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Partial amounts keep the obligation open as “partially collected”.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setCollectFor(null)}>
              Cancel
            </Button>
            <Button className="rounded-full" onClick={collect} disabled={busyId === collectFor?.id}>
              Record collection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
