'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN · KYC PROVIDER CONSOLE — Phase 12.4 (lastplan v5 §12).
//
//   • "Routing"      — per document type: MANUAL | PROVIDER | PROVIDER_THEN_
//                      MANUAL + adapter + timeoutMs + enabled + mock outcome
//                      (PUT /api/admin/kyc/provider-configs), webhook secret
//                      display + rotate.
//   • "Case Queue"   — the case work queue (OPEN = SUBMITTED + PROVIDER_ERROR
//                      + MANUAL_QUEUE + PENDING), the minimized transmitted-
//                      payload evidence viewer, and the manual decisions
//                      (approve / reject / requeue).
//   • "Webhook Log"  — every delivery with signature validity, replay flags
//                      and the raw payload (forensics).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import {
  CheckCircle2,
  Eye,
  FileSearch,
  KeyRound,
  ListFilter,
  Loader2,
  RefreshCw,
  Route,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Undo2,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { formatDate } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { AdminEmptyState, apiRequest, toastApiError } from '../shared'

type SectionKey = 'routing' | 'cases' | 'webhooks'

const SECTIONS: { key: SectionKey; label: string; icon: LucideIcon }[] = [
  { key: 'routing', label: 'Routing', icon: Route },
  { key: 'cases', label: 'Case Queue', icon: ListFilter },
  { key: 'webhooks', label: 'Webhook Log', icon: ScrollText },
]

const MODE_LABELS: Record<string, string> = {
  MANUAL: 'Manual review',
  PROVIDER: 'Provider',
  PROVIDER_THEN_MANUAL: 'Provider → manual on reject',
}

