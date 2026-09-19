'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Archive,
  ArrowUpDown,
  Layers,
  ListTree,
  Loader2,
  Pencil,
  Plus,
  Save,
  ShieldAlert,
  Tags,
  Trash2,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import type { CustomerGroupDTO, OrganizationDTO, PriceListDTO } from '@/lib/types'
import { formatDate, formatUSD } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import {
  AdminEmptyState,
  PL_SCOPE_MAP,
  PL_STATUS_MAP,
  ProductPicker,
  StatusBadge,
  apiRequest,
  isoToLocalInput,
  localInputToIso,
  toastApiError,
} from './shared'

/** One editable rung of the quantity-break ladder. */
interface EditableEntry {
  productId: string
  productTitle: string
  image?: string | null
  minQuantity: string
  unitPrice: string
}

export function PriceListsSection() {
  const [createOpen, setCreateOpen] = useState(false)
  const [createSeq, setCreateSeq] = useState(0)
  const [openId, setOpenId] = useState<string | null>(null)
  const [openSeq, setOpenSeq] = useState(0)

  const openCreate = () => {
    setCreateOpen(true)
    setCreateSeq((s) => s + 1)
  }
  const openList = (id: string) => {
    setOpenId(id)
    setOpenSeq((s) => s + 1)
  }

  const { data, loading, error, refetch } = useApi<{ priceLists: PriceListDTO[] }>('/api/admin/price-lists')
  const priceLists = data?.priceLists ?? []

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Contract and group pricing — CONTRACT beats GROUP beats retail at checkout resolution.
        </p>
        <Button className="rounded-xl" onClick={openCreate}>
          <Plus size={15} className="mr-1.5" /> New price list
        </Button>
      </div>

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[74px] w-full rounded-2xl" />
          ))}
        </div>
      )}

      {!loading && error && (
        <AdminEmptyState icon={ShieldAlert} title="Couldn't load price lists" description={error}>
          <Button variant="outline" className="rounded-xl" onClick={() => void refetch()}>
            Try again
          </Button>
        </AdminEmptyState>
      )}

      {!loading && !error && priceLists.length === 0 && (
        <AdminEmptyState
          icon={Tags}
          title="No price lists yet"
          description="Create an organization contract or a customer-group price list with quantity-break ladders."
        >
          <Button className="rounded-xl" onClick={openCreate}>
            <Plus size={15} className="mr-1.5" /> New price list
          </Button>
        </AdminEmptyState>
      )}

      {/* Desktop table */}
      {!loading && !error && priceLists.length > 0 && (
        <div className="hidden overflow-hidden rounded-2xl border md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-medium">Price list</th>
                <th scope="col" className="px-4 py-3 font-medium">Scope</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Priority</th>
                <th scope="col" className="px-4 py-3 font-medium">Entries</th>
                <th scope="col" className="px-4 py-3 font-medium">Window</th>
                <th scope="col" className="px-4 py-3 text-right font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {priceLists.map((pl) => (
                <tr key={pl.id} className="border-b transition-colors last:border-0 hover:bg-accent/50">
                  <td className="px-4 py-3.5">
                    <p className="font-semibold">{pl.name}</p>
                    <p className="max-w-md truncate text-xs text-muted-foreground">
                      {pl.description || pl.organizationName || pl.customerGroupName || '—'}
                    </p>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex flex-col items-start gap-1">
                      <StatusBadge status={pl.scope} map={PL_SCOPE_MAP} />
                      <span className="max-w-[160px] truncate text-xs text-muted-foreground">
                        {pl.scope === 'ORG'
                          ? pl.organizationName ?? '—'
                          : pl.scope === 'GROUP'
                            ? pl.customerGroupName ?? '—'
                            : '—'}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusBadge status={pl.status} map={PL_STATUS_MAP} />
                  </td>
                  <td className="px-4 py-3.5 tabular-nums text-muted-foreground">{pl.priority}</td>
                  <td className="px-4 py-3.5 tabular-nums text-muted-foreground">{pl.entryCount ?? 0}</td>
                  <td className="px-4 py-3.5 text-xs text-muted-foreground">
                    {pl.startsAt || pl.endsAt ? (
                      <span className="whitespace-nowrap">
                        {pl.startsAt ? formatDate(pl.startsAt) : '—'} → {pl.endsAt ? formatDate(pl.endsAt) : '∞'}
                      </span>
                    ) : (
                      'always'
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-lg"
                      onClick={() => openList(pl.id)}
                      aria-label={`Open ${pl.name}`}
                    >
                      <Pencil size={13} className="mr-1.5" /> Manage
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile stacked cards */}
      {!loading && !error && priceLists.length > 0 && (
        <div className="space-y-3 md:hidden">
          {priceLists.map((pl) => (
            <Card key={pl.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{pl.name}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <StatusBadge status={pl.scope} map={PL_SCOPE_MAP} />
                      <span className="truncate">
                        {pl.scope === 'ORG' ? pl.organizationName : pl.customerGroupName}
                      </span>
                    </p>
                  </div>
                  <StatusBadge status={pl.status} map={PL_STATUS_MAP} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>
                    {pl.entryCount ?? 0} entries · priority {pl.priority}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-lg"
                    onClick={() => openList(pl.id)}
                    aria-label={`Open ${pl.name}`}
                  >
                    Manage
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreatePriceListDialog
        open={createOpen}
        seq={createSeq}
        onClose={() => setCreateOpen(false)}
        onCreated={() => { setCreateOpen(false); void refetch() }}
      />
      <PriceListDetailDialog
        listId={openId}
        seq={openSeq}
        onClose={() => setOpenId(null)}
        onChanged={() => void refetch()}
      />
    </div>
  )
}

// ── Create dialog ────────────────────────────────────────────────────────────

function CreatePriceListDialog({
  open,
  seq,
  onClose,
  onCreated,
}: {
  open: boolean
  seq: number
  onClose: () => void
  onCreated: () => void
}) {
  const { data: orgsData } = useApi<{ organizations: OrganizationDTO[] }>(open ? '/api/admin/organizations' : null, { skip: !open })
  const { data: groupsData } = useApi<{ groups: CustomerGroupDTO[] }>(open ? '/api/admin/customer-groups' : null, { skip: !open })

  const [form, setForm] = useState({
    name: '',
    description: '',
    scope: 'GROUP' as 'ORG' | 'GROUP',
    organizationId: '',
    customerGroupId: '',
    priority: '10',
    status: 'ACTIVE' as 'ACTIVE' | 'DRAFT',
    startsAt: '',
    endsAt: '',
  })
  const [saving, setSaving] = useState(false)
  // Fresh form every time the dialog opens (keyed by the open sequence)
  const [initializedFor, setInitializedFor] = useState(-1)
  if (open && initializedFor !== seq) {
    setInitializedFor(seq)
    setForm({
      name: '',
      description: '',
      scope: 'GROUP',
      organizationId: '',
      customerGroupId: '',
      priority: '10',
      status: 'ACTIVE',
      startsAt: '',
      endsAt: '',
    })
  }

  const orgs = orgsData?.organizations ?? []
  const groups = groupsData?.groups ?? []
  const targetMissing = form.scope === 'ORG' ? !form.organizationId : !form.customerGroupId

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (targetMissing) {
      toast({
        title: 'Pick a target',
        description: form.scope === 'ORG' ? 'Choose the organization this contract applies to.' : 'Choose the customer group this price list applies to.',
        variant: 'destructive',
      })
      return
    }
    setSaving(true)
    const res = await apiRequest<{ priceList: PriceListDTO }>('/api/admin/price-lists', {
      method: 'POST',
      body: JSON.stringify({
        name: form.name.trim(),
        description: form.description.trim() || null,
        scope: form.scope,
        organizationId: form.scope === 'ORG' ? form.organizationId : null,
        customerGroupId: form.scope === 'GROUP' ? form.customerGroupId : null,
        priority: Number(form.priority) || 0,
        status: form.status,
        startsAt: localInputToIso(form.startsAt),
        endsAt: localInputToIso(form.endsAt),
      }),
    })
    setSaving(false)
    if (!res.ok) {
      toastApiError(res.error, 'Could not create price list')
      return
    }
    toast({
      title: 'Price list created',
      description: `${res.data?.priceList.name} — add entries from the manage dialog.`,
    })
    onCreated()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New price list</DialogTitle>
          <DialogDescription>
            Contract (one organization) or group pricing (every member of a customer group).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pl-name">Name</Label>
            <Input
              id="pl-name"
              required
              minLength={2}
              maxLength={120}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Wholesale Tier 1 — Contract Pricing"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pl-desc">Description (optional)</Label>
            <Input
              id="pl-desc"
              maxLength={2000}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Internal summary of the negotiated deal"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Scope</Label>
              <Select
                value={form.scope}
                onValueChange={(v) => setForm((f) => ({ ...f, scope: v as 'ORG' | 'GROUP' }))}
              >
                <SelectTrigger aria-label="Price list scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GROUP">Customer group</SelectItem>
                  <SelectItem value="ORG">Organization contract</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Input
                type="number"
                min={0}
                max={1000}
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                aria-label="Resolution priority, higher wins within a scope"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{form.scope === 'ORG' ? 'Target organization' : 'Target customer group'}</Label>
            {form.scope === 'ORG' ? (
              <Select
                value={form.organizationId}
                onValueChange={(v) => setForm((f) => ({ ...f, organizationId: v }))}
              >
                <SelectTrigger aria-label="Target organization">
                  <SelectValue placeholder={orgs.length === 0 ? 'No organizations yet…' : 'Choose an organization…'} />
                </SelectTrigger>
                <SelectContent>
                  {orgs.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name} ({o.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Select
                value={form.customerGroupId}
                onValueChange={(v) => setForm((f) => ({ ...f, customerGroupId: v }))}
              >
                <SelectTrigger aria-label="Target customer group">
                  <SelectValue placeholder={groups.length === 0 ? 'No groups yet…' : 'Choose a group…'} />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name} (priority {g.priority})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Initial status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm((f) => ({ ...f, status: v as 'ACTIVE' | 'DRAFT' }))}
              >
                <SelectTrigger aria-label="Initial status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active — applies immediately</SelectItem>
                  <SelectItem value="DRAFT">Draft — not yet applied</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pl-starts">Valid from (optional)</Label>
              <Input
                id="pl-starts"
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
                aria-label="Valid from"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pl-ends">Valid until (optional)</Label>
              <Input
                id="pl-ends"
                type="datetime-local"
                value={form.endsAt}
                onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
                aria-label="Valid until"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" className="rounded-xl" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="rounded-xl" disabled={saving}>
              {saving && <Loader2 size={15} className="mr-1.5 animate-spin" />}
              Create price list
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Detail / manage dialog with ladder editor ────────────────────────────────

function PriceListDetailDialog({
  listId,
  seq,
  onClose,
  onChanged,
}: {
  listId: string | null
  seq: number
  onClose: () => void
  onChanged: () => void
}) {
  const { data, loading, refetch } = useApi<{ priceList: PriceListDTO }>(
    listId ? `/api/admin/price-lists/${listId}` : null,
    { skip: !listId }
  )
  const pl = data?.priceList

  const [settings, setSettings] = useState({
    name: '',
    description: '',
    priority: '0',
    status: 'DRAFT' as 'ACTIVE' | 'DRAFT' | 'ARCHIVED',
    startsAt: '',
    endsAt: '',
  })
  const [entries, setEntries] = useState<EditableEntry[]>([])
  const [saving, setSaving] = useState<string | null>(null)

  // Re-initialize on every open (seq) and every fresh detail fetch (object identity)
  const [initializedFor, setInitializedFor] = useState<{ seq: number; pl: PriceListDTO } | null>(null)
  if (pl && (!initializedFor || initializedFor.seq !== seq || initializedFor.pl !== pl)) {
    setInitializedFor({ seq, pl })
    setSettings({
      name: pl.name,
      description: pl.description ?? '',
      priority: String(pl.priority),
      status: pl.status,
      startsAt: isoToLocalInput(pl.startsAt),
      endsAt: isoToLocalInput(pl.endsAt),
    })
    setEntries(
      (pl.entries ?? []).map((e) => ({
        productId: e.productId,
        productTitle: e.productTitle ?? 'Product',
        image: null,
        minQuantity: String(e.minQuantity),
        unitPrice: String(e.unitPrice),
      }))
    )
  }

  // Duplicate product+minQty detection (server rejects these too)
  const duplicates = useMemo(() => {
    const seen = new Set<string>()
    const dupes = new Set<number>()
    entries.forEach((e, i) => {
      const key = `${e.productId}|${Number(e.minQuantity)}`
      if (seen.has(key)) dupes.add(i)
      else seen.add(key)
    })
    return dupes
  }, [entries])

  if (!listId) return null
  const open = !!listId
  const busy = saving !== null

  const addProduct = (p: { id: string; title: string; price: number; image?: string | null }) => {
    setEntries((prev) => [
      ...prev,
      {
        productId: p.id,
        productTitle: p.title,
        image: p.image ?? null,
        minQuantity: '1',
        unitPrice: p.price.toFixed(2),
      },
    ])
  }

  const saveSettings = async () => {
    setSaving('settings')
    const res = await apiRequest(`/api/admin/price-lists/${listId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: settings.name.trim(),
        description: settings.description.trim() || null,
        priority: Number(settings.priority) || 0,
        status: settings.status,
        startsAt: localInputToIso(settings.startsAt),
        endsAt: localInputToIso(settings.endsAt),
      }),
    })
    setSaving(null)
    if (!res.ok) {
      toastApiError(res.error, 'Save failed')
      return
    }
    toast({ title: 'Price list updated' })
    void refetch()
    onChanged()
  }

  const saveEntries = async () => {
    if (duplicates.size > 0) {
      toast({
        title: 'Duplicate quantity breaks',
        description: 'Each product needs unique minimum quantities (e.g. qty 1 and qty 10, not two qty 5 rows).',
        variant: 'destructive',
      })
      return
    }
    const payload = entries.map((e) => ({
      productId: e.productId,
      minQuantity: Math.max(1, Math.floor(Number(e.minQuantity) || 1)),
      unitPrice: Math.max(0, Number(e.unitPrice) || 0),
    }))
    if (payload.some((p) => p.minQuantity < 1 || Number.isNaN(p.unitPrice))) {
      toast({ title: 'Check the ladder', description: 'Minimum quantity must be ≥ 1 and unit price a valid number.', variant: 'destructive' })
      return
    }
    setSaving('entries')
    const res = await apiRequest(`/api/admin/price-lists/${listId}/entries`, {
      method: 'PUT',
      body: JSON.stringify({ entries: payload }),
    })
    setSaving(null)
    if (!res.ok) {
      toastApiError(res.error, 'Could not save the ladder')
      return
    }
    toast({ title: 'Ladder saved', description: `${payload.length} entr${payload.length === 1 ? 'y' : 'ies'} replaced on the server.` })
    void refetch()
    onChanged()
  }

  const archive = async () => {
    setSaving('archive')
    const res = await apiRequest(`/api/admin/price-lists/${listId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'ARCHIVED' }),
    })
    setSaving(null)
    if (!res.ok) {
      toastApiError(res.error, 'Archive failed')
      return
    }
    toast({ title: 'Price list archived', description: 'It no longer applies at checkout resolution.' })
    void refetch()
    onChanged()
  }

  const remove = async () => {
    setSaving('delete')
    const res = await apiRequest(`/api/admin/price-lists/${listId}`, { method: 'DELETE' })
    setSaving(null)
    if (!res.ok) {
      toastApiError(res.error, 'Delete failed')
      return
    }
    toast({ title: 'Price list deleted' })
    onClose()
    onChanged()
  }

  const sortedEntries = [...entries]
    .map((e, i) => ({ e, i }))
    .sort((a, b) =>
      a.e.productTitle.localeCompare(b.e.productTitle) || Number(a.e.minQuantity) - Number(b.e.minQuantity)
    )

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        {loading || !pl ? (
          <div className="space-y-4 py-2">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2 pr-6 leading-tight">
                {pl.name} <StatusBadge status={pl.status} map={PL_STATUS_MAP} />
              </DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-1.5">
                <StatusBadge status={pl.scope} map={PL_SCOPE_MAP} />
                <span>
                  {pl.scope === 'ORG'
                    ? `Contract for ${pl.organizationName ?? 'unknown org'}`
                    : pl.scope === 'GROUP'
                      ? `Applies to customer group ${pl.customerGroupName ?? 'unknown'}`
                      : 'Channel pricing'}
                </span>
              </DialogDescription>
            </DialogHeader>

            {/* Settings */}
            <section aria-label="Price list settings" className="space-y-3 rounded-xl border p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="pld-name">Name</Label>
                  <Input
                    id="pld-name"
                    value={settings.name}
                    onChange={(e) => setSettings((s) => ({ ...s, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pld-priority">Priority</Label>
                  <Input
                    id="pld-priority"
                    type="number"
                    min={0}
                    max={1000}
                    value={settings.priority}
                    onChange={(e) => setSettings((s) => ({ ...s, priority: e.target.value }))}
                    aria-label="Resolution priority"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pld-desc">Description</Label>
                <Textarea
                  id="pld-desc"
                  rows={2}
                  className="resize-none"
                  value={settings.description}
                  onChange={(e) => setSettings((s) => ({ ...s, description: e.target.value }))}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select
                    value={settings.status}
                    onValueChange={(v) => setSettings((s) => ({ ...s, status: v as 'ACTIVE' | 'DRAFT' | 'ARCHIVED' }))}
                  >
                    <SelectTrigger aria-label="Price list status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="DRAFT">Draft</SelectItem>
                      <SelectItem value="ARCHIVED">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pld-starts">Valid from</Label>
                  <Input
                    id="pld-starts"
                    type="datetime-local"
                    value={settings.startsAt}
                    onChange={(e) => setSettings((s) => ({ ...s, startsAt: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pld-ends">Valid until</Label>
                  <Input
                    id="pld-ends"
                    type="datetime-local"
                    value={settings.endsAt}
                    onChange={(e) => setSettings((s) => ({ ...s, endsAt: e.target.value }))}
                  />
                </div>
              </div>
              <Button size="sm" className="rounded-xl" onClick={() => void saveSettings()} disabled={busy}>
                {saving === 'settings' ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Save size={14} className="mr-1.5" />}
                Save settings
              </Button>
            </section>

            {/* Ladder editor */}
            <section aria-label="Quantity break ladder" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                  <ListTree size={14} className="text-primary" /> Quantity-break ladder
                </h3>
                <span className="text-xs text-muted-foreground">
                  {entries.length} {entries.length === 1 ? 'entry' : 'entries'} · e.g. qty ≥ 1 → full, qty ≥ 10 → bulk
                </span>
              </div>

              <ProductPicker onPick={addProduct} label="Search products to add to the ladder" />

              {entries.length === 0 ? (
                <p className="rounded-xl border border-dashed px-4 py-6 text-center text-xs text-muted-foreground">
                  No entries yet — search for a product above to start building the ladder.
                </p>
              ) : (
                <div className="space-y-2">
                  {sortedEntries.map(({ e, i }) => (
                    <div
                      key={`${e.productId}-${i}`}
                      className={cn(
                        'rounded-xl border p-2.5 transition-colors',
                        duplicates.has(i) ? 'border-destructive/60 bg-destructive/5' : 'hover:bg-accent/40'
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg border bg-muted">
                          {e.image ? (
                            <img src={e.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                          ) : (
                            <Layers size={15} className="m-auto block text-muted-foreground" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{e.productTitle}</p>
                          <p className="text-[11px] text-muted-foreground">
                            qty ≥ {e.minQuantity} → {formatUSD(Number(e.unitPrice) || 0)} / unit
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 rounded-lg p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => setEntries((prev) => prev.filter((_, idx) => idx !== i))}
                          aria-label={`Remove ${e.productTitle} quantity ${e.minQuantity} break`}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 pl-[46px]">
                        <div className="flex items-center gap-1.5">
                          <ArrowUpDown size={12} className="shrink-0 text-muted-foreground" />
                          <Input
                            type="number"
                            min={1}
                            step={1}
                            value={e.minQuantity}
                            onChange={(ev) =>
                              setEntries((prev) => prev.map((x, idx) => (idx === i ? { ...x, minQuantity: ev.target.value } : x)))
                            }
                            className="h-8 rounded-lg text-sm"
                            aria-label={`Minimum quantity for ${e.productTitle}`}
                          />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">$/unit</span>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={e.unitPrice}
                            onChange={(ev) =>
                              setEntries((prev) => prev.map((x, idx) => (idx === i ? { ...x, unitPrice: ev.target.value } : x)))
                            }
                            className="h-8 rounded-lg text-sm"
                            aria-label={`Unit price for ${e.productTitle} at quantity ${e.minQuantity}`}
                          />
                        </div>
                      </div>
                      {duplicates.has(i) && (
                        <p className="mt-1.5 pl-[46px] text-[11px] font-medium text-destructive">
                          Duplicate — this product already has a break at qty ≥ {e.minQuantity}.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" className="rounded-xl" onClick={() => void saveEntries()} disabled={busy || entries.length === 0}>
                  {saving === 'entries' ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Save size={14} className="mr-1.5" />}
                  Save ladder ({entries.length})
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  Saving replaces all entries — the full ladder is sent to the server.
                </p>
              </div>
            </section>

            {/* Danger zone */}
            <section aria-label="Danger zone" className="space-y-2 rounded-xl border border-dashed p-4">
              <div className="flex flex-wrap items-center gap-2">
                {pl.status !== 'ARCHIVED' ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="rounded-xl" disabled={busy}>
                        {saving === 'archive' ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Archive size={14} className="mr-1.5" />}
                        Archive list
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Archive “{pl.name}”?</AlertDialogTitle>
                        <AlertDialogDescription>
                          The list and its entries are kept, but it stops applying when prices resolve at checkout. You can flip it back to Active any time.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => void archive()}>Archive</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    disabled={busy}
                    onClick={() => {
                      setSettings((s) => ({ ...s, status: 'ACTIVE' }))
                      toast({ title: 'Switch status to Active, then press “Save settings”' })
                    }}
                  >
                    <Archive size={14} className="mr-1.5 rotate-180" /> Unarchive (set Active)
                  </Button>
                )}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" className="rounded-xl" disabled={busy}>
                      {saving === 'delete' ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Trash2 size={14} className="mr-1.5" />}
                      Delete list
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete “{pl.name}”?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This permanently removes the price list and every quantity break in it. Buyers instantly fall back to their next-best price source.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => void remove()}
                      >
                        Delete permanently
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </section>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
