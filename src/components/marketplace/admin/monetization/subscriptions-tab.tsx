'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN · MONETIZATION — Subscriptions & Plans tab (Phase 11.2).
//
// Two stacked zones:
//   1. "Plans" — the subscription plan catalog: module bundles, limits,
//      subscriber counts. Editing a plan re-clamps every subscriber's ceiling
//      on the next resolution.
//   2. "Seller org subscriptions" — the live tenant ledger: status machine
//      TRIALING/ACTIVE/GRACE/DOWNGRADED/CANCELLED with the admin state
//      machine actions (change plan, renew/fail renewal, force downgrade,
//      cancel, complimentary grant).
//
// Server surface (all live):
//   GET  /api/admin/subscriptions                → { subscriptions }   (payouts.view)
//   POST /api/admin/subscriptions/[orgId]        → action-based        (payouts.manage)
//   GET  /api/admin/subscriptions/plans          → { plans }           (payouts.view)
//   PUT  /api/admin/subscriptions/plans          → upsert plan         (payouts.manage)
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import {
  BadgeCheck,
  CalendarClock,
  ChevronsUpDown,
  CreditCard,
  Gift,
  Layers,
  Loader2,
  Lock,
  LockOpen,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  SearchX,
  ShieldAlert,
  Users,
  Wallet,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { formatDate } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  AdminEmptyState,
  FilterChips,
  SearchInput,
  StatusBadge,
  apiRequest,
  toastApiError,
  useDebounced,
} from '../shared'

// ── API contracts ────────────────────────────────────────────────────────────

interface SubscriptionPlanDTO {
  id: string
  key: string
  name: string
  description: string | null
  priceMonthly: number
  currency: string
  modules: string[]
  limits: Record<string, number | null>
  isActive: boolean
  sortOrder: number
  subscriberCount: number
}

