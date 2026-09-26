'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN CONSOLE — platform owner workspace on the dedicated DashboardLayout.
// The sidebar (built from ADMIN_NAV) drives sections; the active section is
// URL-addressable via ?view=admin&tab=<section> so links are shareable and
// the browser back/forward buttons work. Content sections are the existing,
// battle-tested tab components — only the shell changed.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react'
import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { useMarketplace } from '@/store/marketplace'
import { DashboardLayout, PageHeader, SignInRequired, AccessDenied } from '@/components/dashboards/dashboard-layout'
import { ADMIN_NAV } from '@/components/dashboards/nav-config'
import type { NavItem } from '@/components/dashboards/nav-config'
import { AuditTab } from './admin/audit-tab'
import { CouponsTab } from './admin/coupons-tab'
import { OrganizationsTab } from './admin/organizations-tab'
import { OverviewTab } from './admin/overview-tab'
import { PricingTab } from './admin/pricing-tab'
import { RfqsTab } from './admin/rfqs-tab'
import { DisputesTab } from './admin/disputes-tab'
import { VendorsTab } from './admin/vendors-tab'
import { AdminProductsTab } from './admin/products-tab'
import { AdminOrdersTab } from './admin/orders-tab'
import { PaymentsTab } from './admin/payments-tab'
import { PayoutsTab } from './admin/payouts-tab'
import { FinancingTab } from './admin/financing-tab'
import { AdminSettings } from './admin-settings'
import { RfqSettings } from './admin/settings/rfq-settings'

function AdminDashboard() {
  const navigate = useMarketplace((s) => s.navigate)
  const params = useMarketplace((s) => s.params)
  const activeSection = params.adminTab ?? 'overview'

  const onNavigate = (item: NavItem) => {
    navigate('admin', { adminTab: item.key === 'overview' ? undefined : item.key })
  }

  const { icon: headerIcon, title, description } = useMemo(() => {
    const t = ADMIN_NAV.titles[activeSection] ?? ADMIN_NAV.titles.overview
    const item = ADMIN_NAV.groups.flatMap((g) => g.items).find((i) => i.key === activeSection)
    return { icon: item?.icon, title: t.title, description: t.description }
  }, [activeSection])

  return (
    <DashboardLayout role="admin" nav={ADMIN_NAV} activeKey={activeSection} onNavigate={onNavigate}>
      <PageHeader icon={headerIcon} title={title} description={description} />
      {activeSection === 'overview' && <OverviewTab />}
      {activeSection === 'vendors' && <VendorsTab />}
      {activeSection === 'products' && <AdminProductsTab />}
      {activeSection === 'orders' && <AdminOrdersTab />}
      {activeSection === 'payments' && <PaymentsTab />}
      {activeSection === 'payouts' && <PayoutsTab />}
      {activeSection === 'financing' && <FinancingTab />}
      {activeSection === 'organizations' && <OrganizationsTab />}
      {activeSection === 'pricing' && <PricingTab />}
      {activeSection === 'coupons' && <CouponsTab />}
      {activeSection === 'rfqs' && <RfqsTab />}
      {activeSection === 'disputes' && <DisputesTab />}
      {activeSection === 'rfq-settings' && <RfqSettings />}
      {activeSection === 'storefront' && <AdminSettings />}
      {activeSection === 'audit' && <AuditTab />}
    </DashboardLayout>
  )
}

export function AdminView() {
  const user = useMarketplace((s) => s.user)
  const authChecked = useMarketplace((s) => s.authChecked)

  if (!user && authChecked) {
    return (
      <SignInRequired
        icon={ShieldCheck}
        title="Admin dashboard"
        description="Sign in with a platform administrator account to operate the marketplace."
        afterView="admin"
      />
    )
  }

  if (user && user.role !== 'ADMIN') {
    return (
      <AccessDenied
        icon={ShieldAlert}
        title="Admin access required"
        description="The admin dashboard is restricted to marketplace administrators."
      />
    )
  }

  return <AdminDashboard />
}
