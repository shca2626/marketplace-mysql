'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FINANCIER VIEW — the institution console (?view=financier, FIN-5).
// Guard: signed-in user who is an OWNER/ADMIN member of a BANK/MFI/EWALLET
// organization (DP-1 — access comes from OrganizationMember, not a global
// role; the backend auto-provisions the FinancierProfile, FIN-001). Sections:
// Dashboard · Services · Requirements composer · Inbox · Offers ·
// Accreditations · Agreements · Profile. Multi-org staff can switch their
// active institution from the topbar (FIN-013).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { Landmark, Loader2, ShieldAlert } from 'lucide-react'
import { useMarketplace } from '@/store/marketplace'
import { useApi } from '@/hooks/use-api'
import type { OrganizationDTO } from '@/lib/types'
import { DashboardLayout, PageHeader, SignInRequired, AccessDenied } from '@/components/dashboards/dashboard-layout'
import { FINANCIER_NAV } from '@/components/dashboards/nav-config'
import type { NavItem } from '@/components/dashboards/nav-config'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { apiRequest } from '@/components/marketplace/admin/shared'
import { DashboardSection } from '@/components/marketplace/financier/dashboard-section'
import { ServicesSection } from '@/components/marketplace/financier/services-section'
import { RequirementsSection } from '@/components/marketplace/financier/requirements-section'
import { InboxSection } from '@/components/marketplace/financier/inbox-section'
import { OffersSection } from '@/components/marketplace/financier/offers-section'
import { AccreditationsSection } from '@/components/marketplace/financier/accreditations-section'
import { AgreementsSection } from '@/components/marketplace/financier/agreements-section'
import { ProfileSection } from '@/components/marketplace/financier/profile-section'
import { OperationsSection } from '@/components/marketplace/financier/operations-section'
import { AnalyticsSection } from '@/components/marketplace/financier/analytics-section'
import { TeamSection } from '@/components/marketplace/financier/team-section'

const FINANCIER_ORG_TYPES = new Set(['BANK', 'MFI', 'EWALLET'])

interface FinancierContextResponse {
  context: {
    organizationId: string
    organizationName: string
    organizationType?: string
    financierProfileId: string
  } | null
  organizations: { id: string; name: string; orgType: string }[]
  activeOrganizationId: string | null
}

/**
 * Compact institution switcher for multi-org staff (FIN-013). Switching sets
 * the server-side fin_org cookie and reloads so every /api/financier/* call
 * (and the console) re-resolves against the new active institution.
 */
function InstitutionSwitcher() {
  const { data } = useApi<FinancierContextResponse>('/api/financier/context')
  const [switching, setSwitching] = useState(false)
  const organizations = data?.organizations ?? []
  const activeId = data?.activeOrganizationId ?? data?.context?.organizationId ?? null

  if (organizations.length < 2 || !activeId) return null

  const switchTo = async (organizationId: string) => {
    if (organizationId === activeId) return
    setSwitching(true)
    await apiRequest('/api/financier/context', {
      method: 'POST',
      body: JSON.stringify({ organizationId }),
    })
    window.location.reload()
  }

  return (
    <div className="flex items-center gap-1.5">
      <Select value={activeId} onValueChange={(v) => void switchTo(v)} disabled={switching}>
        <SelectTrigger
          className="h-8 w-[170px] rounded-lg text-xs sm:w-[210px]"
          aria-label="Active institution"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {switching ? <Loader2 size={12} className="shrink-0 animate-spin" /> : <Landmark size={12} className="shrink-0 text-primary" />}
            <SelectValue />
          </span>
        </SelectTrigger>
        <SelectContent>
          {organizations.map((o) => (
            <SelectItem key={o.id} value={o.id} className="text-xs">
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function FinancierConsole() {
  const [section, setSection] = useState('dashboard')
  const onNavigate = (item: NavItem) => setSection(item.key)

  const { icon: headerIcon, title, description } = useMemo(() => {
    const t = FINANCIER_NAV.titles[section] ?? FINANCIER_NAV.titles.dashboard
    const item = FINANCIER_NAV.groups.flatMap((g) => g.items).find((i) => i.key === section)
    return { icon: item?.icon, title: t.title, description: t.description }
  }, [section])

  return (
    <DashboardLayout
      role="buyer"
      nav={FINANCIER_NAV}
      activeKey={section}
      onNavigate={onNavigate}
      roleBadgeLabel="Institution Staff"
      topbarSlot={<InstitutionSwitcher />}
    >
      <PageHeader icon={headerIcon} title={title} description={description} />
      {section === 'dashboard' && <DashboardSection onNavigate={setSection} />}
      {section === 'services' && <ServicesSection />}
      {section === 'requirements' && <RequirementsSection />}
      {section === 'inbox' && <InboxSection />}
      {section === 'offers' && <OffersSection />}
      {section === 'accreditations' && <AccreditationsSection />}
      {section === 'agreements' && <AgreementsSection />}
      {section === 'operations' && <OperationsSection />}
      {section === 'analytics' && <AnalyticsSection />}
      {section === 'profile' && <ProfileSection />}
      {section === 'team' && <TeamSection />}
    </DashboardLayout>
  )
}

export function FinancierView() {
  const user = useMarketplace((s) => s.user)
  const authChecked = useMarketplace((s) => s.authChecked)
  const { data: orgsData, loading: orgsLoading } = useApi<{ organizations: OrganizationDTO[] }>(
    user ? '/api/organizations' : null,
    { skip: !user }
  )

  if (!user && authChecked) {
    return (
      <SignInRequired
        icon={ShieldAlert}
        title="Financier console"
        description="Sign in with an institution staff account (bank, microfinance or e-wallet)."
        afterView="financier"
      />
    )
  }

  if (!user || !authChecked || orgsLoading) {
    // Full-page skeleton while the session + memberships resolve
    return (
      <div className="min-h-screen bg-muted/40 p-6">
        <div className="mx-auto w-full max-w-[1400px] space-y-6">
          <Skeleton className="h-11 w-72 rounded-xl" />
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    )
  }

  const financierOrg = (orgsData?.organizations ?? []).find(
    (o) => FINANCIER_ORG_TYPES.has(o.orgType ?? '') && (o.myRole === 'OWNER' || o.myRole === 'ADMIN')
  )

  if (!financierOrg) {
    return (
      <AccessDenied
        icon={ShieldAlert}
        title="Financier staff access required"
        description="This console is for owners and admins of a bank, microfinance or e-wallet institution on Vendora."
      />
    )
  }

  return <FinancierConsole />
}
