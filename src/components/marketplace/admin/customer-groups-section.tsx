'use client'

import { useState } from 'react'
import {
  Loader2,
  Pencil,
  Plus,
  Save,
  ShieldAlert,
  Tags,
  Trash2,
  Users,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import type { CustomerGroupDTO } from '@/lib/types'
import { formatDate } from '@/lib/format'
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
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
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
import { AdminEmptyState, apiRequest, toastApiError } from './shared'

export function CustomerGroupsSection() {
  const { data, loading, error, refetch } = useApi<{ groups: CustomerGroupDTO[] }>('/api/admin/customer-groups')
  const groups = data?.groups ?? []
  const [createOpen, setCreateOpen] = useState(false)
  const [createSeq, setCreateSeq] = useState(0)
  const [editId, setEditId] = useState<string | null>(null)
  const [editSeq, setEditSeq] = useState(0)

  const openCreate = () => {
    setCreateOpen(true)
    setCreateSeq((s) => s + 1)
  }
  const openEdit = (id: string) => {
    setEditId(id)
    setEditSeq((s) => s + 1)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Segments buyers into pricing tiers — organizations map to groups, groups carry price lists.
        </p>
        <Button className="rounded-xl" onClick={openCreate}>
          <Plus size={15} className="mr-1.5" /> New group
        </Button>
      </div>

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-[74px] w-full rounded-2xl" />
          ))}
        </div>
      )}

      {!loading && error && (
        <AdminEmptyState icon={ShieldAlert} title="Couldn't load customer groups" description={error}>
          <Button variant="outline" className="rounded-xl" onClick={() => void refetch()}>
            Try again
          </Button>
        </AdminEmptyState>
      )}

      {!loading && !error && groups.length === 0 && (
        <AdminEmptyState
          icon={Tags}
          title="No customer groups yet"
          description="Create your first segment — e.g. “Wholesale Tier 1” — then attach group-scoped price lists to it."
        >
          <Button className="rounded-xl" onClick={openCreate}>
            <Plus size={15} className="mr-1.5" /> New group
          </Button>
        </AdminEmptyState>
      )}

      {/* Desktop table */}
      {!loading && !error && groups.length > 0 && (
        <div className="hidden overflow-hidden rounded-2xl border md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-medium">Group</th>
                <th scope="col" className="px-4 py-3 font-medium">Priority</th>
                <th scope="col" className="px-4 py-3 font-medium">Members</th>
                <th scope="col" className="px-4 py-3 font-medium">Orgs</th>
                <th scope="col" className="px-4 py-3 font-medium">Price lists</th>
                <th scope="col" className="px-4 py-3 text-right font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id} className="border-b transition-colors last:border-0 hover:bg-accent/50">
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Users size={14} />
                      </span>
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 font-semibold">
                          {g.name}
                          {g.isDefault && (
                            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                              DEFAULT
                            </span>
                          )}
                        </p>
                        <p className="max-w-sm truncate text-xs text-muted-foreground">
                          /{g.key}
                          {g.description ? ` · ${g.description}` : ''}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 tabular-nums text-muted-foreground">{g.priority}</td>
                  <td className="px-4 py-3.5 tabular-nums text-muted-foreground">{g._count?.users ?? 0}</td>
                  <td className="px-4 py-3.5 tabular-nums text-muted-foreground">{g._count?.organizations ?? 0}</td>
                  <td className="px-4 py-3.5 tabular-nums text-muted-foreground">{g._count?.priceLists ?? 0}</td>
                  <td className="px-4 py-3.5 text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-lg"
                        onClick={() => openEdit(g.id)}
                        aria-label={`Edit group ${g.name}`}
                      >
                        <Pencil size={13} className="mr-1.5" /> Edit
                      </Button>
                      <GroupDeleteButton group={g} onDeleted={() => void refetch()} compact />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile stacked cards */}
      {!loading && !error && groups.length > 0 && (
        <div className="space-y-3 md:hidden">
          {groups.map((g) => (
            <Card key={g.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5 font-semibold">
                      {g.name}
                      {g.isDefault && (
                        <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                          DEFAULT
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">/{g.key} · priority {g.priority}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {g._count?.organizations ?? 0} orgs · {g._count?.priceLists ?? 0} price lists
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-lg"
                      onClick={() => openEdit(g.id)}
                      aria-label={`Edit group ${g.name}`}
                    >
                      Edit
                    </Button>
                    <GroupDeleteButton group={g} onDeleted={() => void refetch()} compact />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <GroupFormDialog
        open={createOpen}
        seq={createSeq}
        mode="create"
        onClose={() => setCreateOpen(false)}
        onSaved={() => {
          setCreateOpen(false)
          void refetch()
        }}
      />
      <GroupFormDialog
        open={!!editId}
        seq={editSeq}
        mode="edit"
        group={groups.find((g) => g.id === editId) ?? null}
        onClose={() => setEditId(null)}
        onSaved={() => {
          setEditId(null)
          void refetch()
        }}
      />
    </div>
  )
}

// ── Delete (with API guard errors surfaced as toasts) ─────────────────────────

function GroupDeleteButton({
  group,
  onDeleted,
  compact,
}: {
  group: CustomerGroupDTO
  onDeleted: () => void
  compact?: boolean
}) {
  const [deleting, setDeleting] = useState(false)

  const doDelete = async () => {
    setDeleting(true)
    const res = await apiRequest(`/api/admin/customer-groups/${group.id}`, { method: 'DELETE' })
    setDeleting(false)
    if (!res.ok) {
      // API guard rails (default group / referenced by price lists) land here
      toastApiError(res.error, `Can't delete ${group.name}`)
      return
    }
    toast({ title: 'Group deleted', description: `${group.name} has been removed.` })
    onDeleted()
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`h-8 rounded-lg text-destructive hover:text-destructive ${compact ? '' : 'w-full'}`}
          disabled={deleting}
          aria-label={`Delete group ${group.name}`}
        >
          {deleting ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Trash2 size={13} className="mr-1.5" />}
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{group.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            The group and its {group._count?.organizations ?? 0} organization mapping(s) are removed. The platform
            default group and groups still referenced by price lists are protected — the server will refuse those
            deletions.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void doDelete()}>
            Delete group
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ── Create / edit dialog ─────────────────────────────────────────────────────

function GroupFormDialog({
  open,
  seq,
  mode,
  group,
  onClose,
  onSaved,
}: {
  open: boolean
  seq: number
  mode: 'create' | 'edit'
  group?: CustomerGroupDTO | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({ name: '', description: '', priority: '0', isDefault: false })
  const [saving, setSaving] = useState(false)
  // Fresh form on every open (keyed by the open sequence from the parent)
  const [initializedFor, setInitializedFor] = useState(-1)
  if (open && initializedFor !== seq) {
    setInitializedFor(seq)
    setForm({
      name: group?.name ?? '',
      description: group?.description ?? '',
      priority: String(group?.priority ?? 0),
      isDefault: group?.isDefault ?? false,
    })
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.name.trim().length < 2) {
      toast({ title: 'Name too short', description: 'Group names need at least 2 characters.', variant: 'destructive' })
      return
    }
    setSaving(true)
    const payload =
      mode === 'create'
        ? {
            name: form.name.trim(),
            description: form.description.trim() || null,
            priority: Number(form.priority) || 0,
          }
        : {
            name: form.name.trim(),
            description: form.description.trim() || null,
            priority: Number(form.priority) || 0,
            isDefault: form.isDefault,
          }
    const res = await apiRequest<{ group: CustomerGroupDTO }>(
      mode === 'create' ? '/api/admin/customer-groups' : `/api/admin/customer-groups/${group?.id}`,
      { method: mode === 'create' ? 'POST' : 'PATCH', body: JSON.stringify(payload) }
    )
    setSaving(false)
    if (!res.ok) {
      toastApiError(res.error, mode === 'create' ? 'Could not create group' : 'Could not update group')
      return
    }
    toast({
      title: mode === 'create' ? 'Group created' : 'Group updated',
      description: mode === 'create' ? `${res.data?.group.name} (/${res.data?.group.key})` : `${form.name.trim()} saved.`,
    })
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'New customer group' : `Edit ${group?.name ?? 'group'}`}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'A URL-safe key is derived from the name automatically.'
              : `Created ${group ? formatDate(group.createdAt) : ''} · key /${group?.key ?? ''}`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="grp-name">Name</Label>
            <Input
              id="grp-name"
              required
              minLength={2}
              maxLength={120}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Wholesale Tier 2"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="grp-desc">Description (optional)</Label>
            <Textarea
              id="grp-desc"
              rows={2}
              className="resize-none"
              maxLength={2000}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Who belongs in this tier?"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="grp-priority">Priority</Label>
            <Input
              id="grp-priority"
              type="number"
              min={0}
              max={1000}
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
              aria-label="Group priority, higher resolves first"
            />
            <p className="text-[11px] text-muted-foreground">Higher priority wins when several groups could apply.</p>
          </div>
          {mode === 'edit' && (
            <div className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5">
              <div className="min-w-0">
                <Label htmlFor="grp-default" className="text-sm">
                  Default group
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Buyers outside any segment land here. The current default can't be un-defaulted — pick a new default
                  first.
                </p>
              </div>
              <Switch
                id="grp-default"
                checked={form.isDefault}
                disabled={group?.isDefault}
                onCheckedChange={(c) => setForm((f) => ({ ...f, isDefault: c }))}
                aria-label="Make this the default customer group"
              />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" className="rounded-xl" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="rounded-xl" disabled={saving}>
              {saving ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : <Save size={15} className="mr-1.5" />}
              {mode === 'create' ? 'Create group' : 'Save changes'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
