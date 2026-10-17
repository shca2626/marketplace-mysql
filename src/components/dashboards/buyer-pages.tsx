'use client'

// ─────────────────────────────────────────────────────────────────────────────
// BUYER CONSOLE PAGES — thin wrappers that mount the existing, battle-tested
// buyer views (RFQs, Business, Orders, Favorites) inside the shared
// DashboardLayout so the buyer never leaves their console shell. The sidebar
// highlights the active surface via `activeKey`.
// ─────────────────────────────────────────────────────────────────────────────

import { useMarketplace } from '@/store/marketplace'
import { DashboardLayout } from './dashboard-layout'
import { BUYER_NAV } from './nav-config'
import type { NavItem } from './nav-config'
import { RfqView } from '@/components/marketplace/b2b/rfq-view'
import { BusinessView } from '@/components/marketplace/b2b/business-view'
import { OrdersView } from '@/components/marketplace/orders-view'
import { FavoritesView } from '@/components/marketplace/favorites-view'
import { ComplaintsView } from '@/components/marketplace/complaints-view'
import { FollowingView } from '@/components/marketplace/following-view'

function BuyerPage({ activeKey, children }: { activeKey: string; children: React.ReactNode }) {
  const navigate = useMarketplace((s) => s.navigate)
  const onNavigate = (item: NavItem) => navigate(item.view ?? 'account', item.params)
  return (
    <DashboardLayout role="buyer" nav={BUYER_NAV} activeKey={activeKey} onNavigate={onNavigate}>
      {children}
    </DashboardLayout>
  )
}

export function BuyerRfqsPage() {
  return (
    <BuyerPage activeKey="rfqs">
      <RfqView />
    </BuyerPage>
  )
}

export function BuyerBusinessPage() {
  return (
    <BuyerPage activeKey="business">
      <BusinessView />
    </BuyerPage>
  )
}

export function BuyerOrdersPage() {
  return (
    <BuyerPage activeKey="orders">
      <OrdersView />
    </BuyerPage>
  )
}

export function BuyerFavoritesPage() {
  return (
    <BuyerPage activeKey="favorites">
      <FavoritesView />
    </BuyerPage>
  )
}

export function BuyerComplaintsPage() {
  return (
    <BuyerPage activeKey="complaints">
      <ComplaintsView />
    </BuyerPage>
  )
}

export function BuyerFollowingPage() {
  return (
    <BuyerPage activeKey="following">
      <FollowingView />
    </BuyerPage>
  )
}
