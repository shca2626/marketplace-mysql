'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN · FINANCING — REQUIREMENTS LIBRARY. The GENERAL ConditionTemplate
// CRUD (R-5/DP-24): the platform's shared conditions every financier can
// attach. Eight typed kinds; deactivation instead of deletion (submissions
// preserved). This is the admin's mirror of the financier composer's
// private-condition builder (FIN-5).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import {
  ListChecks,
  Loader2,
  Pencil,
  Plus,
  SearchX,
  ShieldAlert,
  Trash2,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import type { ConditionTemplateDTO } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { SearchInput, apiRequest, toastApiError, useDebounced } from '../shared'
import {
  CONDITION_TYPE_LABELS,
  ConditionTypeBadge,
  DOCUMENT_TYPE_LABELS,
  PROFILE_FIELD_LABELS,
} from '../../financing/financing-shared'

type ConditionType =
  | 'DOCUMENT' | 'PROFILE_FIELD' | 'DECLARATION' | 'TEXT' | 'NUMBER' | 'DATE' | 'SELECT' | 'MULTI_SELECT'

const CONDITION_TYPES: ConditionType[] = [
  'DOCUMENT', 'PROFILE_FIELD', 'DECLARATION', 'TEXT', 'NUMBER', 'DATE', 'SELECT', 'MULTI_SELECT',
]

const TYPE_FILTERS = [
  { value: '', label: 'All kinds' },
  ...CONDITION_TYPES.map((t) => ({ value: t, label: CONDITION_TYPE_LABELS[t] })),
]

