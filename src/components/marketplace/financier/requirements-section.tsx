'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FINANCIER · REQUIREMENTS COMPOSER (DP-24) — per-service checklist editor:
// attach conditions from the GENERAL library or the institution's own PRIVATE
// templates, configure required/order/instructions/auto-pass, reorder live and
// detach (soft — submissions preserved).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Banknote,
  ChevronDown,
  ListChecks,
  Loader2,
  Milestone,
  Plus,
  Search,
  Trash2,
  Zap,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import type { ConditionTemplateDTO, FinancierServiceDTO, ServiceRequirementDTO } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
import { cn } from '@/lib/utils'
import {
  apiRequest,
  ConditionTypeBadge,
  CONDITION_TYPE_LABELS,
  DOCUMENT_TYPE_LABELS,
  EmptyState,
  PROFILE_FIELD_LABELS,
  ScopeBadge,
  SERVICE_KIND_MAP,
  useDebounced,
  toastApiError,
} from '@/components/marketplace/financing/financing-shared'

const CONDITION_TYPES = ['DOCUMENT', 'PROFILE_FIELD', 'DECLARATION', 'TEXT', 'NUMBER', 'DATE', 'SELECT', 'MULTI_SELECT'] as const
type ConditionType = (typeof CONDITION_TYPES)[number]

// ── Section ──────────────────────────────────────────────────────────────────

export function RequirementsSection() {
  const { data: servicesData, loading: servicesLoading } = useApi<{ services: FinancierServiceDTO[] }>(
    '/api/financier/services'
  )
  const services = servicesData?.services ?? []
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const {
    data: detailData,
    loading: detailLoading,
    refetch: refetchDetail,
  } = useApi<{ service: FinancierServiceDTO; requirements: ServiceRequirementDTO[] }>(
    selectedId ? `/api/financier/services/${selectedId}` : null,
    { skip: !selectedId }
  )

  if (servicesLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    )
  }

  if (services.length === 0) {
    return (
      <EmptyState
        icon={ListChecks}
        title="No services to compose yet"
        description="Create a service first — requirements are attached per service (one checklist per offering)."
      />
    )
  }

  const active = selectedId ?? services[0].id
  const selected = services.find((s) => s.id === active) ?? services[0]

  return (
    <div className="space-y-5">
      {/* Service picker */}
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
        {services.map((svc) => {
          const isActive = svc.id === active
          return (
            <button
              key={svc.id}
              type="button"
              onClick={() => setSelectedId(svc.id)}
              className={cn(
                'flex min-w-[210px] flex-col gap-1 rounded-xl border px-3.5 py-3 text-left transition-colors',
                isActive
                  ? 'border-primary/50 bg-primary/10'
                  : 'border-border bg-card hover:border-primary/30 hover:bg-muted/50'
              )}
              aria-pressed={isActive}
            >
              <span className="flex items-center gap-1.5">
                <span className="truncate text-[13px] font-semibold">{svc.name}</span>
              </span>
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className={cn('rounded-full px-1.5 py-px text-[10px] font-semibold', SERVICE_KIND_MAP[svc.serviceKind]?.badge)}>
                  {SERVICE_KIND_MAP[svc.serviceKind]?.label}
                </span>
                <span>{svc.requirementCount ?? 0} reqs</span>
              </span>
            </button>
          )
        })}
      </div>

      {detailLoading || !detailData ? (
        <Skeleton className="h-80 rounded-2xl" />
      ) : (
        <ComposerDetail
          key={detailData.service.id}
          service={detailData.service}
          requirements={detailData.requirements}
          onChanged={() => void refetchDetail()}
        />
      )}
    </div>
  )
}

// ── Composer detail (summary + attached list + picker) ─────────────────────

