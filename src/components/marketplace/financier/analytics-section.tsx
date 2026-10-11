'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FINANCIER · ANALYTICS (Phase 10 — lastplan v5 §10.1 + §10.2 + §10.7)
//
// Three sticky-pill tabs:
//   • Overview          — funnel KPIs, disbursed volume, outstanding, NPL,
//                          30/60/90 aging distribution (pure CSS bars — no
//                          chart libs), per-branch and per-program tables,
//                          CSV exports per lens.
//   • Risk scoring      — the 6-factor weight config (decision-support by
//                          default; auto-decision behind a danger confirm),
//                          thresholds + an on-the-spot assessment panel.
//   • Underwriting limits — the org/branch/user limit matrix with an
//                          add/edit dialog (enforced on offer create/send).
// Owner: Task 10-b.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  BarChart3,
  CalendarRange,
  Download,
  Gauge,
  Info,
  Landmark,
  Loader2,
  PieChart,
  Plus,
  RotateCcw,
  Save,
  Scale,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { Switch } from '@/components/ui/switch'
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
  formatMoney,
  toastApiError,
} from '@/components/marketplace/financing/financing-shared'

// ── Local DTO mirrors (services own the source of truth; this file is
// deliberately self-contained — Task 10-b convention) ────────────────────────

interface AgingBucketDTO { count: number; amount: number }
interface BranchRow {
  branchId: string | null
  branchName: string
  city: string | null
  requests: number
  agreements: number
  disbursed: number
  outstanding: number
}
interface ProgramRow {
  serviceId: string
  serviceName: string
  requests: number
  agreements: number
  disbursed: number
  outstanding: number
}
interface OverviewDTO {
  funnel: {
    requestsReceived: number
    offersSent: number
    offersAccepted: number
    approvalRate: number | null
    agreementsActive: number
    agreementsCompleted: number
  }
  volume: {
    disbursedVolume: number
    outstandingPrincipal: number
    overdueAmount: number
    nplCount: number
    aging: { D1_30: AgingBucketDTO; D31_60: AgingBucketDTO; D61_90: AgingBucketDTO; D90_PLUS: AgingBucketDTO }
  }
  branches: BranchRow[]
  programs: ProgramRow[]
  range: { from: string | null; to: string | null }
}
interface RiskConfigDTO {
  id: string
  autoDecisionEnabled: boolean
  autoApproveThreshold: number
  autoDeclineThreshold: number
  weightAmount: number
  weightTenor: number
  weightGuarantee: number
  weightCapacity: number
  weightHistory: number
  weightDocuments: number
  updatedAt: string
}
interface RiskFactorDTO { name: string; weight: number; score: number; contribution: number; note: string }
interface RiskAssessmentDTO {
  id: string
  requestId: string
  requestNumber: string
  applicantName: string
  serviceName: string
  score: number
  band: 'LOW' | 'MEDIUM' | 'HIGH'
  decision: 'DECISION_SUPPORT' | 'AUTO_APPROVE' | 'AUTO_DECLINE'
  factors: RiskFactorDTO[]
  computedAt: string
}
interface LimitRow {
  id: string
  scope: 'ORG' | 'BRANCH' | 'USER' | 'BRANCH_USER'
  scopeKey: string
  branchId: string | null
  branchName: string | null
  userId: string | null
  userName: string | null
  userEmail: string | null
  maxAmount: number
  currency: string
  updatedAt: string
  updatedByName: string | null
}
interface BranchLite { id: string; name: string; city: string | null; district: string | null }
interface TeamMemberLite { userId: string; name: string; email: string | null }

// ── Shared bits ──────────────────────────────────────────────────────────────

type SectionKey = 'overview' | 'risk' | 'limits'

const SECTIONS: { key: SectionKey; label: string; icon: typeof BarChart3 }[] = [
  { key: 'overview', label: 'Overview', icon: BarChart3 },
  { key: 'risk', label: 'Risk scoring', icon: Gauge },
  { key: 'limits', label: 'Underwriting limits', icon: Scale },
]