export function RequirementsLibrarySection() {
  const [typeFilter, setTypeFilter] = useState('')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search)
  const [includeInactive, setIncludeInactive] = useState(false)
  const [editing, setEditing] = useState<ConditionTemplateDTO | 'new' | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const query = new URLSearchParams()
  if (typeFilter) query.set('conditionType', typeFilter)
  if (debouncedSearch.trim()) query.set('search', debouncedSearch.trim())
  if (includeInactive) query.set('includeInactive', 'true')
  const { data, loading, error, refetch } = useApi<{ templates: ConditionTemplateDTO[] }>(
    `/api/admin/financing/conditions?${query.toString()}`
  )
  const templates = data?.templates ?? []

  const toggleActive = async (t: ConditionTemplateDTO) => {
    setBusyId(t.id)
    const res = await apiRequest<{ template: ConditionTemplateDTO }>(`/api/admin/financing/conditions/${t.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: !t.isActive }),
    })
    setBusyId(null)
    if (!res.ok) {
      toastApiError(res.error, 'Could not update the condition')
      return
    }
    toast({
      title: t.isActive ? `“${t.title}” deactivated` : `“${t.title}” reactivated`,
      description: t.isActive
        ? 'Existing submissions are preserved; financiers can no longer attach it.'
        : 'Financiers can attach it to their services again.',
    })
    void refetch()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <p className="max-w-xl text-xs text-muted-foreground">
          The platform&apos;s shared condition library (GENERAL scope). Financiers attach these to
          their services — deactivating preserves every existing submission.
        </p>
        <Button className="shrink-0 rounded-xl" onClick={() => setEditing('new')}>
          <Plus size={14} className="mr-1.5" /> New condition
        </Button>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div
          className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label="Filter conditions by kind"
        >
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={typeFilter === f.value}
              onClick={() => setTypeFilter(f.value)}
              className={cn(
                'shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors',
                typeFilter === f.value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex shrink-0 items-center gap-2 text-xs font-medium text-muted-foreground">
            <Switch checked={includeInactive} onCheckedChange={setIncludeInactive} aria-label="Show inactive conditions" />
            Show inactive
          </label>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search title or code…"
            ariaLabel="Search the condition library"
            className="min-w-0 flex-1 md:max-w-60"
          />
        </div>
      </div>

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-12 text-center">
          <ShieldAlert size={34} className="text-muted-foreground/40" />
          <p className="mt-3 text-sm font-semibold">Couldn't load the library</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">{error}</p>
          <Button variant="outline" className="mt-4 rounded-xl" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      )}

      {!loading && !error && templates.length === 0 && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-12 text-center">
          <SearchX size={34} className="text-muted-foreground/40" />
          <p className="mt-3 text-sm font-semibold">
            {debouncedSearch.trim() || typeFilter ? 'No conditions match' : 'The library is empty'}
          </p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            {debouncedSearch.trim() || typeFilter
              ? 'Try clearing the search or switching the kind filter.'
              : 'Create the first GENERAL condition — financiers attach these to their services.'}
          </p>
        </div>
      )}

      {!loading && !error && templates.length > 0 && (
        <div className="max-h-[32rem] space-y-3 overflow-y-auto pr-1 [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border">
          {templates.map((t, i) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, delay: i * 0.02 }}
            >
              <Card className={cn(!t.isActive && 'opacity-60')}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      <span className="truncate">{t.title}</span>
                      <ConditionTypeBadge type={t.conditionType} />
                      {t.code && (
                        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          {t.code}
                        </span>
                      )}
                      {!t.isActive && (
                        <Badge variant="outline" className="rounded-full px-1.5 text-[10px] font-semibold text-muted-foreground">
                          Inactive
                        </Badge>
                      )}
                    </p>
                    {t.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t.description}</p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      {t.documentType && <span>expects {DOCUMENT_TYPE_LABELS[t.documentType] ?? t.documentType}</span>}
                      {t.profileFieldKey && <span>checks {PROFILE_FIELD_LABELS[t.profileFieldKey] ?? t.profileFieldKey}</span>}
                      {(t.validationMin != null || t.validationMax != null) && (
                        <span>
                          range {t.validationMin ?? '−∞'}–{t.validationMax ?? '∞'}
                        </span>
                      )}
                      {t.options.length > 0 && <span>{t.options.length} options</span>}
                      {t.validityMonths && <span>valid {t.validityMonths} mo</span>}
                      {t.isRepeatable && <span>repeatable</span>}
                      <span>· {t.attachmentCount} service{t.attachmentCount === 1 ? '' : 's'} attached</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-lg"
                      onClick={() => setEditing(t)}
                      aria-label={`Edit ${t.title}`}
                    >
                      <Pencil size={13} className="mr-1" /> Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        'h-8 rounded-lg',
                        t.isActive ? 'text-rose-600 hover:text-rose-700' : 'text-emerald-600 hover:text-emerald-700'
                      )}
                      disabled={busyId === t.id}
                      onClick={() => void toggleActive(t)}
                    >
                      {busyId === t.id ? (
                        <Loader2 size={13} className="mr-1 animate-spin" />
                      ) : t.isActive ? (
                        <Trash2 size={13} className="mr-1" />
                      ) : (
                        <ListChecks size={13} className="mr-1" />
                      )}
                      {t.isActive ? 'Deactivate' : 'Reactivate'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <ConditionDialog
        key={editing === 'new' ? 'new' : editing?.id ?? 'closed'}
        editing={editing === 'new' ? null : editing}
        open={editing !== null}
        onOpenChange={(v) => (!v ? setEditing(null) : undefined)}
        onSaved={() => {
          setEditing(null)
          void refetch()
        }}
      />
    </div>
  )
}

// ── Create / edit dialog (8 typed kinds — the composer's condition builder) ──

function ConditionDialog({
  editing,
  open,
  onOpenChange,
  onSaved,
}: {
  editing: ConditionTemplateDTO | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const isEdit = !!editing
  const [type, setType] = useState<ConditionType>((editing?.conditionType as ConditionType) ?? 'DOCUMENT')
  const [title, setTitle] = useState(editing?.title ?? '')
  const [code, setCode] = useState(editing?.code ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [documentType, setDocumentType] = useState(editing?.documentType ?? 'COMMERCIAL_REG')
  const [profileFieldKey, setProfileFieldKey] = useState(editing?.profileFieldKey ?? 'org.taxId')
  const [validationMin, setValidationMin] = useState(
    editing?.validationMin != null ? String(editing.validationMin) : ''
  )
  const [validationMax, setValidationMax] = useState(
    editing?.validationMax != null ? String(editing.validationMax) : ''
  )
  const [validityMonths, setValidityMonths] = useState(
    editing?.validityMonths != null ? String(editing.validityMonths) : ''
  )
  const [isRepeatable, setIsRepeatable] = useState(editing?.isRepeatable ?? false)
  const [options, setOptions] = useState<string[]>(
    editing?.options?.length ? editing.options.map((o) => o.value) : ['', '']
  )
  const [submitting, setSubmitting] = useState(false)

  const needsOptions = type === 'SELECT' || type === 'MULTI_SELECT'
  const cleanOptions = useMemo(() => options.map((o) => o.trim()).filter(Boolean), [options])

  const submit = async () => {
    if (title.trim().length < 3) {
      toast({ title: 'Title too short', description: 'Give the condition a clear title (3+ characters).', variant: 'destructive' })
      return
    }
    if (type === 'DOCUMENT' && !documentType) {
      toast({ title: 'Document type required', description: 'DOCUMENT conditions need an expected document type.', variant: 'destructive' })
      return
    }
    if (needsOptions && cleanOptions.length < 2) {
      toast({ title: 'Options required', description: 'SELECT / MULTI_SELECT conditions need at least two option rows.', variant: 'destructive' })
      return
    }
    const body: Record<string, unknown> = {
      title: title.trim(),
      code: code.trim() || null,
      description: description.trim() || null,
      validityMonths: validityMonths.trim() ? Number(validityMonths) : null,
      isRepeatable,
    }
    if (!isEdit) body.conditionType = type
    if (type === 'DOCUMENT') body.documentType = documentType
    if (type === 'PROFILE_FIELD') body.profileFieldKey = profileFieldKey
    if (type === 'NUMBER') {
      body.validationMin = validationMin.trim() ? Number(validationMin) : null
      body.validationMax = validationMax.trim() ? Number(validationMax) : null
    }
    if (needsOptions) body.options = cleanOptions

    setSubmitting(true)
    const res = isEdit
      ? await apiRequest<{ template: ConditionTemplateDTO }>(`/api/admin/financing/conditions/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        })
      : await apiRequest<{ template: ConditionTemplateDTO }>('/api/admin/financing/conditions', {
          method: 'POST',
          body: JSON.stringify(body),
        })
    setSubmitting(false)
    if (!res.ok) return toastApiError(res.error)
    toast({
      title: isEdit ? 'Condition updated' : 'Condition created',
      description: `“${title.trim()}” is in the GENERAL library — every financier can attach it to their services.`,
    })
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit “${editing?.title}”` : 'New GENERAL condition'}</DialogTitle>
          <DialogDescription>
            Platform library (GENERAL scope — shared by every financier). Eight typed kinds;
            SELECT/MULTI_SELECT get option rows. {isEdit ? 'The kind is fixed once created.' : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Condition type</Label>
            <Select value={type} onValueChange={(v) => setType(v as ConditionType)} disabled={isEdit}>
              <SelectTrigger className="h-9 rounded-lg" aria-label="Condition type">
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
                <SelectTrigger className="h-9 rounded-lg" aria-label="Expected document type">
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
                <SelectTrigger className="h-9 rounded-lg" aria-label="Profile field to check">
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
              <p className="text-[11px] text-muted-foreground">
                Auto-evaluated from the applicant&apos;s profile — no manual answer needed.
              </p>
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
              max={120}
              className="h-9 rounded-lg"
              value={validityMonths}
              onChange={(e) => setValidityMonths(e.target.value)}
              placeholder="e.g. 6"
            />
          </div>
          {type === 'DOCUMENT' && (
            <label className="flex items-start gap-2.5 self-end rounded-xl border bg-muted/30 px-3.5 py-2.5 text-xs font-medium">
              <Checkbox checked={isRepeatable} onCheckedChange={(v) => setIsRepeatable(v === true)} />
              <span>
                Repeatable document
                <span className="block font-normal text-muted-foreground">Applicants may supply more than one file.</span>
              </span>
            </label>
          )}
          {needsOptions && (
            <div className="space-y-2 sm:col-span-2">
              <Label className="text-xs">Option rows (at least two)</Label>
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
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button className="rounded-xl" onClick={() => void submit()} disabled={submitting}>
            {submitting && <Loader2 size={14} className="mr-1.5 animate-spin" />}
            {isEdit ? 'Save changes' : 'Add to library'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
