'use client'

// ─────────────────────────────────────────────────────────────────────────────
// BUYER DASHBOARD — the signed-in user's account hub ("My Account" console).
// Replaces the old flat AccountView quick-links page: real activity counts,
// clear profile & security sections and one consistent page header. All other
// buyer surfaces (RFQs, Business, Orders, Favorites) are sidebar entries that
// stay inside this same console shell.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react'
import {
  AtSign,
  BadgeCheck,
  Briefcase,
  CalendarDays,
  FileText,
  Heart,
  LayoutDashboard,
  Package,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
} from 'lucide-react'
import { useMarketplace } from '@/store/marketplace'
import { useApi } from '@/hooks/use-api'
import { formatDate, initials } from '@/lib/format'
import type { OrderDTO, RfqDTO } from '@/lib/types'
import { DashboardLayout, PageHeader, SignInRequired } from './dashboard-layout'
import { BUYER_NAV } from './nav-config'
import type { NavItem } from './nav-config'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'

export function BuyerDashboard() {
  const user = useMarketplace((s) => s.user)
  const authChecked = useMarketplace((s) => s.authChecked)
  const navigate = useMarketplace((s) => s.navigate)

  const { data: ordersData } = useApi<{ orders: OrderDTO[] }>(user ? '/api/orders' : null, { skip: !user })
  const { data: rfqData } = useApi<{ rfqs: RfqDTO[] }>(user ? '/api/rfqs' : null, { skip: !user })

  const onNavigate = (item: NavItem) => navigate(item.view ?? 'account', item.params)

  const tiles = useMemo(
    () => [
      {
        key: 'orders',
        icon: Package,
        title: 'My Orders',
        description: 'Purchases, tracking & invoices',
        value: ordersData?.orders?.length,
        view: 'orders' as const,
      },
      {
        key: 'rfqs',
        icon: FileText,
        title: 'My RFQs',
        description: 'Quote requests & negotiations',
        value: rfqData?.rfqs?.length,
        view: 'rfqs' as const,
      },
      {
        key: 'favorites',
        icon: Heart,
        title: 'Favorites',
        description: 'Products saved for later',
        value: undefined,
        view: 'favorites' as const,
      },
      {
        key: 'business',
        icon: Briefcase,
        title: 'Business Account',
        description: 'Organization, team & pricing',
        value: undefined,
        view: 'business' as const,
      },
    ],
    [ordersData, rfqData]
  )

  if (!user && authChecked) {
    return (
      <SignInRequired
        icon={Settings}
        title="My account"
        description="Sign in to manage your orders, quotes and preferences."
        afterView="account"
      />
    )
  }
  if (!user) return null

  return (
    <DashboardLayout role="buyer" nav={BUYER_NAV} activeKey="account" onNavigate={onNavigate}>
      <PageHeader
        icon={LayoutDashboard}
        title={`Welcome back, ${user.name.split(' ')[0]}`}
        description="Your profile, security and everything you do on Vendora — in one place."
        actions={
          <Button variant="outline" className="rounded-xl" onClick={() => navigate('home')}>
            <ShoppingBag size={15} className="mr-1.5" /> Continue shopping
          </Button>
        }
      />

      {/* Activity tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((tile) => (
          <button
            key={tile.key}
            type="button"
            onClick={() => navigate(tile.view)}
            className="group flex flex-col items-start gap-3 rounded-2xl border bg-card p-5 text-left shadow-sm outline-none transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              <tile.icon size={19} />
            </span>
            <div className="min-w-0">
              <p className="flex items-baseline gap-2 text-sm font-semibold">
                <span className="truncate">{tile.title}</span>
                {typeof tile.value === 'number' && (
                  <span className="rounded-full bg-muted px-1.5 py-px text-[10.5px] font-bold tabular-nums text-muted-foreground">
                    {tile.value}
                  </span>
                )}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{tile.description}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Profile */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <BadgeCheck size={16} className="text-primary" /> Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap items-center gap-5">
              <Avatar className="h-16 w-16 border-2">
                <AvatarFallback className="bg-primary/10 text-lg font-bold text-primary">
                  {initials(user.name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold">{user.name}</h2>
                  <Badge
                    variant="secondary"
                    className={
                      user.role === 'SELLER'
                        ? 'rounded-full bg-primary/10 text-primary'
                        : 'rounded-full'
                    }
                  >
                    {user.role === 'SELLER' ? 'Seller' : 'Buyer'}
                  </Badge>
                </div>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <AtSign size={13} /> {user.email}
                </p>
                {user.createdAt && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarDays size={12} /> Member since {formatDate(user.createdAt)}
                  </p>
                )}
              </div>
            </div>

            {user.role === 'SELLER' && user.storeName && (
              <>
                <Separator />
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/50 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Store size={16} className="text-primary" />
                    <div>
                      <p className="text-sm font-semibold leading-tight">{user.storeName}</p>
                      <p className="text-xs text-muted-foreground">
                        {user.storeBio ? user.storeBio : 'Your public storefront'}
                      </p>
                    </div>
                    <BadgeCheck size={15} className="text-primary" />
                  </div>
                  <Button size="sm" variant="outline" className="rounded-lg" onClick={() => navigate('seller')}>
                    Open seller console
                  </Button>
                </div>
              </>
            )}

            {user.role !== 'SELLER' && (
              <>
                <Separator />
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-primary/40 bg-primary/[0.04] px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <Sparkles size={16} className="text-primary" />
                    <div>
                      <p className="text-sm font-semibold leading-tight">Turn your passion into a store</p>
                      <p className="text-xs text-muted-foreground">
                        List products in minutes — 5% fee only when you sell.
                      </p>
                    </div>
                  </div>
                  <Button size="sm" className="rounded-lg" onClick={() => navigate('seller')}>
                    Start selling
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Security */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck size={16} className="text-primary" /> Security
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Password</span>
              <Badge variant="secondary" className="rounded-full text-xs">
                Set at registration
              </Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Two-factor authentication</span>
              <Badge variant="outline" className="rounded-full text-xs">
                Coming soon
              </Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Session</span>
              <Badge className="rounded-full bg-emerald-500 text-xs hover:bg-emerald-500">Active</Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Verification</span>
              <Badge variant="outline" className="rounded-full text-xs capitalize">
                Email verified
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
