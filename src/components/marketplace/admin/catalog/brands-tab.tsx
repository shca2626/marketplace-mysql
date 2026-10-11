'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN CONSOLE → CATALOG BRANDS (Phase 4).
// The brand directory behind the "what it is" layer of every listing. Brands
// with listings attached can't be deleted (the API answers 409 with the count).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BadgeCheck,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  Save,
  SearchX,
  ShieldAlert,
  Tag,
  Trash2,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { AdminEmptyState, SearchInput, apiRequest, toastApiError, useDebounced } from '../shared'

interface BrandRow {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  description: string | null
  websiteUrl: string | null
  originCountry: string | null
  isVerified: boolean
  productCount: number
  createdAt: string
}

function BrandDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editing: BrandRow | null
  onSaved: () => void
}) {
  const [name, setName] = useState(editing?.name ?? '')
  const [logoUrl, setLogoUrl] = useState(editing?.logoUrl ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [websiteUrl, setWebsiteUrl] = useState(editing?.websiteUrl ?? '')
  const [originCountry, setOriginCountry] = useState(editing?.originCountry ?? '')
  const [isVerified, setIsVerified] = useState(editing?.isVerified ?? false)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (name.trim().length < 2) {
      toast({ title: 'Name too short', description: 'Brand names need at least 2 characters', variant: 'destructive' })
      return
    }
    setSaving(true)
    const payload = {
      name: name.trim(),
      logoUrl: logoUrl.trim() || null,
      description: description.trim() || null,
      websiteUrl: websiteUrl.trim() || null,
      originCountry: originCountry.trim() || null,
      ...(editing ? { isVerified } : {}),
    }
    const res = editing
      ? await apiRequest(`/api/admin/catalog/brands/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
      : await apiRequest('/api/admin/catalog/brands', { method: 'POST', body: JSON.stringify(payload) })
    setSaving(false)
    if (!res.ok) {
      toastApiError(res.error, editing ? 'Could not update the brand' : 'Could not create the brand')
      return
    }
    toast({ title: editing ? 'Brand updated' : 'Brand created', description: name.trim() })
    onOpenChange(false)
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto scrollbar-thin sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${editing.name}` : 'New brand'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Sellers link listings to the brand by name — renaming keeps those links intact.'
              : 'Manufacturers get a directory entry sellers can attach listings to.'}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="br-name">Name *</Label>
                <Input id="br-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Trina Solar" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="br-origin">
                  Origin country <span className="text-xs text-muted-foreground">(opt.)</span>
                </Label>
                <Input id="br-origin" value={originCountry} onChange={(e) => setOriginCountry(e.target.value)} maxLength={60} placeholder="e.g. China" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="br-logo">
                  Logo URL <span className="text-xs text-muted-foreground">(opt.)</span>
                </Label>
                <Input id="br-logo" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} maxLength={2048} className="font-mono text-xs" placeholder="https://…" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="br-website">
                  Website <span className="text-xs text-muted-foreground">(opt.)</span>
                </Label>
                <Input id="br-website" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} maxLength={512} className="font-mono text-xs" placeholder="https://trinasolar.com" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="br-description">
                Description <span className="text-xs text-muted-foreground">(opt.)</span>
              </Label>
              <Input id="br-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} placeholder="What the manufacturer is known for" />
            </div>
            {editing && (
              <div className="flex items-center gap-2 rounded-xl border bg-muted/30 px-4 py-3">
                <Switch id="br-verified" checked={isVerified} onCheckedChange={setIsVerified} />
                <Label htmlFor="br-verified" className="cursor-pointer">
                  Verified brand <span className="text-xs text-muted-foreground">(shows the verification chip on listings)</span>
                </Label>
              </div>
            )}
            <DialogFooter className="gap-2 pt-1">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void save()} disabled={saving} className="min-w-28">
                {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}
                {editing ? <Save size={14} className="mr-1.5" /> : <Plus size={14} className="mr-1.5" />}
                {editing ? 'Save changes' : 'Create brand'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function CatalogBrandsTab() {
  const [brands, setBrands] = useState<BrandRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 300)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<BrandRow | null>(null)
  const [deleting, setDeleting] = useState<BrandRow | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const load = useCallback(async (q = '') => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await apiRequest<{ brands: BrandRow[] }>(`/api/admin/catalog/brands${q ? `?q=${encodeURIComponent(q)}` : ''}`)
      if (!res.ok || !res.data) {
        setLoadError(res.error ?? 'Failed to load brands')
        setBrands([])
      } else {
        setBrands(res.data.brands)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(debouncedSearch.trim())
  }, [load, debouncedSearch])

  const filtered = useMemo(() => brands, [brands])

  const confirmDelete = async () => {
    if (!deleting) return
    setDeleteBusy(true)
    const res = await apiRequest(`/api/admin/catalog/brands/${deleting.id}`, { method: 'DELETE' })
    setDeleteBusy(false)
    if (!res.ok) {
      toastApiError(res.error, 'Could not delete the brand')
      return // keep the dialog open so the 409 reason is right there
    }
    toast({ title: 'Brand deleted', description: deleting.name })
    setDeleting(null)
    void load(debouncedSearch.trim())
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-sm text-muted-foreground">
          The brand directory behind the <span className="font-semibold text-foreground">what it is</span> layer —
          verified brands carry a trust chip on every listing that references them.
        </p>
        <Button
          className="shrink-0 rounded-xl"
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        >
          <Plus size={15} className="mr-1.5" /> New brand
        </Button>
      </div>

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search brands by name…"
        ariaLabel="Search brands"
        className="md:max-w-72"
      />

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-xl" />
          ))}
        </div>
      )}

      {!loading && loadError && (
        <AdminEmptyState icon={ShieldAlert} title="Couldn't load brands" description={loadError}>
          <Button variant="outline" className="rounded-xl" onClick={() => void load(debouncedSearch.trim())}>
            Try again
          </Button>
        </AdminEmptyState>
      )}

      {!loading && !loadError && filtered.length === 0 && (
        <AdminEmptyState
          icon={debouncedSearch.trim() ? SearchX : Tag}
          title={debouncedSearch.trim() ? 'No brands match' : 'No brands yet'}
          description={debouncedSearch.trim() ? 'Try a different search.' : 'Create the first manufacturer directory entry.'}
        />
      )}

      {/* Desktop table */}
      {!loading && !loadError && filtered.length > 0 && (
        <div className="hidden overflow-hidden rounded-2xl border md:block">
          <div className="max-h-96 overflow-y-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-medium">Brand</th>
                  <th scope="col" className="px-4 py-3 font-medium">Origin</th>
                  <th scope="col" className="px-4 py-3 font-medium">Listings</th>
                  <th scope="col" className="px-4 py-3 font-medium">Website</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => (
                  <tr key={b.id} className="border-b transition-colors last:border-0 hover:bg-accent/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xs font-extrabold text-primary">
                          {b.name.slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 font-medium">
                            <span className="truncate">{b.name}</span>
                            {b.isVerified && (
                              <Badge className="rounded-full border-0 bg-emerald-100 px-1.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                <BadgeCheck size={10} className="mr-0.5" /> Verified
                              </Badge>
                            )}
                          </p>
                          <p className="truncate font-mono text-xs text-muted-foreground">{b.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{b.originCountry ?? '—'}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{b.productCount}</td>
                    <td className="px-4 py-3">
                      {b.websiteUrl ? (
                        <a
                          href={b.websiteUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                        >
                          <ExternalLink size={11} /> Website
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-lg"
                          onClick={() => {
                            setEditing(b)
                            setDialogOpen(true)
                          }}
                          aria-label={`Edit ${b.name}`}
                        >
                          <Pencil size={13} className="mr-1" /> Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-lg border-rose-300 text-rose-700 hover:bg-rose-50 hover:text-rose-800 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/50"
                          onClick={() => setDeleting(b)}
                          aria-label={`Delete ${b.name}`}
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
      )}

      {/* Mobile stacked cards */}
      {!loading && !loadError && filtered.length > 0 && (
        <div className="space-y-3 md:hidden">
          {filtered.map((b) => (
            <div key={b.id} className="rounded-2xl border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <span className="truncate">{b.name}</span>
                    {b.isVerified && (
                      <Badge className="rounded-full border-0 bg-emerald-100 px-1.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        <BadgeCheck size={10} className="mr-0.5" /> Verified
                      </Badge>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {b.originCountry ?? '—'} · {b.productCount} listing{b.productCount === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-lg"
                    onClick={() => {
                      setEditing(b)
                      setDialogOpen(true)
                    }}
                    aria-label={`Edit ${b.name}`}
                  >
                    <Pencil size={13} />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-lg border-rose-300 text-rose-700 dark:border-rose-900 dark:text-rose-400"
                    onClick={() => setDeleting(b)}
                    aria-label={`Delete ${b.name}`}
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* key = fresh state every time the dialog opens on a different row */}
      <BrandDialog key={editing?.id ?? 'new'} open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} onSaved={() => void load(debouncedSearch.trim())} />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The directory entry is removed. Brands referenced by listings can&apos;t be deleted — detach those
              listings first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              disabled={deleteBusy}
              onClick={(e) => {
                e.preventDefault() // keep the dialog open until the API answers
                void confirmDelete()
              }}
            >
              {deleteBusy && <Loader2 size={14} className="mr-1.5 animate-spin" />}
              Delete brand
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
