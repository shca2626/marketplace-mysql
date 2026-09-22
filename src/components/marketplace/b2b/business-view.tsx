'use client'

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileText,
  Hourglass,
  Loader2,
  Mail,
  Percent,
  Plus,
  ShieldAlert,
  UserPlus,
  Users,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useMarketplace } from '@/store/marketplace'
import { useApi } from '@/hooks/use-api'
import type { OrganizationDTO } from '@/lib/types'
import { formatDate, formatUSD, initials } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { apiRequest, ORG_ROLE_MAP, ORG_STATUS_MAP, StatusBadge } from './b2b-shared'
import { ApprovalsCard } from './approvals-card'

// ── Register-form state ─────────────────────────────────────────────────────

interface OrgFormState {
  name: string
  legalName: string
  taxId: string
  registrationNumber: string
  industry: string
  website: string
}

const EMPTY_FORM: OrgFormState = {
  name: '',
  legalName: '',
  taxId: '',
  registrationNumber: '',
  industry: '',
  website: '',
}

const BENEFITS = [
  {
    icon: Percent,
    title: 'Contract pricing',
    text: 'Locked-in price lists and quantity-break ladders negotiated for your business.',
  },
  {
    icon: FileText,
    title: 'Bulk RFQs',
    text: 'Send multi-line requests for quote, compare offers and negotiate on your terms.',
  },
  {
    icon: CalendarClock,
    title: 'NET payment terms',
    text: 'Pay on invoice — NET-30 or better once your account is verified.',
  },
  {
    icon: Users,
    title: 'Team accounts',
    text: 'Invite buyers, approvers and viewers under one company identity.',
  },
]

// ── Component ───────────────────────────────────────────────────────────────

