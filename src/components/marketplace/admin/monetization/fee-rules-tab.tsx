'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN · MONETIZATION → FEE RULES (Phase 11.1, task 11-a).
//
// Server surface (all live):
//   GET    /api/admin/fees/rules            → { rules }  ?event= filter   (payouts.view)
//   POST   /api/admin/fees/rules            → 201 { rule }                (payouts.manage)
//   PUT    /api/admin/fees/rules/[id]       → { rule } — version bump     (payouts.manage)
//   DELETE /api/admin/fees/rules/[id]       → { rule } — retire only      (payouts.manage)
//
// Rules are configuration, assessments are history: an edit bumps the rule
// version (existing assessments keep their snapshots), retire only flips
// isActive=false — rows are never hard-deleted. Scope chain: ORG →
// ORG_TYPE → PLATFORM, precedence breaks ties, effective dating gates.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import {
  Building2,
  CalendarRange,
  Coins,
  Globe,
  Layers,
  Loader2,
  Network,
  Pencil,
  Plus,
  RefreshCw,
  SearchX,
  ShieldAlert,
  SlidersHorizontal,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { formatDate, timeAgo } from '@/lib/format'
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
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { AdminEmptyState, apiRequest, toastApiError } from '../shared'

// ── Types (contracts of /api/admin/fees/rules) ──────────────────────────────

interface FeeRuleDTO {
  id: string
  event: string
  actorType: string
  scopeType: string
  scopeId: string
  dimension: string
  value: number
  currency: string | null
  precedence: number
  effectiveFrom: string
  effectiveTo: string | null
  version: number
  note: string | null
  isActive: boolean
  updatedAt: string
}

interface OrgLite {
  id: string
  name: string
  orgType: string
}

// ── Vocabulary (mirrors the engine spine) ────────────────────────────────────

const FEE_EVENTS = [
  'ORDER_COMMISSION',
  'FINANCING_SUCCESS',
  'SUBSCRIPTION_RENEWAL',
  'ACCREDITATION',
  'SPONSORSHIP',
  'FINANCING_REFERRAL',
] as const
const FEE_ACTOR_TYPES = ['SELLER', 'FINANCIER', 'PLATFORM'] as const
const FEE_SCOPE_TYPES = ['PLATFORM', 'ORG_TYPE', 'ORG'] as const
const FEE_ORG_TYPES = ['COMPANY', 'BANK', 'MFI', 'EWALLET'] as const

const EVENT_META: Record<string, { label: string; badge: string }> = {
  ORDER_COMMISSION: {
    label: 'Order commission',
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  },
  FINANCING_SUCCESS: {
    label: 'Financing success',
    badge: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  },
  SUBSCRIPTION_RENEWAL: {
    label: 'Subscription renewal',
    badge: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  },
  ACCREDITATION: {
    label: 'Accreditation',
    badge: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  },
  SPONSORSHIP: {
    label: 'Sponsorship / featuring',
    badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  },
  FINANCING_REFERRAL: {
    label: 'Financing referral / service',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  },
}

const SCOPE_META: Record<string, { label: string; badge: string; icon: typeof Globe }> = {
  ORG: {
    label: 'Org',
    badge: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
    icon: Building2,
  },
  ORG_TYPE: {
    label: 'Org type',
    badge: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
    icon: Network,
  },
  PLATFORM: {
    label: 'Platform',
    badge: 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400',
    icon: Globe,
  },
}

const ACTOR_LABELS: Record<string, string> = {
  SELLER: 'Seller',
  FINANCIER: 'Financier',
  PLATFORM: 'Platform',
}

/** yyyy-mm-dd for <Input type="date"> from an ISO string. */
function toDateInput(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toISOString().slice(0, 10)
}

// ── The rule form (create + edit share it) ──────────────────────────────────

interface RuleFormState {
  event: string
  actorType: string
  scopeType: string
  scopeId: string
  dimension: string
  value: string
  currency: string
  precedence: string
  effectiveFrom: string
  effectiveTo: string
  note: string
}

const EMPTY_FORM: RuleFormState = {
  event: 'ORDER_COMMISSION',
  actorType: 'SELLER',
  scopeType: 'PLATFORM',
  scopeId: '',
  dimension: 'PERCENT',
  value: '',
  currency: 'USD',
  precedence: '0',
  effectiveFrom: toDateInput(new Date().toISOString()),
  effectiveTo: '',
  note: '',
}