const BAND_STYLE: Record<string, { badge: string; bar: string }> = {
  LOW: { badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300', bar: 'bg-emerald-500' },
  MEDIUM: { badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300', bar: 'bg-amber-500' },
  HIGH: { badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300', bar: 'bg-rose-500' },
}

const SCOPE_LABEL: Record<LimitRow['scope'], string> = {
  ORG: 'Institution-wide',
  BRANCH: 'Branch',
  USER: 'Underwriter',
  BRANCH_USER: 'Underwriter @ branch',
}

const WEIGHT_FIELDS: { key: keyof Pick<RiskConfigDTO, 'weightAmount' | 'weightTenor' | 'weightGuarantee' | 'weightCapacity' | 'weightHistory' | 'weightDocuments'>; label: string; hint: string }[] = [
  { key: 'weightAmount', label: 'Amount vs program range', hint: 'Requested amount vs the service ticket range' },
  { key: 'weightTenor', label: 'Tenor', hint: 'Requested tenor vs financed norms (24/36/60 mo)' },
  { key: 'weightGuarantee', label: 'Guarantee', hint: 'Guarantee type + availability' },
  { key: 'weightCapacity', label: 'Capacity', hint: 'Stated monthly capacity vs the estimated installment' },
  { key: 'weightHistory', label: 'History', hint: 'Prior agreements on the platform' },
  { key: 'weightDocuments', label: 'Documents', hint: 'Verified checklist ratio' },
]

const pct = (n: number | null | undefined) =>
  n == null ? '—' : `${Math.round(n * 1000) / 10}%`

export function AnalyticsSection() {
  const [section, setSection] = useState<SectionKey>('overview')
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <BarChart3 size={13} className="text-primary" />
        <span>
          Portfolio analytics, risk scoring and underwriting limits — read-only views over your live book. Money
          facts come from reported disbursements and the installment ledger; nothing here mutates them.
        </span>
      </div>

      {/* Sticky section pills (dock under the dashboard topbar, h-14) */}
      <div className="sticky top-14 z-20 -mx-4 border-b bg-background/95 px-4 pb-2 pt-1 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <nav
          aria-label="Analytics sections"
          className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {SECTIONS.map((s) => {
            const active = section === s.key
            const Icon = s.icon
            return (
              <button
                key={s.key}
                type="button"
                aria-current={active ? 'true' : undefined}
                onClick={() => setSection(s.key)}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition-colors',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
                )}
              >
                <Icon size={14} />
                {s.label}
              </button>
            )
          })}
        </nav>
      </div>

      {section === 'overview' && <OverviewTab />}
      {section === 'risk' && <RiskTab />}
      {section === 'limits' && <LimitsTab />}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// OVERVIEW TAB
// ═════════════════════════════════════════════════════════════════════════════

function OverviewTab() {
  const [draftFrom, setDraftFrom] = useState('')
  const [draftTo, setDraftTo] = useState('')
  const [applied, setApplied] = useState<{ from: string; to: string }>({ from: '', to: '' })
  const [exporting, setExporting] = useState(false)

  const qs = useMemo(() => {
    const p = new URLSearchParams()
    if (applied.from) p.set('from', applied.from)
    if (applied.to) p.set('to', applied.to)
    const s = p.toString()
    return s ? `?${s}` : ''
  }, [applied])

  const { data, loading, error, refetch } = useApi<OverviewDTO>(`/api/financier/analytics/overview${qs}`)

  const applyRange = () => setApplied({ from: draftFrom, to: draftTo })
  const clearRange = () => {
    setDraftFrom('')
    setDraftTo('')
    setApplied({ from: '', to: '' })
  }

  const exportCsv = async (type: 'overview' | 'aging' | 'branches' | 'programs') => {
    setExporting(true)
    try {
      const p = new URLSearchParams({ type })
      if (applied.from) p.set('from', applied.from)
      if (applied.to) p.set('to', applied.to)
      window.open(`/api/financier/analytics/export?${p.toString()}`, '_blank', 'noopener')
      toast({ title: 'Export started', description: `The ${type} CSV download has started.` })
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-44 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    )
  }
  if (error) {
    return (
      <EmptyState icon={ShieldAlert} title="Could not load the portfolio" description={error}>
        <Button variant="outline" className="rounded-xl" onClick={() => void refetch()}>
          <RotateCcw size={13} className="mr-1" /> Retry
        </Button>
      </EmptyState>
    )
  }

  const o = data!
  const agingBuckets: { label: string; key: keyof OverviewDTO['volume']['aging']; tone: string }[] = [
    { label: '1–30 days', key: 'D1_30', tone: 'bg-emerald-500' },
    { label: '31–60 days', key: 'D31_60', tone: 'bg-amber-500' },
    { label: '61–90 days', key: 'D61_90', tone: 'bg-orange-500' },
    { label: '90+ days', key: 'D90_PLUS', tone: 'bg-rose-500' },
  ]
  const agingMax = Math.max(1, ...agingBuckets.map((b) => o.volume.aging[b.key].amount))

  return (
    <div className="space-y-4">
      {/* Date range + exports */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor="ov-from" className="text-[11px] text-muted-foreground">From</Label>
              <Input
                id="ov-from"
                type="date"
                className="mt-1 h-9 w-40 rounded-xl"
                value={draftFrom}
                max={draftTo || undefined}
                onChange={(e) => setDraftFrom(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="ov-to" className="text-[11px] text-muted-foreground">To</Label>
              <Input
                id="ov-to"
                type="date"
                className="mt-1 h-9 w-40 rounded-xl"
                value={draftTo}
                min={draftFrom || undefined}
                onChange={(e) => setDraftTo(e.target.value)}
              />
            </div>
            <Button size="sm" className="rounded-xl" onClick={applyRange}>
              <CalendarRange size={14} className="mr-1" /> Apply
            </Button>
            {(applied.from || applied.to) && (
              <Button size="sm" variant="outline" className="rounded-xl" onClick={clearRange}>
                All time
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="rounded-xl" disabled={exporting} onClick={() => void exportCsv('overview')}>
              <Download size={13} className="mr-1" /> KPI CSV
            </Button>
            <Button size="sm" variant="outline" className="rounded-xl" disabled={exporting} onClick={() => void exportCsv('aging')}>
              <Download size={13} className="mr-1" /> Aging CSV
            </Button>
            <Button size="sm" variant="outline" className="rounded-xl" disabled={exporting} onClick={() => void exportCsv('branches')}>
              <Download size={13} className="mr-1" /> Branches CSV
            </Button>
            <Button size="sm" variant="outline" className="rounded-xl" disabled={exporting} onClick={() => void exportCsv('programs')}>
              <Download size={13} className="mr-1" /> Programs CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard icon={PieChart} label="Approval rate" value={pct(o.funnel.approvalRate)} sub={`${o.funnel.offersAccepted}/${o.funnel.offersSent} offers accepted`} tone="emerald" />
        <KpiCard icon={Landmark} label="Disbursed volume" value={formatMoney(o.volume.disbursedVolume)} sub={`${o.funnel.agreementsActive} active · ${o.funnel.agreementsCompleted} completed`} tone="stone" />
        <KpiCard icon={CalendarRange} label="Outstanding principal" value={formatMoney(o.volume.outstandingPrincipal)} sub={`overdue ${formatMoney(o.volume.overdueAmount)}`} tone="amber" />
        <KpiCard icon={AlertTriangle} label="NPL agreements" value={String(o.volume.nplCount)} sub="90+ days late or defaulted" tone={o.volume.nplCount > 0 ? 'rose' : 'emerald'} />
      </div>

      {/* Funnel strip */}
      <Card>
        <CardContent className="p-4">
          <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-foreground/80">
            <Sparkles size={13} className="text-primary" /> Conversion funnel
            <span className="font-normal text-muted-foreground">
              ({(o.range.from ?? 'start').toString()} → {(o.range.to ?? 'today').toString()})
            </span>
          </p>
          <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-5">
            {[
              { label: 'Requests received', value: o.funnel.requestsReceived },
              { label: 'Offers sent', value: o.funnel.offersSent },
              { label: 'Offers accepted', value: o.funnel.offersAccepted },
              { label: 'Agreements active', value: o.funnel.agreementsActive },
              { label: 'Completed', value: o.funnel.agreementsCompleted },
            ].map((f) => (
              <div key={f.label} className="rounded-xl border bg-muted/30 px-3 py-2.5">
                <p className="text-lg font-bold tabular-nums">{f.value}</p>
                <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{f.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Aging distribution — plain CSS bars, no chart libs */}
      <Card>
        <CardContent className="p-4">
          <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-foreground/80">
            <CalendarRange size={13} className="text-primary" /> Aging distribution (past-due installments)
          </p>
          <div className="space-y-2.5">
            {agingBuckets.map((b) => {
              const bucket = o.volume.aging[b.key]
              const width = Math.max(2, Math.round((bucket.amount / agingMax) * 100))
              return (
                <div key={b.key} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">{b.label}</span>
                  <div className="h-6 flex-1 overflow-hidden rounded-lg bg-muted/60">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${width}%` }}
                      transition={{ duration: 0.4 }}
                      className={cn('h-full rounded-lg', b.tone)}
                      style={{ minWidth: 4 }}
                    />
                  </div>
                  <span className="w-32 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {bucket.count} · {formatMoney(bucket.amount)}
                  </span>
                </div>
              )
            })}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Buckets count open installments (outstanding &gt; 0) by days past due. Effective paid = allocated
            payments minus reversals (10.8 ledger).
          </p>
        </CardContent>
      </Card>

      {/* Per-branch */}
      <Card>
        <CardContent className="p-4">
          <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-foreground/80">
            <Landmark size={13} className="text-primary" /> Per-branch book
          </p>
          {o.branches.length === 0 ? (
            <p className="text-sm text-muted-foreground">No branches recorded yet — add them from your institution profile.</p>
          ) : (
            <>
              <div className="hidden overflow-hidden rounded-xl border md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Branch</TableHead>
                      <TableHead>City</TableHead>
                      <TableHead className="text-right">Requests</TableHead>
                      <TableHead className="text-right">Agreements</TableHead>
                      <TableHead className="text-right">Disbursed</TableHead>
                      <TableHead className="text-right">Outstanding</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {o.branches.map((b) => (
                      <TableRow key={b.branchId ?? 'unassigned'}>
                        <TableCell className="font-medium">{b.branchName}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{b.city ?? '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{b.requests}</TableCell>
                        <TableCell className="text-right tabular-nums">{b.agreements}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(b.disbursed)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(b.outstanding)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="space-y-2 md:hidden">
                {o.branches.map((b) => (
                  <div key={b.branchId ?? 'unassigned'} className="rounded-xl border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-semibold">{b.branchName}</p>
                      <span className="shrink-0 text-xs text-muted-foreground">{b.city ?? ''}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <span>Requests: <b className="tabular-nums">{b.requests}</b></span>
                      <span>Agreements: <b className="tabular-nums">{b.agreements}</b></span>
                      <span>Disbursed: <b>{formatMoney(b.disbursed)}</b></span>
                      <span>Outstanding: <b>{formatMoney(b.outstanding)}</b></span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Per-program */}
      <Card>
        <CardContent className="p-4">
          <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-foreground/80">
            <PieChart size={13} className="text-primary" /> Per-program book
          </p>
          {o.programs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No financing services yet.</p>
          ) : (
            <>
              <div className="hidden overflow-hidden rounded-xl border md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Program</TableHead>
                      <TableHead className="text-right">Requests</TableHead>
                      <TableHead className="text-right">Agreements</TableHead>
                      <TableHead className="text-right">Disbursed</TableHead>
                      <TableHead className="text-right">Outstanding</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {o.programs.map((p) => (
                      <TableRow key={p.serviceId}>
                        <TableCell className="font-medium">{p.serviceName}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.requests}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.agreements}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(p.disbursed)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(p.outstanding)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="space-y-2 md:hidden">
                {o.programs.map((p) => (
                  <div key={p.serviceId} className="rounded-xl border p-3">
                    <p className="text-sm font-semibold">{p.serviceName}</p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <span>Requests: <b className="tabular-nums">{p.requests}</b></span>
                      <span>Agreements: <b className="tabular-nums">{p.agreements}</b></span>
                      <span>Disbursed: <b>{formatMoney(p.disbursed)}</b></span>
                      <span>Outstanding: <b>{formatMoney(p.outstanding)}</b></span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof BarChart3
  label: string
  value: string
  sub?: string
  tone: 'emerald' | 'amber' | 'rose' | 'stone'
}) {
  const tones = {
    emerald: 'text-emerald-600 dark:text-emerald-400',
    amber: 'text-amber-600 dark:text-amber-400',
    rose: 'text-rose-600 dark:text-rose-400',
    stone: 'text-foreground',
  }
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <Icon size={15} className="shrink-0 text-muted-foreground/70" />
        </div>
        <p className={cn('mt-1.5 truncate text-2xl font-bold tabular-nums', tones[tone])} title={value}>{value}</p>
        {sub && <p className="mt-1 truncate text-[11px] text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// RISK SCORING TAB
// ═════════════════════════════════════════════════════════════════════════════

function RiskTab() {
  const { data: configData, loading, error, refetch } = useApi<{ config: RiskConfigDTO }>('/api/financier/risk-config')
  const [form, setForm] = useState<RiskConfigDTO | null>(null)
  const [saving, setSaving] = useState(false)
  const [autoConfirmOpen, setAutoConfirmOpen] = useState(false)
  const [pendingAuto, setPendingAuto] = useState<boolean | null>(null)

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    )
  }
  if (error || !configData?.config) {
    return (
      <EmptyState icon={ShieldAlert} title="Could not load the risk config" description={error ?? 'Unknown error'}>
        <Button variant="outline" className="rounded-xl" onClick={() => void refetch()}>
          <RotateCcw size={13} className="mr-1" /> Retry
        </Button>
      </EmptyState>
    )
  }

  const config = form ?? configData.config
  const setField = <K extends keyof RiskConfigDTO>(key: K, value: RiskConfigDTO[K]) =>
    setForm({ ...config, [key]: value } as RiskConfigDTO)

  const totalWeight =
    config.weightAmount + config.weightTenor + config.weightGuarantee + config.weightCapacity + config.weightHistory + config.weightDocuments

  const save = async (override?: Partial<RiskConfigDTO>) => {
    setSaving(true)
    try {
      const payload = { ...config, ...override }
      const res = await apiRequest<{ config: RiskConfigDTO }>('/api/financier/risk-config', {
        method: 'PUT',
        body: JSON.stringify(payload),
      })
      if (!res.ok || !res.data) {
        toastApiError(res.error, 'Could not save the risk config')
        return
      }
      setForm(null)
      toast({ title: 'Risk config saved', description: 'New computations use these weights immediately.' })
      void refetch()
    } finally {
      setSaving(false)
    }
  }

  const onAutoToggle = (checked: boolean) => {
    if (checked) {
      setPendingAuto(true)
      setAutoConfirmOpen(true)
    } else {
      setField('autoDecisionEnabled', false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Decision-support explainer */}
      <div className="flex items-start gap-2.5 rounded-2xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-800/60 dark:bg-amber-950 dark:text-amber-200">
        <Info size={15} className="mt-0.5 shrink-0" />
        <p>
          Risk scoring is <b>decision-support by default</b> — every assessment lands as a recommendation for
          your underwriters. Auto-approve / auto-decline only fire when you explicitly enable auto-decision
          below, and always inside the thresholds you set.
        </p>
      </div>

      {/* Weights */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <p className="flex items-center gap-2 text-sm font-bold">
            <SlidersHorizontal size={15} className="text-primary" /> Factor weights
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Each factor is scored 0–100 (higher = lower risk), then weighted by these shares. Weights are
            normalized to 100% at compute time — any total works, 100 reads as plain percentages.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {WEIGHT_FIELDS.map((f) => (
              <div key={f.key} className="rounded-xl border bg-muted/20 p-3">
                <Label htmlFor={`w-${f.key}`} className="text-xs font-semibold">{f.label}</Label>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{f.hint}</p>
                <Input
                  id={`w-${f.key}`}
                  type="number"
                  min={0}
                  max={100}
                  className="mt-2 h-9 rounded-xl"
                  value={config[f.key]}
                  onChange={(e) => setField(f.key, Number(e.target.value) as never)}
                />
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 py-2 text-xs">
            <span>
              Total: <b className={cn('tabular-nums', totalWeight === 100 ? 'text-emerald-600 dark:text-emerald-400' : totalWeight > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400')}>{totalWeight}</b>
              {totalWeight === 100
                ? ' — used as plain percentages'
                : totalWeight > 0
                  ? ` — normalizes to 100% (e.g. amount share ${Math.round((config.weightAmount / totalWeight) * 100)}%)`
                  : ' — all weights are zero; factors get equal shares'}
            </span>
            <Button size="sm" className="rounded-xl" disabled={saving} onClick={() => void save()}>
              {saving ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Save size={14} className="mr-1" />} Save config
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Auto-decision */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <p className="flex items-center gap-2 text-sm font-bold">
            <Sparkles size={15} className="text-primary" /> Auto-decision (optional)
          </p>
          <div className="mt-3 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Enable AUTO_APPROVE / AUTO_DECLINE verdicts</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                With this off, every assessment is DECISION_SUPPORT — a human decides. With it on, scores at or
                above the approve threshold auto-approve and scores below the decline threshold auto-decline.
              </p>
            </div>
            <Switch
              checked={config.autoDecisionEnabled}
              onCheckedChange={onAutoToggle}
              aria-label="Toggle auto-decision"
            />
          </div>
          {config.autoDecisionEnabled && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border p-3">
                <Label htmlFor="thr-approve" className="text-xs font-semibold">Auto-approve at score ≥</Label>
                <Input
                  id="thr-approve"
                  type="number"
                  min={0}
                  max={100}
                  className="mt-2 h-9 rounded-xl"
                  value={config.autoApproveThreshold}
                  onChange={(e) => setField('autoApproveThreshold', Number(e.target.value))}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">Band LOW starts at 70 — 80 is a conservative default.</p>
              </div>
              <div className="rounded-xl border p-3">
                <Label htmlFor="thr-decline" className="text-xs font-semibold">Auto-decline at score &lt;</Label>
                <Input
                  id="thr-decline"
                  type="number"
                  min={0}
                  max={100}
                  className="mt-2 h-9 rounded-xl"
                  value={config.autoDeclineThreshold}
                  onChange={(e) => setField('autoDeclineThreshold', Number(e.target.value))}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">Band HIGH is below 40 — 30 keeps a buffer.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assessment panel */}
      <RiskAssessPanel />

      {/* Danger confirm for enabling auto-decision */}
      <AlertDialog open={autoConfirmOpen} onOpenChange={setAutoConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-rose-500" /> Enable auto-decision?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This lets the scoring engine issue AUTO_APPROVE and AUTO_DECLINE verdicts on its own for scores
              outside the neutral band. Underwriters still see every assessment, and you can switch auto-decision
              back off at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingAuto(null)}>Keep decision-support</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700"
              onClick={() => {
                if (pendingAuto != null) setField('autoDecisionEnabled', true)
                setPendingAuto(null)
              }}
            >
              Enable auto-decision
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function RiskAssessPanel() {
  const { data: inbox } = useApi<{ requests: { id: string; number: string; applicant: { name: string } }[]; total: number }>(
    '/api/financier/requests?limit=100'
  )
  const [requestId, setRequestId] = useState('')
  const [computing, setComputing] = useState(false)
  const [assessment, setAssessment] = useState<RiskAssessmentDTO | null>(null)

  const compute = async () => {
    if (!requestId) return
    setComputing(true)
    try {
      const res = await apiRequest<{ assessment: RiskAssessmentDTO }>('/api/financier/risk-assessments', {
        method: 'POST',
        body: JSON.stringify({ requestId }),
      })
      if (!res.ok || !res.data) {
        toastApiError(res.error, 'Could not compute the assessment')
        return
      }
      setAssessment(res.data.assessment)
      toast({ title: 'Assessment computed', description: `${res.data.assessment.requestNumber} → ${res.data.assessment.score} (${res.data.assessment.band})` })
    } finally {
      setComputing(false)
    }
  }

  const requests = inbox?.requests ?? []

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <p className="flex items-center gap-2 text-sm font-bold">
          <Gauge size={15} className="text-primary" /> Score a request now
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Pick any forwarded request and run the six-factor score with the saved weights. The result is stored
          on the request (latest wins) and audited.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Select value={requestId} onValueChange={setRequestId}>
            <SelectTrigger className="h-10 w-full rounded-xl sm:max-w-md">
              <SelectValue placeholder="Pick a forwarded request" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {requests.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.number} · {r.applicant.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button className="rounded-xl" disabled={!requestId || computing} onClick={() => void compute()}>
            {computing ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Sparkles size={14} className="mr-1" />}
            Compute score
          </Button>
        </div>

        {assessment && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded-2xl border p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className={cn('flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl text-white', BAND_STYLE[assessment.band].bar)}>
                <span className="text-lg font-bold leading-none tabular-nums">{assessment.score}</span>
                <span className="text-[9px] font-semibold uppercase tracking-wide opacity-90">{assessment.band} risk</span>
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{assessment.requestNumber} · {assessment.applicantName}</p>
                <p className="truncate text-xs text-muted-foreground">{assessment.serviceName}</p>
              </div>
              <span
                className={cn(
                  'ml-auto rounded-full px-3 py-1 text-[11px] font-bold',
                  assessment.decision === 'AUTO_APPROVE'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : assessment.decision === 'AUTO_DECLINE'
                      ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                      : 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300'
                )}
              >
                {assessment.decision.replace(/_/g, ' ')}
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {assessment.factors.map((f) => (
                <div key={f.name} className="flex items-center gap-3">
                  <span className="w-44 shrink-0 truncate text-xs font-medium" title={f.name}>{f.name}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn('h-full rounded-full', f.score >= 70 ? 'bg-emerald-500' : f.score >= 40 ? 'bg-amber-500' : 'bg-rose-500')}
                      style={{ width: `${Math.max(2, f.score)}%` }}
                    />
                  </div>
                  <span className="w-28 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                    {f.score} · {Math.round(f.weight * 100)}%
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Higher factor scores mean lower risk. Weights are the normalized shares from your config.
            </p>
          </motion.div>
        )}
      </CardContent>
    </Card>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// UNDERWRITING LIMITS TAB
// ═════════════════════════════════════════════════════════════════════════════

function LimitsTab() {
  const { data, loading, error, refetch } = useApi<{ limits: LimitRow[] }>('/api/financier/limits')
  const { data: branchesData } = useApi<{ branches: BranchLite[] }>('/api/financier/branches')
  const { data: teamData } = useApi<{ members: TeamMemberLite[] } | { error: string }>('/api/financier/team')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // Non-admin staff get a 403 on /api/financier/team — degrade gracefully.
  const members = 'members' in (teamData ?? {}) ? (teamData as { members: TeamMemberLite[] }).members : []
  const branches = branchesData?.branches ?? []
  const limits = data?.limits ?? []

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }
  if (error) {
    return (
      <EmptyState icon={ShieldAlert} title="Could not load the limits" description={error}>
        <Button variant="outline" className="rounded-xl" onClick={() => void refetch()}>
          <RotateCcw size={13} className="mr-1" /> Retry
        </Button>
      </EmptyState>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-2xl border bg-primary/5 px-4 py-3 text-xs text-foreground/80">
        <ShieldCheck size={15} className="mt-0.5 shrink-0 text-primary" />
        <p>
          Offers are blocked when they exceed the acting underwriter&apos;s effective limit (most specific wins:
          underwriter-at-branch → underwriter → branch → institution). <b>No row = unlimited.</b> Limits apply
          when offers are created and re-checked when a draft is sent.
        </p>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold">Limit matrix</p>
        <Button size="sm" className="rounded-xl" onClick={() => setDialogOpen(true)}>
          <Plus size={14} className="mr-1" /> Set a limit
        </Button>
      </div>

      {limits.length === 0 ? (
        <EmptyState
          icon={Scale}
          title="No underwriting limits set"
          description="Without a limit row, every underwriter can offer any amount. Set institution, branch or per-underwriter caps to fence exposure."
        >
          <Button size="sm" className="rounded-xl" onClick={() => setDialogOpen(true)}>
            <Plus size={14} className="mr-1" /> Set the first limit
          </Button>
        </EmptyState>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-2xl border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scope</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Underwriter</TableHead>
                  <TableHead className="text-right">Max amount</TableHead>
                  <TableHead>Last updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {limits.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{SCOPE_LABEL[l.scope]}</TableCell>
                    <TableCell className="text-xs">{l.branchName ?? '—'}</TableCell>
                    <TableCell className="text-xs">
                      {l.userName ? <span>{l.userName}<span className="block text-muted-foreground">{l.userEmail}</span></span> : '—'}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{formatMoney(l.maxAmount, l.currency)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(l.updatedAt).toLocaleDateString()}
                      {l.updatedByName ? ` · ${l.updatedByName}` : ''}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="space-y-2 md:hidden">
            {limits.map((l) => (
              <Card key={l.id}>
                <CardContent className="space-y-1.5 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{SCOPE_LABEL[l.scope]}</p>
                    <span className="shrink-0 text-sm font-bold tabular-nums">{formatMoney(l.maxAmount, l.currency)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {l.branchName ?? 'Any branch'} · {l.userName ?? 'Any underwriter'}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Updated {new Date(l.updatedAt).toLocaleDateString()}{l.updatedByName ? ` by ${l.updatedByName}` : ''}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <LimitDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        branches={branches}
        members={members}
        saving={saving}
        setSaving={setSaving}
        onSaved={() => void refetch()}
      />
    </div>
  )
}

function LimitDialog({
  open,
  onClose,
  branches,
  members,
  saving,
  setSaving,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  branches: BranchLite[]
  members: TeamMemberLite[]
  saving: boolean
  setSaving: (v: boolean) => void
  onSaved: () => void
}) {
  const [scope, setScope] = useState<'ORG' | 'BRANCH' | 'USER'>('ORG')
  const [branchId, setBranchId] = useState('')
  const [userId, setUserId] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('YER')

  const submit = async () => {
    const maxAmount = Number(amount)
    if (!Number.isFinite(maxAmount) || maxAmount <= 0) {
      toast({ title: 'Enter a positive maximum amount', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const res = await apiRequest<{ limits: LimitRow[] }>('/api/financier/limits', {
        method: 'PUT',
        body: JSON.stringify({
          scope,
          branchId: scope !== 'ORG' && branchId ? branchId : null,
          userId: scope === 'USER' && userId ? userId : null,
          maxAmount,
          currency: currency.toUpperCase(),
        }),
      })
      if (!res.ok || !res.data) {
        toastApiError(res.error, 'Could not set the limit')
        return
      }
      toast({
        title: 'Limit saved',
        description: `${maxAmount.toLocaleString()} ${currency.toUpperCase()} — enforcement is live on new offers.`,
      })
      setAmount('')
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale size={16} className="text-primary" /> Set an underwriting limit
          </DialogTitle>
          <DialogDescription>
            Upserts one row of the limit matrix. Setting an existing scope overwrites its amount.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Scope</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as typeof scope)}>
              <SelectTrigger className="mt-1.5 h-10 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ORG">Institution-wide</SelectItem>
                <SelectItem value="BRANCH">One branch</SelectItem>
                <SelectItem value="USER">One underwriter</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {scope !== 'ORG' && branches.length > 0 && (
            <div>
              <Label className="text-xs">Branch {scope === 'USER' ? '(optional)' : ''}</Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger className="mt-1.5 h-10 rounded-xl">
                  <SelectValue placeholder={scope === 'BRANCH' ? 'Pick a branch' : 'Any branch'} />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {scope === 'USER' && <SelectItem value="any">Any branch</SelectItem>}
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}{b.city ? ` — ${b.city}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {scope === 'USER' && (
            <div>
              <Label className="text-xs">Underwriter</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger className="mt-1.5 h-10 rounded-xl">
                  <SelectValue placeholder="Pick a staff member" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {members.map((m) => (
                    <SelectItem key={m.userId} value={m.userId}>
                      {m.name}{m.email ? ` — ${m.email}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {members.length === 0 && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Only institution owners/admins can read the team list — pick the user&apos;s scope via the API if needed.
                </p>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="lim-amount" className="text-xs">Maximum amount</Label>
              <Input
                id="lim-amount"
                type="number"
                min={1}
                className="mt-1.5 h-10 rounded-xl"
                placeholder="1000000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="lim-currency" className="text-xs">Currency</Label>
              <Input
                id="lim-currency"
                className="mt-1.5 h-10 rounded-xl uppercase"
                maxLength={3}
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={onClose}>Cancel</Button>
          <Button className="rounded-xl" disabled={saving || !amount} onClick={() => void submit()}>
            {saving ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Save size={14} className="mr-1" />} Save limit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
