'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FINANCIER · OPERATIONS (Phase 10 — lastplan v5 §10.5 + §10.6 + §10.8)
//
// Three tabs behind a sticky pill-nav (currencies-console pattern):
//   • Disbursements — the queue → confirm workflow. Confirmation demands the
//     payment rail + reference and captures an FX snapshot when the
//     disbursement currency differs from the agreement currency.
//   • Collections — record installment payments, run the allocation waterfall,
//     reverse (part of) a payment. Allocation status per payment.
//   • Reconciliation — the daily rail-vs-ledger batch and its discrepancy
//     queue (OPEN → RESOLVED with an evidence note).
//
// Money never moves on Vendora — these are reported facts with an evidence
// chain (D-002). Warm theme (emerald/amber/rose/orange/stone — NO blue).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeftRight,
  Banknote,
  CalendarSearch,
  CheckCircle2,
  CircleDollarSign,
  HandCoins,
  Landmark,
  Loader2,
  Plus,
  ReceiptText,
  Scale,
  Undo2,
  Wallet,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
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
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import {
  apiRequest,
  EmptyState,
  formatDate,
  formatDateTime,
  formatMoney,
  FUNDING_STATUS_MAP,
  LabeledValue,
  StatusBadge,
  toastApiError,
} from '@/components/marketplace/financing/financing-shared'

// ── Local DTO mirrors (service DTOs are server-side; task 10-a owns these) ──

interface DisbursementRow {
  id: string
  agreementId: string
  status: string
  currency: string
  amount: number
  rail: string | null
  reference: string | null
  fxRate: number | null
  note: string | null
  queuedAt: string
  queuedBy: { id: string; name: string }
  confirmedAt: string | null
  cancelledAt: string | null
  agreement: {
    number: string
    applicantName: string
    organizationName: string | null
    offerAmount: number
    offerCurrency: string
    fundingStatus: string
    status: string
  }
}

interface PaymentRow {
  id: string
  agreementId: string
  receivedAt: string
  channel: string
  reference: string | null
  amount: number
  currency: string
  fxRateToAgreement: number | null
  effectiveAmount: number
  status: string
  note: string | null
  recordedBy: { id: string; name: string }
  reversalOfId: string | null
  reversalIds: string[]
  allocated: number
  unallocated: number
  createdAt: string
}

interface ReconciliationRow {
  id: string
  agreementId: string
  agreementNumber: string
  applicantName: string
  currency: string
  batchDate: string
  railExpected: number
  ledgerActual: number
  difference: number
  status: string
  resolutionNote: string | null
  resolvedAt: string | null
  createdAt: string
}

interface AgreementLite {
  id: string
  number: string
  fundingStatus: string
  status: string
  offer: { amount: number; currency: string }
  request: { applicantName: string; organizationName: string | null }
}

// ── Status palettes (warm semantic — mirrors financing-shared) ───────────────

