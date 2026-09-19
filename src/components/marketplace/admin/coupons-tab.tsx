'use client'

import { useState } from 'react'
import {
  Loader2,
  Pencil,
  Plus,
  Save,
  ShieldAlert,
  Ticket,
  Trash2,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import type { CouponDTO } from '@/lib/types'
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
import { AdminEmptyState, apiRequest, toastApiError } from './shared'

const CODE_RE = /^[A-Z0-9]{3,24}$/

export function CouponsTab() {
  const { data, loading, error, refetch } = useApi<{ coupons: CouponDTO[] }>('/api/admin/coupons')
  const coupons = data?.coupons ?? []
  const [createOpen, setCreateOpen] = useState(false)
  const [createSeq, setCreateSeq] = useState(0)
  const [editId, setEditId] = useState<string | null>(null)
  const [editSeq, setEditSeq] = useState(0)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const openCreate = () => {
    setCreateOpen(true)
    setCreateSeq((s) => s + 1)
  }
  const openEdit = (id: string) => {
    setEditId(id)
    setEditSeq((s) => s + 1)
  }

  const toggleActive = async (coupon: CouponDTO, next: boolean) => {
    setTogglingId(coupon.id)
    const res = await apiRequest(`/api/admin/coupons/${coupon.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ active: next }),
    })
    setTogglingId(null)
    if (!res.ok) {
      toastApiError(res.error, 'Could not update coupon')
      return
    }
    toast({
      title: next ? `${coupon.code} activated` : `${coupon.code} deactivated`,
      description: next ? 'It can be applied at checkout again.' : 'Buyers can no longer apply it at checkout.',
    })
    void refetch()
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Percentage-off codes validated at checkout — creation, edits and retirement all live here.
        </p>
        <Button className="rounded-xl" onClick={openCreate}>
          <Plus size={15} className="mr-1.5" /> New coupon
        </Button>
      </div>

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {!loading && error && (
        <AdminEmptyState icon={ShieldAlert} title="Couldn't load coupons" description={error}>
          <Button variant="outline" className="rounded-xl" onClick={() => void refetch()}>
            Try again
          </Button>
        </AdminEmptyState>
      )}

      {!loading && !error && coupons.length === 0 && (
        <AdminEmptyState
          icon={Ticket}
          title="No coupons yet"
          description="Create a percentage-off code — e.g. a first-order welcome offer or a bulk-buy incentive."
        >
          <Button className="rounded-xl" onClick={openCreate}>
            <Plus size={15} className="mr-1.5" /> New coupon
          </Button>
        </AdminEmptyState>
      )}

      {/* Desktop table */}
      {!loading && !error && coupons.length > 0 && (
        <div className="hidden overflow-hidden rounded-2xl border md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-medium">Code</th>
                <th scope="col" className="px-4 py-3 font-medium">Offer</th>
                <th scope="col" className="px-4 py-3 font-medium">Min. subtotal</th>
                <th scope="col" className="px-4 py-3 font-medium">First order only</th>
                <th scope="col" className="px-4 py-3 font-medium">Active</th>
                <th scope="col" className="px-4 py-3 font-medium">Created</th>
                <th scope="col" className="px-4 py-3 text-right font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.id} className={cn('border-b transition-colors last:border-0 hover:bg-accent/50', !c.active && 'opacity-60')}>
                  <td className="px-4 py-3.5">
                    <span className="rounded-lg bg-primary/10 px-2.5 py-1 font-mono text-sm font-bold text-primary">
                      {c.code}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="font-semibold">{c.percentOff}% off</p>
                    <p className="max-w-md truncate text-xs text-muted-foreground">{c.description}</p>
                  </td>
                  <td className="px-4 py-3.5 tabular-nums text-muted-foreground">
                    {c.minSubtotal > 0 ? `$${c.minSubtotal.toFixed(2)}` : '—'}
                  </td>
                  <td className="px-4 py-3.5 text-muted-foreground">{c.firstOrderOnly ? 'Yes' : 'No'}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={c.active}
                        onCheckedChange={(v) => void toggleActive(c, v)}
                        disabled={togglingId === c.id}
                        aria-label={`${c.active ? 'Deactivate' : 'Activate'} coupon ${c.code}`}
                      />
                      {togglingId === c.id && <Loader2 size={13} className="animate-spin text-muted-foreground" />}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-muted-foreground">{formatDate(c.createdAt)}</td>
                  <td className="px-4 py-3.5 text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-lg"
                        onClick={() => openEdit(c.id)}
                        aria-label={`Edit coupon ${c.code}`}
                      >
                        <Pencil size={13} className="mr-1.5" /> Edit
                      </Button>
                      <CouponDeleteButton coupon={c} onDeleted={() => void refetch()} compact />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile stacked cards */}
      {!loading && !error && coupons.length > 0 && (
        <div className="space-y-3 md:hidden">
          {coupons.map((c) => (
            <Card key={c.id} className={cn(!c.active && 'opacity-60')}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="rounded-lg bg-primary/10 px-2.5 py-1 font-mono text-sm font-bold text-primary">
                      {c.code}
                    </span>
                    <p className="mt-2 text-sm font-semibold">{c.percentOff}% off</p>
                    <p className="text-xs text-muted-foreground">
                      {c.minSubtotal > 0 ? `min $${c.minSubtotal.toFixed(2)} · ` : ''}
                      {c.firstOrderOnly ? 'first order only' : 'any order'}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Switch
                      checked={c.active}
                      onCheckedChange={(v) => void toggleActive(c, v)}
                      disabled={togglingId === c.id}
                      aria-label={`${c.active ? 'Deactivate' : 'Activate'} coupon ${c.code}`}
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-lg"
                        onClick={() => openEdit(c.id)}
                        aria-label={`Edit coupon ${c.code}`}
                      >
                        <Pencil size={13} />
                      </Button>
                      <CouponDeleteButton coupon={c} onDeleted={() => void refetch()} compact iconOnly />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CouponFormDialog
        open={createOpen}
        seq={createSeq}
        mode="create"
        onClose={() => setCreateOpen(false)}
        onSaved={() => {
          setCreateOpen(false)
          void refetch()
        }}
      />
      <CouponFormDialog
        open={!!editId}
        seq={editSeq}
        mode="edit"
        coupon={coupons.find((c) => c.id === editId) ?? null}
        onClose={() => setEditId(null)}
        onSaved={() => {
          setEditId(null)
          void refetch()
        }}
      />
    </div>
  )
}

// ── Delete ─────────────────────────────────────────────────────────────────────

function CouponDeleteButton({
  coupon,
  onDeleted,
  compact,
  iconOnly,
}: {
  coupon: CouponDTO
  onDeleted: () => void
  compact?: boolean
  iconOnly?: boolean
}) {
  const [deleting, setDeleting] = useState(false)

  const doDelete = async () => {
    setDeleting(true)
    const res = await apiRequest(`/api/admin/coupons/${coupon.id}`, { method: 'DELETE' })
    setDeleting(false)
    if (!res.ok) {
      toastApiError(res.error, 'Delete failed')
      return
    }
    toast({ title: 'Coupon deleted', description: `${coupon.code} has been removed permanently.` })
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
          aria-label={`Delete coupon ${coupon.code}`}
        >
          {deleting ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Trash2 size={13} className={iconOnly ? '' : 'mr-1.5'} />}
          {!iconOnly && 'Delete'}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete coupon {coupon.code}?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the code — buyers currently typing it at checkout will get an “unknown coupon”
            error. Deactivating instead keeps the code but stops it from applying.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void doDelete()}>
            Delete coupon
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ── Create / edit dialog ───────────────────────────────────────────────────────

function CouponFormDialog({
  open,
  seq,
  mode,
  coupon,
  onClose,
  onSaved,
}: {
  open: boolean
  seq: number
  mode: 'create' | 'edit'
  coupon?: CouponDTO | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    code: '',
    description: '',
    percentOff: '10',
    minSubtotal: '0',
    firstOrderOnly: false,
    active: true,
  })
  const [saving, setSaving] = useState(false)
  // Fresh form on every open (keyed by the open sequence from the parent)
  const [initializedFor, setInitializedFor] = useState(-1)
  if (open && initializedFor !== seq) {
    setInitializedFor(seq)
    setForm({
      code: coupon?.code ?? '',
      description: coupon?.description ?? '',
      percentOff: String(coupon?.percentOff ?? 10),
      minSubtotal: String(coupon?.minSubtotal ?? 0),
      firstOrderOnly: coupon?.firstOrderOnly ?? false,
      active: coupon?.active ?? true,
    })
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const code = form.code.trim().toUpperCase()
    const percent = Number(form.percentOff)
    const minSub = Number(form.minSubtotal)

    if (mode === 'create' && !CODE_RE.test(code)) {
      toast({
        title: 'Invalid code',
        description: 'Use 3–24 uppercase letters or numbers (A–Z, 0–9).',
        variant: 'destructive',
      })
      return
    }
    if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
      toast({ title: 'Invalid discount', description: 'Percent off must be a whole number between 1 and 100.', variant: 'destructive' })
      return
    }
    if (Number.isNaN(minSub) || minSub < 0) {
      toast({ title: 'Invalid minimum subtotal', description: 'Minimum subtotal must be zero or more.', variant: 'destructive' })
      return
    }

    setSaving(true)
    const res =
      mode === 'create'
        ? await apiRequest<{ coupon: CouponDTO }>('/api/admin/coupons', {
            method: 'POST',
            body: JSON.stringify({
              code,
              description: form.description.trim(),
              percentOff: percent,
              minSubtotal: minSub > 0 ? minSub : undefined,
              firstOrderOnly: form.firstOrderOnly,
            }),
          })
        : await apiRequest(`/api/admin/coupons/${coupon?.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              description: form.description.trim(),
              percentOff: percent,
              minSubtotal: minSub,
              firstOrderOnly: form.firstOrderOnly,
              active: form.active,
            }),
          })
    setSaving(false)
    if (!res.ok) {
      toastApiError(res.error, mode === 'create' ? 'Could not create coupon' : 'Could not update coupon')
      return
    }
    toast({
      title: mode === 'create' ? 'Coupon created' : 'Coupon updated',
      description: mode === 'create' ? `${code} — ${percent}% off is live.` : `${code} saved.`,
    })
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'New coupon' : `Edit ${coupon?.code ?? 'coupon'}`}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Percentage-off code buyers can apply at checkout.'
              : `Created ${coupon ? formatDate(coupon.createdAt) : ''}. The code itself is permanent.`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cpn-code">Code</Label>
            <Input
              id="cpn-code"
              required
              minLength={3}
              maxLength={24}
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              className="font-mono uppercase tracking-wider"
              placeholder="SUMMER20"
              disabled={mode === 'edit'}
              aria-describedby="cpn-code-hint"
            />
            <p id="cpn-code-hint" className="text-[11px] text-muted-foreground">
              3–24 characters, letters and numbers only (auto-uppercased).
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cpn-desc">Description</Label>
            <Input
              id="cpn-desc"
              required
              minLength={3}
              maxLength={160}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="10% off your first order"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cpn-percent">Percent off</Label>
              <Input
                id="cpn-percent"
                type="number"
                required
                min={1}
                max={100}
                step={1}
                value={form.percentOff}
                onChange={(e) => setForm((f) => ({ ...f, percentOff: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cpn-min">Min. subtotal (USD)</Label>
              <Input
                id="cpn-min"
                type="number"
                min={0}
                step="0.01"
                value={form.minSubtotal}
                onChange={(e) => setForm((f) => ({ ...f, minSubtotal: e.target.value }))}
                aria-label="Minimum order subtotal required to apply the coupon"
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5">
            <div>
              <Label htmlFor="cpn-first" className="text-sm">
                First order only
              </Label>
              <p className="text-[11px] text-muted-foreground">One redemption per buyer — their first completed order.</p>
            </div>
            <Switch
              id="cpn-first"
              checked={form.firstOrderOnly}
              onCheckedChange={(c) => setForm((f) => ({ ...f, firstOrderOnly: c }))}
              aria-label="Restrict coupon to a buyer's first order"
            />
          </div>
          {mode === 'edit' && (
            <div className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5">
              <div>
                <Label htmlFor="cpn-active" className="text-sm">
                  Active
                </Label>
                <p className="text-[11px] text-muted-foreground">Inactive codes are rejected at checkout.</p>
              </div>
              <Switch
                id="cpn-active"
                checked={form.active}
                onCheckedChange={(c) => setForm((f) => ({ ...f, active: c }))}
                aria-label="Coupon active status"
              />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" className="rounded-xl" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="rounded-xl" disabled={saving}>
              {saving ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : <Save size={15} className="mr-1.5" />}
              {mode === 'create' ? 'Create coupon' : 'Save changes'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
