'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN · FINANCING — INSTITUTIONS. Financier organizations (BANK/MFI/EWALLET):
// profiled ones show license, stats, verify / suspend / edit actions; orgs
// WITHOUT a profile (previously invisible) show a one-click Activate. "Add
// institution" creates the org + FinancierProfile with its facts (FIN-002).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import {
  BadgeCheck,
  Ban,
  Building2,
  Landmark,
  Loader2,
  Pencil,
  Plus,
  SearchX,
  ShieldAlert,
  Zap,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import type { FinancierInstitutionDTO } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { motion } from 'framer-motion'
import { SearchInput, StatusBadge, apiRequest, toastApiError, useDebounced } from '../shared'
import {
  ORG_TYPE_MAP,
  formatDate,
  formatMoney,
} from '../../financing/financing-shared'

const ORG_STATUS_MAP = {
  PENDING_VERIFICATION: { label: 'Pending', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  ACTIVE: { label: 'Active', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  SUSPENDED: { label: 'Suspended', badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' },
  REJECTED: { label: 'Rejected', badge: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
}

const NEW_ORG = '__new__'

export function InstitutionsSection() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search)
  const [busy, setBusy] = useState<string | null>(null)
  const [dialog, setDialog] = useState<FinancierInstitutionDTO | 'new' | null>(null)

  const query = new URLSearchParams()
  if (debouncedSearch.trim()) query.set('search', debouncedSearch.trim())
  const { data, loading, error, refetch } = useApi<{ institutions: FinancierInstitutionDTO[] }>(
    `/api/admin/financing/institutions?${query.toString()}`
  )
  const institutions = data?.institutions ?? []
  const unprofiled = institutions.filter((i) => !i.profile)

  const act = async (
    org: FinancierInstitutionDTO,
    action: 'verify' | 'suspend',
    e?: React.MouseEvent
  ) => {
    e?.stopPropagation()
    setBusy(org.organizationId)
    const res = await apiRequest(`/api/admin/financing/institutions/${org.organizationId}/${action}`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
    setBusy(null)
    if (!res.ok) {
      toastApiError(res.error, action === 'verify' ? 'Verify failed' : 'Suspend failed')
      return
    }
    toast({
      title: action === 'verify' ? `${org.name} verified` : `${org.name} suspended`,
      description:
        action === 'verify'
          ? 'Their staff was notified — services can be published and receive applications.'
          : 'New applications are blocked until reactivation.',
    })
    void refetch()
  }

  /** One-click activation (FIN-002): create the missing FinancierProfile. */
  const activate = async (org: FinancierInstitutionDTO) => {
    setBusy(org.organizationId)
    const res = await apiRequest<{ institution: FinancierInstitutionDTO }>(
      '/api/admin/financing/institutions',
      { method: 'POST', body: JSON.stringify({ organizationId: org.organizationId }) }
    )
    setBusy(null)
    if (!res.ok) return toastApiError(res.error, 'Could not activate the institution')
    toast({
      title: `${org.name} activated`,
      description:
        'A financier profile was created — their staff can now open the financier console. Use Edit to complete the license and contact facts.',
    })
    void refetch()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-xs text-muted-foreground">
          Banks, microfinance institutions and e-wallets offering financing on Vendora. Verified
          institutions can publish services; suspended ones receive no new applications.
        </p>
        <div className="flex items-center gap-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search institutions…"
            ariaLabel="Search institutions"
            className="min-w-0 flex-1 md:max-w-72"
          />
          <Button
            className="h-9 shrink-0 rounded-xl bg-bh-gold text-bh-navy-deep shadow-sm hover:bg-bh-gold-light"
            onClick={() => setDialog('new')}
          >
            <Plus size={14} className="mr-1" /> Add institution
          </Button>
        </div>
      </div>

      {loading && (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-12 text-center">
          <ShieldAlert size={34} className="text-muted-foreground/40" />
          <p className="mt-3 text-sm font-semibold">Couldn't load the institutions</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">{error}</p>
          <Button variant="outline" className="mt-4 rounded-xl" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      )}

      {!loading && !error && institutions.length === 0 && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-12 text-center">
          <SearchX size={34} className="text-muted-foreground/40" />
          <p className="mt-3 text-sm font-semibold">No financier institutions yet</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            Add a bank, microfinance institution or e-wallet to start receiving financing
            applications.
          </p>
        </div>
      )}

      {!loading && !error && institutions.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {institutions.map((org, i) => (
            <motion.div
              key={org.organizationId}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, delay: i * 0.03 }}
            >
              {org.profile ? (
                <Card className="h-full">
                  <CardContent className="flex h-full flex-col gap-3 p-4 sm:p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <Landmark size={19} />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold">{org.name}</p>
                          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <StatusBadge status={org.orgType} map={ORG_TYPE_MAP} />
                            {org.profile.licenseNumber && <span>· {org.profile.licenseNumber}</span>}
                          </p>
                        </div>
                      </div>
                      <StatusBadge status={org.status} map={ORG_STATUS_MAP} />
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
                      <Stat label="Services" value={`${org.stats.activeServices} active`} />
                      <Stat label="Forwarded" value={String(org.stats.requestsForwarded)} />
                      <Stat label="Accreditations" value={String(org.stats.liveAccreditations)} />
                      <Stat label="Fees accrued" value={formatMoney(org.stats.feesAccrued)} />
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Building2 size={11} /> {org.profile.branchCount} branches
                      </span>
                      {org.profile.regulator && <span>· {org.profile.regulator}</span>}
                      {org.profile.contactEmail && <span className="truncate">· {org.profile.contactEmail}</span>}
                      {org.verifiedAt && <span>· verified {formatDate(org.verifiedAt)}</span>}
                    </div>

                    <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 rounded-xl"
                        onClick={() => setDialog(org)}
                      >
                        <Pencil size={13} className="mr-1" /> Edit
                      </Button>
                      {org.status !== 'ACTIVE' ? (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" className="h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700" disabled={busy === org.organizationId}>
                              {busy === org.organizationId ? <Loader2 size={13} className="mr-1 animate-spin" /> : <BadgeCheck size={13} className="mr-1" />}
                              Verify
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Verify {org.name}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                The institution becomes ACTIVE and its staff is notified — services can
                                be published and receive applications.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="rounded-xl bg-emerald-600 hover:bg-emerald-700"
                                onClick={(e) => void act(org, 'verify', e)}
                              >
                                Verify institution
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      ) : (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="outline" className="h-9 rounded-xl text-rose-600 hover:text-rose-700" disabled={busy === org.organizationId}>
                              {busy === org.organizationId ? <Loader2 size={13} className="mr-1 animate-spin" /> : <Ban size={13} className="mr-1" />}
                              Suspend
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Suspend {org.name}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                New applications are blocked until the institution is reactivated.
                                Existing agreements stay untouched.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="rounded-xl bg-rose-600 hover:bg-rose-700"
                                onClick={(e) => void act(org, 'suspend', e)}
                              >
                                Suspend institution
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                /* BANK/MFI/EWALLET org without a profile — invisible before FIN-002 */
                <Card className="h-full border-dashed">
                  <CardContent className="flex h-full flex-col gap-3 p-4 sm:p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                          <Landmark size={19} />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold">{org.name}</p>
                          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <StatusBadge status={org.orgType} map={ORG_TYPE_MAP} />
                          </p>
                        </div>
                      </div>
                      <StatusBadge status={org.status} map={ORG_STATUS_MAP} />
                    </div>
                    <p className="rounded-xl border border-dashed bg-muted/40 p-2.5 text-[11.5px] leading-relaxed text-muted-foreground">
                      No financier profile yet — their staff cannot use the financier console.
                      Activating creates the profile; license, regulator and contact facts can be
                      completed through Edit.
                    </p>
                    <div className="mt-auto pt-1">
                      <Button
                        size="sm"
                        className="h-9 rounded-xl bg-bh-gold text-bh-navy-deep shadow-sm hover:bg-bh-gold-light"
                        disabled={busy === org.organizationId}
                        onClick={() => void activate(org)}
                      >
                        {busy === org.organizationId ? (
                          <Loader2 size={13} className="mr-1 animate-spin" />
                        ) : (
                          <Zap size={13} className="mr-1" />
                        )}
                        Activate institution
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </motion.div>
          ))}
        </div>
      )}

      <InstitutionDialog
        key={dialog === 'new' ? 'new' : dialog?.organizationId ?? 'closed'}
        editing={dialog === 'new' ? null : dialog}
        availableOrgs={unprofiled}
        open={dialog !== null}
        onOpenChange={(v) => (!v ? setDialog(null) : undefined)}
        onSaved={() => {
          setDialog(null)
          void refetch()
        }}
      />
    </div>
  )
}

// ── Create / Edit dialog ─────────────────────────────────────────────────────

function InstitutionDialog({
  editing,
  availableOrgs,
  open,
  onOpenChange,
  onSaved,
}: {
  editing: FinancierInstitutionDTO | null
  availableOrgs: FinancierInstitutionDTO[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const isEdit = !!editing
  const [orgChoice, setOrgChoice] = useState<string>(
    !isEdit && availableOrgs.length > 0 ? availableOrgs[0].organizationId : NEW_ORG
  )
  const [name, setName] = useState('')
  const [orgType, setOrgType] = useState('BANK')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [licenseNumber, setLicenseNumber] = useState(editing?.profile?.licenseNumber ?? '')
  const [regulator, setRegulator] = useState(editing?.profile?.regulator ?? '')
  const [minTicket, setMinTicket] = useState(
    editing?.profile?.minTicket != null ? String(editing.profile.minTicket) : ''
  )
  const [maxTicket, setMaxTicket] = useState(
    editing?.profile?.maxTicket != null ? String(editing.profile.maxTicket) : ''
  )
  const [contactEmail, setContactEmail] = useState(editing?.profile?.contactEmail ?? '')
  const [contactPhone, setContactPhone] = useState(editing?.profile?.contactPhone ?? '')
  const [website, setWebsite] = useState(editing?.website ?? '')
  const [about, setAbout] = useState(editing?.profile?.about ?? '')
  const [submitting, setSubmitting] = useState(false)

  const creatingNewOrg = !isEdit && orgChoice === NEW_ORG

  const factsBody = () => ({
    licenseNumber: licenseNumber.trim() || null,
    regulator: regulator.trim() || null,
    minTicket: minTicket.trim() ? Number(minTicket) : null,
    maxTicket: maxTicket.trim() ? Number(maxTicket) : null,
    contactEmail: contactEmail.trim() || null,
    contactPhone: contactPhone.trim() || null,
    website: website.trim() || null,
    about: about.trim() || null,
  })

  const submit = async () => {
    if (creatingNewOrg && name.trim().length < 2) {
      toast({ title: 'Name too short', description: 'Give the institution a clear name (2+ characters).', variant: 'destructive' })
      return
    }
    if (minTicket.trim() && maxTicket.trim() && Number(minTicket) > Number(maxTicket)) {
      toast({ title: 'Ticket range inverted', description: 'The minimum ticket cannot exceed the maximum ticket.', variant: 'destructive' })
      return
    }
    setSubmitting(true)
    const res = isEdit
      ? await apiRequest<{ institution: FinancierInstitutionDTO }>(
          `/api/admin/financing/institutions/${editing!.organizationId}`,
          { method: 'PATCH', body: JSON.stringify(factsBody()) }
        )
      : await apiRequest<{ institution: FinancierInstitutionDTO }>(
          '/api/admin/financing/institutions',
          {
            method: 'POST',
            body: JSON.stringify(
              creatingNewOrg
                ? { name: name.trim(), orgType, ownerEmail: ownerEmail.trim() || undefined, ...factsBody() }
                : { organizationId: orgChoice, ...factsBody() }
            ),
          }
        )
    setSubmitting(false)
    if (!res.ok) return toastApiError(res.error)
    toast({
      title: isEdit ? `${editing!.name} updated` : `${res.data?.institution.name ?? 'Institution'} created`,
      description: isEdit
        ? 'License, regulator, ticket range and contact facts updated.'
        : 'The financier profile is live — their staff can now open the financier console.',
    })
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${editing!.name}` : 'Add institution'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Financier profile facts — license, regulator, ticket range, contacts and the public about text.'
              : 'Activate an existing BANK / MFI / e-wallet organization, or create the institution from scratch. New orgs land Pending — Verify flips them Active.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {!isEdit && (
            <>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Organization</Label>
                <Select value={orgChoice} onValueChange={setOrgChoice}>
                  <SelectTrigger className="h-9 rounded-lg" aria-label="Organization to activate">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableOrgs.length > 0 && (
                      <>
                        <p className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Existing — no profile yet
                        </p>
                        {availableOrgs.map((o) => (
                          <SelectItem key={o.organizationId} value={o.organizationId}>
                            {o.name} ({ORG_TYPE_MAP[o.orgType]?.label ?? o.orgType})
                          </SelectItem>
                        ))}
                      </>
                    )}
                    <SelectItem value={NEW_ORG}>＋ Create a new organization…</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {creatingNewOrg && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="inst-name" className="text-xs">
                      Institution name
                    </Label>
                    <Input
                      id="inst-name"
                      className="h-9 rounded-lg"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Saba Islamic Bank"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Type</Label>
                    <Select value={orgType} onValueChange={setOrgType}>
                      <SelectTrigger className="h-9 rounded-lg" aria-label="Institution type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BANK">Bank</SelectItem>
                        <SelectItem value="MFI">Microfinance</SelectItem>
                        <SelectItem value="EWALLET">E-wallet</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="inst-owner" className="text-xs">
                      Owner email (optional)
                    </Label>
                    <Input
                      id="inst-owner"
                      type="email"
                      className="h-9 rounded-lg"
                      value={ownerEmail}
                      onChange={(e) => setOwnerEmail(e.target.value)}
                      placeholder="staff.member@example.com — must already have a Vendora account"
                    />
                    <p className="text-[10.5px] leading-relaxed text-muted-foreground">
                      The account&apos;s owner becomes the institution&apos;s OWNER — they can open the
                      financier console immediately.
                    </p>
                  </div>
                </>
              )}
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="inst-license" className="text-xs">
              License number
            </Label>
            <Input
              id="inst-license"
              className="h-9 rounded-lg"
              value={licenseNumber}
              onChange={(e) => setLicenseNumber(e.target.value)}
              placeholder="e.g. CBY-BANK-0417"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inst-regulator" className="text-xs">
              Regulator
            </Label>
            <Input
              id="inst-regulator"
              className="h-9 rounded-lg"
              value={regulator}
              onChange={(e) => setRegulator(e.target.value)}
              placeholder="e.g. Central Bank of Yemen"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inst-min" className="text-xs">
              Min ticket (YER)
            </Label>
            <Input
              id="inst-min"
              type="number"
              min={0}
              className="h-9 rounded-lg"
              value={minTicket}
              onChange={(e) => setMinTicket(e.target.value)}
              placeholder="e.g. 50000"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inst-max" className="text-xs">
              Max ticket (YER)
            </Label>
            <Input
              id="inst-max"
              type="number"
              min={0}
              className="h-9 rounded-lg"
              value={maxTicket}
              onChange={(e) => setMaxTicket(e.target.value)}
              placeholder="e.g. 50000000"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inst-email" className="text-xs">
              Contact email
            </Label>
            <Input
              id="inst-email"
              type="email"
              className="h-9 rounded-lg"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="financing@institution.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inst-phone" className="text-xs">
              Contact phone
            </Label>
            <Input
              id="inst-phone"
              className="h-9 rounded-lg"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="+967 1 234 567"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="inst-website" className="text-xs">
              Website
            </Label>
            <Input
              id="inst-website"
              type="url"
              className="h-9 rounded-lg"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://institution.example.com"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="inst-about" className="text-xs">
              About (public entity page)
            </Label>
            <Textarea
              id="inst-about"
              rows={3}
              className="rounded-lg"
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              placeholder="Shown on the public financier profile page — mission, focus, what they finance."
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            className="rounded-xl bg-bh-gold text-bh-navy-deep hover:bg-bh-gold-light"
            onClick={() => void submit()}
            disabled={submitting}
          >
            {submitting ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Landmark size={14} className="mr-1" />}
            {isEdit ? 'Save changes' : 'Create institution'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate text-xs font-semibold">{value}</p>
    </div>
  )
}
