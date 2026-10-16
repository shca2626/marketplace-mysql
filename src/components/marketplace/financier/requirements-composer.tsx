'use client'

// ─────────────────────────────────────────────────────────────────────────────
// REQUIREMENTS COMPOSER — the owner's "flexible, easy, comprehensive"
// management interface (DP-24 / FIN-5 §3).
//
// Three panes in one dialog per service:
//   (a) library picker — searchable GENERAL + own private templates, each with
//       an Attach config (required / order / instructions / auto-pass);
//   (b) private condition builder — the 8 typed kinds w/ options as rows;
//   (c) the attached checklist — reorder, required toggle, inline
//       instructions, auto-pass, soft detach.
// Deactivated attachments are kept visible so history is never a mystery.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  CircleDot,
  Layers,
  Loader2,
  Lock,
  Plus,
  Search,
  Sparkles,
  Milestone,
  Trash2,
  Unlock,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { apiRequest, toastApiError, useDebounced } from '../admin/shared'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  conditionTypeLabel,
  documentTypeLabel,
  type ConditionTemplateDTO,
  type FinancierServiceDTO,
  type ServiceRequirementDTO,
} from './financing-status-badge'

const PROFILE_FIELD_OPTIONS = [
  { value: 'user.phone', label: 'User — phone' },
  { value: 'user.identityNumber', label: 'User — identity number' },
  { value: 'user.dateOfBirth', label: 'User — date of birth' },
  { value: 'org.taxId', label: 'Organization — tax ID' },
  { value: 'org.registrationNumber', label: 'Organization — registration no.' },
  { value: 'org.industry', label: 'Organization — industry' },
]

const DOCUMENT_TYPE_OPTIONS = [
  'NATIONAL_ID',
  'PASSPORT',
  'RESIDENCE_PERMIT',
  'COMMERCIAL_REG',
  'TAX_CARD',
  'BUSINESS_LICENSE',
  'BANK_STATEMENT',
  'FINANCIAL_STATEMENT',
  'PROOF_OF_ADDRESS',
  'GUARANTEE_DOC',
  'FEASIBILITY_STUDY',
  'INVOICE',
  'PURCHASE_ORDER',
  'PROJECT_FILE',
  'OTHER',
] as const

const CONDITION_TYPES = [
  'DOCUMENT',
  'PROFILE_FIELD',
  'DECLARATION',
  'TEXT',
  'NUMBER',
  'DATE',
  'SELECT',
  'MULTI_SELECT',
] as const

/** Small scope chip — GENERAL (library) vs PRIVATE (own). */
function ScopeChip({ scope }: { scope: string }) {
  const general = scope === 'GENERAL'
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-px text-[10px] font-bold uppercase tracking-wide',
        general
          ? 'bg-primary/10 text-primary'
          : 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300'
      )}
    >
      {general ? 'Library' : 'Private'}
    </span>
  )
}

// ── Private condition builder dialog ───────────────────────────────────────

function ConditionBuilderDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (condition: ConditionTemplateDTO) => void
}) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    conditionType: 'DOCUMENT' as (typeof CONDITION_TYPES)[number],
    code: '',
    title: '',
    description: '',
    documentType: 'COMMERCIAL_REG' as string,
    profileFieldKey: 'org.taxId' as string,
    validationMin: '',
    validationMax: '',
    validityMonths: '',
    isRepeatable: false,
    options: [] as string[],
  })

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const needsOptions = form.conditionType === 'SELECT' || form.conditionType === 'MULTI_SELECT'

  const submit = async () => {
    if (form.title.trim().length < 2) {
      toast({ title: 'Give the condition a title', variant: 'destructive' })
      return
    }
    if (needsOptions && form.options.filter((o) => o.trim()).length < 1) {
      toast({ title: 'Select conditions need at least one option', variant: 'destructive' })
      return
    }
    setSaving(true)
    const payload: Record<string, unknown> = {
      scope: 'FINANCIER',
      conditionType: form.conditionType,
      title: form.title.trim(),
      description: form.description.trim() || null,
      isRepeatable: form.isRepeatable,
    }
    if (form.code.trim()) payload.code = form.code.trim().toUpperCase()
    if (form.conditionType === 'DOCUMENT') payload.documentType = form.documentType
    if (form.conditionType === 'PROFILE_FIELD') payload.profileFieldKey = form.profileFieldKey
    if (form.conditionType === 'NUMBER') {
      if (form.validationMin !== '') payload.validationMin = Number(form.validationMin)
      if (form.validationMax !== '') payload.validationMax = Number(form.validationMax)
    }
    if (form.validityMonths !== '') payload.validityMonths = Number(form.validityMonths)
    if (needsOptions) payload.options = form.options.filter((o) => o.trim()).map((value) => ({ value: value.trim() }))

    const res = await apiRequest<{ condition: ConditionTemplateDTO }>('/api/financier/conditions', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (!res.ok) return toastApiError(res.error, 'Condition not created')
    toast({
      title: 'Private condition created',
      description: `“${res.data?.condition.title}” is ready to attach to any of your services.`,
    })
    onCreated(res.data!.condition)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={17} className="text-primary" /> New private condition
          </DialogTitle>
          <DialogDescription>
            Private conditions belong to your institution only. They compose into any service
            checklist alongside the shared platform library.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cond-type">Condition type</Label>
            <Select value={form.conditionType} onValueChange={(v) => set('conditionType', v as never)}>
              <SelectTrigger id="cond-type" className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONDITION_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {conditionTypeLabel(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cond-code">Code (optional)</Label>
            <Input
              id="cond-code"
              value={form.code}
              onChange={(e) => set('code', e.target.value.toUpperCase())}
              placeholder="e.g. TWO-GUARANTORS"
              className="rounded-xl font-mono text-xs uppercase"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cond-title">Title</Label>
            <Input
              id="cond-title"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="What must the applicant provide or declare?"
              className="rounded-xl"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cond-desc">Description (optional)</Label>
            <Textarea
              id="cond-desc"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={2}
              className="rounded-xl"
            />
          </div>

          {form.conditionType === 'DOCUMENT' && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Document type</Label>
              <Select value={form.documentType} onValueChange={(v) => set('documentType', v)}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPE_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {documentTypeLabel(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {form.conditionType === 'PROFILE_FIELD' && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Profile field (auto-evaluated by the platform)</Label>
              <Select value={form.profileFieldKey} onValueChange={(v) => set('profileFieldKey', v)}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROFILE_FIELD_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {form.conditionType === 'NUMBER' && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="cond-min">Minimum (optional)</Label>
                <Input
                  id="cond-min"
                  type="number"
                  value={form.validationMin}
                  onChange={(e) => set('validationMin', e.target.value)}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cond-max">Maximum (optional)</Label>
                <Input
                  id="cond-max"
                  type="number"
                  value={form.validationMax}
                  onChange={(e) => set('validationMax', e.target.value)}
                  className="rounded-xl"
                />
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="cond-validity">Validity months (optional)</Label>
            <Input
              id="cond-validity"
              type="number"
              min={1}
              value={form.validityMonths}
              onChange={(e) => set('validityMonths', e.target.value)}
              placeholder="e.g. 6"
              className="rounded-xl"
            />
          </div>
          <div className="flex items-end gap-2 pb-1">
            <Switch id="cond-repeatable" checked={form.isRepeatable} onCheckedChange={(v) => set('isRepeatable', v)} />
            <Label htmlFor="cond-repeatable" className="font-normal text-muted-foreground">
              Repeatable (applicant can re-submit)
            </Label>
          </div>

          {needsOptions && (
            <div className="space-y-2 sm:col-span-2">
              <Label>Options</Label>
              {form.options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={opt}
                    onChange={(e) =>
                      set(
                        'options',
                        form.options.map((o, j) => (j === i ? e.target.value : o))
                      )
                    }
                    placeholder={`Option ${i + 1}`}
                    className="rounded-xl"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove option ${i + 1}`}
                    onClick={() => set('options', form.options.filter((_, j) => j !== i))}
                  >
                    <Trash2 size={14} className="text-muted-foreground" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-lg"
                onClick={() => set('options', [...form.options, ''])}
              >
                <Plus size={14} className="mr-1" /> Add option
              </Button>
            </div>
          )}
        </div>

        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="outline" className="rounded-xl" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" className="rounded-xl" onClick={submit} disabled={saving}>
            {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />} Create condition
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Attach configuration row (expands under a library result) ────────────────

function AttachConfig({
  serviceId,
  condition,
  nextOrder,
  onAttached,
  onCancel,
}: {
  serviceId: string
  condition: ConditionTemplateDTO
  nextOrder: number
  onAttached: () => void
  onCancel: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [cfg, setCfg] = useState({
    isRequired: true,
    displayOrder: nextOrder,
    phase: '',
    instructions: '',
    autoPassAccredited: false,
  })

  const attach = async () => {
    setSaving(true)
    const res = await apiRequest<{ requirement: ServiceRequirementDTO }>(`/api/financier/services/${serviceId}/requirements`, {
      method: 'POST',
      body: JSON.stringify({
        conditionTemplateId: condition.id,
        isRequired: cfg.isRequired,
        displayOrder: cfg.displayOrder,
        phase: cfg.phase.trim() || null,
        instructions: cfg.instructions.trim() || null,
        autoPassAccredited: cfg.autoPassAccredited,
      }),
    })
    setSaving(false)
    if (!res.ok) return toastApiError(res.error, 'Could not attach')
    toast({
      title: 'Requirement attached',
      description: `“${condition.title}” is now part of this service's checklist.`,
    })
    onAttached()
  }

  return (
    <div className="mt-2 rounded-xl border bg-muted/40 p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex items-center gap-2">
          <Switch
            id={`req-${condition.id}`}
            checked={cfg.isRequired}
            onCheckedChange={(v) => setCfg((c) => ({ ...c, isRequired: v }))}
          />
          <Label htmlFor={`req-${condition.id}`} className="font-normal text-muted-foreground">
            Required
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id={`autopass-${condition.id}`}
            checked={cfg.autoPassAccredited}
            onCheckedChange={(v) => setCfg((c) => ({ ...c, autoPassAccredited: v }))}
          />
          <Label htmlFor={`autopass-${condition.id}`} className="font-normal text-muted-foreground">
            Auto-pass accredited orgs
          </Label>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`order-${condition.id}`} className="text-xs">
            Display order
          </Label>
          <Input
            id={`order-${condition.id}`}
            type="number"
            min={0}
            value={cfg.displayOrder}
            onChange={(e) => setCfg((c) => ({ ...c, displayOrder: Number(e.target.value) }))}
            className="h-9 rounded-lg"
          />
        </div>
      </div>
      <div className="mt-3 space-y-1">
        <Label htmlFor={`phase-${condition.id}`} className="text-xs">
          Sequence phase (optional — groups this step into a named stage)
        </Label>
        <Input
          id={`phase-${condition.id}`}
          value={cfg.phase}
          onChange={(e) => setCfg((c) => ({ ...c, phase: e.target.value }))}
          maxLength={60}
          placeholder="e.g. Pre-approval · Due diligence · Contracting"
          className="h-9 rounded-lg"
        />
        <p className="text-[11px] text-muted-foreground">
          Requirements sharing a phase render as one stage of your agreement sequence — blank = ungrouped baseline.
        </p>
      </div>
      <div className="mt-3 space-y-1">
        <Label htmlFor={`instr-${condition.id}`} className="text-xs">
          Instructions shown to applicants (optional)
        </Label>
        <Textarea
          id={`instr-${condition.id}`}
          value={cfg.instructions}
          onChange={(e) => setCfg((c) => ({ ...c, instructions: e.target.value }))}
          rows={2}
          placeholder="e.g. Registration must be valid for the full financing tenor."
          className="rounded-xl text-sm"
        />
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" className="rounded-lg" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" size="sm" className="rounded-lg" onClick={attach} disabled={saving}>
          {saving && <Loader2 size={13} className="mr-1 animate-spin" />} Attach requirement
        </Button>
      </div>
    </div>
  )
}

// ── The composer dialog ─────────────────────────────────────────────────────

export function RequirementsComposer({
  service,
  onClose,
  onChanged,
}: {
  service: FinancierServiceDTO | null
  onClose: () => void
  onChanged: () => void
}) {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [builderOpen, setBuilderOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [edits, setEdits] = useState<Record<string, string>>({})

  // The attached checklist (all rows incl. deactivated ones).
  const {
    data: reqData,
    loading: reqLoading,
    refetch: refetchReqs,
  } = useApi<{ requirements: ServiceRequirementDTO[] }>(
    service ? `/api/financier/services/${service.id}/requirements` : null
  )
  const requirements = useMemo(
    () => [...(reqData?.requirements ?? [])].sort((a, b) => a.displayOrder - b.displayOrder),
    [reqData]
  )
  const active = requirements.filter((r) => r.isActive)
  const detached = requirements.filter((r) => !r.isActive)
  const attachedTemplateIds = new Set(active.map((r) => r.conditionTemplateId))
  const nextOrder = active.length ? Math.max(...active.map((r) => r.displayOrder)) + 1 : 0

  // Library picker results (GENERAL + own privates).
  const query = debouncedSearch.trim() ? `?search=${encodeURIComponent(debouncedSearch.trim())}` : ''
  const { data: condData, loading: condLoading } = useApi<{ conditions: ConditionTemplateDTO[] }>(
    service ? `/api/financier/conditions${query}` : null
  )
  const conditions = condData?.conditions ?? []

  const refresh = () => {
    void refetchReqs()
    onChanged()
  }

  const patchRequirement = async (req: ServiceRequirementDTO, payload: Record<string, unknown>) => {
    setBusyId(req.id)
    const res = await apiRequest<{ requirement: ServiceRequirementDTO }>(
      `/api/financier/services/${service!.id}/requirements/${req.id}`,
      { method: 'PATCH', body: JSON.stringify(payload) }
    )
    setBusyId(null)
    if (!res.ok) return toastApiError(res.error, 'Update failed')
    refresh()
  }

  const detach = async (req: ServiceRequirementDTO) => {
    setBusyId(req.id)
    const res = await apiRequest(`/api/financier/services/${service!.id}/requirements/${req.id}`, {
      method: 'DELETE',
    })
    setBusyId(null)
    if (!res.ok) return toastApiError(res.error, 'Could not detach')
    toast({
      title: 'Requirement detached',
      description: 'Existing submissions on past requests are preserved.',
    })
    refresh()
  }

  const move = async (req: ServiceRequirementDTO, dir: -1 | 1) => {
    const idx = active.findIndex((r) => r.id === req.id)
    const target = active[idx + dir]
    if (!target) return
    // Swap displayOrder with the neighbor (two parallel patches).
    setBusyId(req.id)
    const [a, b] = await Promise.all([
      apiRequest(`/api/financier/services/${service!.id}/requirements/${req.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ displayOrder: target.displayOrder }),
      }),
      apiRequest(`/api/financier/services/${service!.id}/requirements/${target.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ displayOrder: req.displayOrder }),
      }),
    ])
    setBusyId(null)
    if (!a.ok || !b.ok) return toastApiError(a.error ?? b.error, 'Reorder failed')
    refresh()
  }

  const saveInstructions = async (req: ServiceRequirementDTO) => {
    const value = edits[req.id]
    if (value === undefined || value === (req.instructions ?? '')) return
    await patchRequirement(req, { instructions: value.trim() || null })
    toast({ title: 'Instructions updated' })
  }

  if (!service) return null

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <Layers size={17} className="text-primary" />
            Requirements — {service.name}
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
              {active.length} active
            </span>
          </DialogTitle>
          <DialogDescription>
            Compose the checklist every application to this service must satisfy. The platform
            gate verifies each item before the request ever reaches your inbox.
          </DialogDescription>
        </DialogHeader>

        {/* (c) The attached checklist */}
        {reqLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="skeleton-shimmer h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : active.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <BookOpen size={22} />
            </span>
            <p className="mt-3 text-sm font-semibold">No requirements attached yet</p>
            <p className="mt-1 max-w-md text-xs text-muted-foreground">
              Pick conditions from the platform library below or create your own private ones —
              applicants will answer them in the application wizard.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {active.map((req, i) => {
              const instructionDraft = edits[req.id] ?? req.instructions ?? ''
              const dirty = (edits[req.id] ?? '') !== '' && edits[req.id] !== (req.instructions ?? '')
              return (
                <li key={req.id} className="rounded-xl border bg-card transition-colors duration-150 hover:border-primary/30">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
                    <div className="flex shrink-0 flex-col">
                      <button
                        type="button"
                        aria-label="Move up"
                        disabled={i === 0 || busyId === req.id}
                        onClick={() => void move(req, -1)}
                        className="rounded p-0.5 text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-25"
                      >
                        <ArrowUp size={13} />
                      </button>
                      <button
                        type="button"
                        aria-label="Move down"
                        disabled={i === active.length - 1 || busyId === req.id}
                        onClick={() => void move(req, 1)}
                        className="rounded p-0.5 text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-25"
                      >
                        <ArrowDown size={13} />
                      </button>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                        <span className="truncate" title={req.template.title}>{req.template.title}</span>
                        <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold text-muted-foreground">
                          {conditionTypeLabel(req.template.conditionType)}
                        </span>
                        <ScopeChip scope={req.template.scope} />
                        {req.phase && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-sky-100 px-1.5 py-px text-[10px] font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                            <Milestone size={9} /> {req.phase}
                          </span>
                        )}
                        {req.autoPassAccredited && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-px text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            <Unlock size={9} /> auto-pass
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {req.template.description ?? conditionTypeLabel(req.template.conditionType)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void patchRequirement(req, { isRequired: !req.isRequired })}
                        disabled={busyId === req.id}
                        title={req.isRequired ? 'Required — the gate blocks until verified' : 'Optional'}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide transition-colors duration-150',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                          req.isRequired
                            ? 'bg-rose-100 text-rose-800 hover:bg-rose-200 dark:bg-rose-950 dark:text-rose-300'
                            : 'bg-muted text-muted-foreground hover:bg-accent'
                        )}
                      >
                        {req.isRequired ? <Lock size={9} /> : <CircleDot size={9} />}
                        {req.isRequired ? 'Required' : 'Optional'}
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Detach ${req.template.title}`}
                        disabled={busyId === req.id}
                        onClick={() => void detach(req)}
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 border-t px-3 py-2">
                    <Input
                      value={instructionDraft}
                      onChange={(e) => setEdits((m) => ({ ...m, [req.id]: e.target.value }))}
                      onBlur={() => void saveInstructions(req)}
                      placeholder="Applicant-facing instructions for this requirement (optional)"
                      className="h-8 rounded-lg border-dashed text-xs"
                    />
                    {dirty && (
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 rounded-lg"
                        onClick={() => void saveInstructions(req)}
                      >
                        Save
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 border-t px-3 py-2">
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Phase
                    </span>
                    <Input
                      defaultValue={req.phase ?? ''}
                      key={`phase-${req.id}-${req.phase ?? ''}`}
                      onBlur={(e) => {
                        const next = e.target.value.trim()
                        if (next !== (req.phase ?? '')) void patchRequirement(req, { phase: next || null })
                      }}
                      maxLength={60}
                      placeholder="Ungrouped — set a stage like “Due diligence” to structure your sequence"
                      className="h-8 rounded-lg border-dashed text-xs"
                      aria-label={`Sequence phase for ${req.template.title}`}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {/* Detached history */}
        {detached.length > 0 && (
          <details className="rounded-xl border bg-muted/30 px-3 py-2.5">
            <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
              {detached.length} detached {detached.length === 1 ? 'requirement' : 'requirements'} (history preserved)
            </summary>
            <ul className="mt-2 space-y-1">
              {detached.map((req) => (
                <li key={req.id} className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="truncate line-through">{req.template.title}</span>
                  <span className="shrink-0">re-attach via the library below</span>
                </li>
              ))}
            </ul>
          </details>
        )}

        {/* (a) Library picker */}
        <div className="rounded-2xl border bg-muted/30 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search the requirements library…"
                className="h-9 rounded-full pl-9 text-sm"
                aria-label="Search the requirements library"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 rounded-lg"
              onClick={() => setBuilderOpen(true)}
            >
              <Plus size={14} className="mr-1" /> New private condition
            </Button>
          </div>

          <div className="mt-3 max-h-72 space-y-1 overflow-y-auto">
            {condLoading ? (
              <div className="space-y-1.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="skeleton-shimmer h-12 w-full rounded-lg" />
                ))}
              </div>
            ) : conditions.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                No conditions match — create a private one instead.
              </p>
            ) : (
              conditions.map((cond) => {
                const attached = attachedTemplateIds.has(cond.id)
                const expanded = expandedId === cond.id
                return (
                  <div
                    key={cond.id}
                    className="rounded-lg border border-border/70 bg-card px-3 py-2 transition-colors duration-150 hover:border-primary/30"
                  >
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 text-[13px] font-semibold">
                          <span className="truncate" title={cond.title}>{cond.title}</span>
                          <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold text-muted-foreground">
                            {conditionTypeLabel(cond.conditionType)}
                          </span>
                          <ScopeChip scope={cond.scope} />
                        </p>
                        {cond.description && (
                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{cond.description}</p>
                        )}
                      </div>
                      {attached ? (
                        <span className="shrink-0 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                          ✓ attached
                        </span>
                      ) : (
                        <Button
                          type="button"
                          variant={expanded ? 'secondary' : 'outline'}
                          size="sm"
                          className="h-7 shrink-0 rounded-lg text-xs"
                          onClick={() => setExpandedId(expanded ? null : cond.id)}
                        >
                          {expanded ? 'Close' : 'Attach'}
                        </Button>
                      )}
                    </div>
                    {expanded && !attached && (
                      <AttachConfig
                        serviceId={service.id}
                        condition={cond}
                        nextOrder={nextOrder}
                        onAttached={() => {
                          setExpandedId(null)
                          refresh()
                        }}
                        onCancel={() => setExpandedId(null)}
                      />
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      </DialogContent>

      {/* (b) Private condition builder — nested dialog */}
      <ConditionBuilderDialog
        open={builderOpen}
        onClose={() => setBuilderOpen(false)}
        onCreated={() => refresh()}
      />
    </Dialog>
  )
}