const DISBURSEMENT_STATUS_MAP: Record<string, { label: string; badge: string }> = {
  QUEUED: { label: 'Queued', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  CONFIRMED: { label: 'Confirmed', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  CANCELLED: { label: 'Cancelled', badge: 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400' },
}

const PAYMENT_STATUS_MAP: Record<string, { label: string; badge: string }> = {
  RECEIVED: { label: 'Received', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  PARTIALLY_ALLOCATED: { label: 'Partial apply', badge: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300' },
  ALLOCATED: { label: 'Applied', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  PARTIALLY_REVERSED: { label: 'Part. reversed', badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' },
  REVERSED: { label: 'Reversed', badge: 'bg-stone-200 text-stone-700 line-through dark:bg-stone-800 dark:text-stone-400' },
}

const RECON_STATUS_MAP: Record<string, { label: string; badge: string }> = {
  OPEN: { label: 'Open', badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' },
  RESOLVED: { label: 'Resolved', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
}

const PAYMENT_CHANNELS = ['BANK_TRANSFER', 'CASH', 'AGENT', 'RAIL_EXPORT', 'OTHER'] as const
const DISBURSEMENT_RAILS = ['BANK', 'CASH', 'WALLET', 'OTHER'] as const

function channelLabel(c: string): string {
  if (c === 'REVERSAL') return 'Reversal'
  return c.charAt(0) + c.slice(1).toLowerCase().replace('_', ' ')
}

function amountTone(v: number): string {
  if (v > 0.009) return 'text-emerald-700 dark:text-emerald-400'
  if (v < -0.009) return 'text-rose-700 dark:text-rose-400'
  return 'text-muted-foreground'
}

// ── Section shell (sticky pill nav) ─────────────────────────────────────────

type TabKey = 'disbursements' | 'collections' | 'reconciliation'

const TABS: { key: TabKey; label: string; icon: typeof Wallet }[] = [
  { key: 'disbursements', label: 'Disbursements', icon: Wallet },
  { key: 'collections', label: 'Collections', icon: HandCoins },
  { key: 'reconciliation', label: 'Reconciliation', icon: Scale },
]

export function OperationsSection() {
  const [tab, setTab] = useState<TabKey>('disbursements')

  return (
    <div className="space-y-4">
      <p className="rounded-2xl border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
        Money moves on your rails, not on Vendora — this console records the evidence chain: rail references, FX
        snapshots, allocation waterfalls and daily reconciliation (track-only ledger, D-002).
      </p>

      {/* ── Sticky section pills (dock under the dashboard topbar, h-14) ──── */}
      <div className="sticky top-14 z-20 -mx-4 border-b bg-background/95 px-4 pb-2 pt-1 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <nav
          aria-label="Operations sections"
          className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {TABS.map((t) => {
            const active = tab === t.key
            const Icon = t.icon
            return (
              <button
                key={t.key}
                type="button"
                aria-current={active ? 'true' : undefined}
                onClick={() => setTab(t.key)}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition-colors',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
                )}
              >
                <Icon size={14} />
                {t.label}
              </button>
            )
          })}
        </nav>
      </div>

      {tab === 'disbursements' && <DisbursementsTab />}
      {tab === 'collections' && <CollectionsTab />}
      {tab === 'reconciliation' && <ReconciliationTab />}
    </div>
  )
}

// ── KPI mini-row ─────────────────────────────────────────────────────────────

function KpiRow({ items }: { items: { label: string; value: string; tone?: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((k) => (
        <div key={k.label} className="rounded-xl border bg-muted/30 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{k.label}</p>
          <p className={cn('mt-0.5 text-sm font-bold', k.tone)}>{k.value}</p>
        </div>
      ))}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 1 — DISBURSEMENTS (§10.5)
// ═════════════════════════════════════════════════════════════════════════════

function DisbursementsTab() {
  const { data, loading, error, refetch } = useApi<{ disbursements: DisbursementRow[] }>('/api/financier/disbursements')
  const [confirmFor, setConfirmFor] = useState<DisbursementRow | null>(null)
  const [cancelFor, setCancelFor] = useState<DisbursementRow | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const rows = data?.disbursements ?? []
  const queued = rows.filter((r) => r.status === 'QUEUED')
  const confirmed = rows.filter((r) => r.status === 'CONFIRMED')

  const cancel = async (row: DisbursementRow, note: string) => {
    setBusyId(row.id)
    const res = await apiRequest(`/api/financier/disbursements/${row.id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ note: note.trim() || null }),
    })
    setBusyId(null)
    if (!res.ok) return toastApiError(res.error)
    toast({ title: 'Disbursement cancelled', description: `${row.agreement.number} left the queue (rail history preserved).` })
    setCancelFor(null)
    void refetch()
  }

  return (
    <div className="space-y-4">
      <KpiRow
        items={[
          { label: 'Queue', value: String(queued.length), tone: queued.length ? 'text-amber-600' : undefined },
          { label: 'Confirmed', value: String(confirmed.length), tone: 'text-emerald-700' },
          {
            label: 'Confirmed volume',
            value: confirmed.length
              ? `${confirmed[0].agreement.offerCurrency === confirmed[0].currency ? formatMoney(confirmed.reduce((s, r) => s + r.amount, 0), confirmed[0].currency) : confirmed.map((r) => formatMoney(r.amount, r.currency)).join(' + ')}`
              : '—',
          },
          { label: 'Total records', value: String(rows.length) },
        ]}
      />

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <EmptyState icon={Wallet} title="Could not load the disbursement queue" description={error}>
          <Button variant="outline" className="rounded-xl" onClick={() => void refetch()}>
            Retry
          </Button>
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No disbursements yet"
          description="Accepted agreements with funding still PENDING appear here once you queue their disbursement. Open the Agreements section to queue one."
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl border md:block">
            <Table className="w-full text-left text-xs">
              <TableHeader className="bg-muted/60 uppercase tracking-wide text-muted-foreground">
                <TableRow>
                  <TableHead className="px-3 py-2 font-semibold">Agreement</TableHead>
                  <TableHead className="px-3 py-2 font-semibold">Applicant</TableHead>
                  <TableHead className="px-3 py-2 text-right font-semibold">Amount</TableHead>
                  <TableHead className="px-3 py-2 font-semibold">Status</TableHead>
                  <TableHead className="px-3 py-2 font-semibold">Queued</TableHead>
                  <TableHead className="px-3 py-2 text-right font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} className="bg-background">
                    <TableCell className="px-3 py-2.5">
                      <span className="font-mono text-[11px] font-bold">{r.agreement.number}</span>
                      {r.agreement.offerCurrency !== r.currency && (
                        <span className="ml-1.5 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-800 dark:bg-orange-950 dark:text-orange-300">
                          FX {r.agreement.offerCurrency}→{r.currency}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="px-3 py-2.5">
                      <span className="font-semibold">{r.agreement.organizationName ?? r.agreement.applicantName}</span>
                    </TableCell>
                    <TableCell className="px-3 py-2.5 text-right font-mono">
                      {formatMoney(r.amount, r.currency)}
                      {r.fxRate != null && (
                        <span className="block text-[10px] text-muted-foreground">@ {r.fxRate}</span>
                      )}
                    </TableCell>
                    <TableCell className="px-3 py-2.5">
                      <StatusBadge status={r.status} map={DISBURSEMENT_STATUS_MAP} />
                      {r.reference && <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">{r.reference}</span>}
                    </TableCell>
                    <TableCell className="px-3 py-2.5 text-muted-foreground">{formatDateTime(r.queuedAt)}</TableCell>
                    <TableCell className="px-3 py-2.5 text-right">
                      {r.status === 'QUEUED' ? (
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" className="h-7 rounded-lg" onClick={() => setConfirmFor(r)} disabled={busyId === r.id}>
                            <CheckCircle2 size={12} className="mr-1" /> Confirm
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 rounded-lg" onClick={() => setCancelFor(r)} disabled={busyId === r.id}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">
                          {r.status === 'CONFIRMED' && r.confirmedAt ? `confirmed ${formatDate(r.confirmedAt)}` : r.cancelledAt ? `cancelled ${formatDate(r.cancelledAt)}` : '—'}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {rows.map((r) => (
              <motion.div key={r.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg bg-muted px-2 py-1 font-mono text-xs font-bold">{r.agreement.number}</span>
                      <StatusBadge status={r.status} map={DISBURSEMENT_STATUS_MAP} />
                      <span className="ml-auto font-mono text-sm font-bold">{formatMoney(r.amount, r.currency)}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                      <LabeledValue label="Applicant">
                        <span className="font-semibold">{r.agreement.organizationName ?? r.agreement.applicantName}</span>
                      </LabeledValue>
                      <LabeledValue label="Queued">
                        <span className="font-semibold">{formatDateTime(r.queuedAt)}</span>
                      </LabeledValue>
                      {r.fxRate != null && (
                        <LabeledValue label="FX snapshot">
                          <span className="font-semibold">
                            {r.agreement.offerCurrency}→{r.currency} @ {r.fxRate}
                          </span>
                        </LabeledValue>
                      )}
                      {r.reference && (
                        <LabeledValue label="Rail reference">
                          <span className="font-mono font-semibold">{r.reference}</span>
                        </LabeledValue>
                      )}
                    </div>
                    {r.status === 'QUEUED' && (
                      <div className="mt-3 flex gap-2">
                        <Button size="sm" className="flex-1 rounded-lg" onClick={() => setConfirmFor(r)}>
                          <CheckCircle2 size={12} className="mr-1" /> Confirm
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1 rounded-lg" onClick={() => setCancelFor(r)}>
                          Cancel
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </>
      )}

      <ConfirmDisbursementDialog row={confirmFor} onOpenChange={(o) => !o && setConfirmFor(null)} onSaved={() => void refetch()} />
      <CancelDisbursementDialog row={cancelFor} onOpenChange={(o) => !o && setCancelFor(null)} onConfirm={(note) => void cancel(cancelFor!, note)} />
    </div>
  )
}

function ConfirmDisbursementDialog({
  row,
  onOpenChange,
  onSaved,
}: {
  row: DisbursementRow | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [rail, setRail] = useState<string>('BANK')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [initializedFor, setInitializedFor] = useState<string | null>(null)

  const key = row?.id ?? null
  if (row && initializedFor !== key) {
    setInitializedFor(key)
    setRail('BANK')
    setReference('')
    setNote('')
  }
  if (!row && initializedFor !== null) setInitializedFor(null)

  const fxMismatch = row != null && row.agreement.offerCurrency !== row.currency

  const submit = async () => {
    if (!row) return
    if (!reference.trim()) {
      toast({ title: 'Rail reference required', description: 'Confirmation demands the payment-rail reference — no exceptions.', variant: 'destructive' })
      return
    }
    setSubmitting(true)
    const res = await apiRequest(`/api/financier/disbursements/${row.id}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ rail, reference: reference.trim(), note: note.trim() || null }),
    })
    setSubmitting(false)
    if (!res.ok) return toastApiError(res.error)
    toast({
      title: 'Disbursement confirmed',
      description: `${row.agreement.number} → REPORTED_FUNDED via ${rail.toLowerCase()}${fxMismatch ? ' (FX snapshot captured)' : ''}.`,
    })
    onOpenChange(false)
    onSaved()
  }

  return (
    <Dialog open={!!row} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark size={15} className="text-primary" /> Confirm disbursement — {row?.agreement.number}
          </DialogTitle>
          <DialogDescription>
            {formatMoney(row?.amount ?? 0, row?.currency ?? 'YER')} to{' '}
            {row?.agreement.organizationName ?? row?.agreement.applicantName}. Confirming reports the agreement as
            funded and writes the DISBURSEMENT ledger event.
          </DialogDescription>
        </DialogHeader>
        {fxMismatch && (
          <p className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-300">
            Disbursement runs in {row?.currency} while the agreement runs in {row?.agreement.offerCurrency} — the latest
            pinned exchange rate for that pair is snapshotted at confirm. If none is pinned, the confirm is refused.
          </p>
        )}
        <div className="grid gap-3.5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Payment rail *</Label>
            <Select value={rail} onValueChange={setRail}>
              <SelectTrigger className="h-9 rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DISBURSEMENT_RAILS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r.charAt(0) + r.slice(1).toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="disb-ref" className="text-xs">
              Rail reference *
            </Label>
            <Input
              id="disb-ref"
              className="h-9 rounded-lg"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. TRX-88421"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="disb-note" className="text-xs">
              Note
            </Label>
            <Textarea
              id="disb-note"
              className="min-h-[54px] rounded-lg"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional context recorded with the confirmation"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button className="rounded-xl" onClick={() => void submit()} disabled={submitting}>
            {submitting && <Loader2 size={14} className="mr-1.5 animate-spin" />} Confirm &amp; report funded
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CancelDisbursementDialog({
  row,
  onOpenChange,
  onConfirm,
}: {
  row: DisbursementRow | null
  onOpenChange: (open: boolean) => void
  onConfirm: (note: string) => void
}) {
  const [note, setNote] = useState('')
  const [initializedFor, setInitializedFor] = useState<string | null>(null)

  const key = row?.id ?? null
  if (row && initializedFor !== key) {
    setInitializedFor(key)
    setNote('')
  }
  if (!row && initializedFor !== null) setInitializedFor(null)

  return (
    <Dialog open={!!row} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Cancel disbursement — {row?.agreement.number}</DialogTitle>
          <DialogDescription>
            The queued disbursement leaves the queue. The agreement stays PENDING so you can queue it again with
            corrected details.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="disb-cancel-note" className="text-xs">
            Reason (optional)
          </Label>
          <Textarea
            id="disb-cancel-note"
            className="min-h-[54px] rounded-lg"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why is this disbursement being cancelled?"
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Keep it queued
          </Button>
          <Button variant="destructive" className="rounded-xl" onClick={() => onConfirm(note)}>
            Cancel disbursement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 2 — COLLECTIONS (§10.6 + §10.8)
// ═════════════════════════════════════════════════════════════════════════════

function CollectionsTab() {
  const { data: agrData, loading: agrLoading } = useApi<{ agreements: AgreementLite[] }>('/api/financier/agreements')
  const agreements = agrData?.agreements ?? []
  const [agreementId, setAgreementId] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)
  if (!initialized && agreements.length > 0 && !agreementId) {
    setInitialized(true)
    setAgreementId(agreements[0].id)
  }
  const selected = agreements.find((a) => a.id === agreementId) ?? null
  const { data, loading, error, refetch } = useApi<{ payments: PaymentRow[] }>(
    agreementId ? `/api/financier/payments?agreementId=${agreementId}` : null,
    { skip: !agreementId }
  )
  const [recordFor, setRecordFor] = useState<AgreementLite | null>(null)
  const [reverseFor, setReverseFor] = useState<PaymentRow | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const payments = data?.payments ?? []
  const effective = payments.filter((p) => p.reversalOfId == null)
  const applied = payments.reduce((s, p) => s + (p.reversalOfId == null ? p.allocated : 0), 0)
  const credit = payments.reduce((s, p) => s + (p.reversalOfId == null && p.status !== 'REVERSED' ? p.unallocated : 0), 0)

  const allocate = async (payment: PaymentRow) => {
    setBusyId(payment.id)
    const res = await apiRequest(`/api/financier/payments/${payment.id}/allocate`, { method: 'POST' })
    setBusyId(null)
    if (!res.ok) return toastApiError(res.error)
    const allocatedNow = (res.data as { payment?: PaymentRow } | undefined)?.payment
    toast({
      title: 'Waterfall applied',
      description: allocatedNow
        ? `${formatMoney(allocatedNow.allocated, selected?.offer.currency ?? 'YER')} now applied on ${selected?.number} — remainder stays as credit.`
        : 'Allocation re-checked (idempotent).',
    })
    void refetch()
  }

  if (agrLoading) {
    return <div className="space-y-2">
      <Skeleton className="h-9 w-64 rounded-xl" />
      <Skeleton className="h-40 rounded-2xl" />
    </div>
  }

  return (
    <div className="space-y-4">
      {/* Agreement picker */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 sm:max-w-xs">
          <Select value={agreementId ?? undefined} onValueChange={setAgreementId}>
            <SelectTrigger className="h-9 rounded-lg text-xs" aria-label="Agreement">
              <SelectValue placeholder="Pick an agreement" />
            </SelectTrigger>
            <SelectContent>
              {agreements.map((a) => (
                <SelectItem key={a.id} value={a.id} className="text-xs">
                  {a.number} — {a.request.organizationName ?? a.request.applicantName} ({formatMoney(a.offer.amount, a.offer.currency)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selected && (
          <Button size="sm" className="rounded-lg" onClick={() => setRecordFor(selected)}>
            <Plus size={12} className="mr-1" /> Record payment
          </Button>
        )}
      </div>

      {selected && (
        <KpiRow
          items={[
            { label: 'Received (net rows)', value: String(effective.length) },
            { label: 'Applied', value: formatMoney(applied, selected.offer.currency), tone: 'text-emerald-700' },
            { label: 'Open credit', value: formatMoney(credit, selected.offer.currency), tone: credit > 0.009 ? 'text-amber-600' : undefined },
            { label: 'Funding', value: FUNDING_STATUS_MAP[selected.fundingStatus]?.label ?? selected.fundingStatus },
          ]}
        />
      )}

      {!selected ? (
        <EmptyState
          icon={HandCoins}
          title="No agreements to collect on"
          description="Accepted offers create agreements — their installment payments are recorded and allocated here."
        />
      ) : loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <EmptyState icon={HandCoins} title="Could not load the payments" description={error}>
          <Button variant="outline" className="rounded-xl" onClick={() => void refetch()}>
            Retry
          </Button>
        </EmptyState>
      ) : payments.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title={`No payments recorded on ${selected.number}`}
          description="Record a received payment (bank transfer, cash, agent…) and run the allocation waterfall against the installment schedule."
        />
      ) : (
        <div className="space-y-2">
          {payments.map((p) => {
            const isReversal = p.reversalOfId != null
            const canAllocate = !isReversal && p.status !== 'REVERSED' && p.unallocated > 0.009
            const canReverse = !isReversal && p.allocated > 0.009 && p.status !== 'REVERSED'
            return (
              <motion.div key={p.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
                <Card className={cn(isReversal && 'border-rose-200 dark:border-rose-900')}>
                  <CardContent className="p-3.5 sm:p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                          isReversal ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' : 'bg-primary/10 text-primary'
                        )}
                      >
                        {isReversal ? <Undo2 size={13} /> : <Banknote size={13} />}
                      </span>
                      <span className="font-semibold">
                        {channelLabel(p.channel)}
                        {p.reference && <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">{p.reference}</span>}
                      </span>
                      <StatusBadge status={p.status} map={PAYMENT_STATUS_MAP} />
                      <span className="ml-auto font-mono text-sm font-bold">
                        {formatMoney(p.amount, p.currency)}
                        {p.fxRateToAgreement != null && (
                          <span className="block text-right text-[10px] font-normal text-muted-foreground">
                            = {formatMoney(p.effectiveAmount, selected.offer.currency)}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <span>Received {formatDateTime(p.receivedAt)}</span>
                      <span className={cn('font-semibold', amountTone(p.allocated))}>
                        applied {formatMoney(p.allocated, selected.offer.currency)}
                      </span>
                      {p.unallocated > 0.009 && (
                        <span className="font-semibold text-amber-600">credit {formatMoney(p.unallocated, selected.offer.currency)}</span>
                      )}
                      <span>by {p.recordedBy.name}</span>
                      {p.reversalIds.length > 0 && <span className="font-semibold text-rose-600">{p.reversalIds.length} reversal(s)</span>}
                    </div>
                    {p.note && <p className="mt-1.5 line-clamp-2 text-[11px] text-muted-foreground">{p.note}</p>}
                    {(canAllocate || canReverse) && (
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        {canAllocate && (
                          <Button size="sm" className="h-7 rounded-lg" onClick={() => void allocate(p)} disabled={busyId === p.id}>
                            {busyId === p.id ? <Loader2 size={11} className="mr-1 animate-spin" /> : <ArrowLeftRight size={11} className="mr-1" />}
                            Allocate
                          </Button>
                        )}
                        {canReverse && (
                          <Button size="sm" variant="outline" className="h-7 rounded-lg" onClick={() => setReverseFor(p)}>
                            <Undo2 size={11} className="mr-1" /> Reverse
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </div>
      )}

      <RecordPaymentDialog
        agreement={recordFor}
        onOpenChange={(o) => !o && setRecordFor(null)}
        onSaved={() => void refetch()}
      />
      <ReversePaymentDialog
        payment={reverseFor}
        agreementCurrency={selected?.offer.currency ?? 'YER'}
        onOpenChange={(o) => !o && setReverseFor(null)}
        onSaved={() => void refetch()}
      />
    </div>
  )
}

function RecordPaymentDialog({
  agreement,
  onOpenChange,
  onSaved,
}: {
  agreement: AgreementLite | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [receivedAt, setReceivedAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [channel, setChannel] = useState<string>('CASH')
  const [reference, setReference] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('')
  const [fx, setFx] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [initializedFor, setInitializedFor] = useState<string | null>(null)

  const key = agreement?.id ?? null
  if (agreement && initializedFor !== key) {
    setInitializedFor(key)
    setReceivedAt(new Date().toISOString().slice(0, 10))
    setChannel('CASH')
    setReference('')
    setAmount('')
    setCurrency(agreement.offer.currency)
    setFx('')
    setNote('')
  }
  if (!agreement && initializedFor !== null) setInitializedFor(null)

  const fxMismatch = currency !== (agreement?.offer.currency ?? '')

  const submit = async () => {
    if (!agreement) return
    const amt = Number(amount)
    if (!amount.trim() || !(amt > 0)) {
      toast({ title: 'Amount required', description: 'The received amount must be positive.', variant: 'destructive' })
      return
    }
    if (fxMismatch && !(Number(fx) > 0)) {
      toast({
        title: 'FX rate required',
        description: `Payment in ${currency} needs fxRateToAgreement (to ${agreement.offer.currency}).`,
        variant: 'destructive',
      })
      return
    }
    setSubmitting(true)
    const res = await apiRequest('/api/financier/payments', {
      method: 'POST',
      body: JSON.stringify({
        agreementId: agreement.id,
        receivedAt: new Date(`${receivedAt}T12:00:00`).toISOString(),
        channel,
        reference: reference.trim() || null,
        amount: amt,
        ...(currency !== agreement.offer.currency ? { currency, fxRateToAgreement: Number(fx) } : {}),
        note: note.trim() || null,
      }),
    })
    setSubmitting(false)
    if (!res.ok) return toastApiError(res.error)
    toast({
      title: 'Payment recorded',
      description: `${formatMoney(amt, currency)} received on ${agreement.number} — run Allocate to apply the waterfall.`,
    })
    onOpenChange(false)
    onSaved()
  }

  return (
    <Dialog open={!!agreement} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HandCoins size={15} className="text-primary" /> Record payment — {agreement?.number}
          </DialogTitle>
          <DialogDescription>
            A received rail fact. Nothing is applied to the schedule yet — allocate afterwards (waterfall by due date).
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pay-date" className="text-xs">
              Received on
            </Label>
            <Input id="pay-date" type="date" className="h-9 rounded-lg" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Channel</Label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger className="h-9 rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_CHANNELS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {channelLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-amount" className="text-xs">
              Amount *
            </Label>
            <Input id="pay-amount" type="number" min="0" className="h-9 rounded-lg" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-currency" className="text-xs">
              Currency
            </Label>
            <Input
              id="pay-currency"
              className="h-9 rounded-lg uppercase"
              maxLength={3}
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              placeholder={agreement?.offer.currency}
            />
          </div>
          {fxMismatch && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="pay-fx" className="text-xs">
                FX rate to {agreement?.offer.currency} *
              </Label>
              <Input
                id="pay-fx"
                type="number"
                min="0"
                step="any"
                className="h-9 rounded-lg"
                value={fx}
                onChange={(e) => setFx(e.target.value)}
                placeholder={`1 ${currency} = ? ${agreement?.offer.currency}`}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="pay-ref" className="text-xs">
              Reference
            </Label>
            <Input id="pay-ref" className="h-9 rounded-lg" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="receipt / rail id" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-note" className="text-xs">
              Note
            </Label>
            <Input id="pay-note" className="h-9 rounded-lg" value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button className="rounded-xl" onClick={() => void submit()} disabled={submitting}>
            {submitting && <Loader2 size={14} className="mr-1.5 animate-spin" />} Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ReversePaymentDialog({
  payment,
  agreementCurrency,
  onOpenChange,
  onSaved,
}: {
  payment: PaymentRow | null
  agreementCurrency: string
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [initializedFor, setInitializedFor] = useState<string | null>(null)

  const key = payment?.id ?? null
  if (payment && initializedFor !== key) {
    setInitializedFor(key)
    setAmount('')
    setNote('')
  }
  if (!payment && initializedFor !== null) setInitializedFor(null)

  const submit = async () => {
    if (!payment) return
    if (note.trim().length < 3) {
      toast({ title: 'A note is required', description: 'Reversals are evidence — say why (bounce, chargeback, error…).', variant: 'destructive' })
      return
    }
    setSubmitting(true)
    const res = await apiRequest(`/api/financier/payments/${payment.id}/reverse`, {
      method: 'POST',
      body: JSON.stringify({
        note: note.trim(),
        ...(amount.trim() ? { amount: Number(amount) } : {}),
      }),
    })
    setSubmitting(false)
    if (!res.ok) return toastApiError(res.error)
    toast({
      title: 'Payment reversed',
      description: amount.trim()
        ? `${formatMoney(Number(amount), agreementCurrency)} un-applied (a new REVERSAL row mirrors the allocations).`
        : 'Fully un-applied (a new REVERSAL row mirrors the allocations).',
    })
    onOpenChange(false)
    onSaved()
  }

  return (
    <Dialog open={!!payment} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 size={15} className="text-rose-600" /> Reverse payment
          </DialogTitle>
          <DialogDescription>
            {formatMoney(payment?.amount ?? 0, payment?.currency ?? 'YER')} · applied{' '}
            {formatMoney(payment?.allocated ?? 0, agreementCurrency)}. A reversal is always a NEW row mirroring the
            original&apos;s allocations — history is never rewritten.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="rev-amount" className="text-xs">
            Amount to reverse ({agreementCurrency}) — empty = all applied
          </Label>
          <Input
            id="rev-amount"
            type="number"
            min="0"
            step="any"
            max={payment?.allocated}
            className="h-9 rounded-lg"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={`up to ${payment?.allocated ?? 0}`}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rev-note" className="text-xs">
            Reason *
          </Label>
          <Textarea
            id="rev-note"
            className="min-h-[54px] rounded-lg"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. cheque bounced / duplicated entry"
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="destructive" className="rounded-xl" onClick={() => void submit()} disabled={submitting}>
            {submitting && <Loader2 size={14} className="mr-1.5 animate-spin" />} Reverse
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 3 — RECONCILIATION (§10.8)
// ═════════════════════════════════════════════════════════════════════════════

function ReconciliationTab() {
  const { data, loading, error, refetch } = useApi<{ reconciliations: ReconciliationRow[] }>('/api/financier/reconciliations')
  const { data: agrData } = useApi<{ agreements: AgreementLite[] }>('/api/financier/agreements')
  const agreements = agrData?.agreements ?? []
  const [runOpen, setRunOpen] = useState(false)
  const [resolveFor, setResolveFor] = useState<ReconciliationRow | null>(null)

  const rows = data?.reconciliations ?? []
  const open = rows.filter((r) => r.status === 'OPEN')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" className="rounded-lg" onClick={() => setRunOpen(true)}>
          <CalendarSearch size={12} className="mr-1" /> Run daily batch
        </Button>
        <p className="text-[11px] text-muted-foreground">
          Compare one agreement&apos;s ledger (effective payments of the day) against the rail export.
        </p>
      </div>

      <KpiRow
        items={[
          { label: 'Open discrepancies', value: String(open.length), tone: open.length ? 'text-rose-600' : 'text-emerald-700' },
          {
            label: 'Open net difference',
            value: open.length ? formatMoney(open.reduce((s, r) => s + r.difference, 0), open[0].currency) : '—',
            tone: open.length ? 'text-rose-600' : undefined,
          },
          { label: 'Resolved (recent)', value: String(rows.length - open.length) },
          { label: 'Batches run', value: String(rows.length) },
        ]}
      />

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <EmptyState icon={Scale} title="Could not load the discrepancy queue" description={error}>
          <Button variant="outline" className="rounded-xl" onClick={() => void refetch()}>
            Retry
          </Button>
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Scale}
          title="No reconciliation batches yet"
          description="Run the daily batch per agreement: the ledger's effective payments of the day vs the rail export. Differences beyond one cent open a discrepancy."
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl border md:block">
            <Table className="w-full text-left text-xs">
              <TableHeader className="bg-muted/60 uppercase tracking-wide text-muted-foreground">
                <TableRow>
                  <TableHead className="px-3 py-2 font-semibold">Agreement</TableHead>
                  <TableHead className="px-3 py-2 font-semibold">Batch day</TableHead>
                  <TableHead className="px-3 py-2 text-right font-semibold">Rail expected</TableHead>
                  <TableHead className="px-3 py-2 text-right font-semibold">Ledger actual</TableHead>
                  <TableHead className="px-3 py-2 text-right font-semibold">Difference</TableHead>
                  <TableHead className="px-3 py-2 font-semibold">Status</TableHead>
                  <TableHead className="px-3 py-2 text-right font-semibold">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} className="bg-background">
                    <TableCell className="px-3 py-2.5">
                      <span className="font-mono text-[11px] font-bold">{r.agreementNumber}</span>
                      <span className="block text-[10px] text-muted-foreground">{r.applicantName}</span>
                    </TableCell>
                    <TableCell className="px-3 py-2.5">{formatDate(r.batchDate)}</TableCell>
                    <TableCell className="px-3 py-2.5 text-right font-mono">{formatMoney(r.railExpected, r.currency)}</TableCell>
                    <TableCell className="px-3 py-2.5 text-right font-mono">{formatMoney(r.ledgerActual, r.currency)}</TableCell>
                    <TableCell className={cn('px-3 py-2.5 text-right font-mono font-bold', amountTone(r.difference))}>
                      {r.difference >= 0 ? '+' : ''}
                      {formatMoney(r.difference, r.currency).replace('-', '−')}
                    </TableCell>
                    <TableCell className="px-3 py-2.5">
                      <StatusBadge status={r.status} map={RECON_STATUS_MAP} />
                    </TableCell>
                    <TableCell className="px-3 py-2.5 text-right">
                      {r.status === 'OPEN' ? (
                        <Button size="sm" variant="outline" className="h-7 rounded-lg" onClick={() => setResolveFor(r)}>
                          Resolve
                        </Button>
                      ) : (
                        <span className="text-[11px] text-muted-foreground" title={r.resolutionNote ?? ''}>
                          {r.resolvedAt ? formatDate(r.resolvedAt) : '—'}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {rows.map((r) => (
              <motion.div key={r.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg bg-muted px-2 py-1 font-mono text-xs font-bold">{r.agreementNumber}</span>
                      <StatusBadge status={r.status} map={RECON_STATUS_MAP} />
                      <span className="ml-auto text-xs text-muted-foreground">{formatDate(r.batchDate)}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                      <LabeledValue label="Rail expected">
                        <span className="font-mono font-semibold">{formatMoney(r.railExpected, r.currency)}</span>
                      </LabeledValue>
                      <LabeledValue label="Ledger actual">
                        <span className="font-mono font-semibold">{formatMoney(r.ledgerActual, r.currency)}</span>
                      </LabeledValue>
                      <LabeledValue label="Difference">
                        <span className={cn('font-mono font-bold', amountTone(r.difference))}>
                          {r.difference >= 0 ? '+' : ''}
                          {formatMoney(r.difference, r.currency).replace('-', '−')}
                        </span>
                      </LabeledValue>
                    </div>
                    {r.status === 'OPEN' ? (
                      <Button size="sm" variant="outline" className="mt-2.5 w-full rounded-lg" onClick={() => setResolveFor(r)}>
                        Resolve discrepancy
                      </Button>
                    ) : (
                      r.resolutionNote && (
                        <p className="mt-2 rounded-lg bg-muted/40 px-2.5 py-1.5 text-[11px] text-muted-foreground">{r.resolutionNote}</p>
                      )
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </>
      )}

      <RunBatchDialog
        agreements={agreements}
        open={runOpen}
        onOpenChange={setRunOpen}
        onSaved={() => void refetch()}
      />
      <ResolveDialog row={resolveFor} onOpenChange={(o) => !o && setResolveFor(null)} onSaved={() => void refetch()} />
    </div>
  )
}

function RunBatchDialog({
  agreements,
  open,
  onOpenChange,
  onSaved,
}: {
  agreements: AgreementLite[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [agreementId, setAgreementId] = useState('')
  const [batchDate, setBatchDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [railExpected, setRailExpected] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    if (!agreementId) {
      toast({ title: 'Pick an agreement', variant: 'destructive' })
      return
    }
    const expected = Number(railExpected)
    if (!railExpected.trim() || !(expected >= 0)) {
      toast({ title: 'Rail expected required', description: 'The rail export total for that day (0 allowed).', variant: 'destructive' })
      return
    }
    setSubmitting(true)
    const res = await apiRequest('/api/financier/reconciliations', {
      method: 'POST',
      body: JSON.stringify({
        agreementId,
        batchDate: new Date(`${batchDate}T12:00:00`).toISOString(),
        railExpected: expected,
      }),
    })
    setSubmitting(false)
    if (!res.ok) return toastApiError(res.error)
    const recon = (res.data as { reconciliation?: ReconciliationRow } | undefined)?.reconciliation
    toast({
      title: recon?.status === 'OPEN' ? 'Discrepancy opened' : 'Batch reconciled',
      description: recon
        ? `Ledger ${formatMoney(recon.ledgerActual, recon.currency)} vs rail ${formatMoney(recon.railExpected, recon.currency)} → ${recon.difference >= 0 ? '+' : ''}${recon.difference.toLocaleString()}.`
        : undefined,
      variant: recon?.status === 'OPEN' ? 'destructive' : undefined,
    })
    onOpenChange(false)
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarSearch size={15} className="text-primary" /> Run daily reconciliation batch
          </DialogTitle>
          <DialogDescription>
            Sums the agreement&apos;s effective payments received that UTC day (originals minus reversals) and compares
            against the rail export total.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Agreement</Label>
            <Select value={agreementId || undefined} onValueChange={setAgreementId}>
              <SelectTrigger className="h-9 rounded-lg text-xs">
                <SelectValue placeholder="Pick an agreement" />
              </SelectTrigger>
              <SelectContent>
                {agreements.map((a) => (
                  <SelectItem key={a.id} value={a.id} className="text-xs">
                    {a.number} — {a.request.organizationName ?? a.request.applicantName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="recon-date" className="text-xs">
              Batch day
            </Label>
            <Input id="recon-date" type="date" className="h-9 rounded-lg" value={batchDate} onChange={(e) => setBatchDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="recon-expected" className="text-xs">
              Rail expected
            </Label>
            <Input
              id="recon-expected"
              type="number"
              min="0"
              className="h-9 rounded-lg"
              value={railExpected}
              onChange={(e) => setRailExpected(e.target.value)}
              placeholder="rail export total"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button className="rounded-xl" onClick={() => void submit()} disabled={submitting}>
            {submitting && <Loader2 size={14} className="mr-1.5 animate-spin" />} Run batch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ResolveDialog({
  row,
  onOpenChange,
  onSaved,
}: {
  row: ReconciliationRow | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [initializedFor, setInitializedFor] = useState<string | null>(null)

  const key = row?.id ?? null
  if (row && initializedFor !== key) {
    setInitializedFor(key)
    setNote('')
  }
  if (!row && initializedFor !== null) setInitializedFor(null)

  const submit = async () => {
    if (!row) return
    if (note.trim().length < 3) {
      toast({ title: 'A resolution note is required', variant: 'destructive' })
      return
    }
    setSubmitting(true)
    const res = await apiRequest(`/api/financier/reconciliations/${row.id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ resolutionNote: note.trim() }),
    })
    setSubmitting(false)
    if (!res.ok) return toastApiError(res.error)
    toast({ title: 'Discrepancy resolved', description: `${row.agreementNumber} — the note is kept as evidence.` })
    onOpenChange(false)
    onSaved()
  }

  return (
    <Dialog open={!!row} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CircleDollarSign size={15} className="text-primary" /> Resolve discrepancy — {row?.agreementNumber}
          </DialogTitle>
          <DialogDescription>
            {row ? (
              <>
                Batch {formatDate(row.batchDate)}: ledger {formatMoney(row.ledgerActual, row.currency)} vs rail{' '}
                {formatMoney(row.railExpected, row.currency)} → difference{' '}
                <span className={cn('font-bold', amountTone(row.difference))}>
                  {row.difference >= 0 ? '+' : ''}
                  {row.difference.toLocaleString()}
                </span>
                .
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="resolve-note" className="text-xs">
            Resolution note *
          </Label>
          <Textarea
            id="resolve-note"
            className="min-h-[64px] rounded-lg"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. late rail settlement posting — verified against bank statement #4471"
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button className="rounded-xl" onClick={() => void submit()} disabled={submitting}>
            {submitting && <Loader2 size={14} className="mr-1.5 animate-spin" />} Mark resolved
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