function RuleFormDialog({
  open,
  onOpenChange,
  editing,
  orgs,
  orgsUnavailable,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: FeeRuleDTO | null
  orgs: OrgLite[]
  orgsUnavailable: boolean
  onSaved: () => void
}) {
  // Radix unmounts DialogContent while closed, so this mounts fresh each time
  // the dialog opens — the useState initializers below run per open (no
  // reset-effect needed).
  const [form, setForm] = useState<RuleFormState>(() =>
    editing
      ? {
          event: editing.event,
          actorType: editing.actorType,
          scopeType: editing.scopeType,
          scopeId: editing.scopeId,
          dimension: editing.dimension,
          value: String(editing.value),
          currency: editing.currency ?? 'USD',
          precedence: String(editing.precedence),
          effectiveFrom: toDateInput(editing.effectiveFrom),
          effectiveTo: toDateInput(editing.effectiveTo),
          note: editing.note ?? '',
        }
      : { ...EMPTY_FORM, effectiveFrom: toDateInput(new Date().toISOString()) }
  )
  const [saving, setSaving] = useState(false)
  const [touched, setTouched] = useState(false)

  const set = <K extends keyof RuleFormState>(key: K, value: RuleFormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const percentValue = form.dimension === 'PERCENT'
  const numericValue = Number(form.value)
  const errors: string[] = []
  if (!percentValue && form.scopeType === 'ORG' && !form.scopeId)
    errors.push('Pick the organization this rule applies to.')
  if (form.value === '' || !Number.isFinite(numericValue))
    errors.push('Enter the rule value.')
  else if (percentValue && (numericValue < 0 || numericValue > 90))
    errors.push('A percent rule must be between 0 and 90.')
  else if (!percentValue && numericValue <= 0) errors.push('A flat fee must be positive.')
  if (!percentValue && !form.currency.trim()) errors.push('A flat rule requires a currency.')
  const precedence = Number(form.precedence === '' ? '0' : form.precedence)
  if (!Number.isInteger(precedence) || precedence < 0) errors.push('Precedence must be an integer ≥ 0.')
  if (form.effectiveFrom && form.effectiveTo && form.effectiveTo < form.effectiveFrom)
    errors.push('The effective window cannot end before it starts.')

  const submit = async () => {
    setTouched(true)
    if (errors.length > 0 || !form.effectiveFrom) return
    setSaving(true)
    const body = JSON.stringify({
      event: form.event,
      actorType: form.actorType,
      scopeType: form.scopeType,
      scopeId: form.scopeType === 'PLATFORM' ? '' : form.scopeId,
      dimension: form.dimension,
      value: numericValue,
      currency: form.dimension === 'FLAT' ? form.currency.trim().toUpperCase() : null,
      precedence,
      effectiveFrom: new Date(`${form.effectiveFrom}T00:00:00.000Z`).toISOString(),
      effectiveTo: form.effectiveTo
        ? new Date(`${form.effectiveTo}T23:59:59.999Z`).toISOString()
        : null,
      note: form.note.trim() || null,
    })
    const res = await apiRequest<{ rule: FeeRuleDTO }>(
      editing ? `/api/admin/fees/rules/${editing.id}` : '/api/admin/fees/rules',
      { method: editing ? 'PUT' : 'POST', body }
    )
    setSaving(false)
    if (!res.ok) {
      toastApiError(res.error, editing ? "Couldn't update the rule" : "Couldn't create the rule")
      return
    }
    toast({
      title: editing ? `Rule updated — v${res.data!.rule.version}` : 'Fee rule created',
      description: editing
        ? 'The rule advanced a version; existing assessments keep their snapshots.'
        : `${EVENT_META[form.event]?.label ?? form.event} resolves at ${
            SCOPE_META[form.scopeType]?.label ?? form.scopeType
          } scope from now on.`,
    })
    onOpenChange(false)
    onSaved()
  }

  const selectedOrg = orgs.find((o) => o.id === form.scopeId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SlidersHorizontal size={16} className="text-primary" />
            {editing ? `Edit rule — currently v${editing.version}` : 'New fee rule'}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? 'Saving bumps the version — assessments already written keep their snapshots.'
              : 'Pick the event, who pays, and how narrowly it applies. Narrower scope wins: ORG → Org type → Platform.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fee-event">Event</Label>
              <Select value={form.event} onValueChange={(v) => set('event', v)}>
                <SelectTrigger id="fee-event" className="rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FEE_EVENTS.map((e) => (
                    <SelectItem key={e} value={e}>
                      {EVENT_META[e].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fee-actor">Paid by</Label>
              <Select value={form.actorType} onValueChange={(v) => set('actorType', v)}>
                <SelectTrigger id="fee-actor" className="rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FEE_ACTOR_TYPES.map((a) => (
                    <SelectItem key={a} value={a}>
                      {ACTOR_LABELS[a]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fee-scope-type">Scope</Label>
              <Select
                value={form.scopeType}
                onValueChange={(v) => {
                  set('scopeType', v)
                  set('scopeId', '')
                }}
              >
                <SelectTrigger id="fee-scope-type" className="rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FEE_SCOPE_TYPES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {SCOPE_META[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fee-scope-target">Applies to</Label>
              {form.scopeType === 'PLATFORM' ? (
                <div
                  id="fee-scope-target"
                  className="flex h-9 items-center gap-1.5 rounded-lg border bg-muted/40 px-3 text-xs text-muted-foreground"
                >
                  <Globe size={13} /> Every organization
                </div>
              ) : form.scopeType === 'ORG_TYPE' ? (
                <Select value={form.scopeId || undefined} onValueChange={(v) => set('scopeId', v)}>
                  <SelectTrigger id="fee-scope-target" className="rounded-lg">
                    <SelectValue placeholder="Organization type" />
                  </SelectTrigger>
                  <SelectContent>
                    {FEE_ORG_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : orgsUnavailable ? (
                <Input
                  id="fee-scope-target"
                  className="rounded-lg"
                  placeholder="Organization id (org directory unavailable)"
                  value={form.scopeId}
                  onChange={(e) => set('scopeId', e.target.value)}
                />
              ) : (
                <Select value={form.scopeId || undefined} onValueChange={(v) => set('scopeId', v)}>
                  <SelectTrigger id="fee-scope-target" className="rounded-lg">
                    <SelectValue placeholder="Pick an organization" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {orgs.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name} · {o.orgType}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* Dimension + value */}
          <div className="space-y-2">
            <Label>Dimension</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                aria-pressed={form.dimension === 'PERCENT'}
                onClick={() => set('dimension', 'PERCENT')}
                className={cn(
                  'rounded-xl border px-3 py-2.5 text-left text-xs transition-colors',
                  form.dimension === 'PERCENT'
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border text-muted-foreground hover:border-primary/40'
                )}
              >
                <span className="block font-semibold">Percent</span>
                <span className="text-[11px]">of the base amount, 0–90%</span>
              </button>
              <button
                type="button"
                aria-pressed={form.dimension === 'FLAT'}
                onClick={() => set('dimension', 'FLAT')}
                className={cn(
                  'rounded-xl border px-3 py-2.5 text-left text-xs transition-colors',
                  form.dimension === 'FLAT'
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border text-muted-foreground hover:border-primary/40'
                )}
              >
                <span className="block font-semibold">Flat</span>
                <span className="text-[11px]">fixed amount + currency</span>
              </button>
            </div>
          </div>

          {percentValue ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="fee-value">Rate</Label>
                <span className="text-sm font-bold tabular-nums">{form.value || '—'}%</span>
              </div>
              <Slider
                value={[Number.isFinite(numericValue) ? Math.min(90, Math.max(0, numericValue)) : 0]}
                min={0}
                max={90}
                step={0.25}
                onValueChange={([v]) => set('value', String(v))}
                aria-label="Percent value"
              />
              <Input
                id="fee-value"
                type="number"
                min={0}
                max={90}
                step={0.25}
                className="rounded-lg"
                placeholder="e.g. 10"
                value={form.value}
                onChange={(e) => set('value', e.target.value)}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="fee-flat-value">Amount</Label>
                <Input
                  id="fee-flat-value"
                  type="number"
                  min={0}
                  step={0.01}
                  className="rounded-lg"
                  placeholder="e.g. 25.00"
                  value={form.value}
                  onChange={(e) => set('value', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fee-flat-currency">Currency</Label>
                <Input
                  id="fee-flat-currency"
                  className="rounded-lg uppercase"
                  placeholder="USD"
                  maxLength={3}
                  value={form.currency}
                  onChange={(e) => set('currency', e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fee-precedence">Precedence</Label>
              <Input
                id="fee-precedence"
                type="number"
                min={0}
                step={1}
                className="rounded-lg"
                value={form.precedence}
                onChange={(e) => set('precedence', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fee-from">Effective from</Label>
              <Input
                id="fee-from"
                type="date"
                className="rounded-lg"
                value={form.effectiveFrom}
                onChange={(e) => set('effectiveFrom', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fee-to">Effective to</Label>
              <Input
                id="fee-to"
                type="date"
                className="rounded-lg"
                value={form.effectiveTo}
                onChange={(e) => set('effectiveTo', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fee-note">Note (optional)</Label>
            <Input
              id="fee-note"
              className="rounded-lg"
              placeholder="Why this rule exists — shows in the audit trail"
              value={form.note}
              onChange={(e) => set('note', e.target.value)}
            />
          </div>

          {touched && errors.length > 0 && (
            <ul className="space-y-1 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
              {errors.map((e) => (
                <li key={e}>• {e}</li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-lg" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="rounded-lg"
            onClick={() => void submit()}
            disabled={saving || (touched && errors.length > 0)}
          >
            {saving && <Loader2 size={13} className="mr-1.5 animate-spin" />}
            {editing ? 'Save version bump' : 'Create rule'}
          </Button>
        </DialogFooter>
        {selectedOrg && (
          <p className="sr-only">Scoped to organization {selectedOrg.name}</p>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Fee Rules tab ────────────────────────────────────────────────────────────

export function FeeRulesTab() {
  const [eventFilter, setEventFilter] = useState<string>('')
  const {
    data,
    loading,
    error,
    refetch,
  } = useApi<{ rules: FeeRuleDTO[] }>(
    `/api/admin/fees/rules${eventFilter ? `?event=${eventFilter}` : ''}`
  )
  const rules = useMemo(() => data?.rules ?? [], [data])

  // Org directory for the ORG-scope picker + scope-target display.
  const [orgs, setOrgs] = useState<OrgLite[] | null>(null)
  const [orgsUnavailable, setOrgsUnavailable] = useState(false)
  useEffect(() => {
    let alive = true
    void apiRequest<{ organizations: OrgLite[] }>('/api/admin/organizations').then((res) => {
      if (!alive) return
      if (res.ok && res.data) setOrgs(res.data.organizations)
      else setOrgsUnavailable(true)
    })
    return () => {
      alive = false
    }
  }, [])

  const orgName = (id: string) => orgs?.find((o) => o.id === id)?.name ?? id

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<FeeRuleDTO | null>(null)
  const [confirmRetire, setConfirmRetire] = useState<FeeRuleDTO | null>(null)
  const [reactivatingId, setReactivatingId] = useState<string | null>(null)

  const reactivate = async (rule: FeeRuleDTO) => {
    setReactivatingId(rule.id)
    const res = await apiRequest<{ rule: FeeRuleDTO }>(`/api/admin/fees/rules/${rule.id}`, {
      method: 'PUT',
      body: JSON.stringify({ isActive: true }),
    })
    setReactivatingId(null)
    if (!res.ok) {
      toastApiError(res.error, "Couldn't reactivate the rule")
      return
    }
    toast({ title: 'Rule reactivated', description: 'It resolves again inside its effective window.' })
    void refetch()
  }

  const retire = async (rule: FeeRuleDTO) => {
    const res = await apiRequest<{ rule: FeeRuleDTO }>(`/api/admin/fees/rules/${rule.id}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      toastApiError(res.error, "Couldn't retire the rule")
      return
    }
    toast({
      title: 'Rule retired',
      description: 'Existing assessments keep their snapshots — history is never rewritten.',
    })
    setConfirmRetire(null)
    void refetch()
  }

  return (
    <div className="space-y-5">
      {/* ── Toolbar: event filter + new rule ─────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            aria-pressed={eventFilter === ''}
            onClick={() => setEventFilter('')}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
              eventFilter === ''
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
            )}
          >
            All events
          </button>
          {FEE_EVENTS.map((e) => (
            <button
              key={e}
              type="button"
              aria-pressed={eventFilter === e}
              onClick={() => setEventFilter(e)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                eventFilter === e
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
              )}
            >
              {EVENT_META[e].label}
            </button>
          ))}
        </div>
        <span className="ml-auto flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-lg"
            onClick={() => void refetch()}
            disabled={loading}
            aria-label="Refresh fee rules"
          >
            {loading ? (
              <Loader2 size={13} className="mr-1.5 animate-spin" />
            ) : (
              <RefreshCw size={13} className="mr-1.5" />
            )}
            Refresh
          </Button>
          <Button
            size="sm"
            className="h-8 rounded-lg"
            onClick={() => {
              setEditing(null)
              setDialogOpen(true)
            }}
            aria-label="Create a fee rule"
          >
            <Plus size={13} className="mr-1.5" /> New rule
          </Button>
        </span>
      </div>

      {/* ── Rules table ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Layers size={16} className="text-primary" /> Fee rules
            <Badge variant="outline" className="ml-1 rounded-full font-mono text-[10px]">
              {rules.length}
            </Badge>
            <span className="ml-auto hidden text-xs font-normal text-muted-foreground sm:inline">
              narrowest scope wins · ORG → Org type → Platform
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && !data ? (
            <div className="space-y-2.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-xl" />
              ))}
            </div>
          ) : error ? (
            <AdminEmptyState icon={ShieldAlert} title="Couldn't load fee rules" description={error}>
              <Button variant="outline" className="rounded-xl" onClick={() => void refetch()}>
                Try again
              </Button>
            </AdminEmptyState>
          ) : rules.length === 0 ? (
            <AdminEmptyState
              icon={SearchX}
              title="No rules yet"
              description={
                eventFilter
                  ? `No ${EVENT_META[eventFilter]?.label ?? eventFilter} rules exist — the legacy fallback applies for that event.`
                  : 'Without a rule, every event falls back to its legacy source (platform settings). Create the first rule to start governing fees here.'
              }
            />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto rounded-2xl border lg:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th scope="col" className="px-4 py-3 font-medium">Event</th>
                      <th scope="col" className="px-4 py-3 font-medium">Scope</th>
                      <th scope="col" className="px-4 py-3 font-medium">Fee</th>
                      <th scope="col" className="px-4 py-3 font-medium">Prec.</th>
                      <th scope="col" className="px-4 py-3 font-medium">Ver.</th>
                      <th scope="col" className="px-4 py-3 font-medium">Effective</th>
                      <th scope="col" className="px-4 py-3 font-medium">Active</th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map((r) => {
                      const scope = SCOPE_META[r.scopeType] ?? SCOPE_META.PLATFORM
                      const ScopeIcon = scope.icon
                      return (
                        <tr
                          key={r.id}
                          className="cursor-pointer border-b transition-colors last:border-0 hover:bg-accent/50"
                          onClick={() => {
                            setEditing(r)
                            setDialogOpen(true)
                          }}
                        >
                          <td className="px-4 py-3">
                            <Badge className={`rounded-full font-medium ${EVENT_META[r.event]?.badge ?? ''}`}>
                              {EVENT_META[r.event]?.label ?? r.event}
                            </Badge>
                            {r.note && (
                              <p className="mt-1 max-w-48 truncate text-[11px] text-muted-foreground" title={r.note}>
                                {r.note}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1.5">
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${scope.badge}`}>
                                <ScopeIcon size={11} />
                                {scope.label}
                              </span>
                              <span className="max-w-40 truncate text-xs text-muted-foreground">
                                {r.scopeType === 'PLATFORM'
                                  ? 'everyone'
                                  : r.scopeType === 'ORG_TYPE'
                                    ? r.scopeId
                                    : orgName(r.scopeId)}
                              </span>
                            </span>
                          </td>
                          <td className="px-4 py-3 font-semibold tabular-nums">
                            {r.dimension === 'PERCENT'
                              ? `${r.value}%`
                              : `${r.value.toLocaleString()} ${r.currency ?? ''}`}
                            <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                              {r.dimension === 'PERCENT' ? 'of base' : 'flat'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs tabular-nums text-muted-foreground">{r.precedence}</td>
                          <td className="px-4 py-3">
                            <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] font-bold">
                              v{r.version}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1" title={`from ${formatDate(r.effectiveFrom)}${r.effectiveTo ? ` to ${formatDate(r.effectiveTo)}` : ' — open-ended'}`}>
                              <CalendarRange size={11} />
                              {formatDate(r.effectiveFrom)} → {r.effectiveTo ? formatDate(r.effectiveTo) : 'open-ended'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <Switch
                              checked={r.isActive}
                              disabled={reactivatingId === r.id}
                              aria-label={`${r.isActive ? 'Retire' : 'Reactivate'} ${EVENT_META[r.event]?.label ?? r.event} rule v${r.version}`}
                              onClick={(e) => e.stopPropagation()}
                              onCheckedChange={(next) => {
                                if (next) void reactivate(r)
                                else setConfirmRetire(r)
                              }}
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="inline-flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 rounded-lg"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setEditing(r)
                                  setDialogOpen(true)
                                }}
                                aria-label={`Edit ${EVENT_META[r.event]?.label ?? r.event} rule`}
                              >
                                <Pencil size={13} />
                              </Button>
                              {r.isActive && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 rounded-lg text-rose-600 hover:text-rose-700 dark:text-rose-400"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setConfirmRetire(r)
                                  }}
                                  aria-label={`Retire ${EVENT_META[r.event]?.label ?? r.event} rule`}
                                >
                                  Retire
                                </Button>
                              )}
                            </span>
                            <p className="mt-0.5 text-[10px] text-muted-foreground">
                              updated {timeAgo(r.updatedAt)}
                            </p>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile + tablet stacked cards */}
              <div className="space-y-2.5 lg:hidden">
                {rules.map((r) => {
                  const scope = SCOPE_META[r.scopeType] ?? SCOPE_META.PLATFORM
                  const ScopeIcon = scope.icon
                  return (
                    <div key={r.id} className="rounded-2xl border p-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge className={`rounded-full font-medium ${EVENT_META[r.event]?.badge ?? ''}`}>
                              {EVENT_META[r.event]?.label ?? r.event}
                            </Badge>
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${scope.badge}`}>
                              <ScopeIcon size={11} />
                              {scope.label}
                            </span>
                            <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] font-bold">
                              v{r.version}
                            </span>
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {r.scopeType === 'PLATFORM'
                              ? 'everyone'
                              : r.scopeType === 'ORG_TYPE'
                                ? r.scopeId
                                : orgName(r.scopeId)}
                          </p>
                          <p className="text-sm font-semibold tabular-nums">
                            {r.dimension === 'PERCENT'
                              ? `${r.value}% of base`
                              : `${r.value.toLocaleString()} ${r.currency ?? ''} flat`}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            prec {r.precedence} · {formatDate(r.effectiveFrom)} →{' '}
                            {r.effectiveTo ? formatDate(r.effectiveTo) : 'open-ended'} · updated {timeAgo(r.updatedAt)}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <Switch
                            checked={r.isActive}
                            disabled={reactivatingId === r.id}
                            aria-label={`${r.isActive ? 'Retire' : 'Reactivate'} rule`}
                            onCheckedChange={(next) => {
                              if (next) void reactivate(r)
                              else setConfirmRetire(r)
                            }}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-lg"
                            onClick={() => {
                              setEditing(r)
                              setDialogOpen(true)
                            }}
                            aria-label="Edit rule"
                          >
                            <Pencil size={13} />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                <Coins size={12} className="mr-1 inline-block align-[-2px]" />
                Editing a rule bumps its version — assessments already written keep their
                snapshots forever. Retiring only stops future resolutions.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Create / edit dialog ─────────────────────────────────────────── */}
      <RuleFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        orgs={orgs ?? []}
        orgsUnavailable={orgsUnavailable}
        onSaved={() => void refetch()}
      />

      {/* ── Retire confirm (assessments keep their snapshots) ─────────────── */}
      <AlertDialog open={!!confirmRetire} onOpenChange={(o) => !o && setConfirmRetire(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retire this rule?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmRetire && (
                <>
                  {EVENT_META[confirmRetire.event]?.label ?? confirmRetire.event} at{' '}
                  {SCOPE_META[confirmRetire.scopeType]?.label ?? confirmRetire.scopeType} scope
                  {confirmRetire.scopeType !== 'PLATFORM' && ` (${confirmRetire.scopeId})`}
                  {confirmRetireSafe(confirmRetire.value, confirmRetire.dimension, confirmRetire.currency)}. It stops
                  resolving immediately for NEW charges. Assessments already written keep their
                  snapshots — history is never rewritten. The rule row stays (retired, version{' '}
                  {confirmRetire.version}) and can be reactivated later.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">Keep rule</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-lg bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-700 dark:hover:bg-rose-800"
              onClick={() => confirmRetire && void retire(confirmRetire)}
            >
              Retire rule
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** Human summary of the rule value for the retire dialog. */
function confirmRetireSafe(value: number, dimension: string, currency: string | null): string {
  return dimension === 'PERCENT' ? ` at ${value}%` : ` at ${value.toLocaleString()} ${currency ?? ''}`
}
