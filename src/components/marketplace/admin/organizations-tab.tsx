'use client'

import { useState } from 'react'
import {
  BadgeCheck,
  Ban,
  Building2,
  Globe,
  Landmark,
  Loader2,
  Mail,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  SearchX,
  ShieldAlert,
  ShieldQuestion,
  Trash2,
  Users,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import type { CustomerGroupDTO, OrganizationDTO } from '@/lib/types'
import { formatDate, formatUSD, initials, timeAgo } from '@/lib/format'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
import { cn } from '@/lib/utils'
import {
  AdminEmptyState,
  FilterChips,
  ORG_STATUS_MAP,
  SearchInput,
  StatusBadge,
  apiRequest,
  toastApiError,
  useDebounced,
} from './shared'

const ROLE_BADGE: Record<string, string> = {
  OWNER: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  ADMIN: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  BUYER: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  APPROVER: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  VIEWER: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
}

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'PENDING_VERIFICATION', label: 'Pending' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'REJECTED', label: 'Rejected' },
]

const FINANCIER_ORG_TYPES: Record<string, string> = {
  BANK: 'Bank — financing institution',
  MFI: 'Microfinance — financing institution',
  EWALLET: 'E-wallet — financing institution',
}

export function OrganizationsTab() {
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search)
  const [openId, setOpenId] = useState<string | null>(null)
  const [openSeq, setOpenSeq] = useState(0)
  const [createOpen, setCreateOpen] = useState(false)
  const [createSeq, setCreateSeq] = useState(0)

  const openOrg = (id: string) => {
    setOpenId(id)
    setOpenSeq((s) => s + 1)
  }

  const openCreate = () => {
    setCreateOpen(true)
    setCreateSeq((s) => s + 1)
  }

  const query = new URLSearchParams()
  if (statusFilter) query.set('status', statusFilter)
  if (debouncedSearch.trim()) query.set('search', debouncedSearch.trim())
  const {
    data,
    loading,
    error,
    refetch: refetchList,
  } = useApi<{ organizations: OrganizationDTO[] }>(`/api/admin/organizations?${query.toString()}`)
  const organizations = data?.organizations ?? []

  const { data: groupsData } = useApi<{ groups: CustomerGroupDTO[] }>('/api/admin/customer-groups')
  const groups = groupsData?.groups ?? []

  // Counts are only truthful while viewing the unfiltered list
  const showCounts = statusFilter === '' && !debouncedSearch.trim()
  const counts = organizations.reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1
    return acc
  }, {})
  const pendingCount = counts['PENDING_VERIFICATION'] ?? 0

  return (
    <div className="space-y-5">
      {/* Verification queue call-out */}
      {statusFilter === '' && !debouncedSearch.trim() && pendingCount > 0 && !loading && (
        <button
          type="button"
          onClick={() => setStatusFilter('PENDING_VERIFICATION')}
          className="flex w-full items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-left transition-colors hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/50 dark:hover:bg-amber-950"
          aria-label={`${pendingCount} organizations awaiting verification — open the queue`}
        >
          <ShieldQuestion size={20} className="shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="min-w-0 flex-1 text-sm">
            <span className="font-semibold">
              {pendingCount} {pendingCount === 1 ? 'organization is' : 'organizations are'} awaiting verification
            </span>
            <span className="text-muted-foreground"> — review the queue to activate, reject or request more info.</span>
          </span>
          <BadgeCheck size={16} className="shrink-0 text-amber-600 dark:text-amber-400" />
        </button>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterChips
          options={STATUS_FILTERS.map((f) => ({
            ...f,
            count: showCounts && f.value ? counts[f.value] : undefined,
          }))}
          value={statusFilter}
          onChange={setStatusFilter}
          ariaLabel="Filter organizations by status"
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search organizations — name, tax ID…"
            ariaLabel="Search organizations"
            className="min-w-0 flex-1 md:max-w-72"
          />
          <Button className="shrink-0 rounded-xl" onClick={openCreate}>
            <Plus size={15} className="mr-1.5" /> New organization
          </Button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <AdminEmptyState
          icon={ShieldAlert}
          title="Couldn't load organizations"
          description={error}
        >
          <Button variant="outline" className="rounded-xl" onClick={() => void refetchList()}>
            Try again
          </Button>
        </AdminEmptyState>
      )}

      {/* Empty */}
      {!loading && !error && organizations.length === 0 && (
        <AdminEmptyState
          icon={SearchX}
          title={debouncedSearch.trim() || statusFilter ? 'No organizations match' : 'No organizations yet'}
          description={
            debouncedSearch.trim() || statusFilter
              ? 'Try clearing the search or switching the status filter.'
              : 'Business accounts that register on the platform will appear here.'
          }
        />
      )}

      {/* Desktop table */}
      {!loading && !error && organizations.length > 0 && (
        <div className="hidden overflow-hidden rounded-2xl border md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-medium">Organization</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Members</th>
                <th scope="col" className="px-4 py-3 font-medium">Credit terms</th>
                <th scope="col" className="px-4 py-3 font-medium">Joined</th>
                <th scope="col" className="px-4 py-3 text-right font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {organizations.map((org) => (
                <tr key={org.id} className="border-b transition-colors last:border-0 hover:bg-accent/50">
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xs font-extrabold text-primary">
                        {initials(org.name)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{org.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {org.slug}
                          {org.industry ? ` · ${org.industry}` : ''}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusBadge status={org.status} map={ORG_STATUS_MAP} />
                  </td>
                  <td className="px-4 py-3.5 tabular-nums text-muted-foreground">{org.memberCount ?? '—'}</td>
                  <td className="px-4 py-3.5">
                    <span className="text-muted-foreground">
                      {FINANCIER_ORG_TYPES[org.orgType ?? ''] ?? `NET-${org.creditTermsDays} · ${formatUSD(org.creditLimit)}`}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-muted-foreground" title={formatDate(org.createdAt)}>
                    {timeAgo(org.createdAt)}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-lg"
                      onClick={() => openOrg(org.id)}
                      aria-label={`Manage ${org.name}`}
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
      {!loading && !error && organizations.length > 0 && (
        <div className="space-y-3 md:hidden">
          {organizations.map((org) => (
            <Card key={org.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xs font-extrabold text-primary">
                      {initials(org.name)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{org.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {org.slug} · {org.memberCount ?? '—'} members
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={org.status} map={ORG_STATUS_MAP} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>
                    {FINANCIER_ORG_TYPES[org.orgType ?? ''] ??
                      `NET-${org.creditTermsDays} · limit ${formatUSD(org.creditLimit)}`}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-lg"
                    onClick={() => openOrg(org.id)}
                    aria-label={`Manage ${org.name}`}
                  >
                    Manage
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Detail + management dialog */}
      <OrgManageDialog
        orgId={openId}
        seq={openSeq}
        groups={groups}
        onClose={() => setOpenId(null)}
        onChanged={() => void refetchList()}
      />

      {/* Creation dialog */}
      <OrgCreateDialog
        open={createOpen}
        seq={createSeq}
        onClose={() => setCreateOpen(false)}
        onCreated={() => void refetchList()}
      />
    </div>
  )
}

// ── Management dialog ─────────────────────────────────────────────────────────

function OrgManageDialog({
  orgId,
  seq,
  groups,
  onClose,
  onChanged,
}: {
  orgId: string | null
  seq: number
  groups: CustomerGroupDTO[]
  onClose: () => void
  onChanged: () => void
}) {
  const { data, loading, refetch } = useApi<{ organization: OrganizationDTO }>(
    orgId ? `/api/organizations/${orgId}` : null,
    { skip: !orgId }
  )
  const org = data?.organization

  // Local edit state — re-initialized on every dialog open (seq) and every
  // fresh detail fetch (new object identity), the seller-view cover pattern.
  const [form, setForm] = useState({
    name: '',
    legalName: '',
    taxId: '',
    registrationNumber: '',
    industry: '',
    website: '',
    creditTermsDays: '30',
    creditLimit: '0',
    notes: '',
    orgType: 'COMPANY',
  })
  const [groupIds, setGroupIds] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState<string | null>(null)
  const [initializedFor, setInitializedFor] = useState<{ seq: number; org: OrganizationDTO } | null>(null)
  if (org && (!initializedFor || initializedFor.seq !== seq || initializedFor.org !== org)) {
    setInitializedFor({ seq, org })
    setForm({
      name: org.name,
      legalName: org.legalName ?? '',
      taxId: org.taxId ?? '',
      registrationNumber: org.registrationNumber ?? '',
      industry: org.industry ?? '',
      website: org.website ?? '',
      creditTermsDays: String(org.creditTermsDays),
      creditLimit: String(org.creditLimit),
      notes: org.notes ?? '',
      orgType: org.orgType ?? 'COMPANY',
    })
    setGroupIds(new Set((org.groups ?? []).map((g) => g.id)))
  }

  if (!orgId) return null
  const open = !!orgId

  const refresh = () => {
    void refetch()
    onChanged()
  }

  const setStatus = async (status: string, successTitle: string, successDescription: string) => {
    setSaving(status)
    const res = await apiRequest(`/api/admin/organizations/${orgId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
    setSaving(null)
    if (!res.ok) {
      toastApiError(res.error, 'Status change failed')
      return
    }
    toast({ title: successTitle, description: successDescription })
    refresh()
  }

  const saveProfile = async () => {
    const name = form.name.trim()
    if (name.length < 2) {
      toast({
        title: 'Name too short',
        description: 'Organization name must be at least 2 characters.',
        variant: 'destructive',
      })
      return
    }
    setSaving('profile')
    const res = await apiRequest(`/api/admin/organizations/${orgId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name,
        legalName: form.legalName.trim() || null,
        taxId: form.taxId.trim() || null,
        registrationNumber: form.registrationNumber.trim() || null,
        industry: form.industry.trim() || null,
        website: form.website.trim() || null,
      }),
    })
    setSaving(null)
    if (!res.ok) {
      toastApiError(res.error, 'Profile save failed')
      return
    }
    toast({ title: 'Profile saved' })
    refresh()
  }

  const saveCommercial = async () => {
    // Financier institutions: only the org type + internal notes apply —
    // payment terms / credit limit are buyer-company concepts.
    if (isFinancier) {
      setSaving('commercial')
      const res = await apiRequest(`/api/admin/organizations/${orgId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          notes: form.notes.trim() || null,
          orgType: form.orgType,
        }),
      })
      setSaving(null)
      if (!res.ok) {
        toastApiError(res.error, 'Save failed')
        return
      }
      toast({ title: 'Institution settings saved' })
      refresh()
      return
    }
    const terms = Number(form.creditTermsDays)
    const limit = Number(form.creditLimit)
    if (!Number.isInteger(terms) || terms < 0 || terms > 180) {
      toast({ title: 'Invalid credit terms', description: 'Payment terms must be 0–180 days.', variant: 'destructive' })
      return
    }
    if (Number.isNaN(limit) || limit < 0) {
      toast({ title: 'Invalid credit limit', description: 'Credit limit must be zero or more.', variant: 'destructive' })
      return
    }
    setSaving('commercial')
    const res = await apiRequest(`/api/admin/organizations/${orgId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        creditTermsDays: terms,
        creditLimit: Math.round(limit * 100) / 100,
        notes: form.notes.trim() || null,
        orgType: form.orgType,
      }),
    })
    setSaving(null)
    if (!res.ok) {
      toastApiError(res.error, 'Save failed')
      return
    }
    toast({ title: 'Commercial settings saved' })
    refresh()
  }

  const saveGroups = async () => {
    setSaving('groups')
    const res = await apiRequest(`/api/admin/organizations/${orgId}`, {
      method: 'PATCH',
      body: JSON.stringify({ groupIds: [...groupIds] }),
    })
    setSaving(null)
    if (!res.ok) {
      toastApiError(res.error, 'Group mapping failed')
      return
    }
    toast({ title: 'Group mapping updated' })
    refresh()
  }

  const deleteOrg = async () => {
    setSaving('delete')
    const res = await apiRequest(`/api/admin/organizations/${orgId}`, { method: 'DELETE' })
    setSaving(null)
    if (!res.ok) {
      // 409 → the server message explains exactly which history blocks deletion.
      toastApiError(res.error, 'Delete failed')
      return
    }
    toast({
      title: 'Organization deleted',
      description: `${org?.name ?? 'The organization'} has been removed.`,
    })
    onClose()
    onChanged()
  }

  const toggleGroup = (id: string, checked: boolean) => {
    setGroupIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const status = org?.status
  const busy = saving !== null
  // Financier institutions (BANK/MFI/EWALLET) are lenders on the platform —
  // they don't buy on NET terms and never map to buyer customer groups.
  // The manage dialog must reflect that instead of showing buyer-company fields
  // (audit feedback: "why does a bank show Wholesale Tier 1 / Retail?").
  const isFinancier = org?.orgType === 'BANK' || org?.orgType === 'MFI' || org?.orgType === 'EWALLET'

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        {loading || !org ? (
          <div className="space-y-4 py-2">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3 pr-6">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-extrabold text-primary">
                  {initials(org.name)}
                </span>
                <div className="min-w-0">
                  <DialogTitle className="truncate leading-tight">{org.name}</DialogTitle>
                  <DialogDescription className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
                    <span>/{org.slug}</span>
                    <StatusBadge status={org.status} map={ORG_STATUS_MAP} />
                    {org.verifiedAt && (
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        <BadgeCheck size={12} /> verified {formatDate(org.verifiedAt)}
                      </span>
                    )}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            {/* Profile */}
            <section aria-label="Organization profile">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <Globe size={14} className="text-primary" /> Profile
              </h3>
              <div className="space-y-3 rounded-xl border p-4">
                <div className="space-y-1.5">
                  <Label htmlFor="org-name" className="text-xs">
                    Name
                  </Label>
                  <Input
                    id="org-name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    aria-label="Organization name"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="org-legal-name" className="text-xs">
                      Legal name
                    </Label>
                    <Input
                      id="org-legal-name"
                      value={form.legalName}
                      onChange={(e) => setForm((f) => ({ ...f, legalName: e.target.value }))}
                      aria-label="Legal name"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="org-tax-id" className="text-xs">
                      Tax ID
                    </Label>
                    <Input
                      id="org-tax-id"
                      value={form.taxId}
                      onChange={(e) => setForm((f) => ({ ...f, taxId: e.target.value }))}
                      aria-label="Tax ID"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="org-registration" className="text-xs">
                      Registration no.
                    </Label>
                    <Input
                      id="org-registration"
                      value={form.registrationNumber}
                      onChange={(e) => setForm((f) => ({ ...f, registrationNumber: e.target.value }))}
                      aria-label="Registration number"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="org-industry" className="text-xs">
                      Industry
                    </Label>
                    <Input
                      id="org-industry"
                      value={form.industry}
                      onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
                      aria-label="Industry"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="org-website" className="text-xs">
                    Website
                  </Label>
                  <Input
                    id="org-website"
                    value={form.website}
                    onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                    placeholder="https://…"
                    aria-label="Website"
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[11px] text-muted-foreground">
                    Joined {formatDate(org.createdAt)} · the /{org.slug} identifier never changes on rename
                  </p>
                  <Button size="sm" className="rounded-xl" onClick={() => void saveProfile()} disabled={busy}>
                    {saving === 'profile' ? (
                      <Loader2 size={14} className="mr-1.5 animate-spin" />
                    ) : (
                      <Save size={14} className="mr-1.5" />
                    )}
                    Save profile
                  </Button>
                </div>
              </div>
            </section>

            {/* Members */}
            <section aria-label="Organization members">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <Users size={14} className="text-primary" /> Members ({org.members?.length ?? 0})
              </h3>
              <div className="max-h-52 space-y-1.5 overflow-y-auto rounded-xl border p-2">
                {(org.members ?? []).map((m) => (
                  <div key={m.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold">
                      {initials(m.user.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{m.user.name}</p>
                      <p className="flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground">
                        <Mail size={11} className="shrink-0" /> {m.user.email}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                        ROLE_BADGE[m.role] ?? 'bg-muted text-muted-foreground'
                      )}
                    >
                      {m.role}
                    </span>
                  </div>
                ))}
                {(org.members ?? []).length === 0 && (
                  <p className="px-2 py-3 text-center text-xs text-muted-foreground">No members yet.</p>
                )}
              </div>
            </section>

            {/* Commercial settings (buyer companies) / Institution settings (financiers) */}
            <section aria-label={isFinancier ? 'Institution settings' : 'Commercial settings'}>
              <h3 className="mb-2 text-sm font-semibold">
                {isFinancier ? 'Financing institution' : 'Commercial settings'}
              </h3>
              <div className="space-y-3 rounded-xl border p-4">
                {isFinancier && (
                  <div className="flex items-start gap-2.5 rounded-lg border border-bh-gold/40 bg-bh-bg-gold/40 px-3 py-2.5 dark:bg-bh-gold/10">
                    <Landmark size={15} className="mt-0.5 shrink-0 text-bh-gold-dark dark:text-bh-gold" />
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      This organization is a lender on Vendora — it publishes financing &amp; accreditation services and
                      funds buyers. Payment terms, credit limits and customer groups are buyer-company concepts and do
                      not apply here. Institution profile, services, requests and fees are managed in the{' '}
                      <span className="font-semibold text-foreground">Financing</span> tab.
                    </p>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="org-type" className="text-xs">
                    Organization type
                  </Label>
                  <Select value={form.orgType} onValueChange={(v) => setForm((f) => ({ ...f, orgType: v }))}>
                    <SelectTrigger id="org-type" className="h-9" aria-label="Organization type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="COMPANY">Company</SelectItem>
                      <SelectItem value="BANK">Bank</SelectItem>
                      <SelectItem value="MFI">Micro-finance institution</SelectItem>
                      <SelectItem value="EWALLET">E-wallet</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Scoped RFQ settings can target a whole organization type.
                  </p>
                </div>
                {!isFinancier && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="org-credit-terms" className="text-xs">
                        Payment terms (days)
                      </Label>
                      <Input
                        id="org-credit-terms"
                        type="number"
                        min={0}
                        max={180}
                        value={form.creditTermsDays}
                        onChange={(e) => setForm((f) => ({ ...f, creditTermsDays: e.target.value }))}
                        aria-label="Payment terms in days, 0 to 180"
                      />
                      <p className="text-[11px] text-muted-foreground">0 = prepaid · max 180 (NET-180)</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="org-credit-limit" className="text-xs">
                        Credit limit (USD)
                      </Label>
                      <Input
                        id="org-credit-limit"
                        type="number"
                        min={0}
                        step="0.01"
                        value={form.creditLimit}
                        onChange={(e) => setForm((f) => ({ ...f, creditLimit: e.target.value }))}
                        aria-label="Credit limit in US dollars"
                      />
                      <p className="text-[11px] text-muted-foreground">{formatUSD(Number(form.creditLimit) || 0)}</p>
                    </div>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="org-notes" className="text-xs">
                    Internal notes
                  </Label>
                  <Textarea
                    id="org-notes"
                    rows={2}
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder={
                      isFinancier
                        ? 'License review notes, regulator references, contact preferences…'
                        : 'KYC notes, contract references, contact preferences…'
                    }
                    aria-label="Internal notes about this organization"
                    className="resize-none"
                  />
                </div>
                <Button
                  size="sm"
                  className="rounded-xl"
                  onClick={() => void saveCommercial()}
                  disabled={busy}
                >
                  {saving === 'commercial' ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Save size={14} className="mr-1.5" />}
                  {isFinancier ? 'Save institution settings' : 'Save commercial settings'}
                </Button>
              </div>
            </section>

            {/* Customer group mapping — buying organizations only. Financier
                institutions never join pricing segments (they are the funding
                side, not a buyer), so the section is hidden for them. */}
            {!isFinancier && (
              <section aria-label="Customer group mapping">
                <h3 className="mb-2 text-sm font-semibold">Customer groups</h3>
                <div className="space-y-3 rounded-xl border p-4">
                  <div className="space-y-2">
                    {groups.map((g) => (
                      <label
                        key={g.id}
                        className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2 transition-colors hover:bg-accent/50"
                      >
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                            {g.name}
                            {g.isDefault && (
                              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                                DEFAULT
                              </span>
                            )}
                          </span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            /{g.key} · priority {g.priority}
                          </span>
                        </span>
                        <Switch
                          checked={groupIds.has(g.id)}
                          onCheckedChange={(c) => toggleGroup(g.id, c)}
                          aria-label={`Map ${org.name} to customer group ${g.name}`}
                        />
                      </label>
                    ))}
                    {groups.length === 0 && (
                      <p className="py-2 text-center text-xs text-muted-foreground">
                        No customer groups exist yet — create them in the Pricing tab.
                      </p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    onClick={() => void saveGroups()}
                    disabled={busy}
                  >
                    {saving === 'groups' ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Save size={14} className="mr-1.5" />}
                    Apply group mapping
                  </Button>
                  <p className="text-[11px] text-muted-foreground">
                    Saving replaces the full mapping — every enabled switch is sent to the server.
                  </p>
                </div>
              </section>
            )}

            {/* Status actions */}
            <section aria-label="Account status actions" className="rounded-xl border border-dashed p-4">
              <h3 className="mb-2 text-sm font-semibold">Account status</h3>
              <div className="flex flex-wrap gap-2">
                {(status === 'PENDING_VERIFICATION' || status === 'SUSPENDED' || status === 'REJECTED') && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" className="rounded-xl" disabled={busy}>
                        {saving === 'ACTIVE' ? (
                          <Loader2 size={14} className="mr-1.5 animate-spin" />
                        ) : (
                          <BadgeCheck size={14} className="mr-1.5" />
                        )}
                        {status === 'PENDING_VERIFICATION' ? 'Approve & verify' : 'Reactivate'}
                      </Button>
                    </AlertDialogTrigger>
                    <ConfirmContent
                      title={status === 'PENDING_VERIFICATION' ? `Verify ${org.name}?` : `Reactivate ${org.name}?`}
                      description={
                        status === 'PENDING_VERIFICATION'
                          ? isFinancier
                            ? 'The financing institution is activated — its staff unlock the financier console (services, requests inbox, offers, agreements and operations) and its offerings become visible on the marketplace.'
                            : 'The organization gains access to contract pricing, credit terms and B2B ordering. Their members can sign quotes and place orders on account.'
                          : 'The organization returns to good standing and regains full marketplace access.'
                      }
                      actionLabel="Confirm"
                      onConfirm={() => void setStatus('ACTIVE', 'Organization activated', `${org.name} is now verified and active.`)}
                    />
                  </AlertDialog>
                )}
                {status === 'ACTIVE' && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm" className="rounded-xl" disabled={busy}>
                        {saving === 'SUSPENDED' ? (
                          <Loader2 size={14} className="mr-1.5 animate-spin" />
                        ) : (
                          <Ban size={14} className="mr-1.5" />
                        )}
                        Suspend
                      </Button>
                    </AlertDialogTrigger>
                    <ConfirmContent
                      title={`Suspend ${org.name}?`}
                      description="Their members lose B2B pricing, quoting and on-account ordering until the organization is reactivated."
                      actionLabel="Suspend"
                      destructive
                      onConfirm={() => void setStatus('SUSPENDED', 'Organization suspended', `${org.name} has been suspended.`)}
                    />
                  </AlertDialog>
                )}
                {(status === 'PENDING_VERIFICATION' || status === 'ACTIVE' || status === 'SUSPENDED') && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="rounded-xl text-destructive hover:text-destructive" disabled={busy}>
                        {saving === 'REJECTED' ? (
                          <Loader2 size={14} className="mr-1.5 animate-spin" />
                        ) : (
                          <ShieldAlert size={14} className="mr-1.5" />
                        )}
                        Reject
                      </Button>
                    </AlertDialogTrigger>
                    <ConfirmContent
                      title={`Reject ${org.name}?`}
                      description="Use this when verification fails — the organization cannot trade until it is re-reviewed and activated."
                      actionLabel="Reject"
                      destructive
                      onConfirm={() => void setStatus('REJECTED', 'Organization rejected', `${org.name} has been rejected.`)}
                    />
                  </AlertDialog>
                )}
                <p className="flex w-full items-center gap-1.5 pt-1 text-[11px] text-muted-foreground">
                  <RotateCcw size={11} className="shrink-0" />
                  All status changes are written to the platform audit log.
                </p>
              </div>
            </section>

            {/* Danger zone */}
            <section
              aria-label="Danger zone"
              className="rounded-xl border border-destructive/40 bg-destructive/5 p-4"
            >
              <h3 className="mb-2 text-sm font-semibold text-destructive">Danger zone</h3>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">
                  Organizations that have traded — orders, RFQs, price lists — cannot be deleted; suspend them
                  instead to preserve history.
                </p>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" className="shrink-0 rounded-xl" disabled={busy}>
                      {saving === 'delete' ? (
                        <Loader2 size={14} className="mr-1.5 animate-spin" />
                      ) : (
                        <Trash2 size={14} className="mr-1.5" />
                      )}
                      Delete organization
                    </Button>
                  </AlertDialogTrigger>
                  <ConfirmContent
                    title={`Delete ${org.name}?`}
                    description="This permanently removes the organization and its memberships. This cannot be undone."
                    actionLabel="Delete organization"
                    destructive
                    onConfirm={() => void deleteOrg()}
                  />
                </AlertDialog>
              </div>
            </section>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Creation dialog ──────────────────────────────────────────────────────────

const CREATE_FORM_DEFAULTS = {
  name: '',
  orgType: 'COMPANY',
  status: 'ACTIVE',
  ownerEmail: '',
  legalName: '',
  taxId: '',
  registrationNumber: '',
  industry: '',
  website: '',
  creditTermsDays: '0',
  creditLimit: '0',
  notes: '',
}

function OrgCreateDialog({
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
  const [form, setForm] = useState({ ...CREATE_FORM_DEFAULTS })
  const [posting, setPosting] = useState(false)
  // Fresh form on every open — the same render-time init pattern as the manage
  // dialog (no effects).
  const [initializedFor, setInitializedFor] = useState<number | null>(null)
  if (open && initializedFor !== seq) {
    setInitializedFor(seq)
    setForm({ ...CREATE_FORM_DEFAULTS })
  }

  const submit = async () => {
    const name = form.name.trim()
    if (name.length < 2) {
      toast({
        title: 'Name too short',
        description: 'Organization name must be at least 2 characters.',
        variant: 'destructive',
      })
      return
    }
    const terms = Number(form.creditTermsDays)
    if (!Number.isInteger(terms) || terms < 0 || terms > 180) {
      toast({ title: 'Invalid credit terms', description: 'Payment terms must be 0–180 days.', variant: 'destructive' })
      return
    }
    const limit = Number(form.creditLimit)
    if (Number.isNaN(limit) || limit < 0) {
      toast({ title: 'Invalid credit limit', description: 'Credit limit must be zero or more.', variant: 'destructive' })
      return
    }

    setPosting(true)
    const res = await apiRequest('/api/admin/organizations', {
      method: 'POST',
      body: JSON.stringify({
        name,
        orgType: form.orgType,
        status: form.status,
        ownerEmail: form.ownerEmail.trim() || undefined,
        legalName: form.legalName.trim() || null,
        taxId: form.taxId.trim() || null,
        registrationNumber: form.registrationNumber.trim() || null,
        industry: form.industry.trim() || null,
        website: form.website.trim() || null,
        creditTermsDays: terms,
        creditLimit: Math.round(limit * 100) / 100,
        notes: form.notes.trim() || null,
      }),
    })
    setPosting(false)
    if (!res.ok) {
      toastApiError(res.error, 'Creation failed')
      return
    }
    toast({ title: 'Organization created', description: `${name} is ready.` })
    onCreated()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 leading-tight">
            <Building2 size={18} className="text-primary" /> New organization
          </DialogTitle>
          <DialogDescription>
            Create a business account on behalf of the platform — assign an owner and configure commercial
            terms right away.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="new-org-name" className="text-xs">
              Name
            </Label>
            <Input
              id="new-org-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Acme Trading Co"
              aria-label="Organization name"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-org-type" className="text-xs">
                Organization type
              </Label>
              <Select value={form.orgType} onValueChange={(v) => setForm((f) => ({ ...f, orgType: v }))}>
                <SelectTrigger id="new-org-type" className="h-9" aria-label="Organization type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="COMPANY">Company</SelectItem>
                  <SelectItem value="BANK">Bank</SelectItem>
                  <SelectItem value="MFI">Micro-finance institution</SelectItem>
                  <SelectItem value="EWALLET">E-wallet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-org-status" className="text-xs">
                Status
              </Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger id="new-org-status" className="h-9" aria-label="Initial status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="PENDING_VERIFICATION">Pending verification</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-org-owner" className="text-xs">
              Owner email
            </Label>
            <Input
              id="new-org-owner"
              type="email"
              value={form.ownerEmail}
              onChange={(e) => setForm((f) => ({ ...f, ownerEmail: e.target.value }))}
              placeholder="owner@example.com"
              aria-label="Owner email, optional"
            />
            <p className="text-[11px] text-muted-foreground">
              Optional — must already have a Vendora account; they become the organization owner
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-org-legal-name" className="text-xs">
                Legal name
              </Label>
              <Input
                id="new-org-legal-name"
                value={form.legalName}
                onChange={(e) => setForm((f) => ({ ...f, legalName: e.target.value }))}
                aria-label="Legal name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-org-tax-id" className="text-xs">
                Tax ID
              </Label>
              <Input
                id="new-org-tax-id"
                value={form.taxId}
                onChange={(e) => setForm((f) => ({ ...f, taxId: e.target.value }))}
                aria-label="Tax ID"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-org-registration" className="text-xs">
                Registration no.
              </Label>
              <Input
                id="new-org-registration"
                value={form.registrationNumber}
                onChange={(e) => setForm((f) => ({ ...f, registrationNumber: e.target.value }))}
                aria-label="Registration number"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-org-industry" className="text-xs">
                Industry
              </Label>
              <Input
                id="new-org-industry"
                value={form.industry}
                onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
                aria-label="Industry"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-org-website" className="text-xs">
              Website
            </Label>
            <Input
              id="new-org-website"
              value={form.website}
              onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
              placeholder="https://…"
              aria-label="Website"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-org-credit-terms" className="text-xs">
                Credit terms (days)
              </Label>
              <Input
                id="new-org-credit-terms"
                type="number"
                min={0}
                max={180}
                value={form.creditTermsDays}
                onChange={(e) => setForm((f) => ({ ...f, creditTermsDays: e.target.value }))}
                aria-label="Payment terms in days, 0 to 180"
              />
              <p className="text-[11px] text-muted-foreground">0 = prepaid · max 180 (NET-180)</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-org-credit-limit" className="text-xs">
                Credit limit (USD)
              </Label>
              <Input
                id="new-org-credit-limit"
                type="number"
                min={0}
                step="0.01"
                value={form.creditLimit}
                onChange={(e) => setForm((f) => ({ ...f, creditLimit: e.target.value }))}
                aria-label="Credit limit in US dollars"
              />
              <p className="text-[11px] text-muted-foreground">{formatUSD(Number(form.creditLimit) || 0)}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-org-notes" className="text-xs">
              Notes
            </Label>
            <Textarea
              id="new-org-notes"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="KYC notes, contract references…"
              aria-label="Internal notes about this organization"
              className="resize-none"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" className="rounded-xl" onClick={onClose} disabled={posting}>
              Cancel
            </Button>
            <Button className="rounded-xl" onClick={() => void submit()} disabled={posting}>
              {posting ? (
                <Loader2 size={14} className="mr-1.5 animate-spin" />
              ) : (
                <Plus size={14} className="mr-1.5" />
              )}
              Create organization
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ConfirmContent({
  title,
  description,
  actionLabel,
  onConfirm,
  destructive,
}: {
  title: string
  description: string
  actionLabel: string
  onConfirm: () => void
  destructive?: boolean
}) {
  return (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          onClick={onConfirm}
          className={destructive ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : undefined}
        >
          {actionLabel}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  )
}