// Warm palette — SUBMITTED uses the teal family (no blue/indigo).
const CASE_STATUS_STYLE: Record<string, { label: string; badge: string; outline?: boolean }> = {
  PENDING: { label: 'Pending', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  SUBMITTED: { label: 'Submitted', badge: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300' },
  APPROVED: { label: 'Approved', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  REJECTED: { label: 'Rejected', badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' },
  PROVIDER_ERROR: {
    label: 'Provider error',
    badge: 'border border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
    outline: true,
  },
  MANUAL_QUEUE: {
    label: 'Manual queue',
    badge: 'border border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
    outline: true,
  },
  CANCELLED: { label: 'Cancelled', badge: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
}

const OUTCOME_LABELS: Record<string, string> = {
  approve: 'Approve',
  reject: 'Reject',
  error500: 'Simulated HTTP 500',
  timeout: 'Simulated timeout',
}

const shortId = (id: string) => id.slice(0, 8)

function prettyJson(raw: string | null | undefined): string {
  if (!raw) return '—'
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

// ── API contracts ────────────────────────────────────────────────────────────

interface ProviderConfigRow {
  id: string
  docType: string
  mode: string
  providerKey: string
  enabled: boolean
  timeoutMs: number
  outcome: string
  changedById: string | null
  updatedAt: string
  transmittedFields: string[]
}

interface ConfigsResponse {
  configs: ProviderConfigRow[]
  secrets: Record<string, string>
  providers: string[]
}

interface CaseRow {
  id: string
  documentId: string
  docType: string
  documentTitle: string | null
  documentStatus: string
  ownerName: string
  ownerEmail: string | null
  ownerUserId: string
  organizationId: string | null
  providerKey: string
  status: string
  providerCaseRef: string | null
  submittedAt: string | null
  decisionAt: string | null
  decidedBy: string | null
  errorDetail: string | null
  transmittedFields: string | null
  createdAt: string
  updatedAt: string
}

interface CasesResponse {
  cases: CaseRow[]
  counts: { open: number; total: number }
}

interface WebhookEventRow {
  id: string
  eventId: string
  providerKey: string
  eventType: string
  caseId: string | null
  caseDocType: string | null
  caseStatus: string | null
  payload: string
  signatureValid: boolean
  replayed: boolean
  nonce: string | null
  receivedAt: string
  processedAt: string | null
}

interface WebhookEventsResponse {
  events: WebhookEventRow[]
  total: number
}

export function KycProviderConsole() {
  const [section, setSection] = useState<SectionKey>('routing')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <Route size={13} className="text-primary" />
        <span>
          Route document verification per type — manual review, provider auto-checks or provider-then-manual. Provider
          errors and timeouts hold cases for <strong>human</strong> review: nothing is ever auto-approved.
        </span>
      </div>

      <div className="sticky top-14 z-20 -mx-4 border-b bg-background/95 px-4 pb-2 pt-1 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <nav
          aria-label="KYC provider sections"
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

      {section === 'routing' && <RoutingTab />}
      {section === 'cases' && <CaseQueueTab />}
      {section === 'webhooks' && <WebhookLogTab />}
    </div>
  )
}

// ── Routing tab ──────────────────────────────────────────────────────────────

function RoutingTab() {
  const { data, loading, error, refetch } = useApi<ConfigsResponse>('/api/admin/kyc/provider-configs')
  const [busy, setBusy] = useState<string | null>(null)
  const [secretShown, setSecretShown] = useState(false)
  const [rotating, setRotating] = useState(false)
  const [rotateConfirm, setRotateConfirm] = useState(false)

  async function saveConfig(row: ProviderConfigRow, patch: Partial<ProviderConfigRow>) {
    const next = { ...row, ...patch }
    setBusy(row.docType)
    const res = await apiRequest('/api/admin/kyc/provider-configs', {
      method: 'PUT',
      body: JSON.stringify({
        docType: next.docType,
        mode: next.mode,
        providerKey: next.providerKey,
        timeoutMs: next.timeoutMs,
        enabled: next.enabled,
        outcome: next.outcome,
      }),
    })
    setBusy(null)
    if (!res.ok) {
      toastApiError(res.error, 'Routing not saved')
      return
    }
    toast({ title: `${row.docType} routing saved`, description: `${next.enabled ? MODE_LABELS[next.mode] : 'Manual (disabled)'} via ${next.providerKey}` })
    void refetch({ silent: true })
  }

  async function rotateSecret() {
    setRotating(true)
    const res = await apiRequest<{ secret: string }>('/api/admin/kyc/provider-configs', {
      method: 'POST',
      body: JSON.stringify({ action: 'rotate-secret', providerKey: 'mock' }),
    })
    setRotating(false)
    setRotateConfirm(false)
    if (!res.ok) {
      toastApiError(res.error, 'Secret not rotated')
      return
    }
    toast({ title: 'Webhook secret rotated', description: 'The mock provider signs with the new secret from now on.' })
    setSecretShown(true)
    void refetch({ silent: true })
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    )
  }
  if (error || !data) {
    return <AdminEmptyState icon={ShieldAlert} title="Routing unavailable" description={error ?? 'No configuration loaded'} />
  }

  const mockSecret = data.secrets.mock ?? '— not generated yet (first dispatch creates it) —'

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-4">
        {/* Webhook secrets */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <KeyRound size={15} className="text-primary" />
                <CardTitle className="text-sm font-semibold">Webhook signing secret</CardTitle>
              </div>
              <Button variant="outline" size="sm" disabled={rotating} onClick={() => setRotateConfirm(true)}>
                {rotating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Regenerate
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Provider <Badge variant="secondary" className="font-mono text-[11px]">mock</Badge> signs every webhook with
              HMAC-SHA256 over <code className="rounded bg-muted px-1 py-0.5 text-[11px]">timestamp.nonce.rawBody</code>.
              The platform verifies constant-time and enforces the ±5 min replay window + nonce uniqueness.
            </p>
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3">
              <code className="min-w-0 flex-1 truncate font-mono text-xs">
                {secretShown ? mockSecret : '••••••••••••••••••••••••••••••••••••••••••••••••••'}
              </code>
              <Button variant="ghost" size="sm" onClick={() => setSecretShown((v) => !v)}>
                {secretShown ? 'Hide' : 'Reveal'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Routing table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Per-document-type routing</CardTitle>
            <p className="text-xs text-muted-foreground">
              MANUAL keeps the classic admin verify queue (no case is created). PROVIDER submits the minimized payload
              and waits for the signed decision. PROVIDER_THEN_MANUAL sends provider rejections to a human second look.
            </p>
          </CardHeader>
          <CardContent className="p-0 pb-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    <TableHead>Document type</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Mock outcome</TableHead>
                    <TableHead className="text-right">Timeout</TableHead>
                    <TableHead>Enabled</TableHead>
                    <TableHead>Transmitted fields</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.configs.map((row) => {
                    const disabled = busy === row.docType
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="font-mono text-xs font-medium">{row.docType}</TableCell>
                        <TableCell>
                          <Select
                            value={row.mode}
                            disabled={disabled}
                            onValueChange={(mode) => void saveConfig(row, { mode })}
                          >
                            <SelectTrigger className="h-8 w-[210px] text-xs" aria-label={`${row.docType} routing mode`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(MODE_LABELS).map(([value, label]) => (
                                <SelectItem key={value} value={value} className="text-xs">
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-xs text-muted-foreground">{row.providerKey}</span>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={row.outcome}
                            disabled={disabled}
                            onValueChange={(outcome) => void saveConfig(row, { outcome })}
                          >
                            <SelectTrigger className="h-8 w-[170px] text-xs" aria-label={`${row.docType} mock outcome`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(OUTCOME_LABELS).map(([value, label]) => (
                                <SelectItem key={value} value={value} className="text-xs">
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Input
                              type="number"
                              min={1000}
                              max={120000}
                              step={500}
                              defaultValue={row.timeoutMs}
                              disabled={disabled}
                              className="h-8 w-24 text-right text-xs tabular-nums"
                              aria-label={`${row.docType} timeout ms`}
                              onBlur={(e) => {
                                const v = Number(e.target.value)
                                if (Number.isFinite(v) && v >= 1000 && v <= 120000 && v !== row.timeoutMs) {
                                  void saveConfig(row, { timeoutMs: v })
                                } else {
                                  e.target.value = String(row.timeoutMs)
                                }
                              }}
                            />
                            <span className="text-[11px] text-muted-foreground">ms</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={row.enabled}
                            disabled={disabled}
                            onCheckedChange={(enabled) => void saveConfig(row, { enabled })}
                            aria-label={`${row.docType} routing enabled`}
                          />
                        </TableCell>
                        <TableCell>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button" className="text-left">
                                <Badge variant="secondary" className="font-mono text-[10px]">
                                  {row.transmittedFields.length} fields
                                </Badge>
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="max-w-72">
                              <p className="font-mono text-[11px] leading-relaxed">{row.transmittedFields.join(', ')}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={rotateConfirm} onOpenChange={setRotateConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regenerate the mock webhook secret?</DialogTitle>
            <DialogDescription>
              The old signature stops verifying immediately — deliveries signed with the previous secret are rejected
              401 (and audited). Use this to invalidate a compromised secret.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRotateConfirm(false)}>
              Cancel
            </Button>
            <Button onClick={() => void rotateSecret()}>Regenerate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}

// ── Case Queue tab ───────────────────────────────────────────────────────────

const STATUS_FILTERS = ['OPEN', 'ALL', 'PENDING', 'SUBMITTED', 'PROVIDER_ERROR', 'MANUAL_QUEUE', 'APPROVED', 'REJECTED', 'CANCELLED'] as const

const ACTIONABLE = new Set(['PENDING', 'PROVIDER_ERROR', 'MANUAL_QUEUE'])

function CaseQueueTab() {
  const [filter, setFilter] = useState<(typeof STATUS_FILTERS)[number]>('OPEN')
  const { data, loading, error, refetch } = useApi<CasesResponse>(`/api/admin/kyc/cases?status=${filter}`, { pollMs: 8000 })
  const [viewing, setViewing] = useState<CaseRow | null>(null)
  const [deciding, setDeciding] = useState<{ row: CaseRow; action: 'approve' | 'reject' } | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  async function decide(row: CaseRow, action: 'approve' | 'reject' | 'requeue', noteValue?: string) {
    setBusy(`${row.id}:${action}`)
    const res = await apiRequest<{ caseStatus: string }>(`/api/admin/kyc/cases/${row.id}`, {
      method: 'POST',
      body: JSON.stringify({ action, note: noteValue || undefined }),
    })
    setBusy(null)
    if (!res.ok) {
      toastApiError(res.error, 'Decision not applied')
      return
    }
    toast({
      title: `Case ${shortId(row.id)} → ${res.data?.caseStatus ?? action}`,
      description:
        action === 'approve'
          ? 'Document verified, KYC levels recomputed.'
          : action === 'reject'
            ? 'Document rejected.'
            : 'Case re-queued to PENDING.',
    })
    setDeciding(null)
    setNote('')
    void refetch({ silent: true })
  }

  const counts = data?.counts

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-4">
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
            <div className="flex items-center gap-2">
              <Select value={filter} onValueChange={(v) => setFilter(v as (typeof STATUS_FILTERS)[number])}>
                <SelectTrigger className="h-9 w-[230px] text-xs" aria-label="Case status filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OPEN" className="text-xs">Open (in flight / needs a human)</SelectItem>
                  <SelectItem value="ALL" className="text-xs">All cases</SelectItem>
                  {STATUS_FILTERS.slice(2).map((s) => (
                    <SelectItem key={s} value={s} className="text-xs">
                      {CASE_STATUS_STYLE[s]?.label ?? s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {counts && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary" className="font-mono">{counts.open} open</Badge>
                  <span>/</span>
                  <Badge variant="secondary" className="font-mono">{counts.total} total</Badge>
                </div>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={() => void refetch({ silent: true })}>
              <RefreshCw size={14} />
              Refresh
            </Button>
          </CardContent>
        </Card>

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        ) : error || !data ? (
          <AdminEmptyState icon={ShieldAlert} title="Case queue unavailable" description={error ?? 'Nothing loaded'} />
        ) : data.cases.length === 0 ? (
          <AdminEmptyState
            icon={FileSearch}
            title="No cases in this view"
            description="Documents uploaded while a doc type routes to a provider appear here. Errors and timeouts land in the same queue for a human decision."
          />
        ) : (
          <Card>
            <CardContent className="p-0 pb-2">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      <TableHead>Case</TableHead>
                      <TableHead>Document</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Decided</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.cases.map((row) => {
                      const style = CASE_STATUS_STYLE[row.status] ?? { label: row.status, badge: 'bg-neutral-200 text-neutral-600' }
                      const actionable = ACTIONABLE.has(row.status)
                      return (
                        <TableRow key={row.id}>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-mono text-xs font-medium">{shortId(row.id)}</span>
                              {row.providerCaseRef && (
                                <span className="font-mono text-[10px] text-muted-foreground">{row.providerCaseRef.slice(0, 18)}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-mono text-xs">{row.docType}</span>
                              {row.documentTitle && <span className="text-[11px] text-muted-foreground">{row.documentTitle}</span>}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="text-xs">{row.ownerName}</span>
                              {row.ownerEmail && <span className="text-[11px] text-muted-foreground">{row.ownerEmail}</span>}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="font-mono text-xs text-muted-foreground">{row.providerKey}</span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <Badge className={cn('rounded-full border-0 text-[11px] font-semibold', style.badge)}>
                                {style.label}
                              </Badge>
                              {row.errorDetail && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span tabIndex={0} role="button" aria-label="Provider error detail" className="text-rose-500">
                                      <ShieldAlert size={14} />
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-96">
                                    <p className="font-mono text-[11px] leading-relaxed">{row.errorDetail}</p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {row.submittedAt ? formatDate(row.submittedAt) : '—'}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {row.decisionAt ? (
                              <div className="flex flex-col">
                                <span>{formatDate(row.decisionAt)}</span>
                                {row.decidedBy && <span className="text-[10px]">by {row.decidedBy}</span>}
                              </div>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="sm" onClick={() => setViewing(row)} aria-label="View transmitted fields">
                                <Eye size={14} />
                                Payload
                              </Button>
                              {actionable ? (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-emerald-700 hover:text-emerald-800 dark:text-emerald-400"
                                    disabled={busy === `${row.id}:approve`}
                                    onClick={() => {
                                      setDeciding({ row, action: 'approve' })
                                      setNote('')
                                    }}
                                  >
                                    {busy === `${row.id}:approve` ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                    Approve
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-rose-700 hover:text-rose-800 dark:text-rose-400"
                                    disabled={busy === `${row.id}:reject`}
                                    onClick={() => {
                                      setDeciding({ row, action: 'reject' })
                                      setNote('')
                                    }}
                                  >
                                    {busy === `${row.id}:reject` ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                                    Reject
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={busy === `${row.id}:requeue`}
                                    onClick={() => void decide(row, 'requeue')}
                                    aria-label="Requeue case"
                                  >
                                    {busy === `${row.id}:requeue` ? <Loader2 size={14} className="animate-spin" /> : <Undo2 size={14} />}
                                  </Button>
                                </>
                              ) : (
                                <span className="text-[11px] text-muted-foreground">read-only</span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Transmitted-fields viewer — the data-minimization evidence */}
      <Dialog open={!!viewing} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Transmitted payload</DialogTitle>
            <DialogDescription>
              The EXACT minimized fields sent to provider “{viewing?.providerKey}” for {viewing?.docType} — never the
              file bytes, never a public URL. Stored on the case as evidence.
            </DialogDescription>
          </DialogHeader>
          <pre className="max-h-80 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">
            {prettyJson(viewing?.transmittedFields)}
          </pre>
        </DialogContent>
      </Dialog>

      {/* Manual decision dialog */}
      <Dialog open={!!deciding} onOpenChange={(open) => !open && setDeciding(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {deciding?.action === 'approve' ? 'Approve' : 'Reject'} case {deciding ? shortId(deciding.row.id) : ''}
            </DialogTitle>
            <DialogDescription>
              {deciding?.action === 'approve'
                ? 'The document becomes VERIFIED, the case APPROVED and the owner’s KYC level recomputes.'
                : 'The document becomes REJECTED. The owner can re-upload a corrected version.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="decision-note">Note (optional)</Label>
            <Textarea
              id="decision-note"
              value={note}
              maxLength={500}
              rows={3}
              placeholder="Why this decision was taken…"
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeciding(null)}>
              Cancel
            </Button>
            <Button
              variant={deciding?.action === 'reject' ? 'destructive' : 'default'}
              disabled={busy === `${deciding?.row.id}:${deciding?.action}`}
              onClick={() => deciding && void decide(deciding.row, deciding.action, note)}
            >
              {busy === `${deciding?.row.id}:${deciding?.action}` && <Loader2 size={14} className="animate-spin" />}
              {deciding?.action === 'approve' ? 'Approve case' : 'Reject case'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}

// ── Webhook Log tab ──────────────────────────────────────────────────────────

const EVENT_STYLE: Record<string, string> = {
  'case.approved': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  'case.rejected': 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  'case.error': 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  ping: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
}

function WebhookLogTab() {
  const { data, loading, error, refetch } = useApi<WebhookEventsResponse>('/api/admin/kyc/webhook-events?limit=100', { pollMs: 10000 })
  const [viewing, setViewing] = useState<WebhookEventRow | null>(null)

  const stats = useMemo(() => {
    const events = data?.events ?? []
    return {
      total: data?.total ?? events.length,
      invalid: events.filter((e) => !e.signatureValid).length,
      replayed: events.filter((e) => e.replayed).length,
    }
  }, [data])

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="uppercase tracking-wide">Receive log</span>
            <Badge variant="secondary" className="font-mono">{stats.total} total</Badge>
            <Badge variant="secondary" className="border border-rose-300 bg-rose-50 font-mono text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
              {stats.invalid} bad signature
            </Badge>
            <Badge variant="secondary" className="border border-amber-300 bg-amber-50 font-mono text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              {stats.replayed} replayed
            </Badge>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refetch({ silent: true })}>
            <RefreshCw size={14} />
            Refresh
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      ) : error || !data ? (
        <AdminEmptyState icon={ShieldAlert} title="Webhook log unavailable" description={error ?? 'Nothing loaded'} />
      ) : data.events.length === 0 ? (
        <AdminEmptyState
          icon={ScrollText}
          title="No webhook deliveries yet"
          description="Every delivery — valid or not — is logged here with its signature and replay flags."
        />
      ) : (
        <Card>
          <CardContent className="p-0 pb-2">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    <TableHead>Received</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Case</TableHead>
                    <TableHead>Signature</TableHead>
                    <TableHead>Replayed</TableHead>
                    <TableHead>Event id</TableHead>
                    <TableHead className="text-right">Payload</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.events.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-xs text-muted-foreground">{new Date(row.receivedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-muted-foreground">{row.providerKey}</span>
                      </TableCell>
                      <TableCell>
                        <Badge className={cn('rounded-full border-0 text-[11px] font-semibold', EVENT_STYLE[row.eventType] ?? 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400')}>
                          {row.eventType}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {row.caseId ? (
                          <div className="flex flex-col">
                            <span className="font-mono text-xs">{shortId(row.caseId)}</span>
                            <span className="text-[10px] text-muted-foreground">{row.caseDocType}</span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.signatureValid ? (
                          <Badge className="rounded-full border-0 bg-emerald-100 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            <ShieldCheck size={11} className="mr-1" />
                            valid
                          </Badge>
                        ) : (
                          <Badge className="rounded-full border border-rose-300 bg-rose-50 text-[11px] font-semibold text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
                            <ShieldAlert size={11} className="mr-1" />
                            invalid
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.replayed ? (
                          <Badge className="rounded-full border border-amber-300 bg-amber-50 text-[11px] font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                            duplicate
                          </Badge>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-[11px] text-muted-foreground">{shortId(row.eventId)}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => setViewing(row)} aria-label="View raw payload">
                          <Eye size={14} />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!viewing} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Raw webhook payload</DialogTitle>
            <DialogDescription>
              Exactly what arrived from provider “{viewing?.providerKey}” — the signed bytes, kept as receive evidence.
            </DialogDescription>
          </DialogHeader>
          <pre className="max-h-80 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">
            {prettyJson(viewing?.payload)}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  )
}