export function BusinessView() {
  const user = useMarketplace((s) => s.user)
  const openAuth = useMarketplace((s) => s.openAuth)
  const navigate = useMarketplace((s) => s.navigate)

  const {
    data: orgListData,
    loading: orgsLoading,
    refetch: refetchOrgs,
  } = useApi<{ organizations: OrganizationDTO[] }>(user ? '/api/organizations' : null, {
    skip: !user,
  })

  const orgs = useMemo(() => orgListData?.organizations ?? [], [orgListData])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const activeOrgId = selectedId && orgs.some((o) => o.id === selectedId) ? selectedId : orgs[0]?.id ?? null
  const selected = orgs.find((o) => o.id === activeOrgId) ?? null

  // Detail (members + groups) for the selected organization
  const {
    data: detailData,
    loading: detailLoading,
    refetch: refetchDetail,
  } = useApi<{ organization: OrganizationDTO }>(
    activeOrgId && selected ? `/api/organizations/${activeOrgId}` : null,
    { skip: !activeOrgId || !selected }
  )
  const detail = detailData?.organization ?? selected

  // ── Registration form ──
  const [form, setForm] = useState<OrgFormState>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)

  const setField = (key: keyof OrgFormState) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }))

  const submitRegistration = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.name.trim().length < 2) {
      toast({
        title: 'Business name required',
        description: 'Use at least 2 characters so we can review your business.',
        variant: 'destructive',
      })
      return
    }
    if (form.website.trim() && !/^https?:\/\/.+\..+/.test(form.website.trim()) && !/^[\w-]+(\.[\w-]+)+/.test(form.website.trim())) {
      toast({
        title: 'Invalid website',
        description: 'Enter a full URL like https://acme.com — or leave it empty.',
        variant: 'destructive',
      })
      return
    }
    setSubmitting(true)
    const res = await apiRequest<{ organization: OrganizationDTO }>('/api/organizations', {
      method: 'POST',
      body: JSON.stringify({
        name: form.name.trim(),
        legalName: form.legalName.trim() || null,
        taxId: form.taxId.trim() || null,
        registrationNumber: form.registrationNumber.trim() || null,
        industry: form.industry.trim() || null,
        website: form.website.trim() || null,
      }),
    })
    setSubmitting(false)
    if (!res.ok || !res.data) {
      toast({ title: 'Registration failed', description: res.error, variant: 'destructive' })
      return
    }
    setForm(EMPTY_FORM)
    setSelectedId(res.data.organization.id)
    void refetchOrgs()
    toast({
      title: `Welcome aboard, ${res.data.organization.name}!`,
      description: 'Your business account is registered — verification usually completes quickly.',
    })
  }

  // ── Add member form ──
  const [memberForm, setMemberForm] = useState({ email: '', role: 'BUYER', jobTitle: '' })
  const [addingMember, setAddingMember] = useState(false)

  const canManageMembers = detail?.myRole === 'OWNER' || detail?.myRole === 'ADMIN'

  const submitAddMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeOrgId) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(memberForm.email.trim())) {
      toast({ title: 'Enter a valid email', description: 'The email of an existing Vendora account.', variant: 'destructive' })
      return
    }
    setAddingMember(true)
    const res = await apiRequest<{ member: { user: { name: string } } }>(
      `/api/organizations/${activeOrgId}/members`,
      {
        method: 'POST',
        body: JSON.stringify({
          email: memberForm.email.trim(),
          role: memberForm.role,
          jobTitle: memberForm.jobTitle.trim() || null,
        }),
      }
    )
    setAddingMember(false)
    if (!res.ok) {
      toast({ title: 'Could not add member', description: res.error, variant: 'destructive' })
      return
    }
    setMemberForm({ email: '', role: 'BUYER', jobTitle: '' })
    void refetchDetail()
    toast({
      title: 'Member added',
      description: `${res.data?.member.user.name ?? 'Your colleague'} can now buy on behalf of ${detail?.name ?? 'your business'}.`,
    })
  }

  // ── Signed-out gate ──
  if (!user) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <Building2 size={44} className="text-muted-foreground/40" />
        <h1 className="mt-4 text-xl font-bold">Sign in to manage your business account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Contract pricing, RFQs and your team live here.
        </p>
        <Button className="mt-6 rounded-xl" onClick={() => openAuth('login', { view: 'business' })}>
          Sign in
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Business account</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your B2B identity on Vendora — verification, payment terms and your team.
      </p>

      {orgsLoading ? (
        <div className="mt-8 space-y-5">
          <Skeleton className="h-56 w-full rounded-2xl" />
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
      ) : orgs.length === 0 ? (
        /* ── No organization yet: benefits + registration ── */
        <div className="mt-8 space-y-8">
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            aria-labelledby="b2b-benefits-heading"
          >
            <div className="rounded-2xl border bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:p-8">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Building2 size={22} />
              </span>
              <h2 id="b2b-benefits-heading" className="mt-4 text-xl font-bold tracking-tight sm:text-2xl">
                Buy for your business on Vendora
              </h2>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                One account unlocks wholesale workflows on top of everything you already love —
                no new logins, no separate storefront.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {BENEFITS.map((b, i) => (
                  <motion.div
                    key={b.title}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.08 + i * 0.06 }}
                    className="flex gap-3.5 rounded-xl border bg-card/70 p-4"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <b.icon size={18} />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{b.title}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{b.text}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.section>

          {/* Registration form */}
          <section aria-labelledby="register-heading">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle id="register-heading" className="flex items-center gap-2 text-base">
                  <UserPlus size={16} className="text-primary" /> Register your business
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Only the business name is required — you can add the rest any time during
                  verification. You&apos;ll become the account <span className="font-medium">owner</span>.
                </p>
              </CardHeader>
              <CardContent>
                <form onSubmit={submitRegistration} className="space-y-4" noValidate>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="org-name">
                        Business name <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="org-name"
                        value={form.name}
                        onChange={(e) => setField('name')(e.target.value)}
                        placeholder="Acme Trading Co"
                        className="rounded-xl"
                        required
                        maxLength={120}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="org-legal">Legal name</Label>
                      <Input
                        id="org-legal"
                        value={form.legalName}
                        onChange={(e) => setField('legalName')(e.target.value)}
                        placeholder="Acme Trading Company LLC"
                        className="rounded-xl"
                        maxLength={160}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="org-tax">Tax ID</Label>
                      <Input
                        id="org-tax"
                        value={form.taxId}
                        onChange={(e) => setField('taxId')(e.target.value)}
                        placeholder="US-EIN 12-3456789"
                        className="rounded-xl"
                        maxLength={50}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="org-reg">Registration number</Label>
                      <Input
                        id="org-reg"
                        value={form.registrationNumber}
                        onChange={(e) => setField('registrationNumber')(e.target.value)}
                        placeholder="State / chamber number"
                        className="rounded-xl"
                        maxLength={50}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="org-industry">Industry</Label>
                      <Input
                        id="org-industry"
                        value={form.industry}
                        onChange={(e) => setField('industry')(e.target.value)}
                        placeholder="Wholesale, manufacturing, retail…"
                        className="rounded-xl"
                        maxLength={80}
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="org-website">Website</Label>
                      <Input
                        id="org-website"
                        type="url"
                        value={form.website}
                        onChange={(e) => setField('website')(e.target.value)}
                        placeholder="https://acme.com"
                        className="rounded-xl"
                        maxLength={200}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <p className="text-xs text-muted-foreground">
                      One user owns one business account.
                    </p>
                    <Button type="submit" className="rounded-xl" disabled={submitting}>
                      {submitting ? (
                        <>
                          <Loader2 size={15} className="mr-1.5 animate-spin" /> Registering…
                        </>
                      ) : (
                        'Register business'
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </section>
        </div>
      ) : (
        /* ── Has organization: status card + members ── */
        <div className="mt-8 space-y-6">
          {/* Org selector when a user belongs to several businesses */}
          {orgs.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Viewing
              </span>
              <Select value={activeOrgId ?? undefined} onValueChange={setSelectedId}>
                <SelectTrigger className="h-9 w-64 rounded-full text-sm" aria-label="Select organization">
                  <SelectValue placeholder="Select organization" />
                </SelectTrigger>
                <SelectContent>
                  {orgs.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <OrgStatusCard org={detail} loading={detailLoading && !detailData} />

          {/* Purchase-approval workflow (ACTIVE orgs) */}
          {detail?.status === 'ACTIVE' && (
            <ApprovalsCard org={detail} myRole={detail.myRole} onChanged={() => void refetchDetail()} />
          )}

          {/* Members */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center justify-between gap-2 text-base">
                <span className="flex items-center gap-2">
                  <Users size={16} className="text-primary" /> Team members
                  <span className="text-xs font-normal text-muted-foreground">
                    ({detail?.members?.length ?? orgs.find((o) => o.id === activeOrgId)?.memberCount ?? 0})
                  </span>
                </span>
                {detail?.myRole && (
                  <span className="text-xs font-normal text-muted-foreground">
                    You are <StatusBadge status={detail.myRole} map={ORG_ROLE_MAP} />
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {detailLoading && !detailData ? (
                <div className="space-y-3">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-xl" />
                  ))}
                </div>
              ) : (detail?.members ?? []).length === 0 ? (
                <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                  No members yet — invite your team below.
                </p>
              ) : (
                <ul className="divide-y rounded-xl border">
                  {(detail?.members ?? []).map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <Avatar className="h-9 w-9 border">
                        <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
                          {initials(m.user.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{m.user.name}</p>
                        <p className="flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground">
                          <Mail size={11} className="shrink-0" /> {m.user.email}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {m.jobTitle && (
                          <span className="hidden text-xs text-muted-foreground sm:inline">{m.jobTitle}</span>
                        )}
                        <StatusBadge status={m.role} map={ORG_ROLE_MAP} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <Separator />

              {canManageMembers ? (
                <form onSubmit={submitAddMember} className="space-y-3" noValidate>
                  <p className="text-sm font-semibold">Add a member</p>
                  <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                    <div className="space-y-1.5">
                      <Label htmlFor="member-email" className="sr-only">
                        Email
                      </Label>
                      <Input
                        id="member-email"
                        type="email"
                        value={memberForm.email}
                        onChange={(e) => setMemberForm((f) => ({ ...f, email: e.target.value }))}
                        placeholder="colleague@company.com"
                        className="rounded-xl"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="member-role" className="sr-only">
                        Role
                      </Label>
                      <Select
                        value={memberForm.role}
                        onValueChange={(v) => setMemberForm((f) => ({ ...f, role: v }))}
                      >
                        <SelectTrigger id="member-role" className="h-10 w-full rounded-xl sm:w-36" aria-label="Member role">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ADMIN">Admin</SelectItem>
                          <SelectItem value="BUYER">Buyer</SelectItem>
                          <SelectItem value="APPROVER">Approver</SelectItem>
                          <SelectItem value="VIEWER">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="member-title" className="sr-only">
                        Job title
                      </Label>
                      <Input
                        id="member-title"
                        value={memberForm.jobTitle}
                        onChange={(e) => setMemberForm((f) => ({ ...f, jobTitle: e.target.value }))}
                        placeholder="Job title (optional)"
                        className="rounded-xl"
                        maxLength={80}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                      They need an existing Vendora account with that email.
                    </p>
                    <Button type="submit" variant="outline" className="rounded-xl" disabled={addingMember}>
                      {addingMember ? (
                        <>
                          <Loader2 size={14} className="mr-1.5 animate-spin" /> Adding…
                        </>
                      ) : (
                        <>
                          <Plus size={14} className="mr-1.5" /> Add member
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Only owners and admins can add members — ask {detail?.name}&apos;s owner to invite
                  new colleagues.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Where B2B actually happens */}
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <FileText size={18} />
                </span>
                <div>
                  <p className="text-sm font-semibold">Request bulk pricing</p>
                  <p className="text-xs text-muted-foreground">
                    Send a request for quote on behalf of {detail?.name ?? 'your business'}.
                  </p>
                </div>
              </div>
              <Button className="rounded-xl" onClick={() => navigate('rfqs')}>
                Go to RFQs
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

// ── Status card (per org status) ────────────────────────────────────────────

function OrgStatusCard({ org, loading }: { org: OrganizationDTO | null; loading: boolean }) {
  if (loading || !org) {
    return <Skeleton className="h-52 w-full rounded-2xl" />
  }

  const groups = org.groups ?? []

  return (
    <Card className="overflow-hidden">
      <div
        className={cn(
          'flex flex-wrap items-center gap-3 border-b px-5 py-4 sm:px-6',
          org.status === 'ACTIVE' && 'bg-emerald-50/80 dark:bg-emerald-950/30',
          org.status === 'PENDING_VERIFICATION' && 'bg-amber-50/80 dark:bg-amber-950/30',
          org.status === 'SUSPENDED' && 'bg-rose-50/80 dark:bg-rose-950/30',
          org.status === 'REJECTED' && 'bg-muted/60'
        )}
      >
        <span
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
            org.status === 'ACTIVE' && 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
            org.status === 'PENDING_VERIFICATION' && 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
            org.status === 'SUSPENDED' && 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
            org.status === 'REJECTED' && 'bg-muted text-muted-foreground'
          )}
        >
          {org.status === 'ACTIVE' ? (
            <CheckCircle2 size={22} />
          ) : org.status === 'PENDING_VERIFICATION' ? (
            <Hourglass size={22} />
          ) : (
            <ShieldAlert size={22} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold leading-tight">{org.name}</h2>
            <StatusBadge status={org.status} map={ORG_STATUS_MAP} />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Registered {formatDate(org.createdAt)}
            {org.industry ? ` · ${org.industry}` : ''}
            {org.website ? (
              <>
                {' · '}
                <a
                  href={org.website.startsWith('http') ? org.website : `https://${org.website}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline-offset-2 hover:underline"
                >
                  {org.website.replace(/^https?:\/\//, '')}
                </a>
              </>
            ) : ''}
          </p>
        </div>
      </div>

      <CardContent className="p-5 sm:p-6">
        {org.status === 'PENDING_VERIFICATION' && (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Clock size={15} className="text-amber-600 dark:text-amber-400" /> We&apos;re reviewing
              your business
            </p>
            <ol className="space-y-2.5 text-sm text-muted-foreground">
              {[
                'Our team checks your business details — this usually happens quickly.',
                'You can keep browsing and buying at retail while you wait.',
                'Once verified, contract pricing, NET payment terms and team features unlock automatically.',
              ].map((step, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-[11px] font-bold text-amber-700 dark:text-amber-400">
                    {i + 1}
                  </span>
                  <span className="leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
            <p className="rounded-xl bg-muted/60 px-4 py-3 text-xs text-muted-foreground">
              Need it faster? Reply to any order confirmation email and mention your business name —
              verification requests are prioritized.
            </p>
          </div>
        )}

        {org.status === 'ACTIVE' && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-muted/50 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Verified since
                </p>
                <p className="mt-0.5 text-sm font-semibold">
                  {org.verifiedAt ? formatDate(org.verifiedAt) : '—'}
                </p>
              </div>
              <div className="rounded-xl bg-muted/50 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Payment terms
                </p>
                <p className="mt-0.5 text-sm font-semibold">
                  {org.creditTermsDays > 0 ? `NET-${org.creditTermsDays}` : 'Prepaid'}
                </p>
              </div>
              <div className="rounded-xl bg-muted/50 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Credit limit
                </p>
                <p className="mt-0.5 text-sm font-semibold">
                  {org.creditLimit > 0 ? formatUSD(org.creditLimit) : 'Not set'}
                </p>
              </div>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Customer groups
              </p>
              {groups.length === 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  No customer groups yet — group price lists apply automatically once mapped.
                </p>
              ) : (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {groups.map((g) => (
                    <span
                      key={g.id}
                      className="rounded-full bg-orange-100 px-2.5 py-0.5 text-[11px] font-semibold text-orange-800 dark:bg-orange-950 dark:text-orange-300"
                    >
                      {g.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {org.status === 'SUSPENDED' && (
          <div className="space-y-2 text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">This business account is suspended.</p>
            <p className="leading-relaxed">
              Buying on behalf of {org.name} is paused and contract pricing is inactive. Reach out to
              Vendora support from your account email to resolve outstanding items and restore access.
            </p>
          </div>
        )}

        {org.status === 'REJECTED' && (
          <div className="space-y-2 text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">We couldn&apos;t verify this business.</p>
            <p className="leading-relaxed">
              The details submitted didn&apos;t match our verification checks. You can still buy at
              retail prices — or contact support with updated registration documents to retry
              verification.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