function ComposerDetail({
  service,
  requirements,
  onChanged,
}: {
  service: FinancierServiceDTO
  requirements: ServiceRequirementDTO[]
  onChanged: () => void
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [attachFor, setAttachFor] = useState<ConditionTemplateDTO | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const activeReqs = requirements.filter((r) => r.isActive)
  // CONFIG-1: phase-first ordering — ungrouped items lead, then staged groups
  const sorted = [...activeReqs].sort(
    (a, b) => (a.phase ?? '').localeCompare(b.phase ?? '') || a.displayOrder - b.displayOrder
  )

  const patch = async (req: ServiceRequirementDTO, body: Record<string, unknown>) => {
    setBusyId(req.id)
    const res = await apiRequest(`/api/financier/requirements/${req.id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
    setBusyId(null)
    if (!res.ok) return toastApiError(res.error)
    onChanged()
  }

  const move = async (req: ServiceRequirementDTO, dir: -1 | 1) => {
    const idx = sorted.findIndex((r) => r.id === req.id)
    const swapWith = sorted[idx + dir]
    if (!swapWith) return
    setBusyId(req.id)
    const a = await apiRequest(`/api/financier/requirements/${req.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ displayOrder: swapWith.displayOrder }),
    })
    const b = await apiRequest(`/api/financier/requirements/${swapWith.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ displayOrder: req.displayOrder }),
    })
    setBusyId(null)
    if (!a.ok || !b.ok) return toastApiError(a.error ?? b.error)
    onChanged()
  }

  const detach = async (req: ServiceRequirementDTO) => {
    setBusyId(req.id)
    const res = await apiRequest(`/api/financier/requirements/${req.id}`, { method: 'DELETE' })
    setBusyId(null)
    if (!res.ok) return toastApiError(res.error)
    toast({
      title: 'Requirement detached',
      description: `“${req.template.title}” was removed from ${service.name}. Submitted checklists keep their history.`,
    })
    onChanged()
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      {/* ── Attached requirements ── */}
      <div className="space-y-4">
        <div className="rounded-2xl border bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold">Attached requirements ({sorted.length})</h3>
              <p className="text-xs text-muted-foreground">Applicants answer these in wizard step 2; the platform verifies each item (the gate).</p>
            </div>
            <Button size="sm" className="rounded-lg" onClick={() => setCreateOpen(true)}>
              <Plus size={13} className="mr-1" /> Private condition
            </Button>
          </div>

          {sorted.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed px-4 py-8 text-center">
              <ListChecks size={26} className="mx-auto text-muted-foreground/40" />
              <p className="mt-2 text-xs text-muted-foreground">
                No requirements attached — pick conditions from the library on the right.
              </p>
            </div>
          ) : (
            <ul className="mt-4 space-y-2">
              {sorted.map((req, i) => {
                const t = req.template
                const expanded = expandedId === req.id
                return (
                  <li key={req.id} className="rounded-xl border bg-background">
                    <div className="flex items-start gap-2.5 p-3">
                      <div className="flex shrink-0 flex-col items-center gap-0.5 pt-0.5">
                        <button
                          type="button"
                          aria-label="Move up"
                          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                          disabled={i === 0 || busyId === req.id}
                          onClick={() => void move(req, -1)}
                        >
                          <ArrowUp size={13} />
                        </button>
                        <span className="text-[10px] font-bold text-muted-foreground">{i + 1}</span>
                        <button
                          type="button"
                          aria-label="Move down"
                          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                          disabled={i === sorted.length - 1 || busyId === req.id}
                          onClick={() => void move(req, 1)}
                        >
                          <ArrowDown size={13} />
                        </button>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-[13px] font-semibold leading-snug">{t.title}</p>
                          <ConditionTypeBadge type={t.conditionType} />
                          <ScopeBadge scope={t.scope} />
                          {req.phase && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-sky-100 px-1.5 py-px text-[10px] font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                              <Milestone size={9} /> {req.phase}
                            </span>
                          )}
                          {req.isRequired ? (
                            <span className="text-[10px] font-bold uppercase tracking-wide text-rose-600 dark:text-rose-400">Required</span>
                          ) : (
                            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Optional</span>
                          )}
                          {req.autoPassAccredited && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-violet-100 px-1.5 py-px text-[10px] font-semibold text-violet-800 dark:bg-violet-950 dark:text-violet-300">
                              <Zap size={9} /> auto-pass
                            </span>
                          )}
                        </div>
                        {req.instructions && <p className="mt-1 text-xs italic text-muted-foreground">“{req.instructions}”</p>}
                        {t.conditionType === 'DOCUMENT' && t.documentType && (
                          <p className="mt-1 text-[11px] text-muted-foreground">Expects: {DOCUMENT_TYPE_LABELS[t.documentType] ?? t.documentType}</p>
                        )}
                        {t.conditionType === 'PROFILE_FIELD' && t.profileFieldKey && (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Checks: {PROFILE_FIELD_LABELS[t.profileFieldKey] ?? t.profileFieldKey} (auto-evaluated)
                          </p>
                        )}

                        {expanded && (
                          <div className="mt-3 space-y-3 rounded-lg border bg-muted/30 p-3">
                            <label className="flex items-start gap-2.5 text-xs font-medium">
                              <Checkbox
                                checked={req.isRequired}
                                onCheckedChange={(v) => void patch(req, { isRequired: v === true })}
                                disabled={busyId === req.id}
                              />
                              <span>
                                Required
                                <span className="block font-normal text-muted-foreground">Required items block the forward gate until verified or waived.</span>
                              </span>
                            </label>
                            <label className="flex items-start gap-2.5 text-xs font-medium">
                              <Checkbox
                                checked={req.autoPassAccredited}
                                onCheckedChange={(v) => void patch(req, { autoPassAccredited: v === true })}
                                disabled={busyId === req.id}
                              />
                              <span>
                                Auto-pass accredited orgs
                                <span className="block font-normal text-muted-foreground">
                                  Companies accredited with you skip this item (auto-VERIFIED — §5.3).
                                </span>
                              </span>
                            </label>
                            <div className="space-y-1.5">
                              <Label className="text-[11px]">Sequence phase</Label>
                              <Input
                                defaultValue={req.phase ?? ''}
                                key={`phase-${req.id}-${req.phase ?? ''}`}
                                maxLength={60}
                                disabled={busyId === req.id}
                                placeholder="Ungrouped — e.g. “Pre-approval”, “Due diligence”, “Contracting”"
                                className="h-8 rounded-lg text-xs"
                                aria-label={`Sequence phase for ${t.title}`}
                                onBlur={(e) => {
                                  const v = e.target.value.trim() || null
                                  if (v !== (req.phase ?? null)) void patch(req, { phase: v })
                                }}
                              />
                              <p className="text-[10px] text-muted-foreground">
                                Requirements sharing a phase form one stage of the agreement sequence your applicants follow.
                              </p>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-[11px]">Per-service instructions</Label>
                              <Textarea
                                className="min-h-[54px] rounded-lg text-xs"
                                defaultValue={req.instructions ?? ''}
                                placeholder="Shown to applicants under the checklist item (e.g. “Include all pages of the statement”)"
                                onBlur={(e) => {
                                  const v = e.target.value.trim() || null
                                  if (v !== req.instructions) void patch(req, { instructions: v })
                                }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <button
                          type="button"
                          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          aria-label={expanded ? 'Collapse configuration' : 'Configure requirement'}
                          onClick={() => setExpandedId(expanded ? null : req.id)}
                        >
                          <ChevronDown size={15} className={cn('transition-transform', expanded && 'rotate-180')} />
                        </button>
                        <button
                          type="button"
                          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          aria-label={`Detach ${t.title}`}
                          disabled={busyId === req.id}
                          onClick={() => void detach(req)}
                        >
                          {busyId === req.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                        </button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      {/* ── Condition picker ── */}
      <ConditionPicker
        service={service}
        onAttach={(t) => setAttachFor(t)}
        onCreated={() => onChanged()}
      />

      <AttachDialog
        template={attachFor}
        service={service}
        nextOrder={sorted.length ? Math.max(...sorted.map((r) => r.displayOrder)) + 1 : 0}
        onOpenChange={(o) => !o && setAttachFor(null)}
        onAttached={() => {
          setAttachFor(null)
          onChanged()
        }}
      />
      <CreateConditionDialog open={createOpen} onOpenChange={setCreateOpen} service={service} onCreated={onChanged} />
    </div>
  )
}

// ── Condition library picker (GENERAL + own PRIVATE) ────────────────────────

function ConditionPicker({
  service,
  onAttach,
  onCreated,
}: {
  service: FinancierServiceDTO
  onAttach: (template: ConditionTemplateDTO) => void
  onCreated: () => void
}) {
  const [query, setQuery] = useState('')
  const debounced = useDebounced(query)
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [scopeFilter, setScopeFilter] = useState('ALL')

  const { data, loading, error: libError, refetch: refetchLib } = useApi<{ templates: ConditionTemplateDTO[] }>(
    `/api/financier/conditions?q=${encodeURIComponent(debounced)}&conditionType=${typeFilter === 'ALL' ? '' : typeFilter}`,
    { skip: false }
  )

  const templates = useMemo(
    () => (data?.templates ?? []).filter((t) => (scopeFilter === 'ALL' ? true : t.scope === scopeFilter)),
    [data, scopeFilter]
  )
  const general = templates.filter((t) => t.scope === 'GENERAL')
  const own = templates.filter((t) => t.scope === 'FINANCIER')

  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold">Condition library</h3>
          <p className="text-xs text-muted-foreground">The platform&apos;s shared library + your private templates.</p>
        </div>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-semibold text-muted-foreground">
          GENERAL + private
        </span>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-9 rounded-lg pl-9 text-sm"
          placeholder="Search conditions…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search the condition library"
        />
        {loading && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(['ALL', 'GENERAL', 'FINANCIER'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setScopeFilter(s)}
            className={cn(
              'rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors',
              scopeFilter === s ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground'
            )}
          >
            {s === 'ALL' ? 'All scopes' : s === 'GENERAL' ? 'General library' : 'My private'}
          </button>
        ))}
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-7 w-auto gap-1 rounded-full border-border px-2.5 text-[11px] font-semibold">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All types</SelectItem>
            {CONDITION_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {CONDITION_TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="max-h-[430px] space-y-3 overflow-y-auto pr-0.5 [scrollbar-width:thin]">
        {/* FIN-004: never render a fake empty library — surface API errors. */}
        {libError ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-center">
            <p className="text-sm font-semibold text-destructive">Could not load the condition library</p>
            <p className="max-w-sm text-xs text-muted-foreground">{libError}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 rounded-lg"
              onClick={() => void refetchLib()}
            >
              Retry
            </Button>
          </div>
        ) : (
          <>
        {(['FINANCIER', 'GENERAL'] as const).map((scope) => {
          const list = scope === 'GENERAL' ? general : own
          if (!list.length) return null
          return (
            <div key={scope}>
              <p className="sticky top-0 z-10 bg-card/95 py-1 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground backdrop-blur">
                {scope === 'GENERAL' ? `General library (${general.length})` : `My private templates (${own.length})`}
              </p>
              <ul className="mt-1 space-y-1.5">
                {list.map((t) => (
                  <li key={t.id} className="rounded-xl border bg-background p-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="min-w-0 flex-1 text-[12.5px] font-semibold leading-snug">{t.title}</p>
                      <ConditionTypeBadge type={t.conditionType} />
                    </div>
                    {t.description && <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{t.description}</p>}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-[10.5px] text-muted-foreground">
                        {t.attachmentCount > 0 ? `attached to ${t.attachmentCount} service${t.attachmentCount === 1 ? '' : 's'}` : 'not attached yet'}
                        {!t.isActive && ' · inactive'}
                      </span>
                      <Button size="sm" className="h-7 rounded-lg px-2.5 text-[11px]" onClick={() => onAttach(t)}>
                        <Plus size={11} className="mr-0.5" /> Attach
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
        {!loading && templates.length === 0 && !libError && (
          <p className="py-8 text-center text-xs text-muted-foreground">
            No conditions match — try another search or create a private template.
          </p>
        )}
          </>
        )}
      </div>

      <p className="rounded-xl bg-muted/40 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
        Composing for <span className="font-semibold text-foreground">{service.name}</span> — the checklist applicants
        will face in the wizard.
      </p>
    </div>
  )
}

// ── Attach configuration dialog ─────────────────────────────────────────────

function AttachDialog({
  template,
  service,
  nextOrder,
  onOpenChange,
  onAttached,
}: {
  template: ConditionTemplateDTO | null
  service: FinancierServiceDTO
  nextOrder: number
  onOpenChange: (open: boolean) => void
  onAttached: () => void
}) {
  const [isRequired, setIsRequired] = useState(true)
  const [autoPass, setAutoPass] = useState(false)
  const [phase, setPhase] = useState('')
  const [instructions, setInstructions] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [initializedFor, setInitializedFor] = useState<string | null>(null)

  const key = template?.id ?? null
  if (template && initializedFor !== key) {
    setInitializedFor(key)
    setIsRequired(true)
    setAutoPass(false)
    setPhase('')
    setInstructions('')
  }
  if (!template && initializedFor !== null) setInitializedFor(null)

  const submit = async () => {
    if (!template) return
    setSubmitting(true)
    const res = await apiRequest('/api/financier/requirements', {
      method: 'POST',
      body: JSON.stringify({
        serviceId: service.id,
        conditionTemplateId: template.id,
        isRequired,
        displayOrder: nextOrder,
        phase: phase.trim() || null,
        instructions: instructions.trim() || null,
        autoPassAccredited: autoPass,
      }),
    })
    setSubmitting(false)
    if (!res.ok) return toastApiError(res.error)
    toast({ title: 'Requirement attached', description: `“${template.title}” is now part of ${service.name}'s checklist.` })
    onAttached()
  }

  return (
    <Dialog open={!!template} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Attach — {template?.title}</DialogTitle>
          <DialogDescription>Configure how this condition applies to {service.name}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3.5">
          <label className="flex items-start gap-2.5 text-sm font-medium">
            <Checkbox checked={isRequired} onCheckedChange={(v) => setIsRequired(v === true)} />
            <span>
              Required
              <span className="block text-xs font-normal text-muted-foreground">The platform gate blocks forwarding until required items are verified or waived.</span>
            </span>
          </label>
          <label className="flex items-start gap-2.5 text-sm font-medium">
            <Checkbox checked={autoPass} onCheckedChange={(v) => setAutoPass(v === true)} />
            <span>
              Auto-pass accredited orgs
              <span className="block text-xs font-normal text-muted-foreground">Companies with a live accreditation from you get this item auto-verified.</span>
            </span>
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="attach-phase" className="text-xs">
              Sequence phase (optional)
            </Label>
            <Input
              id="attach-phase"
              value={phase}
              onChange={(e) => setPhase(e.target.value)}
              maxLength={60}
              placeholder="e.g. Pre-approval · Due diligence · Contracting"
              className="h-9 rounded-lg text-sm"
            />
            <p className="text-[10px] text-muted-foreground">
              Requirements sharing a phase form one stage of the agreement sequence — blank = ungrouped.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="attach-instructions" className="text-xs">
              Per-service instructions (optional)
            </Label>
            <Textarea
              id="attach-instructions"
              className="min-h-[60px] rounded-lg"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Statement must cover the last 6 months"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button className="rounded-xl" onClick={() => void submit()} disabled={submitting}>
            {submitting && <Loader2 size={14} className="mr-1.5 animate-spin" />} Attach requirement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Create private condition dialog (8 typed kinds) ─────────────────────────

function CreateConditionDialog({
  open,
  onOpenChange,
  service,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  service: FinancierServiceDTO
  onCreated: () => void
}) {
  const [type, setType] = useState<ConditionType>('DOCUMENT')
  const [title, setTitle] = useState('')
  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [documentType, setDocumentType] = useState('COMMERCIAL_REG')
  const [profileFieldKey, setProfileFieldKey] = useState('org.taxId')
  const [validationMin, setValidationMin] = useState('')
  const [validationMax, setValidationMax] = useState('')
  const [validityMonths, setValidityMonths] = useState('')
  const [options, setOptions] = useState<string[]>(['', ''])
  const [attachToo, setAttachToo] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const needsOptions = type === 'SELECT' || type === 'MULTI_SELECT'

  const submit = async () => {
    if (title.trim().length < 3) {
      toast({ title: 'Title too short', description: 'Give the condition a clear title (3+ characters).', variant: 'destructive' })
      return
    }
    if (needsOptions && options.filter((o) => o.trim()).length < 2) {
      toast({ title: 'Options required', description: 'SELECT / MULTI_SELECT conditions need at least two option rows.', variant: 'destructive' })
      return
    }
    const body: Record<string, unknown> = {
      conditionType: type,
      title: title.trim(),
      code: code.trim() || null,
      description: description.trim() || null,
      validityMonths: validityMonths.trim() ? Number(validityMonths) : null,
    }
    if (type === 'DOCUMENT') body.documentType = documentType
    if (type === 'PROFILE_FIELD') body.profileFieldKey = profileFieldKey
    if (type === 'NUMBER') {
      body.validationMin = validationMin.trim() ? Number(validationMin) : null
      body.validationMax = validationMax.trim() ? Number(validationMax) : null
    }
    if (needsOptions) body.options = options.map((o) => o.trim()).filter(Boolean)

    setSubmitting(true)
    const res = await apiRequest<{ template: ConditionTemplateDTO }>('/api/financier/conditions', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    let attached = false
    if (res.ok && res.data && attachToo) {
      const attachRes = await apiRequest('/api/financier/requirements', {
        method: 'POST',
        body: JSON.stringify({
          serviceId: service.id,
          conditionTemplateId: res.data.template.id,
          isRequired: true,
          displayOrder: 999,
        }),
      })
      attached = attachRes.ok
      if (!attachRes.ok) toastApiError(attachRes.error, 'Saved, but attach failed')
    }
    setSubmitting(false)
    if (!res.ok) return toastApiError(res.error)
    toast({
      title: 'Private condition created',
      description: `“${res.data?.template.title}” saved to your library${attached ? ` and attached to ${service.name}` : ''}.`,
    })
    setTitle('')
    setCode('')
    setDescription('')
    setOptions(['', ''])
    onOpenChange(false)
    onCreated()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create a private condition</DialogTitle>
          <DialogDescription>
            Private templates belong to your institution only (invisible to other financiers — DP-24). Eight typed kinds;
            SELECT/MULTI_SELECT get option rows.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Condition type</Label>
            <Select value={type} onValueChange={(v) => setType(v as ConditionType)}>
              <SelectTrigger className="h-9 rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONDITION_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {CONDITION_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cond-code" className="text-xs">
              Code (optional)
            </Label>
            <Input id="cond-code" className="h-9 rounded-lg" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. BK-STMT-6M" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cond-title" className="text-xs">
              Title
            </Label>
            <Input
              id="cond-title"
              className="h-9 rounded-lg"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. 6-month bank statement"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cond-desc" className="text-xs">
              Description (optional)
            </Label>
            <Textarea
              id="cond-desc"
              className="min-h-[54px] rounded-lg"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What the applicant should know about this requirement"
            />
          </div>
          {type === 'DOCUMENT' && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Expected document type</Label>
              <Select value={documentType} onValueChange={setDocumentType}>
                <SelectTrigger className="h-9 rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {type === 'PROFILE_FIELD' && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Profile field to check</Label>
              <Select value={profileFieldKey} onValueChange={setProfileFieldKey}>
                <SelectTrigger className="h-9 rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PROFILE_FIELD_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {type === 'NUMBER' && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="cond-vmin" className="text-xs">
                  Min (optional)
                </Label>
                <Input id="cond-vmin" type="number" className="h-9 rounded-lg" value={validationMin} onChange={(e) => setValidationMin(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cond-vmax" className="text-xs">
                  Max (optional)
                </Label>
                <Input id="cond-vmax" type="number" className="h-9 rounded-lg" value={validationMax} onChange={(e) => setValidationMax(e.target.value)} />
              </div>
            </>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="cond-validity" className="text-xs">
              Validity months (optional)
            </Label>
            <Input
              id="cond-validity"
              type="number"
              min={1}
              className="h-9 rounded-lg"
              value={validityMonths}
              onChange={(e) => setValidityMonths(e.target.value)}
              placeholder="e.g. 6"
            />
          </div>
          {needsOptions && (
            <div className="space-y-2 sm:col-span-2">
              <Label className="text-xs">Option rows</Label>
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    className="h-9 rounded-lg"
                    value={opt}
                    onChange={(e) => setOptions((o) => o.map((x, j) => (j === i ? e.target.value : x)))}
                    placeholder={`Option ${i + 1}`}
                    aria-label={`Option row ${i + 1}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 rounded-lg text-muted-foreground hover:text-destructive"
                    aria-label="Remove option row"
                    disabled={options.length <= 2}
                    onClick={() => setOptions((o) => o.filter((_, j) => j !== i))}
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" className="rounded-lg text-xs" onClick={() => setOptions((o) => [...o, ''])}>
                <Plus size={12} className="mr-1" /> Add option row
              </Button>
            </div>
          )}
          <label className="flex items-start gap-2.5 rounded-xl border bg-muted/30 px-3.5 py-2.5 text-xs font-medium sm:col-span-2">
            <Checkbox checked={attachToo} onCheckedChange={(v) => setAttachToo(v === true)} />
            <span>
              Attach to {service.name} immediately
              <span className="block font-normal text-muted-foreground">Required, last position — configure after attaching.</span>
            </span>
          </label>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button className="rounded-xl" onClick={() => void submit()} disabled={submitting}>
            {submitting && <Loader2 size={14} className="mr-1.5 animate-spin" />} Save to my library
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
