'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN CONSOLE → CATALOG CATEGORIES (Phase 4).
// The storefront taxonomy: names, icons, sort order, descriptions — and the
// per-category spec dictionary counts. Deleting a category with listings
// requires moving them somewhere first (the API enforces it with a 409).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react'
import {
  FolderTree,
  Loader2,
  Pencil,
  Plus,
  Save,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
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
import { Textarea } from '@/components/ui/textarea'
import { AdminEmptyState, apiRequest, toastApiError } from '../shared'

interface CategoryRow {
  id: string
  name: string
  slug: string
  icon: string | null
  description: string | null
  sortOrder: number
  productCount: number
  specAttributeCount: number
}

function CategoryDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editing: CategoryRow | null
  onSaved: () => void
}) {
  const [name, setName] = useState(editing?.name ?? '')
  const [icon, setIcon] = useState(editing?.icon ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [sortOrder, setSortOrder] = useState(String(editing?.sortOrder ?? 0))
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (name.trim().length < 2) {
      toast({ title: 'Name too short', description: 'Category names need 2–60 characters', variant: 'destructive' })
      return
    }
    const order = parseInt(sortOrder || '0', 10)
    if (Number.isNaN(order) || order < 0 || order > 9999) {
      toast({ title: 'Invalid sort order', description: 'Sort order must be a number between 0 and 9999', variant: 'destructive' })
      return
    }
    setSaving(true)
    const payload = { name: name.trim(), icon: icon.trim() || null, description: description.trim() || null, sortOrder: order }
    const res = editing
      ? await apiRequest(`/api/admin/categories/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
      : await apiRequest('/api/admin/categories', { method: 'POST', body: JSON.stringify(payload) })
    setSaving(false)
    if (!res.ok) {
      toastApiError(res.error, editing ? 'Could not update the category' : 'Could not create the category')
      return
    }
    toast({ title: editing ? 'Category updated' : 'Category created', description: name.trim() })
    onOpenChange(false)
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto scrollbar-thin sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${editing.name}` : 'New category'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'The slug regenerates from the name — storefront links follow automatically.'
              : 'A top-level storefront category with its own spec dictionary.'}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ct-name">Name *</Label>
                <Input id="ct-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Solar Panels" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ct-icon">
                  Icon <span className="text-xs text-muted-foreground">(Lucide name)</span>
                </Label>
                <Input id="ct-icon" value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={40} className="font-mono text-xs" placeholder="e.g. Zap" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ct-order">
                  Sort order <span className="text-xs text-muted-foreground">(0–9999)</span>
                </Label>
                <Input id="ct-order" type="number" min="0" max="9999" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
              </div>
              <div className="flex items-end pb-1.5 text-xs text-muted-foreground">
                Lower numbers appear first in the storefront navigation.
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ct-description">
                Description <span className="text-xs text-muted-foreground">(shown on the category page)</span>
              </Label>
              <Textarea id="ct-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={2000} placeholder="What buyers find in this category…" />
            </div>
            <DialogFooter className="gap-2 pt-1">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void save()} disabled={saving} className="min-w-28">
                {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}
                {editing ? <Save size={14} className="mr-1.5" /> : <Plus size={14} className="mr-1.5" />}
                {editing ? 'Save changes' : 'Create category'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Delete confirm — categories with listings must move them somewhere first. */
function DeleteCategoryDialog({
  category,
  categories,
  onClose,
  onDone,
}: {
  category: CategoryRow | null
  categories: CategoryRow[]
  onClose: () => void
  onDone: () => void
}) {
  const [reassignTo, setReassignTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const others = categories.filter((c) => c.id !== category?.id)
  const needsMove = (category?.productCount ?? 0) > 0

  const confirm = async () => {
    if (!category) return
    if (needsMove && !reassignTo) {
      setError('Pick a category to move the listings to.')
      return
    }
    setBusy(true)
    setError(null)
    const res = await apiRequest(`/api/admin/categories/${category.id}${reassignTo ? `?reassignTo=${reassignTo}` : ''}`, {
      method: 'DELETE',
    })
    setBusy(false)
    if (!res.ok) {
      setError(res.error ?? 'Could not delete the category')
      return
    }
    toast({
      title: 'Category deleted',
      description: needsMove ? `${category.name} — its listings moved to their new category.` : category.name,
    })
    onClose()
    setReassignTo('')
    onDone()
  }

  return (
    <Dialog open={!!category} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete “{category?.name}”?</DialogTitle>
          <DialogDescription>
            {needsMove
              ? `This category still has ${category?.productCount} listing(s) — pick the category they move to. Its ${category?.specAttributeCount} spec attribute(s) are removed (the target keeps its own dictionary).`
              : 'The category is removed permanently. Its spec dictionary goes with it.'}
          </DialogDescription>
        </DialogHeader>
        {category && (
          <div className="space-y-4">
            {needsMove && (
              <div className="space-y-1.5">
                <Label htmlFor="ct-reassign">Move {category.productCount} listing(s) to…</Label>
                <Select value={reassignTo} onValueChange={(v) => { setReassignTo(v); setError(null) }}>
                  <SelectTrigger id="ct-reassign" aria-label="Reassignment target">
                    <SelectValue placeholder="Pick a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {others.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {error && (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
                {error}
              </p>
            )}
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => void confirm()} disabled={busy} className="min-w-28">
                {busy && <Loader2 size={14} className="mr-1.5 animate-spin" />}
                <Trash2 size={14} className="mr-1.5" /> Delete category
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function CatalogCategoriesTab() {
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<CategoryRow | null>(null)
  const [deleting, setDeleting] = useState<CategoryRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await apiRequest<{ categories: CategoryRow[] }>('/api/admin/categories')
      if (!res.ok || !res.data) {
        setLoadError(res.error ?? 'Failed to load categories')
        setCategories([])
      } else {
        setCategories(res.data.categories)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-sm text-muted-foreground">
          The storefront taxonomy. Each category carries its own{' '}
          <span className="font-semibold text-foreground">spec dictionary</span> — the structured form sellers fill
          in instead of free-form rows.
        </p>
        <Button
          className="shrink-0 rounded-xl"
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        >
          <Plus size={15} className="mr-1.5" /> New category
        </Button>
      </div>

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      )}

      {!loading && loadError && (
        <AdminEmptyState icon={ShieldAlert} title="Couldn't load categories" description={loadError}>
          <Button variant="outline" className="rounded-xl" onClick={() => void load()}>
            Try again
          </Button>
        </AdminEmptyState>
      )}

      {!loading && !loadError && categories.length === 0 && (
        <AdminEmptyState icon={FolderTree} title="No categories yet" description="Create the first storefront category." />
      )}

      {!loading && !loadError && categories.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-2xl border md:block">
            <div className="max-h-96 overflow-y-auto scrollbar-thin">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="px-4 py-3 font-medium">Category</th>
                    <th scope="col" className="px-4 py-3 font-medium">Order</th>
                    <th scope="col" className="px-4 py-3 font-medium">Listings</th>
                    <th scope="col" className="px-4 py-3 font-medium">Specs</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((c) => (
                    <tr key={c.id} className="border-b transition-colors last:border-0 hover:bg-accent/50">
                      <td className="px-4 py-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {c.icon ? <span className="mr-1.5 text-muted-foreground">{c.icon}</span> : null}
                            {c.name}
                          </p>
                          <p className="truncate font-mono text-xs text-muted-foreground">{c.slug}</p>
                          {c.description && (
                            <p className="mt-0.5 max-w-md truncate text-xs text-muted-foreground">{c.description}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">{c.sortOrder}</td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">{c.productCount}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <SlidersHorizontal size={12} /> {c.specAttributeCount}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-lg"
                            onClick={() => {
                              setEditing(c)
                              setDialogOpen(true)
                            }}
                            aria-label={`Edit ${c.name}`}
                          >
                            <Pencil size={13} className="mr-1" /> Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-lg border-rose-300 text-rose-700 hover:bg-rose-50 hover:text-rose-800 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/50"
                            onClick={() => setDeleting(c)}
                            aria-label={`Delete ${c.name}`}
                          >
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile stacked cards */}
          <div className="space-y-3 md:hidden">
            {categories.map((c) => (
              <div key={c.id} className="rounded-2xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{c.name}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">{c.slug}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      order {c.sortOrder} · {c.productCount} listing(s) · {c.specAttributeCount} spec(s)
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-lg"
                      onClick={() => {
                        setEditing(c)
                        setDialogOpen(true)
                      }}
                      aria-label={`Edit ${c.name}`}
                    >
                      <Pencil size={13} />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-lg border-rose-300 text-rose-700 dark:border-rose-900 dark:text-rose-400"
                      onClick={() => setDeleting(c)}
                      aria-label={`Delete ${c.name}`}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>
                {c.description && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{c.description}</p>}
              </div>
            ))}
          </div>
        </>
      )}

      {/* key = fresh state every time the dialog opens on a different row */}
      <CategoryDialog key={editing?.id ?? 'new'} open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} onSaved={() => void load()} />
      <DeleteCategoryDialog category={deleting} categories={categories} onClose={() => setDeleting(null)} onDone={() => void load()} />
    </div>
  )
}
