'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FINANCIER VIEW — financier console (placeholder shell, FIN-5 fills it in)
// Services + requirements composer · forwarded inbox · offers · accreditations.
// ─────────────────────────────────────────────────────────────────────────────

import { useMarketplace } from '@/store/marketplace'
import { DashboardLayout } from '@/components/dashboards/dashboard-layout'
import { BUYER_NAV, type NavItem } from '@/components/dashboards/nav-config'
import { FinancierPlaceholder } from '@/components/marketplace/financing-views'

export function FinancierView() {
  const navigate = useMarketplace((s) => s.navigate)
  const onNavigate = (item: NavItem) => navigate(item.view ?? 'account', item.params)
  return (
    <DashboardLayout role="buyer" nav={BUYER_NAV} activeKey="financier" onNavigate={onNavigate}>
      <FinancierPlaceholder
        title="Financier console"
        subtitle="Services, requirements composer and your forwarded inbox (arriving with FIN-5)."
      />
    </DashboardLayout>
  )
}
