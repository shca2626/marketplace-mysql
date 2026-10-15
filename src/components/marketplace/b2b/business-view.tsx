'use client'

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Building2,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileText,
  FolderLock,
  Hourglass,
  Loader2,
  Mail,
  Percent,
  Plus,
  ReceiptText,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Store,
  UserPlus,
  Users,
  Wallet,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { apiRequest, ORG_ROLE_MAP, ORG_STATUS_MAP, RFQ_STATUS_MAP, StatusBadge, type AuthzContextResponse } from './b2b-shared'
import { ApprovalsCard } from './approvals-card'
import { SellingContextGate, SellingSection } from './selling-section'
import { FinancingCard } from './financing-card'
import { RolesSection } from './roles-section'
import { DocumentsSection } from '@/components/marketplace/financing/documents-section'

// ── Register-form state ─────────────────────────────────────────────────────

/** Org-scoped RFQ list item (subset of RfqDTO the Buying panel renders). */
interface RfqLite {
  id: string
  number: string
  status: string
  title?: string | null
  createdAt: string
  lineCount?: number
  quoteCount?: number
  lines?: { id: string }[]
}

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

  // Active context (authz): the orgs the user belongs to + the server-validated
  // active organization. The Selling console targets the active COMPANY org;
  // the overview follows it too (falling back to the first org until the user
  // has ever picked a context).
  const { data: ctxData, refetch: refetchContext } = useApi<AuthzContextResponse>(
    user ? '/api/context' : null,
    { skip: !user }
  )
  const contextOrgs = ctxData?.orgs ?? []
  const activeContextOrg = ctxData?.activeOrg ?? null
  const companyOrgs = useMemo(
    () => contextOrgs.filter((o) => o.orgType === 'COMPANY'),
    [contextOrgs]
  )

  // Context switching — same endpoint the header switcher uses (server-side
  // membership validation; the cookie is only a selector). A switch RELOADS
  // the app so every scoped payload and permission re-resolves from scratch
  // (Phase 4 context separation). The registration flow opts out (`reload:
  // false`) so the welcome toast survives — this page alone re-renders on the
  // refetched context, and every query here is keyed to the active org.
  const [switching, setSwitching] = useState(false)
  const switchContext = async (organizationId: string, opts?: { reload?: boolean }) => {
    if (switching) return
    setSwitching(true)
    try {
      const res = await fetch('/api/context/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId }),
      })
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string }
        toast({
          title: 'Could not switch context',
          description: json.error ?? 'Please try again in a moment.',
          variant: 'destructive',
        })
        return false
      }
      if (opts?.reload === false) {
        await refetchContext()
      } else {
        window.location.reload()
      }
      return true
    } catch {
      toast({ title: 'Could not switch context', description: 'Network error — please try again.', variant: 'destructive' })
      return false
    } finally {
      setSwitching(false)
    }
  }

  const {
    data: orgListData,
    loading: orgsLoading,
    refetch: refetchOrgs,
  } = useApi<{ organizations: OrganizationDTO[] }>(user ? '/api/organizations' : null, {
    skip: !user,
  })

  const orgs = useMemo(() => orgListData?.organizations ?? [], [orgListData])
  // Local fallback selection — only used while no context has been chosen (or
  // if a context switch ever fails), so the overview never goes blank.
  const [localOrgId, setLocalOrgId] = useState<string | null>(null)
  const activeOrgId = activeContextOrg?.id ?? (localOrgId && orgs.some((o) => o.id === localOrgId) ? localOrgId : orgs[0]?.id) ?? null
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
    // Jump the console (and the active context) to the freshly created org.
    // reload:false keeps the welcome toast — this page refetches its context.
    const switched = await switchContext(res.data.organization.id, { reload: false })
    if (!switched) setLocalOrgId(res.data.organization.id)
    void refetchOrgs()
    toast({
      title: `Welcome aboard, ${res.data.organization.name}!`,
      description: 'Your business account is registered — verification usually completes quickly.',
    })
  }

  // ── Add member form ──
  const [memberForm, setMemberForm] = useState({ email: '', role: 'BUYER', jobTitle: '' })
  const [addingMember, setAddingMember] = useState(false)
  // BUY-213: the invite answer renders INLINE under the field — a 404 "no
  // account with that email" (or 403/409) is actionable right where the user
  // typed it, instead of being swallowed after the field clears.
  const [memberError, setMemberError] = useState<string | null>(null)

  const canManageMembers = detail?.myRole === 'OWNER' || detail?.myRole === 'ADMIN'

  const submitAddMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeOrgId) return
    setMemberError(null)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(memberForm.email.trim())) {
      setMemberError('Enter a valid email — it must be an existing Vendora account.')
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
      // Keep the typed email so it can be corrected — surface the server's
      // reason (e.g. "No Vendora account exists with that email") inline.
      setMemberError(res.error ?? 'Could not add this member — please try again.')
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
      {/* ── Page header ── */}
      <div className="flex items-start gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Building2 size={22} />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Business account</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your B2B identity on Vendora — verification, payment terms and your team.
          </p>
        </div>
      </div>

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
                    className="flex gap-3.5 rounded-xl border bg-card/70 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm"
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
        /* ── Has organization: company workspace (Overview + Selling tabs) ── */
        <div className="mt-8 space-y-6">
          {/* Org selector when a user belongs to several businesses — switching
              also switches the ACTIVE CONTEXT (same endpoint as the header) so
              the Selling console always targets the org being viewed. */}
          {orgs.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Viewing
              </span>
              <Select
                value={activeOrgId ?? undefined}
                onValueChange={(v) => {
                  if (v !== activeContextOrg?.id) void switchContext(v)
                }}
                disabled={switching}
              >
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

          <Tabs defaultValue="overview">
            <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-xl bg-muted/60 p-1 sm:w-auto">
              <TabsTrigger value="overview" className="gap-1.5 rounded-lg px-3.5 py-1.5">
                <Building2 size={14} /> Overview
              </TabsTrigger>
              <TabsTrigger value="buying" className="gap-1.5 rounded-lg px-3.5 py-1.5">
                <ShoppingBag size={14} /> Buying
              </TabsTrigger>
              {companyOrgs.length > 0 && (
                <TabsTrigger value="selling" className="gap-1.5 rounded-lg px-3.5 py-1.5">
                  <Store size={14} /> Selling
                </TabsTrigger>
              )}
              <TabsTrigger value="financing" className="gap-1.5 rounded-lg px-3.5 py-1.5">
                <Wallet size={14} /> Financing
              </TabsTrigger>
              <TabsTrigger value="documents" className="gap-1.5 rounded-lg px-3.5 py-1.5">
                <FolderLock size={14} /> Documents
              </TabsTrigger>
              <TabsTrigger value="team" className="gap-1.5 rounded-lg px-3.5 py-1.5">
                <ShieldCheck size={14} /> Team &amp; roles
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-6 space-y-6">
              <OrgStatusCard org={detail} loading={detailLoading && !detailData} />

              {/* Purchase-approval workflow (ACTIVE orgs) */}
              {detail?.status === 'ACTIVE' && (
                <ApprovalsCard org={detail} myRole={detail.myRole} onChanged={() => void refetchDetail()} />
              )}

              {/* Workspace map — one combined buying-and-selling console */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { tab: 'buying', icon: ShoppingBag, title: 'Buy for the business', text: 'Procurement RFQs, direct purchases & approvals' },
                  ...(companyOrgs.length > 0
                    ? [{ tab: 'selling', icon: Store, title: 'Sell & fulfill', text: 'Offers, stores, sales orders & quotes' }]
                    : []),
                  { tab: 'financing', icon: Wallet, title: 'Financing & accreditation', text: 'Apply through the verification gate' },
                  { tab: 'documents', icon: FolderLock, title: 'Company documents', text: 'Org vault — verified once, reused' },
                  { tab: 'team', icon: Users, title: 'Team & roles', text: 'Members, invitations & permissions' },
                ].map((tile) => (
                  <div key={tile.tab} className="rounded-xl border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <tile.icon size={16} />
                    </span>
                    <p className="mt-2.5 text-sm font-semibold leading-tight">{tile.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{tile.text}</p>
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* ── Buying: procurement RFQs + direct purchases on the org context ── */}
            <TabsContent value="buying" className="mt-6 space-y-6">
              <BuyingPanel
                org={detail}
                activeContextOrg={activeContextOrg}
                buyingAsActive={activeContextOrg?.id === activeOrgId}
                onSwitch={(id) => void switchContext(id)}
                switching={switching}
              />
            </TabsContent>

            {/* ── Selling (company orgs) — offers, proposals, stores, sales ── */}
            {companyOrgs.length > 0 && (
              <TabsContent value="selling" className="mt-6">
                {activeContextOrg?.orgType === 'COMPANY' ? (
                  <SellingSection organizationId={activeContextOrg.id} orgName={activeContextOrg.name} />
                ) : (
                  <SellingContextGate
                    companyOrgs={companyOrgs}
                    activeLabel={
                      activeContextOrg
                        ? `working as ${activeContextOrg.name}`
                        : 'in your personal context'
                    }
                    switching={switching}
                    onSwitch={(id) => void switchContext(id)}
                  />
                )}
              </TabsContent>
            )}

            {/* ── Financing & accreditation applications (company applicant) ── */}
            <TabsContent value="financing" className="mt-6">
              <FinancingCard />
            </TabsContent>

            {/* ── Company document vault ── */}
            <TabsContent value="documents" className="mt-6">
              <DocumentsSection defaultOrganizationId={activeOrgId} />
            </TabsContent>

            {/* ── Team & roles ── */}
            <TabsContent value="team" className="mt-6 space-y-6">
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center justify-between gap-2 text-base">
                    <span className="flex items-center gap-2">
                      <Users size={16} className="text-primary" /> Team members
                      <span className="rounded-full bg-muted px-1.5 text-[11px] font-bold tabular-nums text-muted-foreground">
                        {detail?.members?.length ?? orgs.find((o) => o.id === activeOrgId)?.memberCount ?? 0}
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
                            onChange={(e) => {
                              setMemberForm((f) => ({ ...f, email: e.target.value }))
                              if (memberError) setMemberError(null)
                            }}
                            placeholder="colleague@company.com"
                            className="rounded-xl"
                            aria-invalid={!!memberError}
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
                      {memberError && (
                        <p
                          role="alert"
                          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive"
                        >
                          <ShieldAlert size={14} className="mt-px shrink-0" />
                          <span className="min-w-0 break-words">{memberError}</span>
                        </p>
                      )}
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

              {/* Canonical org-scope RBAC — custom roles + per-member assignments */}
              {activeOrgId && (
                <RolesSection organizationId={activeOrgId} canManage={!!canManageMembers} />
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  )
}

// ── Buying panel (procurement + direct purchases on the org context) ─────────

function BuyingPanel({
  org,
  activeContextOrg,
  buyingAsActive,
  onSwitch,
  switching,
}: {
  org: OrganizationDTO | null
  activeContextOrg: { id: string; name: string; orgType?: string | null } | null
  buyingAsActive: boolean
  onSwitch: (organizationId: string) => void
  switching: boolean
}) {
  const navigate = useMarketplace((s) => s.navigate)
  const { data: rfqData, loading: rfqLoading } = useApi<{ rfqs: RfqLite[] }>(
    org ? `/api/rfqs?organizationId=${org.id}` : null,
    { skip: !org }
  )
  const rfqs = rfqData?.rfqs ?? []
  const openCount = rfqs.filter((r) => ['SUBMITTED', 'UNDER_REVIEW', 'QUOTED'].includes(r.status)).length

  if (!org) return null

  return (
    <div className="space-y-6">
      {/* Context gate — orders placed from here carry the org identity */}
      {buyingAsActive && activeContextOrg?.orgType === 'COMPANY' ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-teal-500/40 bg-teal-500/5 px-4 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300">
            <ShoppingBag size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Buying as {org.name}</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Checkout runs on the company identity{org.creditTermsDays > 0 ? ` — NET-${org.creditTermsDays} terms` : ''},
              with purchase-approval routing{org.approvalThreshold != null ? ` above ${formatUSD(org.approvalThreshold)}` : ''}.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-primary/40 bg-primary/[0.04] px-4 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldAlert size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Switch your active context to buy as {org.name}</p>
            <p className="text-xs text-muted-foreground">
              Orders, RFQs and approvals attach to the company only while its context is active.
            </p>
          </div>
          <Button size="sm" className="rounded-xl" disabled={switching} onClick={() => onSwitch(org.id)}>
            {switching ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : null}
            Switch context
          </Button>
        </div>
      )}

      {/* Procurement RFQs on behalf of the company */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText size={16} className="text-primary" /> Procurement RFQs
              <span className="rounded-full bg-muted px-1.5 text-[11px] font-bold tabular-nums text-muted-foreground">
                {rfqs.length}
              </span>
            </CardTitle>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Multi-line requests for quote, negotiations and recurring schedules on behalf of {org.name}.
            </p>
          </div>
          <Button size="sm" className="rounded-xl" onClick={() => navigate('rfqs')}>
            Open RFQ console
          </Button>
        </CardHeader>
        <CardContent>
          {rfqLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-xl" />
              ))}
            </div>
          ) : rfqs.length === 0 ? (
            <div className="rounded-xl border border-dashed px-4 py-6 text-center">
              <p className="text-sm font-semibold">No RFQs for {org.name} yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Send your first request for quote — compare supplier offers side by side.
              </p>
              <Button size="sm" variant="outline" className="mt-3 rounded-xl" onClick={() => navigate('rfqs')}>
                <Plus size={13} className="mr-1.5" /> New RFQ
              </Button>
            </div>
          ) : (
            <>
              {openCount > 0 && (
                <p className="mb-2.5 text-xs font-semibold text-muted-foreground">
                  {openCount} in negotiation · showing {Math.min(3, rfqs.length)} of {rfqs.length}
                </p>
              )}
              <ul className="divide-y rounded-xl border">
                {rfqs.slice(0, 3).map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <FileText size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{r.title || r.number}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.lineCount ?? r.lines?.length ?? 0} line(s)
                        {typeof r.quoteCount === 'number' ? ` · ${r.quoteCount} quote(s)` : ''} ·{' '}
                        {formatDate(r.createdAt)}
                      </p>
                    </div>
                    <StatusBadge status={r.status} map={RFQ_STATUS_MAP} />
                  </li>
                ))}
              </ul>
              <button
                className="mt-3 text-xs font-medium text-primary hover:underline"
                onClick={() => navigate('rfqs')}
              >
                View all RFQs →
              </button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Direct purchases */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShoppingBag size={16} />
          </span>
          <p className="mt-2.5 text-sm font-semibold">Buy directly from the catalog</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Shared-catalog products with company offers — checkout keeps the org identity and PO reference.
          </p>
          <Button size="sm" variant="outline" className="mt-3 rounded-xl" onClick={() => navigate('catalog')}>
            Browse catalog
          </Button>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CalendarCheck size={16} />
          </span>
          <p className="mt-2.5 text-sm font-semibold">Payment terms</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {org.status === 'ACTIVE'
              ? org.creditTermsDays > 0
                ? `NET-${org.creditTermsDays} invoicing`
                : 'Prepaid while no terms are set'
              : 'Verification pending — retail pricing for now'}
            {org.creditLimit > 0 ? ` · credit line ${formatUSD(org.creditLimit)}` : ''}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ReceiptText size={16} />
          </span>
          <p className="mt-2.5 text-sm font-semibold">Approvals</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {org.approvalThreshold != null && org.approvalThreshold > 0
              ? `Orders from BUYER members at or above ${formatUSD(org.approvalThreshold)} route to approvers first.`
              : 'No purchase-approval threshold set — all members can order directly.'}
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Status card (per org status) ────────────────────────────────────────────

function OrgStatusCard({ org, loading }: { org: OrganizationDTO | null; loading: boolean }) {
  if (loading || !org) {
    return <Skeleton className="h-52 w-full rounded-2xl" />
  }

  const groups = org.groups ?? []

  // Status-driven accents: a slim color strip on top of the card + tinted icon.
  const statusAccent =
    org.status === 'ACTIVE'
      ? 'border-t-emerald-500'
      : org.status === 'PENDING_VERIFICATION'
        ? 'border-t-amber-500'
        : org.status === 'SUSPENDED'
          ? 'border-t-rose-500'
          : 'border-t-border'

  return (
    <Card className={cn('overflow-hidden border-t-[3px] shadow-sm', statusAccent)}>
      <div className="flex flex-wrap items-center gap-3.5 border-b bg-muted/30 px-5 py-4 sm:px-6">
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
            <h2 className="truncate text-lg font-bold leading-tight">{org.name}</h2>
            <StatusBadge status={org.status} map={ORG_STATUS_MAP} />
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            Registered {formatDate(org.createdAt)}
            {org.industry ? <span className="mx-1.5">·</span> : null}
            {org.industry}
            {org.website ? (
              <>
                <span className="mx-1.5">·</span>
                <a
                  href={org.website.startsWith('http') ? org.website : `https://${org.website}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline-offset-2 hover:text-primary hover:underline"
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
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { icon: CalendarCheck, label: 'Verified since', value: org.verifiedAt ? formatDate(org.verifiedAt) : '—' },
                { icon: ReceiptText, label: 'Payment terms', value: org.creditTermsDays > 0 ? `NET-${org.creditTermsDays}` : 'Prepaid' },
                { icon: Wallet, label: 'Credit limit', value: org.creditLimit > 0 ? formatUSD(org.creditLimit) : 'Not set' },
              ].map((tile) => (
                <div key={tile.label} className="flex items-center gap-3 rounded-xl border bg-muted/30 px-4 py-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <tile.icon size={16} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {tile.label}
                    </p>
                    <p className="mt-0.5 truncate text-sm font-bold">{tile.value}</p>
                  </div>
                </div>
              ))}
            </div>
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                Customer groups
              </p>
              {groups.length === 0 ? (
                <p className="mt-1.5 text-sm text-muted-foreground">
                  No customer groups yet — group price lists apply automatically once mapped.
                </p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-1.5">
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
