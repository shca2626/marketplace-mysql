'use client'

// ─────────────────────────────────────────────────────────────────────────────
// REQUIREMENTS LIBRARY — GENERAL ConditionTemplate CRUD (FIN-7 sub-tab 6).
// The platform's shared conditions shelf: every GENERAL template financiers
// can attach to their services. Create/edit (all 8 condition types with
// type-specific config + the options editor for selects) and deactivate —
// attached checklists keep working, the template just leaves the picker.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { ListChecks, Loader2, Pencil, Plus, Power, SearchX, Trash2 } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import {
  AdminEmptyState,
  apiRequest,
  SearchInput,
  toastApiError,
  useDebounced,
} from '../shared'
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
import { conditionTypeLabel } from '@/components/marketplace/financier/financing-status-badge'
import { cn } from '@/lib/utils'
import type { ConditionTemplateDTO } from './shared'

// ── Statics (mirror the zod contracts in server/modules/financing/types.ts) ──

const CONDITION_TYPES = ['DOCUMENT', 'PROFILE_FIELD', 'DECLARATION', 'TEXT', 'NUMBER', 'DATE', 'SELECT', 'MULTI_SELECT'] as const

const DOCUMENT_TYPES = [
  'NATIONAL_ID', 'PASSPORT', 'RESIDENCE_PERMIT', 'COMMERCIAL_REG', 'TAX_CARD', 'BUSINESS_LICENSE',
  'BANK_STATEMENT', 'FINANCIAL_STATEMENT', 'PROOF_OF_ADDRESS', 'GUARANTEE_DOC', 'FEASIBILITY_STUDY',
  'INVOICE', 'PURCHASE_ORDER', 'PROJECT_FILE', 'OTHER',
] as const

const PROFILE_FIELD_KEYS = ['user.phone', 'user.identityNumber', 'user.dateOfBirth', 'org.taxId', 'org.registrationNumber', 'org.industry'] as const

const DOC_TYPE_LABELS: Record<string, string> = {
  NATIONAL_ID: 'National ID', PASSPORT: 'Passport', RESIDENCE_PERMIT: 'Residence permit',
  COMMERCIAL_REG: 'Commercial registration', TAX_CARD: 'Tax card', BUSINESS_LICENSE: 'Business license',
  BANK_STATEMENT: 'Bank statement', FINANCIAL_STATEMENT: 'Financial statement', PROOF_OF_ADDRESS: 'Proof of address',
  GUARANTEE_DOC: 'Guarantee document', FEASIBILITY_STUDY: 'Feasibility study', INVOICE: 'Invoice',
  PURCHASE_ORDER: 'Purchase order', PROJECT_FILE: 'Project file', OTHER: 'Other',
}

const TYPE_TINTS: Record<string, string> = {
  DOCUMENT: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  PROFILE_FIELD: 'bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-300',
  DECLARATION: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  TEXT: 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300',
  NUMBER: 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300',
  DATE: 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300',
  SELECT: 'bg-primary/10 text-primary',
  MULTI_SELECT: 'bg-primary/10 text-primary',
}

interface ConditionDraft {
  conditionType: string
  code: string
  title: string
  description: string
  documentType: string
  profileFieldKey: string
  validationMin: string
  validationMax: string
  validityMonths: string
  isRepeatable: boolean
  options: string[]
}

const EMPTY_DRAFT: ConditionDraft = {
  conditionType: 'DOCUMENT',
  code: '',
  title: '',
  description: '',
  documentType: 'NATIONAL_ID',
  profileFieldKey: 'user.phone',
  validationMin: '',
  validationMax: '',
  validityMonths: '',
  isRepeatable: false,
  options: [''],
}

function draftOf(c: ConditionTemplateDTO): ConditionDraft {
  return {
    conditionType: c.conditionType,
    code: c.code ?? '',
    title: c.title,
    description: c.description ?? '',
    documentType: c.documentType ?? 'NATIONAL_ID',
    profileFieldKey: c.profileFieldKey ?? 'user.phone',
    validationMin: c.validationMin != null ? String(c.validationMin) : '',
    validationMax: c.validationMax != null ? String(c.validationMax) : '',
    validityMonths: c.validityMonths != null ? String(c.validityMonths) : '',
    isRepeatable: c.isRepeatable,
    options: c.options.length > 0 ? c.options.map((o) => o.value) : [''],
  }
}

