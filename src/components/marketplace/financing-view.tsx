'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FINANCING VIEW — applicant surface (placeholder shell, FIN-6 fills it in)
// My financing requests · accreditation status · documents center · wizard.
// ─────────────────────────────────────────────────────────────────────────────

import { useMarketplace } from '@/store/marketplace'
import { DashboardLayout } from '@/components/dashboards/dashboard-layout'
import { BUYER_NAV, type NavItem } from '@/components/dashboards/nav-config'
import { FinancierPlaceholder } from '@/components/marketplace/financing-views'

export function FinancingView() {
  const navigate = useMarketplace((s) => s.navigate)
  const onNavigate = (item: NavItem) => navigate(item.view ?? 'account', item.params)
  return (
    <DashboardLayout role="buyer" nav={BUYER_NAV} activeKey="financing" onNavigate={onNavigate}>
      <FinancierPlaceholder
        title="Financing"
        subtitle="Applicant console — requests, accreditation and your document vault (arriving with FIN-6)."
      />
    </DashboardLayout>
  )
}
