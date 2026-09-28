'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FINANCIER VIEW — the institution console (?view=financier, FIN-5).
// Guard: signed-in user who is an OWNER/ADMIN member of a BANK/MFI/EWALLET
// organization (DP-1 — access comes from OrganizationMember, not a global
// role). Sections: Dashboard · Services · Requirements composer · Inbox ·
// Offers · Accreditations · Agreements · Profile.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { useMarketplace } from '@/store/marketplace'
import { useApi } from '@/hooks/use-api'
import type { OrganizationDTO } from '@/lib/types'
import { DashboardLayout, PageHeader, SignInRequired, AccessDenied } from '@/components/dashboards/dashboard-layout'
import { FINANCIER_NAV } from '@/components/dashboards/nav-config'
import type { NavItem } from '@/components/dashboards/nav-config'
import { Skeleton } from '@/components/ui/skeleton'
import { DashboardSection } from '@/components/marketplace/financier/dashboard-section'
import { ServicesSection } from '@/components/marketplace/financier/services-section'
import { RequirementsSection } from '@/components/marketplace/financier/requirements-section'
import { InboxSection } from '@/components/marketplace/financier/inbox-section'
import { OffersSection } from '@/components/marketplace/financier/offers-section'
import { AccreditationsSection } from '@/components/marketplace/financier/accreditations-section'
import { AgreementsSection } from '@/components/marketplace/financier/agreements-section'
import { ProfileSection } from '@/components/marketplace/financier/profile-section'

const FINANCIER_ORG_TYPES = new Set(['BANK', 'MFI', 'EWALLET'])

function FinancierConsole() {
  const [section, setSection] = useState('dashboard')
  const onNavigate = (item: NavItem) => setSection(item.key)

  const { icon: headerIcon, title, description } = useMemo(() => {
    const t = FINANCIER_NAV.titles[section] ?? FINANCIER_NAV.titles.dashboard
    const item = FINANCIER_NAV.groups.flatMap((g) => g.items).find((i) => i.key === section)
    return { icon: item?.icon, title: t.title, description: t.description }
  }, [section])

  return (
    <DashboardLayout role="buyer" nav={FINANCIER_NAV} activeKey={section} onNavigate={onNavigate}>
      <PageHeader icon={headerIcon} title={title} description={description} />
      {section === 'dashboard' && <DashboardSection onNavigate={setSection} />}
      {section === 'services' && <ServicesSection />}
      {section === 'requirements' && <RequirementsSection />}
      {section === 'inbox' && <InboxSection />}
      {section === 'offers' && <OffersSection />}
      {section === 'accreditations' && <AccreditationsSection />}
      {section === 'agreements' && <AgreementsSection />}
      {section === 'profile' && <ProfileSection />}
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
        description="This console is for owners and admins of a verified bank, microfinance or e-wallet institution on Vendora."
      />
    )
  }

  return <FinancierConsole />
}
