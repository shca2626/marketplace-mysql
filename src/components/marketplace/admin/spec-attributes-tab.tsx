'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN CONSOLE → SPEC ATTRIBUTES (Phase 3 KYP).
// The per-category specification dictionary: what sellers fill in the product
// form (e.g. "Rated power (W)" NUMBER for Solar Panels, "Cell type" SELECT).
// Admins define it once — every seller in that category gets a structured
// form instead of the legacy free-form label/value rows.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Loader2,
  Pencil,
  Plus,
  Save,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import type { CategoryDTO, SpecAttributeDTO } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { cn } from '@/lib/utils'
import { AdminEmptyState, apiRequest, toastApiError } from './shared'

const DATA_TYPES = ['TEXT', 'NUMBER', 'SELECT', 'BOOLEAN'] as const
type DataType = (typeof DATA_TYPES)[number]

const DATA_TYPE_META: Record<DataType, { label: string; chip: string }> = {
  TEXT: { label: 'Text', chip: 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300' },
  NUMBER: { label: 'Number', chip: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300' },
  SELECT: { label: 'Choice', chip: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300' },
  BOOLEAN: { label: 'Yes / No', chip: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300' },
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)

/** Attribute create/edit dialog (create = full form, edit = mutable fields only). */
function AttributeDialog({
  open,
  onOpenChange,
  editing,
  categories,
  defaultScope,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null = create mode. */
  editing: SpecAttributeDTO | null
  categories: CategoryDTO[]
  defaultScope: string
  onSaved: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto scrollbar-thin sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit attribute' : 'New spec attribute'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Scope, key and type are locked (sellers’ saved specs reference them); everything else can change.'
              : 'Define one field sellers fill in the product form for this scope.'}
          </DialogDescription>
        </DialogHeader>
        {/* Radix unmounts closed dialogs — the form state initializes per open. */}
        {open && (
          <AttributeForm
            editing={editing}
            categories={categories}
            defaultScope={defaultScope}
            onDone={() => onOpenChange(false)}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function AttributeForm({
  editing,
  categories,
  defaultScope,
  onDone,
  onSaved,
}: {
  editing: SpecAttributeDTO | null
  categories: CategoryDTO[]
  defaultScope: string
  onDone: () => void
  onSaved: () => void
}) {
  const [scope, setScope] = useState<string>(editing ? editing.categoryId ?? 'global' : defaultScope === 'all' ? 'global' : defaultScope)
  const [key, setKey] = useState(editing?.key ?? '')
  const [keyTouched, setKeyTouched] = useState(!!editing)
  const [label, setLabel] = useState(editing?.label ?? '')
  const [dataType, setDataType] = useState<DataType>((editing?.dataType as DataType) ?? 'TEXT')
  const [unit, setUnit] = useState(editing?.unit ?? '')
  const [options, setOptions] = useState<string[]>([...(editing?.options ?? [])])
  const [optionDraft, setOptionDraft] = useState('')
  const [required, setRequired] = useState(editing?.required ?? false)
  const [position, setPosition] = useState(String(editing?.position ?? 0))
  const [isActive, setIsActive] = useState(editing?.isActive ?? true)
  const [saving, setSaving] = useState(false)

  // Auto-slug the key from the label until the admin edits the key directly.
  const effectiveKey = keyTouched ? slugify(key) : slugify(label)

  const addOption = (raw: string) => {
    const v = raw.trim().replace(/,+$/, '')
    if (!v) return
    if (options.length >= 30) {
      toast({ title: 'Too many choices', description: 'A choice attribute can carry up to 30 options', variant: 'destructive' })
      return
    }
    setOptions((list) => (list.includes(v) ? list : [...list, v]))
    setOptionDraft('')
  }

  const save = async () => {
    if (label.trim().length < 2) {
      toast({ title: 'Label too short', description: 'Give the attribute a buyer-facing label (2–60 characters)', variant: 'destructive' })
      return
    }
    if (!editing && effectiveKey.length < 2) {
      toast({ title: 'Key missing', description: 'The key is auto-generated from the label — check it is at least 2 characters', variant: 'destructive' })
      return
    }
    if (dataType === 'SELECT' && options.length < 1) {
      toast({ title: 'Add at least one choice', description: 'Choice attributes need the options sellers pick from (press Enter after each)', variant: 'destructive' })
      return
    }
    const pos = parseInt(position || '0', 10)
    if (Number.isNaN(pos) || pos < 0 || pos > 9999) {
      toast({ title: 'Invalid position', description: 'Position must be a number between 0 and 9999', variant: 'destructive' })
      return
    }

    setSaving(true)
    const res = editing
      ? await apiRequest(`/api/admin/spec-attributes/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            label: label.trim(),
            unit: unit.trim() || null,
            ...(dataType === 'SELECT' ? { options } : {}),
            required,
            position: pos,
            isActive,
          }),
        })
      : await apiRequest('/api/admin/spec-attributes', {
          method: 'POST',
          body: JSON.stringify({
            categoryId: scope === 'global' ? null : scope,
            key: effectiveKey,
            label: label.trim(),
            dataType,
            unit: unit.trim() || null,
            ...(dataType === 'SELECT' ? { options } : {}),
            required,
            position: pos,
          }),
        })
    setSaving(false)
    if (!res.ok) {
      toastApiError(res.error, editing ? 'Could not update the attribute' : 'Could not create the attribute')
      return
    }
    toast({
      title: editing ? 'Attribute updated' : 'Attribute created',
      description: `${label.trim()}${unit.trim() ? ` (${unit.trim()})` : ''} — ${scope === 'global' ? 'global dictionary' : categories.find((c) => c.id === scope)?.name ?? 'category'}`,
    })
    onDone()
    onSaved()
  }

  const scopeName = scope === 'global' ? 'Global (every category)' : categories.find((c) => c.id === scope)?.name ?? 'Category'

  return (
    <>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="sa-scope">Scope</Label>
            {editing ? (
              <Input value={scopeName} disabled aria-readonly />
            ) : (
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger id="sa-scope" aria-label="Scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global — every category</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sa-key">
              Key <span className="text-xs text-muted-foreground">(slug)</span>
            </Label>
            <Input
              id="sa-key"
              value={editing ? key : effectiveKey}
              onChange={(e) => {
                setKeyTouched(true)
                setKey(e.target.value.toLowerCase())
              }}
              disabled={!!editing}
              placeholder="rated-power"
              className="font-mono text-xs"
              aria-describedby="sa-key-hint"
            />
            {!editing && <p id="sa-key-hint" className="text-[11px] text-muted-foreground">Auto-generated from the label — editable.</p>}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="sa-label">
              Label {required && <span className="text-destructive">*</span>}
            </Label>
            <Input
              id="sa-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={60}
              placeholder="e.g. Rated power"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sa-type">Data type</Label>
            {editing ? (
              <Input value={DATA_TYPE_META[dataType].label} disabled aria-readonly />
            ) : (
              <Select value={dataType} onValueChange={(v) => setDataType(v as DataType)}>
                <SelectTrigger id="sa-type" aria-label="Data type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATA_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {DATA_TYPE_META[t].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="sa-unit">
              Unit <span className="text-xs text-muted-foreground">(opt.)</span>
            </Label>
            <Input id="sa-unit" value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={20} placeholder="e.g. W" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sa-position">
              Position <span className="text-xs text-muted-foreground">(sort order)</span>
            </Label>
            <Input
              id="sa-position"
              type="number"
              min="0"
              max="9999"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
            />
          </div>
        </div>

        {dataType === 'SELECT' && (
          <div className="space-y-1.5">
            <Label htmlFor="sa-options">
              Choices <span className="text-xs text-muted-foreground">(press Enter after each)</span>
            </Label>
            <Input
              id="sa-options"
              value={optionDraft}
              onChange={(e) => setOptionDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault()
                  addOption(optionDraft)
                }
              }}
              placeholder="e.g. Monocrystalline"
            />
            {options.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {options.map((o) => (
                  <span
                    key={o}
                    className="inline-flex items-center gap-1 rounded-full border bg-muted/60 px-2.5 py-1 text-xs"
                  >
                    {o}
                    <button
                      type="button"
                      onClick={() => setOptions((list) => list.filter((x) => x !== o))}
                      aria-label={`Remove choice ${o}`}
                      className="rounded-full p-0.5 text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-6 rounded-xl border bg-muted/30 px-4 py-3">
          <div className="flex items-center gap-2">
            <Switch id="sa-required" checked={required} onCheckedChange={setRequired} />
            <Label htmlFor="sa-required" className="cursor-pointer">
              Required <span className="text-xs text-muted-foreground">(blocks publish)</span>
            </Label>
          </div>
          {editing && (
            <div className="flex items-center gap-2">
              <Switch id="sa-active" checked={isActive} onCheckedChange={setIsActive} />
              <Label htmlFor="sa-active" className="cursor-pointer">Active</Label>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onDone} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={saving} className="min-w-28">
            {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}
            {editing ? <Save size={14} className="mr-1.5" /> : <Plus size={14} className="mr-1.5" />}
            {editing ? 'Save changes' : 'Create attribute'}
          </Button>
        </DialogFooter>
    </>
  )
}

export function SpecAttributesTab() {
  const { data: catData } = useApi<{ categories: CategoryDTO[] }>('/api/categories')
  const categories = useMemo(() => catData?.categories ?? [], [catData])

  // 'all' | 'global' | <categoryId>
  const [scope, setScope] = useState<string>('all')
  const [rows, setRows] = useState<SpecAttributeDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<SpecAttributeDTO | null>(null)
  const [deleting, setDeleting] = useState<SpecAttributeDTO | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      if (scope === 'all') {
        // Global dictionary + every category, merged (category rows are labeled).
        const urls = ['/api/admin/spec-attributes', ...categories.map((c) => `/api/admin/spec-attributes?categoryId=${c.id}`)]
        const results = await Promise.all(
          urls.map(async (u) => {
            const res = await fetch(u, { cache: 'no-store' })
            if (!res.ok) return null
            const json = (await res.json().catch(() => ({}))) as { attributes?: SpecAttributeDTO[] }
            return (json.attributes ?? []) as SpecAttributeDTO[]
          })
        )
        if (results.some((r) => r === null)) throw new Error('load failed')
        setRows(results.filter((r): r is SpecAttributeDTO[] => r !== null).flat())
      } else {
        const res = await fetch(scope === 'global' ? '/api/admin/spec-attributes' : `/api/admin/spec-attributes?categoryId=${scope}`, {
          cache: 'no-store',
        })
        const json = (await res.json().catch(() => ({}))) as { attributes?: SpecAttributeDTO[]; error?: string }
        if (!res.ok) throw new Error(json.error ?? 'load failed')
        setRows(json.attributes ?? [])
      }
    } catch {
      setLoadError('Failed to load the attribute dictionary — please try again.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [scope, categories])

  useEffect(() => {
    void load()
  }, [load])

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }
  const openEdit = (attr: SpecAttributeDTO) => {
    setEditing(attr)
    setDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!deleting) return
    setDeleteBusy(true)
    const res = await apiRequest(`/api/admin/spec-attributes/${deleting.id}`, { method: 'DELETE' })
    setDeleteBusy(false)
    if (!res.ok) {
      toastApiError(res.error, 'Could not delete the attribute')
      return
    }
    toast({
      title: 'Attribute deleted',
      description: `${deleting.label} — specs already saved on products keep their text.`,
    })
    setDeleting(null)
    void load()
  }

  const scopeLabel = (attr: SpecAttributeDTO) =>
    attr.categoryId ? (attr.categoryName ?? categories.find((c) => c.id === attr.categoryId)?.name ?? attr.categoryId) : 'Global'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted-foreground">
          The specification dictionary — define once per category what sellers must fill (e.g. Rated
          power (W) for Solar Panels), and the product form renders a structured form instead of
          free-form rows.
        </p>
        <Button className="rounded-xl" onClick={openCreate}>
          <Plus size={15} className="mr-1.5" /> New attribute
        </Button>
      </div>

      {/* Scope picker */}
      <div className="flex flex-wrap items-center gap-2.5">
        <Label htmlFor="sa-filter-scope" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Scope
        </Label>
        <Select value={scope} onValueChange={setScope}>
          <SelectTrigger id="sa-filter-scope" className="w-56 rounded-xl" aria-label="Filter by scope">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories + global</SelectItem>
            <SelectItem value="global">Global only (every category)</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={() => void load()} aria-label="Refresh attributes">
          <SlidersHorizontal size={14} className={loading ? 'animate-pulse' : undefined} />
        </Button>
      </div>

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {!loading && loadError && (
        <AdminEmptyState icon={ShieldAlert} title="Couldn't load the dictionary" description={loadError}>
          <Button variant="outline" className="rounded-xl" onClick={() => void load()}>
            Try again
          </Button>
        </AdminEmptyState>
      )}

      {!loading && !loadError && rows.length === 0 && (
        <AdminEmptyState
          icon={SlidersHorizontal}
          title="No attributes yet"
          description="No attributes yet — define what sellers fill per category (e.g. Rated power (W) for Solar Panels)."
        >
          <Button className="rounded-xl" onClick={openCreate}>
            <Plus size={15} className="mr-1.5" /> New attribute
          </Button>
        </AdminEmptyState>
      )}

      {!loading && !loadError && rows.length > 0 && (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {/* Desktop table */}
            <div className="hidden md:block">
              <table className="w-full text-sm">
                <caption className="sr-only">Specification attribute dictionary</caption>
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="px-4 py-3 font-medium">Label</th>
                    <th scope="col" className="px-4 py-3 font-medium">Key</th>
                    <th scope="col" className="px-4 py-3 font-medium">Type</th>
                    <th scope="col" className="px-4 py-3 font-medium">Unit</th>
                    <th scope="col" className="px-4 py-3 font-medium">Required</th>
                    <th scope="col" className="px-4 py-3 font-medium">Pos.</th>
                    <th scope="col" className="px-4 py-3 font-medium">Status</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((attr) => (
                    <tr key={attr.id} className="border-b transition-colors last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <p className="font-medium">
                          {attr.label}
                          {attr.required && <span className="ml-1 text-destructive">*</span>}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{scopeLabel(attr)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{attr.key}</code>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={cn('rounded-full border-0 text-[11px] font-semibold', DATA_TYPE_META[attr.dataType as DataType]?.chip)}>
                          {DATA_TYPE_META[attr.dataType as DataType]?.label ?? attr.dataType}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{attr.unit ?? '—'}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={cn('rounded-full text-[11px]', attr.required ? 'border-amber-400 text-amber-700 dark:text-amber-300' : 'text-muted-foreground')}>
                          {attr.required ? 'Required' : 'Optional'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">{attr.position}</td>
                      <td className="px-4 py-3">
                        <Badge
                          className={cn(
                            'rounded-full border-0 text-[11px] font-semibold',
                            attr.isActive
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                          )}
                        >
                          {attr.isActive ? 'Active' : 'Hidden'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => openEdit(attr)} aria-label={`Edit ${attr.label}`}>
                            <Pencil size={14} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleting(attr)}
                            aria-label={`Delete ${attr.label}`}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="divide-y md:hidden">
              {rows.map((attr) => (
                <li key={attr.id} className="space-y-2 px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {attr.label}
                        {attr.required && <span className="ml-1 text-destructive">*</span>}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{scopeLabel(attr)} · <code className="font-mono">{attr.key}</code></p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => openEdit(attr)} aria-label={`Edit ${attr.label}`}>
                        <Pencil size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleting(attr)}
                        aria-label={`Delete ${attr.label}`}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <Badge className={cn('rounded-full border-0 font-semibold', DATA_TYPE_META[attr.dataType as DataType]?.chip)}>
                      {DATA_TYPE_META[attr.dataType as DataType]?.label ?? attr.dataType}
                    </Badge>
                    {attr.unit && <Badge variant="outline" className="rounded-full">Unit: {attr.unit}</Badge>}
                    <Badge variant="outline" className={cn('rounded-full', attr.required ? 'border-amber-400 text-amber-700 dark:text-amber-300' : 'text-muted-foreground')}>
                      {attr.required ? 'Required' : 'Optional'}
                    </Badge>
                    <Badge variant="outline" className="rounded-full text-muted-foreground">Pos {attr.position}</Badge>
                    <Badge
                      className={cn(
                        'rounded-full border-0 font-semibold',
                        attr.isActive
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                      )}
                    >
                      {attr.isActive ? 'Active' : 'Hidden'}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <AttributeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        categories={categories}
        defaultScope={scope}
        onSaved={() => void load()}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.label}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The attribute leaves the seller form immediately. Products that already saved it keep
              their spec text — only the template changes. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteBusy}
              onClick={(e) => {
                e.preventDefault()
                void confirmDelete()
              }}
            >
              {deleteBusy && <Loader2 size={14} className="mr-1.5 animate-spin" />}
              Delete attribute
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
