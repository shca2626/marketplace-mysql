'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN CONSOLE — platform owner workspace on the dedicated DashboardLayout.
// The sidebar (built from ADMIN_NAV) drives sections; the active section is
// URL-addressable via ?view=admin&tab=<section> so links are shareable and
// the browser back/forward buttons work. Content sections are the existing,
// battle-tested tab components — only the shell changed.
//
// RBAC (mergedplan.md Phase 2): entry is granted to legacy ADMINs (implicit
// super-admins) and to platform staff (users holding any platform-scope
// role). The nav is filtered per the user's effective permissions, and each
// admin API enforces the same keys server-side — the UI filter is cosmetic,
// the guards are the security boundary.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react'
import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { useMarketplace } from '@/store/marketplace'
import { DashboardLayout, PageHeader, SignInRequired, AccessDenied } from '@/components/dashboards/dashboard-layout'
import { ADMIN_NAV } from '@/components/dashboards/nav-config'
import type { NavConfig, NavItem } from '@/components/dashboards/nav-config'
import type { SessionUser } from '@/lib/types'
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
import { CurrenciesConsole } from './admin/currencies-console'
import { FinancingTab } from './admin/financing-tab'
import { RbacTab } from './admin/rbac-tab'
import { SecurityTab } from './admin/security-tab'
import { ModulesTab } from './admin/modules-tab'
import { WhatsAppTab } from './admin/whatsapp-tab'
import { SpecAttributesTab } from './admin/spec-attributes-tab'
import { CertificationsTab } from './admin/certifications-tab'
import { CatalogReviewQueueTab } from './admin/catalog/review-queue-tab'
import { CatalogProductsTab } from './admin/catalog/catalog-products-tab'
import { CatalogBrandsTab } from './admin/catalog/brands-tab'
import { CatalogCategoriesTab } from './admin/catalog/categories-tab'
import { CatalogUnitsTab } from './admin/catalog/units-tab'
import { CatalogOrgTypesTab } from './admin/catalog/org-types-tab'
import { CatalogDuplicatesTab } from './admin/catalog/duplicates-tab'
import { CatalogPopularTab } from './admin/catalog/popular-tab'
import { AgreementsTab } from './admin/agreements-tab'
import { AdminSettings } from './admin-settings'
import { RfqSettings } from './admin/settings/rfq-settings'

function hasPermission(user: SessionUser | null, item: NavItem): boolean {
  const keys = item.anyPermissions ?? (item.permission ? [item.permission] : [])
  if (keys.length === 0) return true
  if (!user) return false
  if (user.role === 'ADMIN') return true
  const permissions = user.permissions ?? []
  return keys.some((k) => permissions.includes(k))
}

function filterNavByPermissions(nav: NavConfig, user: SessionUser | null): NavConfig {
  if (user?.role === 'ADMIN') return nav
  const permissions = user?.permissions ?? []
  return {
    ...nav,
    groups: nav.groups
      .map((g) => ({
        ...g,
        items: g.items.filter((i) => {
          const keys = i.anyPermissions ?? (i.permission ? [i.permission] : [])
          return keys.length === 0 || keys.some((k) => permissions.includes(k))
        }),
      }))
      .filter((g) => g.items.length > 0),
  }
}

function AdminDashboard({ user }: { user: SessionUser | null }) {
  const navigate = useMarketplace((s) => s.navigate)
  const params = useMarketplace((s) => s.params)
  const requested = params.adminTab ?? 'overview'

  const nav = useMemo(() => filterNavByPermissions(ADMIN_NAV, user), [user])

  const onNavigate = (item: NavItem) => {
    navigate('admin', { adminTab: item.key === 'overview' ? undefined : item.key })
  }

  // A staff user deep-linking to a section they cannot see falls back to the
  // overview instead of an empty shell — the API would 403 anyway.
  const activeSection = useMemo(
    () =>
      ADMIN_NAV.groups.flatMap((g) => g.items).some((i) => i.key === requested && hasPermission(user, i))
        ? requested
        : 'overview',
    [requested, user]
  )

  const { icon: headerIcon, title, description } = useMemo(() => {
    const t = ADMIN_NAV.titles[activeSection] ?? ADMIN_NAV.titles.overview
    const item = ADMIN_NAV.groups.flatMap((g) => g.items).find((i) => i.key === activeSection)
    return { icon: item?.icon, title: t.title, description: t.description }
  }, [activeSection])

  return (
    <DashboardLayout role="admin" nav={nav} activeKey={activeSection} onNavigate={onNavigate}>
      <PageHeader icon={headerIcon} title={title} description={description} />
      {activeSection === 'overview' && <OverviewTab />}
      {activeSection === 'vendors' && <VendorsTab />}
      {activeSection === 'products' && <AdminProductsTab />}
      {activeSection === 'spec-attributes' && <SpecAttributesTab />}
      {activeSection === 'certifications' && <CertificationsTab />}
      {activeSection === 'catalog-review' && <CatalogReviewQueueTab />}
      {activeSection === 'catalog-products' && <CatalogProductsTab />}
      {activeSection === 'catalog-brands' && <CatalogBrandsTab />}
      {activeSection === 'catalog-categories' && <CatalogCategoriesTab />}
      {activeSection === 'catalog-units' && <CatalogUnitsTab />}
      {activeSection === 'catalog-org-types' && <CatalogOrgTypesTab />}
      {activeSection === 'catalog-duplicates' && <CatalogDuplicatesTab />}
      {activeSection === 'catalog-popular' && <CatalogPopularTab />}
      {activeSection === 'catalog-agreements' && <AgreementsTab />}
      {activeSection === 'orders' && <AdminOrdersTab />}
      {activeSection === 'payments' && <PaymentsTab />}
      {activeSection === 'payouts' && <PayoutsTab />}
      {activeSection === 'currencies' && <CurrenciesConsole />}
      {activeSection === 'financing' && <FinancingTab />}
      {activeSection === 'organizations' && <OrganizationsTab />}
      {activeSection === 'pricing' && <PricingTab />}
      {activeSection === 'coupons' && <CouponsTab />}
      {activeSection === 'rfqs' && <RfqsTab />}
      {activeSection === 'disputes' && <DisputesTab />}
      {activeSection === 'rbac' && <RbacTab user={user} />}
      {activeSection === 'security' && <SecurityTab user={user} />}
      {activeSection === 'modules' && <ModulesTab />}
      {activeSection === 'whatsapp' && <WhatsAppTab />}
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
        description="Sign in with a platform administrator or staff account to operate the marketplace."
        afterView="admin"
      />
    )
  }

  // RBAC Phase 2: legacy admins always enter; platform staff (any
  // platform-scope role) enter with a permission-filtered console.
  if (user && authChecked && user.role !== 'ADMIN' && !user.isPlatformStaff) {
    return (
      <AccessDenied
        icon={ShieldAlert}
        title="Admin access required"
        description="This console is restricted to platform administrators and staff. Ask an administrator to grant you a staff role."
      />
    )
  }

  return <AdminDashboard user={user} />
}
