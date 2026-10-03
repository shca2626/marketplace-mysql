'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN CONSOLE → CATALOG ORG TYPES (Phase 4).
// The four organization types (COMPANY / BANK / MFI / EWALLET) seeded from the
// enum keys. Keys map to system behavior — admins manage the labels,
// descriptions, icons and ordering users actually see.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react'
import { Building, Loader2, Pencil, Save, ShieldAlert } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { Badge } from '@/components/ui/badge'
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
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { AdminEmptyState, apiRequest, toastApiError } from '../shared'

interface OrgTypeRow {
  id: string
  key: string
  name: string
  description: string | null
  icon: string | null
  isActive: boolean
  sortOrder: number
}

function OrgTypeDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editing: OrgTypeRow | null
  onSaved: () => void
}) {
  const [name, setName] = useState(editing?.name ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [icon, setIcon] = useState(editing?.icon ?? '')
  const [isActive, setIsActive] = useState(editing?.isActive ?? true)
  const [sortOrder, setSortOrder] = useState(String(editing?.sortOrder ?? 0))
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (name.trim().length < 2) {
      toast({ title: 'Name too short', description: 'Labels need at least 2 characters', variant: 'destructive' })
      return
    }
    const order = parseInt(sortOrder || '0', 10)
    if (Number.isNaN(order) || order < 0 || order > 9999) {
      toast({ title: 'Invalid sort order', description: 'Sort order must be a number between 0 and 9999', variant: 'destructive' })
      return
    }
    setSaving(true)
    const res = await apiRequest(`/api/admin/catalog/org-types/${editing?.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: name.trim(),
        description: description.trim() || null,
        icon: icon.trim() || null,
        isActive,
        sortOrder: order,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      toastApiError(res.error, 'Could not update the organization type')
      return
    }
    toast({ title: 'Organization type updated', description: name.trim() })
    onOpenChange(false)
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto scrollbar-thin sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Edit {editing?.key ? editing.key.charAt(0) + editing.key.slice(1).toLowerCase() : 'type'}
          </DialogTitle>
          <DialogDescription>
            The key <span className="font-mono text-xs">{editing?.key}</span> is code-defined and locked — you are
            editing what users see.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ot-name">Label *</Label>
                <Input id="ot-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Company / Merchant" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ot-icon">
                  Icon <span className="text-xs text-muted-foreground">(Lucide name)</span>
                </Label>
                <Input id="ot-icon" value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={40} className="font-mono text-xs" placeholder="Building2" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ot-description">Description</Label>
              <Textarea id="ot-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={2000} placeholder="What this organization type means on Vendora…" />
            </div>
            <div className="flex flex-wrap items-center gap-6 rounded-xl border bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-2">
                <Switch id="ot-active" checked={isActive} onCheckedChange={setIsActive} />
                <Label htmlFor="ot-active" className="cursor-pointer">
                  Active <span className="text-xs text-muted-foreground">(selectable at registration)</span>
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="ot-order">
                  Sort order
                </Label>
                <Input id="ot-order" type="number" min="0" max="9999" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="h-9 w-24" />
              </div>
            </div>
            <DialogFooter className="gap-2 pt-1">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void save()} disabled={saving} className="min-w-28">
                {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}
                <Save size={14} className="mr-1.5" /> Save changes
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function CatalogOrgTypesTab() {
  const [orgTypes, setOrgTypes] = useState<OrgTypeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editing, setEditing] = useState<OrgTypeRow | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await apiRequest<{ orgTypes: OrgTypeRow[] }>('/api/admin/catalog/org-types')
      if (!res.ok || !res.data) {
        setLoadError(res.error ?? 'Failed to load organization types')
        setOrgTypes([])
      } else {
        setOrgTypes(res.data.orgTypes)
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
      <p className="max-w-2xl text-sm text-muted-foreground">
        Keys map to system behavior; labels and descriptions are what users see. The four types are fixed by the
        platform enum — everything here is presentation.
      </p>

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {!loading && loadError && (
        <AdminEmptyState icon={ShieldAlert} title="Couldn't load organization types" description={loadError}>
          <Button variant="outline" className="rounded-xl" onClick={() => void load()}>
            Try again
          </Button>
        </AdminEmptyState>
      )}

      {!loading && !loadError && orgTypes.length === 0 && (
        <AdminEmptyState icon={Building} title="No organization types" description="The four system types seed automatically on first load." />
      )}

      {!loading && !loadError && orgTypes.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {orgTypes.map((t) => (
            <div key={t.id} className="flex flex-col rounded-2xl border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold">{t.name}</span>
                    {!t.isActive && (
                      <Badge className="rounded-full border-0 bg-neutral-200 text-[10px] font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                        Hidden
                      </Badge>
                    )}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">{t.key}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 rounded-lg"
                  onClick={() => {
                    setEditing(t)
                    setDialogOpen(true)
                  }}
                  aria-label={`Edit ${t.name}`}
                >
                  <Pencil size={13} className="mr-1" /> Edit
                </Button>
              </div>
              <p className="mt-2 min-h-10 flex-1 text-xs leading-relaxed text-muted-foreground">
                {t.description ?? 'No description yet.'}
              </p>
              <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
                <span>
                  {t.icon ? <span className="font-mono">{t.icon}</span> : 'no icon'} · order {t.sortOrder}
                </span>
                <span className={t.isActive ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}>
                  {t.isActive ? 'Selectable' : 'Hidden from registration'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* key = fresh state every time the dialog opens on a different row */}
      <OrgTypeDialog key={editing?.id ?? 'new'} open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} onSaved={() => void load()} />
    </div>
  )
}