interface SubscriptionListRow {
  id: string
  organizationId: string
  organizationName: string
  status: string
  planKey: string
  planName: string
  priceMonthly: number
  currency: string
  currentPeriodEnd: string
  graceEndsAt: string | null
  cancelledAt: string | null
  invoiceCount: number
  updatedAt: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** The 8 non-core module keys a plan bundle can claim (core `marketplace` is
 *  never subscription-gated — it ships with every tier by definition). */
const GATED_MODULE_KEYS = [
  'financing-hub',
  'rfq',
  'b2b-orgs',
  'financier-console',
  'compare',
  'reviews',
  'insights',
  'solutions',
] as const

const MODULE_LABELS: Record<string, string> = {
  'financing-hub': 'Financing Hub',
  rfq: 'RFQ Pipeline',
  'b2b-orgs': 'B2B Org Accounts',
  'financier-console': 'Financier Console',
  compare: 'Product Compare',
  reviews: 'Buyer Reviews',
  insights: 'Seller Insights',
  solutions: 'Solutions Spotlights',
}

/** Plan tier badge palette (warm theme — free ascends to pro/emerald-gold). */
const PLAN_TIER_STYLE: Record<string, string> = {
  free: 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400',
  starter: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  growth: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  pro: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
}

const SUB_STATUS_MAP = {
  ACTIVE: {
    label: 'Active',
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  },
  TRIALING: {
    label: 'Trialing',
    badge: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300',
  },
  GRACE: {
    label: 'Grace — read-only warnings',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  },
  DOWNGRADED: {
    label: 'Downgraded',
    badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  },
  CANCELLED: {
    label: 'Cancelled',
    badge: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
  },
}

const STATUS_FILTERS = [
  { value: '', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'TRIALING', label: 'Trialing' },
  { value: 'GRACE', label: 'Grace' },
  { value: 'DOWNGRADED', label: 'Downgraded' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

function limitLabel(v: number | null | undefined): string {
  return v === null || v === undefined ? 'Unlimited' : String(v)
}

function PlanChip({ planKey }: { planKey: string }) {
  return (
    <Badge
      className={cn(
        'shrink-0 rounded-full border-0 text-[11px] font-semibold',
        PLAN_TIER_STYLE[planKey] ?? 'bg-muted text-muted-foreground'
      )}
    >
      {planKey}
    </Badge>
  )
}

// ── Zone 1 · Plan edit dialog ─────────────────────────────────────────────────

function PlanEditDialog({
  plan,
  onClose,
  onSaved,
}: {
  plan: SubscriptionPlanDTO | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(plan?.name ?? '')
  const [description, setDescription] = useState(plan?.description ?? '')
  const [price, setPrice] = useState(String(plan?.priceMonthly ?? 0))
  const [modules, setModules] = useState<string[]>(plan?.modules ?? [])
  const [maxProducts, setMaxProducts] = useState(
    plan?.limits.maxProducts != null ? String(plan.limits.maxProducts) : ''
  )
  const [maxActiveOffers, setMaxActiveOffers] = useState(
    plan?.limits.maxActiveOffers != null ? String(plan.limits.maxActiveOffers) : ''
  )
  const [maxUsers, setMaxUsers] = useState(
    plan?.limits.maxUsers != null ? String(plan.limits.maxUsers) : ''
  )
  const [sortOrder, setSortOrder] = useState(String(plan?.sortOrder ?? 0))
  const [isActive, setIsActive] = useState(plan?.isActive ?? true)
  const [saving, setSaving] = useState(false)

  const toggleModule = (key: string, checked: boolean) => {
    setModules((prev) => (checked ? [...new Set([...prev, key])] : prev.filter((k) => k !== key)))
  }

  const parseLimit = (v: string): number | null => {
    const t = v.trim()
    if (!t) return null // blank = unlimited
    const n = Number(t)
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null
  }

  const save = async () => {
    if (!plan) return
    const priceNum = Number(price)
    if (!name.trim() || !Number.isFinite(priceNum) || priceNum < 0) {
      toastApiError('Name and a valid price are required', 'Check the form')
      return
    }
    setSaving(true)
    const res = await apiRequest<{ plan: SubscriptionPlanDTO }>('/api/admin/subscriptions/plans', {
      method: 'PUT',
      body: JSON.stringify({
        key: plan.key,
        name: name.trim(),
        description: description.trim() || null,
        priceMonthly: priceNum,
        currency: plan.currency,
        modules,
        limits: {
          maxProducts: parseLimit(maxProducts),
          maxActiveOffers: parseLimit(maxActiveOffers),
          maxUsers: parseLimit(maxUsers),
        },
        isActive,
        sortOrder: Number(sortOrder) || 0,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      toastApiError(res.error, `Couldn't save the ${plan.key} plan`)
      return
    }
    toast({
      title: `Plan "${name.trim()}" saved`,
      description: 'Subscriber ceilings re-clamp on their next module resolution.',
    })
    onSaved()
    onClose()
  }

  return (
    <Dialog open={!!plan} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil size={16} className="text-primary" /> Edit plan · {plan?.key}
          </DialogTitle>
          <DialogDescription>
            The bundle and limits below are the CEILING for every org on this tier.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/60 dark:text-amber-200">
          <strong className="font-semibold">Ceiling semantics:</strong> the subscription is a
          CEILING — org activations can only enable what the plan entitles. Turning a module on
          for an organization can never exceed this bundle.
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="plan-name">Plan name</Label>
            <Input id="plan-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="plan-price">Price / month ({plan?.currency ?? 'USD'})</Label>
            <Input
              id="plan-price"
              type="number"
              min={0}
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="plan-desc">Description</Label>
          <Textarea
            id="plan-desc"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
          />
        </div>

        <div className="space-y-2">
          <Label>Module bundle (the ceiling)</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {GATED_MODULE_KEYS.map((key) => (
              <label
                key={key}
                className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-sm transition-colors hover:bg-accent/50"
              >
                <Checkbox
                  checked={modules.includes(key)}
                  onCheckedChange={(v) => toggleModule(key, v === true)}
                  aria-label={`Entitle ${MODULE_LABELS[key]}`}
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{MODULE_LABELS[key]}</span>
                  <span className="block font-mono text-[11px] text-muted-foreground">{key}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="plan-maxProducts">Max products</Label>
            <Input
              id="plan-maxProducts"
              type="number"
              min={0}
              placeholder="Unlimited"
              value={maxProducts}
              onChange={(e) => setMaxProducts(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="plan-maxActiveOffers">Max active offers</Label>
            <Input
              id="plan-maxActiveOffers"
              type="number"
              min={0}
              placeholder="Unlimited"
              value={maxActiveOffers}
              onChange={(e) => setMaxActiveOffers(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="plan-maxUsers">Max users</Label>
            <Input
              id="plan-maxUsers"
              type="number"
              min={0}
              placeholder="Unlimited"
              value={maxUsers}
              onChange={(e) => setMaxUsers(e.target.value)}
            />
          </div>
          <p className="text-[11px] text-muted-foreground sm:col-span-3">
            Blank = unlimited (null). Limits re-clamp the tenant the moment the plan saves.
          </p>
        </div>

        <div className="grid items-center gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="plan-sort">Sort order</Label>
            <Input
              id="plan-sort"
              type="number"
              min={0}
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </div>
          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2">
            <span>
              <span className="block text-sm font-medium">Plan is active</span>
              <span className="block text-[11px] text-muted-foreground">
                Inactive tiers stop resolving (their orgs fall to the free tier)
              </span>
            </span>
            <Switch checked={isActive} onCheckedChange={setIsActive} aria-label="Plan is active" />
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button className="rounded-xl" onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />} Save plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Zone 2 · Row action dialogs ───────────────────────────────────────────────

function ChangePlanDialog({
  row,
  plans,
  onClose,
  onDone,
}: {
  row: SubscriptionListRow | null
  plans: SubscriptionPlanDTO[]
  onClose: () => void
  onDone: () => void
}) {
  const [planKey, setPlanKey] = useState('')
  const [trialDays, setTrialDays] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!row || !planKey) return
    setBusy(true)
    const trial = Number(trialDays)
    const res = await apiRequest(`/api/admin/subscriptions/${row.organizationId}`, {
      method: 'POST',
      body: JSON.stringify({
        action: 'subscribe',
        planKey,
        ...(Number.isFinite(trial) && trial > 0 ? { trialDays: Math.floor(trial) } : {}),
      }),
    })
    setBusy(false)
    if (!res.ok) {
      toastApiError(res.error, `Couldn't change ${row.organizationName}'s plan`)
      return
    }
    toast({
      title: `${row.organizationName} → ${planKey}`,
      description: Number.isFinite(trial) && trial > 0 ? `Trialing for ${Math.floor(trial)} days.` : 'Subscribed (ACTIVE, 30-day period).',
    })
    onDone()
    onClose()
  }

  return (
    <Dialog open={!!row} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ChevronsUpDown size={16} className="text-primary" /> Change plan · {row?.organizationName}
          </DialogTitle>
          <DialogDescription>
            Subscribing the org to a paid plan writes a PAID invoice and a SUBSCRIPTION_RENEWAL
            ledger entry (unless a trial is set).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="change-planKey">Plan</Label>
          <select
            id="change-planKey"
            value={planKey}
            onChange={(e) => setPlanKey(e.target.value)}
            className="h-10 w-full rounded-xl border bg-background px-3 text-sm"
          >
            <option value="">Select a plan…</option>
            {plans.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name} — {formatMoney(p.priceMonthly, p.currency)}/mo
                {p.key === row?.planKey ? ' (current)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="change-trial">Trial days (optional)</Label>
          <Input
            id="change-trial"
            type="number"
            min={1}
            max={90}
            placeholder="None — starts ACTIVE"
            value={trialDays}
            onChange={(e) => setTrialDays(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button className="rounded-xl" onClick={() => void submit()} disabled={busy || !planKey}>
            {busy && <Loader2 size={14} className="mr-1.5 animate-spin" />} Change plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CancelSubDialog({
  row,
  onClose,
  onDone,
}: {
  row: SubscriptionListRow | null
  onClose: () => void
  onDone: () => void
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!row || !reason.trim()) return
    setBusy(true)
    const res = await apiRequest(`/api/admin/subscriptions/${row.organizationId}`, {
      method: 'POST',
      body: JSON.stringify({ action: 'cancel', reason: reason.trim() }),
    })
    setBusy(false)
    if (!res.ok) {
      toastApiError(res.error, `Couldn't cancel ${row.organizationName}'s subscription`)
      return
    }
    toast({
      title: 'Subscription cancelled',
      description: `${row.organizationName} drops to the free tier — data preserved.`,
    })
    onDone()
    onClose()
  }

  return (
    <Dialog open={!!row} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel subscription · {row?.organizationName}</DialogTitle>
          <DialogDescription>
            The org keeps its data; entitlements and limits fall back to the free tier
            immediately.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="cancel-reason">Reason (required)</Label>
          <Textarea
            id="cancel-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. merchant closing the store"
            maxLength={1000}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={onClose} disabled={busy}>
            Keep subscription
          </Button>
          <Button
            variant="destructive"
            className="rounded-xl"
            onClick={() => void submit()}
            disabled={busy || !reason.trim()}
          >
            {busy && <Loader2 size={14} className="mr-1.5 animate-spin" />} Cancel subscription
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ForceDowngradeDialog({
  row,
  onClose,
  onDone,
}: {
  row: SubscriptionListRow | null
  onClose: () => void
  onDone: () => void
}) {
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!row) return
    setBusy(true)
    const res = await apiRequest(`/api/admin/subscriptions/${row.organizationId}`, {
      method: 'POST',
      body: JSON.stringify({ action: 'force-downgrade' }),
    })
    setBusy(false)
    if (!res.ok) {
      toastApiError(res.error, `Couldn't downgrade ${row.organizationName}`)
      return
    }
    toast({
      title: `${row.organizationName} downgraded`,
      description: 'Paid modules turn OFF and limits re-clamp to the free tier.',
      variant: 'destructive',
    })
    onDone()
    onClose()
  }

  return (
    <Dialog open={!!row} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-rose-600 dark:text-rose-400">
            Force downgrade · {row?.organizationName}
          </DialogTitle>
          <DialogDescription>
            This skips the grace clock and applies the downgrade immediately:
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2 rounded-xl border border-rose-300/60 bg-rose-50 p-3 text-xs text-rose-900 dark:border-rose-500/40 dark:bg-rose-950/60 dark:text-rose-200">
          <li>• Every module not in the free tier turns OFF for this org&apos;s users.</li>
          <li>• An org-level activation flip CANNOT bring them back (the ceiling clamps it).</li>
          <li>• Limits re-clamp to the free tier (e.g. maxProducts). Existing data is preserved.</li>
        </ul>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={onClose} disabled={busy}>
            Keep current state
          </Button>
          <Button
            variant="destructive"
            className="rounded-xl"
            onClick={() => void submit()}
            disabled={busy}
          >
            {busy && <Loader2 size={14} className="mr-1.5 animate-spin" />} Force downgrade
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CompGrantDialog({
  row,
  plans,
  onClose,
  onDone,
}: {
  row: SubscriptionListRow | null
  plans: SubscriptionPlanDTO[]
  onClose: () => void
  onDone: () => void
}) {
  const [planKey, setPlanKey] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!row || !planKey) return
    setBusy(true)
    const res = await apiRequest(`/api/admin/subscriptions/${row.organizationId}`, {
      method: 'POST',
      body: JSON.stringify({ action: 'comp', planKey }),
    })
    setBusy(false)
    if (!res.ok) {
      toastApiError(res.error, `Couldn't grant ${row.organizationName} a complimentary plan`)
      return
    }
    toast({
      title: `${planKey} granted complimentary`,
      description: `${row.organizationName} is entitled — no invoice, no ledger fee.`,
    })
    onDone()
    onClose()
  }

  return (
    <Dialog open={!!row} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift size={16} className="text-primary" /> Complimentary grant · {row?.organizationName}
          </DialogTitle>
          <DialogDescription>
            Entitle the org without billing: no SubscriptionInvoice, no ledger fee — an audited
            admin grant.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="comp-planKey">Plan</Label>
          <select
            id="comp-planKey"
            value={planKey}
            onChange={(e) => setPlanKey(e.target.value)}
            className="h-10 w-full rounded-xl border bg-background px-3 text-sm"
          >
            <option value="">Select a plan…</option>
            {plans.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name} — {formatMoney(p.priceMonthly, p.currency)}/mo
              </option>
            ))}
          </select>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button className="rounded-xl" onClick={() => void submit()} disabled={busy || !planKey}>
            {busy && <Loader2 size={14} className="mr-1.5 animate-spin" />} Grant plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── The tab ───────────────────────────────────────────────────────────────────

export function SubscriptionsTab() {
  // Zone 1 — plans
  const plansApi = useApi<{ plans: SubscriptionPlanDTO[] }>('/api/admin/subscriptions/plans')
  const plans = plansApi.data?.plans ?? []

  // Zone 2 — seller org subscriptions (server-side status + q filters)
  const [statusFilter, setStatusFilter] = useState('')
  const [q, setQ] = useState('')
  const dq = useDebounced(q, 250)
  const query = new URLSearchParams()
  if (statusFilter) query.set('status', statusFilter)
  if (dq.trim()) query.set('q', dq.trim())
  const subsApi = useApi<{ subscriptions: SubscriptionListRow[] }>(
    `/api/admin/subscriptions?${query.toString()}`
  )
  const subscriptions = subsApi.data?.subscriptions ?? []

  // Dialog state
  const [editPlan, setEditPlan] = useState<SubscriptionPlanDTO | null>(null)
  const [changeFor, setChangeFor] = useState<SubscriptionListRow | null>(null)
  const [cancelFor, setCancelFor] = useState<SubscriptionListRow | null>(null)
  const [downgradeFor, setDowngradeFor] = useState<SubscriptionListRow | null>(null)
  const [compFor, setCompFor] = useState<SubscriptionListRow | null>(null)
  const [renewingOrgId, setRenewingOrgId] = useState<string | null>(null)

  const runAction = async (
    orgId: string,
    body: Record<string, unknown>,
    onOk: (sub: SubscriptionListRow) => void
  ) => {
    const res = await apiRequest<{ subscription: SubscriptionListRow }>(
      `/api/admin/subscriptions/${orgId}`,
      { method: 'POST', body: JSON.stringify(body) }
    )
    if (!res.ok) return res.error ?? 'Action failed'
    onOk(res.data!.subscription)
    return null
  }

  const simulateRenewal = async (row: SubscriptionListRow, succeed: boolean) => {
    setRenewingOrgId(row.organizationId)
    const err = await runAction(
      row.organizationId,
      { action: succeed ? 'renew' : 'fail-renewal' },
      (sub) => {
        if (succeed) {
          toast({
            title: `${row.organizationName} renewed`,
            description: `New period through ${formatDate(sub.currentPeriodEnd)} — PAID invoice written.`,
          })
        } else {
          toast({
            title: `${row.organizationName} → GRACE`,
            description: sub.graceEndsAt
              ? `Renewal failed; grace ends ${formatDate(sub.graceEndsAt)} (FAILED invoice written).`
              : 'Renewal failed — GRACE period started.',
            variant: 'destructive',
          })
        }
      }
    )
    setRenewingOrgId(null)
    if (err) toastApiError(err, 'Renewal simulation failed')
    void subsApi.refetch()
  }

  return (
    <div className="space-y-5">
      {/* ══ Zone 1 · Plans ═════════════════════════════════════════════════ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Layers size={16} className="text-primary" /> Plans
            <Button
              variant="outline"
              size="sm"
              className="ml-auto h-8 rounded-lg"
              onClick={() => void plansApi.refetch()}
              disabled={plansApi.loading}
              aria-label="Refresh plans"
            >
              {plansApi.loading ? (
                <Loader2 size={13} className="mr-1.5 animate-spin" />
              ) : (
                <RefreshCw size={13} className="mr-1.5" />
              )}
              Refresh
            </Button>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            A plan is a ceiling, not a floor — org module activations can never exceed the
            bundle their tier entitles.
          </p>
        </CardHeader>
        <CardContent>
          {plansApi.loading && !plansApi.data ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-64 rounded-2xl" />
              ))}
            </div>
          ) : plansApi.error ? (
            <AdminEmptyState icon={ShieldAlert} title="Couldn't load plans" description={plansApi.error}>
              <Button variant="outline" className="rounded-xl" onClick={() => void plansApi.refetch()}>
                Try again
              </Button>
            </AdminEmptyState>
          ) : plans.length === 0 ? (
            <AdminEmptyState
              icon={SearchX}
              title="No plans yet"
              description="Subscription plans are seeded with the monetization foundation."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {plans.map((plan) => (
                <div
                  key={plan.id}
                  className={cn(
                    'flex flex-col rounded-2xl border p-4',
                    !plan.isActive && 'opacity-60'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{plan.name}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">{plan.key}</p>
                    </div>
                    <PlanChip planKey={plan.key} />
                  </div>
                  <p className="mt-2 text-xl font-extrabold tabular-nums">
                    {formatMoney(plan.priceMonthly, plan.currency)}
                    <span className="ml-1 text-xs font-medium text-muted-foreground">/mo</span>
                  </p>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {GATED_MODULE_KEYS.map((key) => {
                      const unlocked = plan.modules.includes(key)
                      return (
                        <span
                          key={key}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                            unlocked
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-muted text-muted-foreground/70'
                          )}
                          title={unlocked ? 'Entitled by this tier' : 'Not in this tier'}
                        >
                          {unlocked ? <LockOpen size={10} /> : <Lock size={10} />}
                          {MODULE_LABELS[key] ?? key}
                        </span>
                      )
                    })}
                  </div>

                  <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                    <p className="tabular-nums">
                      <span className="font-semibold text-foreground">{limitLabel(plan.limits.maxProducts)}</span>{' '}
                      products ·{' '}
                      <span className="font-semibold text-foreground">{limitLabel(plan.limits.maxActiveOffers)}</span>{' '}
                      offers ·{' '}
                      <span className="font-semibold text-foreground">{limitLabel(plan.limits.maxUsers)}</span> users
                    </p>
                    <p className="flex items-center gap-1.5">
                      <Users size={12} />
                      <span className="tabular-nums">{plan.subscriberCount}</span> subscriber
                      {plan.subscriberCount === 1 ? '' : 's'}
                      {!plan.isActive && <span className="ml-1 font-semibold text-amber-600">· inactive</span>}
                    </p>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4 h-9 rounded-xl"
                    onClick={() => setEditPlan(plan)}
                    aria-label={`Edit the ${plan.name} plan`}
                  >
                    <Pencil size={13} className="mr-1.5" /> Edit plan
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ══ Zone 2 · Seller org subscriptions ══════════════════════════════ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Wallet size={16} className="text-primary" /> Seller org subscriptions
            <span className="ml-auto flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground tabular-nums">
                {subscriptions.length} org{subscriptions.length === 1 ? '' : 's'}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-lg"
                onClick={() => void subsApi.refetch()}
                disabled={subsApi.loading}
                aria-label="Refresh subscriptions"
              >
                {subsApi.loading ? (
                  <Loader2 size={13} className="mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw size={13} className="mr-1.5" />
                )}
                Refresh
              </Button>
            </span>
          </CardTitle>
          <div className="flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between">
            <FilterChips
              options={STATUS_FILTERS}
              value={statusFilter}
              onChange={setStatusFilter}
              ariaLabel="Filter subscriptions by status"
            />
            <SearchInput
              value={q}
              onChange={setQ}
              placeholder="Search organization…"
              ariaLabel="Search subscriptions by organization name"
            />
          </div>
        </CardHeader>
        <CardContent>
          {subsApi.loading && !subsApi.data ? (
            <div className="space-y-2.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-xl" />
              ))}
            </div>
          ) : subsApi.error ? (
            <AdminEmptyState
              icon={ShieldAlert}
              title="Couldn't load subscriptions"
              description={subsApi.error}
            >
              <Button variant="outline" className="rounded-xl" onClick={() => void subsApi.refetch()}>
                Try again
              </Button>
            </AdminEmptyState>
          ) : subscriptions.length === 0 ? (
            <AdminEmptyState
              icon={SearchX}
              title="No subscriptions match"
              description="Try clearing the status filter or the search box."
            />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto rounded-2xl border lg:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th scope="col" className="px-4 py-3 font-medium">Organization</th>
                      <th scope="col" className="px-4 py-3 font-medium">Plan</th>
                      <th scope="col" className="px-4 py-3 font-medium">Status</th>
                      <th scope="col" className="px-4 py-3 font-medium">Renews</th>
                      <th scope="col" className="px-4 py-3 font-medium">Invoices</th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {subscriptions.map((row) => (
                      <tr key={row.id} className="border-b transition-colors last:border-0 hover:bg-accent/50">
                        <td className="max-w-[220px] px-4 py-3">
                          <p className="truncate font-medium">{row.organizationName}</p>
                          <p className="font-mono text-[11px] text-muted-foreground">{row.organizationId.slice(-8)}</p>
                        </td>
                        <td className="px-4 py-3">
                          <PlanChip planKey={row.planKey} />
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={row.status} map={SUB_STATUS_MAP} />
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {row.status === 'CANCELLED' ? (
                            <span className="text-muted-foreground">
                              Cancelled {row.cancelledAt ? formatDate(row.cancelledAt) : ''}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5" title={row.currentPeriodEnd}>
                              <CalendarClock size={13} className="text-muted-foreground" />
                              {formatDate(row.currentPeriodEnd)}
                              {row.status === 'GRACE' && row.graceEndsAt && (
                                <span className="font-semibold text-amber-600 dark:text-amber-400">
                                  · grace ends {formatDate(row.graceEndsAt)}
                                </span>
                              )}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 tabular-nums">{row.invoiceCount}</td>
                        <td className="px-4 py-3 text-right">
                          <RowActions
                            row={row}
                            renewing={renewingOrgId === row.organizationId}
                            onRenew={(ok) => void simulateRenewal(row, ok)}
                            onChangePlan={() => setChangeFor(row)}
                            onCancel={() => setCancelFor(row)}
                            onDowngrade={() => setDowngradeFor(row)}
                            onComp={() => setCompFor(row)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile / tablet stacked cards */}
              <div className="space-y-2.5 lg:hidden">
                {subscriptions.map((row) => (
                  <div key={row.id} className="rounded-2xl border p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{row.organizationName}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <PlanChip planKey={row.planKey} />
                          <StatusBadge status={row.status} map={SUB_STATUS_MAP} />
                        </div>
                      </div>
                      <RowActions
                        row={row}
                        renewing={renewingOrgId === row.organizationId}
                        onRenew={(ok) => void simulateRenewal(row, ok)}
                        onChangePlan={() => setChangeFor(row)}
                        onCancel={() => setCancelFor(row)}
                        onDowngrade={() => setDowngradeFor(row)}
                        onComp={() => setCompFor(row)}
                      />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {row.status === 'CANCELLED' ? (
                        <>Cancelled {row.cancelledAt ? formatDate(row.cancelledAt) : ''}</>
                      ) : (
                        <>
                          Renews {formatDate(row.currentPeriodEnd)}
                          {row.status === 'GRACE' && row.graceEndsAt && (
                            <span className="font-semibold text-amber-600 dark:text-amber-400">
                              {' '}· grace ends {formatDate(row.graceEndsAt)}
                            </span>
                          )}
                        </>
                      )}
                      <span className="tabular-nums"> · {row.invoiceCount} invoice{row.invoiceCount === 1 ? '' : 's'}</span>
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      {editPlan && (
        <PlanEditDialog
          plan={editPlan}
          onClose={() => setEditPlan(null)}
          onSaved={() => void plansApi.refetch()}
        />
      )}
      <ChangePlanDialog
        row={changeFor}
        plans={plans}
        onClose={() => setChangeFor(null)}
        onDone={() => void subsApi.refetch()}
      />
      <CancelSubDialog row={cancelFor} onClose={() => setCancelFor(null)} onDone={() => void subsApi.refetch()} />
      <ForceDowngradeDialog
        row={downgradeFor}
        onClose={() => setDowngradeFor(null)}
        onDone={() => void subsApi.refetch()}
      />
      <CompGrantDialog
        row={compFor}
        plans={plans}
        onClose={() => setCompFor(null)}
        onDone={() => void subsApi.refetch()}
      />
    </div>
  )
}

// ── Row actions dropdown ──────────────────────────────────────────────────────

function RowActions({
  row,
  renewing,
  onRenew,
  onChangePlan,
  onCancel,
  onDowngrade,
  onComp,
}: {
  row: SubscriptionListRow
  renewing: boolean
  onRenew: (succeed: boolean) => void
  onChangePlan: () => void
  onCancel: () => void
  onDowngrade: () => void
  onComp: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 rounded-lg"
          disabled={renewing}
          aria-label={`Subscription actions for ${row.organizationName}`}
        >
          {renewing ? <Loader2 size={13} className="animate-spin" /> : <MoreHorizontal size={13} />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-xs">
          <span className="flex items-center gap-1.5">
            <CreditCard size={12} /> {row.planName} · {row.status.toLowerCase()}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuItem onClick={onChangePlan}>
          <ChevronsUpDown size={13} className="mr-1.5" /> Change plan…
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onRenew(true)} disabled={renewing}>
          <BadgeCheck size={13} className="mr-1.5" /> Simulate renewal — success
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onRenew(false)} disabled={renewing}>
          <CalendarClock size={13} className="mr-1.5" /> Simulate renewal — failure
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onComp}>
          <Gift size={13} className="mr-1.5" /> Complimentary grant…
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDowngrade} className="text-rose-600 focus:text-rose-600 dark:text-rose-400 dark:focus:text-rose-400">
          Force downgrade…
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={onCancel}
          disabled={row.status === 'CANCELLED'}
          className="text-rose-600 focus:text-rose-600 dark:text-rose-400 dark:focus:text-rose-400"
        >
          Cancel subscription…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
