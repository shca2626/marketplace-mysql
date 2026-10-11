'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN CONSOLE → CATALOG UNITS OF MEASURE (Phase 4).
// The compact unit dictionary referenced by spec attributes (e.g. "W", "V",
// "Ah"). Deleting is a soft-deactivate — spec attributes keep their labels.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Pencil, Plus, Ruler, Save, ShieldAlert } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { AdminEmptyState, apiRequest, toastApiError } from '../shared'

const DIMENSIONS = ['POWER', 'VOLTAGE', 'CURRENT', 'WEIGHT', 'LENGTH', 'AREA', 'VOLUME', 'COUNT', 'TIME', 'OTHER'] as const
type Dimension = (typeof DIMENSIONS)[number]

const DIMENSION_CHIP: Record<string, string> = {
  POWER: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  VOLTAGE: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  CURRENT: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300',
  WEIGHT: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300',
  LENGTH: 'bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-300',
  AREA: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  VOLUME: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300',
  COUNT: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  TIME: 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-300',
  OTHER: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
}

interface UnitRow {
  id: string
  code: string
  label: string
  dimension: string
  isActive: boolean
  sortOrder: number
}

function UnitDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editing: UnitRow | null
  onSaved: () => void
}) {
  const [code, setCode] = useState(editing?.code ?? '')
  const [label, setLabel] = useState(editing?.label ?? '')
  const [dimension, setDimension] = useState<Dimension>((editing?.dimension as Dimension) ?? 'OTHER')
  const [sortOrder, setSortOrder] = useState(String(editing?.sortOrder ?? 0))
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const order = parseInt(sortOrder || '0', 10)
    if (Number.isNaN(order) || order < 0 || order > 9999) {
      toast({ title: 'Invalid sort order', description: 'Sort order must be a number between 0 and 9999', variant: 'destructive' })
      return
    }
    setSaving(true)
    const res = editing
      ? await apiRequest(`/api/admin/catalog/units/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ label: label.trim(), dimension, sortOrder: order }),
        })
      : await apiRequest('/api/admin/catalog/units', {
          method: 'POST',
          body: JSON.stringify({ code: code.trim(), label: label.trim(), dimension }),
        })
    setSaving(false)
    if (!res.ok) {
      toastApiError(res.error, editing ? 'Could not update the unit' : 'Could not create the unit')
      return
    }
    toast({ title: editing ? 'Unit updated' : 'Unit created', description: `${label.trim()} (${editing ? editing.code : code.trim()})` })
    onOpenChange(false)
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${editing.code}` : 'New unit'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'The code is the stable key — only the label, dimension and order change.'
              : 'Codes are lowercased slugs (letters, digits, % and /) — e.g. “w”, “v”, “ah”.'}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="un-code">Code *</Label>
                <Input
                  id="un-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toLowerCase())}
                  maxLength={10}
                  disabled={!!editing}
                  className="font-mono"
                  placeholder="w"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="un-label">Label *</Label>
                <Input id="un-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} placeholder="Watt" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="un-dimension">Dimension</Label>
                <Select value={dimension} onValueChange={(v) => setDimension(v as Dimension)}>
                  <SelectTrigger id="un-dimension" aria-label="Dimension">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DIMENSIONS.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d.charAt(0) + d.slice(1).toLowerCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="un-order">Sort order</Label>
                <Input id="un-order" type="number" min="0" max="9999" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
              </div>
            </div>
            <DialogFooter className="gap-2 pt-1">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void save()} disabled={saving} className="min-w-28">
                {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}
                {editing ? <Save size={14} className="mr-1.5" /> : <Plus size={14} className="mr-1.5" />}
                {editing ? 'Save changes' : 'Create unit'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function CatalogUnitsTab() {
  const [units, setUnits] = useState<UnitRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<UnitRow | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await apiRequest<{ units: UnitRow[] }>('/api/admin/catalog/units')
      if (!res.ok || !res.data) {
        setLoadError(res.error ?? 'Failed to load units')
        setUnits([])
      } else {
        setUnits(res.data.units)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const toggleActive = async (unit: UnitRow, next: boolean) => {
    setTogglingId(unit.id)
    const res = await apiRequest(`/api/admin/catalog/units/${unit.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: next }),
    })
    setTogglingId(null)
    if (!res.ok) {
      toastApiError(res.error, 'Could not update the unit')
      return
    }
    setUnits((list) => list.map((u) => (u.id === unit.id ? { ...u, isActive: next } : u)))
    toast({ title: next ? 'Unit activated' : 'Unit deactivated', description: `${unit.label} (${unit.code})` })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-sm text-muted-foreground">
          The unit dictionary spec attributes reference —{' '}
          <span className="font-mono text-xs text-foreground">w</span>,{' '}
          <span className="font-mono text-xs text-foreground">v</span>,{' '}
          <span className="font-mono text-xs text-foreground">ah</span>… Deactivating hides a unit from new
          attributes; saved specs keep their labels.
        </p>
        <Button
          className="shrink-0 rounded-xl"
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        >
          <Plus size={15} className="mr-1.5" /> New unit
        </Button>
      </div>

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
      )}

      {!loading && loadError && (
        <AdminEmptyState icon={ShieldAlert} title="Couldn't load units" description={loadError}>
          <Button variant="outline" className="rounded-xl" onClick={() => void load()}>
            Try again
          </Button>
        </AdminEmptyState>
      )}

      {!loading && !loadError && units.length === 0 && (
        <AdminEmptyState icon={Ruler} title="No units yet" description="Add the first unit of measure for spec attributes." />
      )}

      {!loading && !loadError && units.length > 0 && (
        <div className="overflow-hidden rounded-2xl border">
          <div className="max-h-96 overflow-y-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-2.5 font-medium">Code</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Label</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Dimension</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Order</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Active</th>
                </tr>
              </thead>
              <tbody>
                {units.map((u) => (
                  <tr key={u.id} className={cn('border-b transition-colors last:border-0 hover:bg-accent/50', !u.isActive && 'opacity-55')}>
                    <td className="px-4 py-2.5 font-mono text-xs">{u.code}</td>
                    <td className="px-4 py-2.5">{u.label}</td>
                    <td className="px-4 py-2.5">
                      <Badge className={cn('rounded-full border-0 text-[11px] font-semibold', DIMENSION_CHIP[u.dimension] ?? 'bg-muted text-muted-foreground')}>
                        {u.dimension.charAt(0) + u.dimension.slice(1).toLowerCase()}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{u.sortOrder}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 rounded-lg px-2 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setEditing(u)
                            setDialogOpen(true)
                          }}
                          aria-label={`Edit ${u.code}`}
                        >
                          <Pencil size={12} /> Edit
                        </Button>
                        {togglingId === u.id ? (
                          <Loader2 size={14} className="animate-spin text-muted-foreground" />
                        ) : (
                          <Switch checked={u.isActive} onCheckedChange={(v) => void toggleActive(u, v)} aria-label={`Toggle ${u.code} active`} />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* key = fresh state every time the dialog opens on a different row */}
      <UnitDialog key={editing?.id ?? 'new'} open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} onSaved={() => void load()} />
    </div>
  )
}