// ── Create / edit dialog ─────────────────────────────────────────────────────

function ConditionDialog({
  initial,
  onClose,
  onSaved,
}: {
  initial: ConditionTemplateDTO | null
  onClose: () => void
  onSaved: () => void
}) {
  const [draft, setDraft] = useState<ConditionDraft>(initial ? draftOf(initial) : EMPTY_DRAFT)
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof ConditionDraft>(key: K, value: ConditionDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const needsOptions = draft.conditionType === 'SELECT' || draft.conditionType === 'MULTI_SELECT'

  const payload = () => ({
    scope: 'GENERAL',
    conditionType: draft.conditionType,
    code: draft.code.trim().toUpperCase() || null,
    title: draft.title.trim(),
    description: draft.description.trim() || null,
    documentType: draft.conditionType === 'DOCUMENT' ? draft.documentType : null,
    profileFieldKey: draft.conditionType === 'PROFILE_FIELD' ? draft.profileFieldKey : null,
    validationMin:
      draft.conditionType === 'NUMBER' && draft.validationMin.trim() !== '' ? Number(draft.validationMin) : null,
    validationMax:
      draft.conditionType === 'NUMBER' && draft.validationMax.trim() !== '' ? Number(draft.validationMax) : null,
    validityMonths: draft.validityMonths.trim() !== '' ? Number(draft.validityMonths) : null,
    isRepeatable: draft.isRepeatable,
    options: needsOptions
      ? draft.options.map((o) => o.trim()).filter(Boolean).map((value) => ({ value }))
      : undefined,
  })

  const submit = async () => {
    if (draft.title.trim().length < 3) {
      toast({ title: 'A title is required', description: 'Financiers see this label in the composer picker.', variant: 'destructive' })
      return
    }
    if (needsOptions && draft.options.filter((o) => o.trim()).length < 1) {
      toast({ title: 'At least one option is required', description: 'Select conditions present their options to the applicant.', variant: 'destructive' })
      return
    }
    if (
      draft.conditionType === 'NUMBER' &&
      draft.validationMin.trim() !== '' &&
      draft.validationMax.trim() !== '' &&
      Number(draft.validationMin) > Number(draft.validationMax)
    ) {
      toast({ title: 'Min cannot exceed max', description: 'Fix the validation bounds.', variant: 'destructive' })
      return
    }
    setSaving(true)
    const res = initial
      ? await apiRequest<{ condition: ConditionTemplateDTO }>(`/api/admin/financing/conditions/${initial.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload()),
        })
      : await apiRequest<{ condition: ConditionTemplateDTO }>('/api/admin/financing/conditions', {
          method: 'POST',
          body: JSON.stringify(payload()),
        })
    setSaving(false)
    if (!res.ok) return toastApiError(res.error, initial ? 'Update failed' : 'Creation failed')
    toast({
      title: initial ? 'Template updated' : 'Template created',
      description: `${draft.title.trim()} is now part of the GENERAL library${initial ? '' : ' — financiers can attach it to any service'}.`,
    })
    onSaved()
    onClose()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListChecks size={17} className="text-primary" /> {initial ? 'Edit condition' : 'New GENERAL condition'}
          </DialogTitle>
          <DialogDescription>
            GENERAL templates are the platform&apos;s shared shelf — every financier can attach them to their services
            (their private FINANCIER-scope templates live in their own console).
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Condition type</Label>
            <Select value={draft.conditionType} onValueChange={(v) => set('conditionType', v)}>
              <SelectTrigger className="rounded-xl">
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
              value={draft.code}
              onChange={(e) => set('code', e.target.value.toUpperCase())}
              placeholder="e.g. BANK-3M"
              className="rounded-xl font-mono uppercase"
            />
            <p className="text-[11px] text-muted-foreground">2–32 uppercase letters, digits or dashes.</p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cond-title">Title</Label>
            <Input
              id="cond-title"
              value={draft.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="e.g. Bank statements — last 3 months"
              className="rounded-xl"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cond-desc">Description / instructions (optional)</Label>
            <Textarea
              id="cond-desc"
              value={draft.description}
              onChange={(e) => set('description', e.target.value)}
              rows={2}
              placeholder="Shown to the applicant while answering."
              className="rounded-xl"
            />
          </div>

          {draft.conditionType === 'DOCUMENT' && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Document type required</Label>
              <Select value={draft.documentType} onValueChange={(v) => set('documentType', v)}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {DOC_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                The applicant picks a matching document from their vault (or uploads it once).
              </p>
            </div>
          )}

          {draft.conditionType === 'PROFILE_FIELD' && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Profile field</Label>
              <Select value={draft.profileFieldKey} onValueChange={(v) => set('profileFieldKey', v)}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROFILE_FIELD_KEYS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                The gate auto-evaluates this field against the applicant&apos;s profile — no manual answer needed.
              </p>
            </div>
          )}

          {draft.conditionType === 'NUMBER' && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="cond-min">Minimum (optional)</Label>
                <Input
                  id="cond-min"
                  type="number"
                  value={draft.validationMin}
                  onChange={(e) => set('validationMin', e.target.value)}
                  className="rounded-xl tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cond-max">Maximum (optional)</Label>
                <Input
                  id="cond-max"
                  type="number"
                  value={draft.validationMax}
                  onChange={(e) => set('validationMax', e.target.value)}
                  className="rounded-xl tabular-nums"
                />
              </div>
            </>
          )}

          {needsOptions && (
            <div className="space-y-2 sm:col-span-2">
              <div className="flex items-center justify-between">
                <Label>Options ({draft.options.filter((o) => o.trim()).length})</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-lg text-xs"
                  onClick={() => set('options', [...draft.options, ''])}
                >
                  <Plus size={12} className="mr-1" /> Add option
                </Button>
              </div>
              <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-xl border bg-muted/30 p-2">
                {draft.options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-5 shrink-0 text-center text-xs font-semibold text-muted-foreground tabular-nums">
                      {i + 1}
                    </span>
                    <Input
                      value={opt}
                      onChange={(e) => set('options', draft.options.map((o, j) => (j === i ? e.target.value : o)))}
                      placeholder={`Option ${i + 1}`}
                      className="h-9 rounded-lg"
                      aria-label={`Option ${i + 1} value`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove option ${i + 1}`}
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                      disabled={draft.options.length <= 1}
                      onClick={() => set('options', draft.options.filter((_, j) => j !== i))}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {draft.conditionType === 'MULTI_SELECT' ? 'The applicant may pick several.' : 'The applicant picks one.'}
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="cond-validity">Validity months (optional)</Label>
            <Input
              id="cond-validity"
              type="number"
              min={1}
              max={240}
              value={draft.validityMonths}
              onChange={(e) => set('validityMonths', e.target.value)}
              placeholder="e.g. 3"
              className="rounded-xl tabular-nums"
            />
            <p className="text-[11px] text-muted-foreground">Verified evidence expires after this window.</p>
          </div>
          <div className="flex items-end justify-between gap-3 rounded-xl border px-3 py-2.5">
            <div>
              <Label htmlFor="cond-repeatable">Repeatable</Label>
              <p className="text-[11px] text-muted-foreground">The applicant may supply several instances.</p>
            </div>
            <Switch
              id="cond-repeatable"
              checked={draft.isRepeatable}
              onCheckedChange={(v) => set('isRepeatable', v)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" className="rounded-xl" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" className="rounded-xl" onClick={() => void submit()} disabled={saving}>
            {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />} {initial ? 'Save changes' : 'Create template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── The library tab ──────────────────────────────────────────────────────────

export function ConditionsLibrary() {
  const [search, setSearch] = useState('')
  const debounced = useDebounced(search)
  const [includeInactive, setIncludeInactive] = useState(true)
  const [editing, setEditing] = useState<ConditionTemplateDTO | null>(null)
  const [creating, setCreating] = useState(false)
  const [deactivating, setDeactivating] = useState<ConditionTemplateDTO | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const query = new URLSearchParams()
  if (debounced.trim()) query.set('search', debounced.trim())
  if (includeInactive) query.set('includeInactive', 'true')
  const qs = query.toString()

  const { data, loading, error, refetch } = useApi<{ conditions: ConditionTemplateDTO[] }>(
    `/api/admin/financing/conditions${qs ? `?${qs}` : ''}`
  )
  const conditions = data?.conditions ?? []
  const activeCount = conditions.filter((c) => c.isActive).length

  const deactivate = async () => {
    if (!deactivating) return
    setBusyId(deactivating.id)
    const res = await apiRequest(`/api/admin/financing/conditions/${deactivating.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'deactivate' }),
    })
    setBusyId(null)
    if (!res.ok) return toastApiError(res.error, 'Deactivation failed')
    toast({
      title: 'Template deactivated',
      description: `${deactivating.title} left the composer picker — services already using it keep their checklists.`,
    })
    setDeactivating(null)
    void refetch()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by title or code…"
            ariaLabel="Search condition templates"
            className="min-w-52"
          />
          <button
            type="button"
            onClick={() => setIncludeInactive((v) => !v)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
              includeInactive
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
            )}
            aria-pressed={includeInactive}
          >
            Include deactivated
          </button>
          <span className="text-xs text-muted-foreground">
            {activeCount} active / {conditions.length} shown
          </span>
        </div>
        <Button type="button" className="rounded-xl" onClick={() => setCreating(true)}>
          <Plus size={15} className="mr-1.5" /> New condition
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <AdminEmptyState icon={SearchX} title="Couldn't load the library" description={error} />
      ) : conditions.length === 0 ? (
        <AdminEmptyState
          icon={ListChecks}
          title="No matching condition templates"
          description="GENERAL templates are the shared shelf every financier can attach to their services — create the first one."
        >
          <Button type="button" className="rounded-xl" onClick={() => setCreating(true)}>
            <Plus size={15} className="mr-1.5" /> New condition
          </Button>
        </AdminEmptyState>
      ) : (
        <div className="overflow-x-auto rounded-2xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</th>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Code</th>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Title</th>
                <th className="hidden px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:table-cell">Validity</th>
                <th className="hidden px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:table-cell">Repeatable</th>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Attached</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {conditions.map((c) => (
                <tr key={c.id} className={cn('transition-colors hover:bg-muted/30', !c.isActive && 'opacity-55')}>
                  <td className="px-4 py-2.5">
                    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', TYPE_TINTS[c.conditionType] ?? 'bg-muted text-muted-foreground')}>
                      {conditionTypeLabel(c.conditionType)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">{c.code ?? '—'}</td>
                  <td className="max-w-64 px-4 py-2.5">
                    <p className="truncate font-medium">{c.title}</p>
                    {c.options.length > 0 && (
                      <p className="truncate text-[11px] text-muted-foreground">
                        {c.options.length} option{c.options.length > 1 ? 's' : ''}: {c.options.map((o) => o.value).join(', ')}
                      </p>
                    )}
                  </td>
                  <td className="hidden px-4 py-2.5 text-xs text-muted-foreground sm:table-cell">
                    {c.validityMonths ? `${c.validityMonths} mo` : '—'}
                  </td>
                  <td className="hidden px-4 py-2.5 text-xs sm:table-cell">
                    {c.isRepeatable ? (
                      <Badge className="rounded-full border-0 bg-muted text-[11px]">Repeatable</Badge>
                    ) : (
                      <span className="text-muted-foreground">Once</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-semibold tabular-nums text-muted-foreground">
                    {c.attachmentCount} service{c.attachmentCount === 1 ? '' : 's'}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 rounded-lg px-2 text-xs"
                        onClick={() => setEditing(c)}
                      >
                        <Pencil size={12} className="mr-1" /> Edit
                      </Button>
                      {c.isActive && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 rounded-lg px-2 text-xs text-muted-foreground hover:text-destructive"
                          disabled={busyId === c.id}
                          onClick={() => setDeactivating(c)}
                        >
                          {busyId === c.id ? <Loader2 size={12} className="mr-1 animate-spin" /> : <Power size={12} className="mr-1" />}
                          Deactivate
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && (
        <ConditionDialog
          key={editing?.id ?? 'new'}
          initial={editing}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSaved={() => void refetch()}
        />
      )}

      <AlertDialog open={!!deactivating} onOpenChange={(o) => !o && setDeactivating(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Power size={17} className="text-destructive" /> Deactivate “{deactivating?.title}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The template leaves the financier composer picker. Services already using it keep their checklists and
              historical submissions — this only stops new attachments.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep active</AlertDialogCancel>
            <AlertDialogAction className="rounded-xl bg-destructive text-white hover:bg-destructive/90" onClick={() => void deactivate()}>
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
