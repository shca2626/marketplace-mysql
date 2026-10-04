'use client'

// ─────────────────────────────────────────────────────────────────────────────
// PROFILE & BRANCHES — the institution identity card (FIN-5 §7).
// FinancierProfile form (about, licensing, contact, ticket range) + the
// branch network CRUD (BRANCH / AGENT / ATM) with soft deactivate.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import {
  Building2,
  Loader2,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Power,
  Save,
  SearchX,
  ShieldAlert,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { apiRequest, toastApiError } from '../admin/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  formatMoney,
  type FinancierBranchDTO,
  type FinancierProfileDTO,
} from './financing-status-badge'

const BRANCH_KINDS = ['BRANCH', 'AGENT', 'ATM'] as const

const ORG_TYPE_LABELS: Record<string, string> = {
  BANK: 'Bank',
  MFI: 'Microfinance institution',
  EWALLET: 'E-wallet',
  COMPANY: 'Company',
}

// ── Branch create / edit dialog ─────────────────────────────────────────────

function BranchFormDialog({
  branch,
  onClose,
  onSaved,
}: {
  branch: FinancierBranchDTO | null
  onClose: () => void
  onSaved: () => void
}) {
  const editing = !!branch
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: branch?.name ?? '',
    kind: branch?.kind ?? 'BRANCH',
    street: branch?.street ?? '',
    city: branch?.city ?? '',
    district: branch?.district ?? '',
    phone: branch?.phone ?? '',
    position: String(branch?.position ?? 0),
    isActive: branch?.isActive ?? true,
  })

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const submit = async () => {
    if (form.name.trim().length < 2) {
      toast({ title: 'Branch name is required', variant: 'destructive' })
      return
    }
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      kind: form.kind,
      street: form.street.trim() || null,
      city: form.city.trim() || null,
      district: form.district.trim() || null,
      phone: form.phone.trim() || null,
      position: Number(form.position) || 0,
      isActive: form.isActive,
    }
    const res = editing
      ? await apiRequest<{ branch: FinancierBranchDTO }>(`/api/financier/branches/${branch!.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
      : await apiRequest<{ branch: FinancierBranchDTO }>('/api/financier/branches', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
    setSaving(false)
    if (!res.ok) return toastApiError(res.error, editing ? 'Update failed' : 'Branch not added')
    toast({ title: editing ? 'Branch updated' : 'Branch added', description: form.name.trim() })
    onSaved()
    onClose()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit — ${branch!.name}` : 'Add a branch, agent or ATM'}</DialogTitle>
          <DialogDescription>
            Your network as applicants see it on the public directory.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Kind</Label>
            <Select value={form.kind} onValueChange={(v) => set('kind', v)}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BRANCH">Branch</SelectItem>
                <SelectItem value="AGENT">Agent</SelectItem>
                <SelectItem value="ATM">ATM</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="br-name">Name</Label>
            <Input id="br-name" value={form.name} onChange={(e) => set('name', e.target.value)} className="rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="br-city">City</Label>
            <Input id="br-city" value={form.city} onChange={(e) => set('city', e.target.value)} className="rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="br-district">District</Label>
            <Input
              id="br-district"
              value={form.district}
              onChange={(e) => set('district', e.target.value)}
              className="rounded-xl"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="br-street">Street</Label>
            <Input id="br-street" value={form.street} onChange={(e) => set('street', e.target.value)} className="rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="br-phone">Phone</Label>
            <Input id="br-phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} className="rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="br-position">Display position</Label>
            <Input
              id="br-position"
              type="number"
              value={form.position}
              onChange={(e) => set('position', e.target.value)}
              className="rounded-xl"
            />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Switch id="br-active" checked={form.isActive} onCheckedChange={(v) => set('isActive', v)} />
            <Label htmlFor="br-active" className="font-normal text-muted-foreground">
              Active (shown to applicants)
            </Label>
          </div>
        </div>
        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="outline" className="rounded-xl" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" className="rounded-xl" onClick={submit} disabled={saving}>
            {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}
            {editing ? 'Save branch' : 'Add branch'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── The tab ──────────────────────────────────────────────────────────────────

export function ProfileTab() {
  const {
    data: profileData,
    loading: profileLoading,
    error: profileError,
    refetch: refetchProfile,
  } = useApi<{ profile: FinancierProfileDTO }>('/api/financier/profile')
  const profile = profileData?.profile ?? null

  const {
    data: branchData,
    loading: branchLoading,
    error: branchError,
    refetch: refetchBranches,
  } = useApi<{ branches: FinancierBranchDTO[] }>('/api/financier/branches')
  const branches = branchData?.branches ?? []

  const [form, setForm] = useState<{
    loaded: boolean
    about: string
    licenseNumber: string
    regulator: string
    contactEmail: string
    contactPhone: string
    minTicket: string
    maxTicket: string
  }>({ loaded: false, about: '', licenseNumber: '', regulator: '', contactEmail: '', contactPhone: '', minTicket: '', maxTicket: '' })

  // Hydrate the form once the profile lands (the dialog-free pattern from the
  // org management tab — render-time state adjustment, converges immediately).
  if (profile && !form.loaded) {
    setForm({
      loaded: true,
      about: profile.about ?? '',
      licenseNumber: profile.licenseNumber ?? '',
      regulator: profile.regulator ?? '',
      contactEmail: profile.contactEmail ?? '',
      contactPhone: profile.contactPhone ?? '',
      minTicket: profile.minTicket?.toString() ?? '',
      maxTicket: profile.maxTicket?.toString() ?? '',
    })
  }

  const [saving, setSaving] = useState(false)
  const set = <K extends keyof typeof form>(key: K, value: string) => setForm((f) => ({ ...f, [key]: value }))

  const saveProfile = async () => {
    setSaving(true)
    const res = await apiRequest<{ profile: FinancierProfileDTO }>('/api/financier/profile', {
      method: 'PATCH',
      body: JSON.stringify({
        about: form.about.trim() || null,
        licenseNumber: form.licenseNumber.trim() || null,
        regulator: form.regulator.trim() || null,
        contactEmail: form.contactEmail.trim() || null,
        contactPhone: form.contactPhone.trim() || null,
        minTicket: form.minTicket.trim() === '' ? null : Number(form.minTicket),
        maxTicket: form.maxTicket.trim() === '' ? null : Number(form.maxTicket),
      }),
    })
    setSaving(false)
    if (!res.ok) return toastApiError(res.error, 'Profile not saved')
    toast({ title: 'Profile saved', description: 'Your institution card is up to date.' })
    void refetchProfile()
  }

  const [branchForm, setBranchForm] = useState<{ open: boolean; branch: FinancierBranchDTO | null; seq: number }>({
    open: false,
    branch: null,
    seq: 0,
  })
  const [busyBranchId, setBusyBranchId] = useState<string | null>(null)

  const deactivateBranch = async (branch: FinancierBranchDTO) => {
    setBusyBranchId(branch.id)
    const res = await apiRequest(`/api/financier/branches/${branch.id}`, { method: 'DELETE' })
    setBusyBranchId(null)
    if (!res.ok) return toastApiError(res.error, 'Could not deactivate')
    toast({ title: `${branch.name} deactivated`, description: 'History is preserved — reactivate by editing.' })
    void refetchBranches()
  }

  if (profileLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="skeleton-shimmer h-80 w-full rounded-2xl" />
        <Skeleton className="skeleton-shimmer h-56 w-full rounded-2xl" />
      </div>
    )
  }

  if (profileError || !profile) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-14 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <ShieldAlert size={24} />
        </span>
        <p className="mt-4 text-sm font-semibold">Couldn&apos;t load your profile</p>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">{profileError ?? 'Unknown error'}</p>
        <Button variant="outline" className="mt-4 rounded-xl" onClick={() => void refetchProfile()}>
          Try again
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Organization identity */}
      <Card className="shadow-sm">
        <CardHeader className="border-b py-4">
          <CardTitle className="flex items-center gap-2.5 text-base">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
              <Building2 size={16} />
            </span>
            <span className="truncate" title={profile.organization.name}>{profile.organization.name}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span className="tabular-nums">
              <span className="font-semibold text-foreground">{ORG_TYPE_LABELS[profile.organization.orgType] ?? profile.organization.orgType}</span>{' '}
              · <span className="font-semibold text-foreground">{profile.serviceCount}</span> services · <span className="font-semibold text-foreground">{profile.branchCount}</span> active branches
            </span>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[11px] font-bold',
                profile.organization.status === 'ACTIVE'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
              )}
            >
              {profile.organization.status}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Profile form */}
      <Card className="shadow-sm">
        <CardHeader className="border-b py-4">
          <CardTitle className="text-base">Financier profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-5">
          <div className="space-y-1.5">
            <Label htmlFor="fp-about">About the institution</Label>
            <Textarea
              id="fp-about"
              value={form.about}
              onChange={(e) => set('about', e.target.value)}
              rows={3}
              placeholder="What you finance, your approach, track record…"
              className="rounded-xl"
            />
          </div>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fp-license">License number</Label>
              <Input
                id="fp-license"
                value={form.licenseNumber}
                onChange={(e) => set('licenseNumber', e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fp-regulator">Regulator</Label>
              <Input
                id="fp-regulator"
                value={form.regulator}
                onChange={(e) => set('regulator', e.target.value)}
                placeholder="e.g. Central Bank of Yemen"
                className="rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fp-email">Contact email</Label>
              <Input
                id="fp-email"
                type="email"
                value={form.contactEmail}
                onChange={(e) => set('contactEmail', e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fp-phone">Contact phone</Label>
              <Input
                id="fp-phone"
                value={form.contactPhone}
                onChange={(e) => set('contactPhone', e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fp-min">Minimum ticket</Label>
              <Input
                id="fp-min"
                type="number"
                value={form.minTicket}
                onChange={(e) => set('minTicket', e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fp-max">Maximum ticket</Label>
              <Input
                id="fp-max"
                type="number"
                value={form.maxTicket}
                onChange={(e) => set('maxTicket', e.target.value)}
                className="rounded-xl"
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="tabular-nums text-xs text-muted-foreground">
              Current range: {formatMoney(profile.minTicket)} – {formatMoney(profile.maxTicket)}
            </p>
            <Button type="button" className="rounded-xl" onClick={saveProfile} disabled={saving}>
              {saving ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Save size={14} className="mr-1.5" />}
              Save profile
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Branches */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between border-b py-4">
          <CardTitle className="text-base">Branch network</CardTitle>
          <Button
            type="button"
            size="sm"
            className="rounded-xl"
            onClick={() => setBranchForm((s) => ({ open: true, branch: null, seq: s.seq + 1 }))}
          >
            <Plus size={14} className="mr-1" /> Add
          </Button>
        </CardHeader>
        <CardContent className="p-5">
          {branchLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="skeleton-shimmer h-12 w-full rounded-xl" />
              ))}
            </div>
          ) : branchError ? (
            <p className="text-sm text-muted-foreground">{branchError}</p>
          ) : branches.length === 0 ? (
            <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-10 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <MapPin size={22} />
              </span>
              <p className="mt-3 text-sm font-semibold">No branches yet</p>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                Add your branches, agents and ATMs so applicants can find you.
              </p>
            </div>
          ) : (
            <ul className="divide-y rounded-xl border">
              {branches.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors duration-150 hover:bg-muted/50">
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                      b.kind === 'BRANCH'
                        ? 'bg-primary/10 text-primary'
                        : b.kind === 'AGENT'
                          ? 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300'
                          : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {b.kind}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn('truncate text-sm font-semibold', !b.isActive && 'text-muted-foreground line-through')} title={b.name}>
                      {b.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground" title={[b.city, b.district, b.street].filter(Boolean).join(', ') || 'No address'}>
                      {[b.city, b.district, b.street].filter(Boolean).join(', ') || 'No address'}
                      {b.phone ? (
                        <>
                          {' · '}
                          <Phone size={10} className="inline" /> {b.phone}
                        </>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${b.name}`}
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => setBranchForm((s) => ({ open: true, branch: b, seq: s.seq + 1 }))}
                    >
                      <Pencil size={13} />
                    </Button>
                    {b.isActive && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Deactivate ${b.name}`}
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        disabled={busyBranchId === b.id}
                        onClick={() => void deactivateBranch(b)}
                      >
                        <Power size={13} />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {branchForm.open && (
        <BranchFormDialog
          key={`branch-form-${branchForm.seq}`}
          branch={branchForm.branch}
          onClose={() => setBranchForm((s) => ({ ...s, open: false }))}
          onSaved={() => void refetchBranches()}
        />
      )}
    </div>
  )
}
