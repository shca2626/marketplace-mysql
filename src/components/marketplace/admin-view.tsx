'use client'

import {
  Activity,
  BarChart3,
  CalendarClock,
  ClipboardList,
  DollarSign,
  Layers,
  Loader2,
  PackageCheck,
  PackageOpen,
  RefreshCw,
  ShieldAlert,
  ShoppingBag,
  Star,
  Store,
  Truck,
  UserPlus,
  Users,
} from 'lucide-react'
import { useMarketplace } from '@/store/marketplace'
import { useApi } from '@/hooks/use-api'
import type { AdminStats } from '@/lib/types'
import { formatNumber, formatUSD, timeAgo } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { cn } from '@/lib/utils'

const STATUS_META: Record<string, { color: string; icon: typeof PackageOpen }> = {
  PAID: { color: 'bg-amber-400', icon: ClipboardList },
  PROCESSING: { color: 'bg-orange-500', icon: PackageOpen },
  SHIPPED: { color: 'bg-violet-400', icon: Truck },
  DELIVERED: { color: 'bg-emerald-500', icon: PackageCheck },
  CANCELLED: { color: 'bg-neutral-400', icon: PackageOpen },
}

const STATUS_BADGE: Record<string, string> = {
  PAID: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  PROCESSING: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  SHIPPED: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  DELIVERED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  CANCELLED: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
}

export function AdminView() {
  const user = useMarketplace((s) => s.user)
  const authChecked = useMarketplace((s) => s.authChecked)
  const openAuth = useMarketplace((s) => s.openAuth)
  const { data, loading, refetch } = useApi<{ stats: AdminStats }>(
    user?.role === 'ADMIN' ? '/api/admin/stats' : null,
    { skip: user?.role !== 'ADMIN' }
  )
  const stats = data?.stats

  // ── Signed-out state ──
  if (!user && authChecked) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <BarChart3 size={44} className="text-muted-foreground/40" />
        <h1 className="mt-4 text-xl font-bold">Platform analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign in with an admin account to view marketplace insights.
        </p>
        <Button className="mt-6 rounded-xl" onClick={() => openAuth('login', { view: 'admin' })}>
          Sign in
        </Button>
      </div>
    )
  }

  // ── Non-admin state ──
  if (user && user.role !== 'ADMIN') {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <ShieldAlert size={26} />
        </span>
        <h1 className="mt-4 text-xl font-bold">Admin access required</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Platform analytics is restricted to marketplace administrators.
        </p>
      </div>
    )
  }

  const chartData = (stats?.revenueByDay ?? []).map((d) => ({
    ...d,
    label: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }))

  const totalStatusCount = (stats?.ordersByStatus ?? []).reduce((sum, s) => sum + s.count, 0) || 1
  const maxSellerRevenue = stats?.topSellers[0]?.revenue ?? 1

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <BarChart3 size={20} />
            </span>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Platform analytics</h1>
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Read-only marketplace overview · {user?.name}
          </p>
        </div>
        <Button variant="outline" className="rounded-xl" onClick={() => void refetch()} disabled={loading}>
          {loading ? <Loader2 size={15} className="mr-2 animate-spin" /> : <RefreshCw size={15} className="mr-2" />}
          Refresh
        </Button>
      </div>

      {/* KPI cards */}
      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {loading || !stats ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)
        ) : (
          [
            { icon: DollarSign, label: 'Total GMV', value: formatUSD(stats.totals.revenue), sub: 'non-cancelled orders' },
            { icon: ShoppingBag, label: 'Orders', value: formatNumber(stats.totals.orders), sub: `${stats.totals.aov > 0 ? `${formatUSD(stats.totals.aov)} avg` : '—'}` },
            { icon: Users, label: 'Members', value: formatNumber(stats.totals.users), sub: `${stats.totals.buyers} buyers · ${stats.totals.sellers} sellers` },
            { icon: Store, label: 'Listings', value: formatNumber(stats.totals.products), sub: `${stats.totals.activeListings} active` },
            { icon: Star, label: 'Reviews', value: formatNumber(stats.totals.reviews), sub: 'buyer feedback' },
            { icon: UserPlus, label: 'New members', value: formatNumber(stats.totals.newUsers7d), sub: 'in last 7 days' },
          ].map((kpi) => (
            <Card key={kpi.label} className="transition-shadow hover:shadow-md">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {kpi.label}
                  </p>
                  <kpi.icon size={16} className="shrink-0 text-primary" />
                </div>
                <p className="mt-2.5 truncate text-2xl font-extrabold tabular-nums">{kpi.value}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{kpi.sub}</p>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Revenue chart + order status distribution */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity size={16} className="text-primary" /> Gross revenue — last 14 days
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {loading || !stats ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -12, bottom: 0 }}>
                    <defs>
                      <linearGradient id="adminRevGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11 }}
                      stroke="var(--muted-foreground)"
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      stroke="var(--muted-foreground)"
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `$${v}`}
                    />
                    <ChartTooltip
                      contentStyle={{
                        borderRadius: 12,
                        border: '1px solid var(--border)',
                        background: 'var(--card)',
                        color: 'var(--foreground)',
                        fontSize: 12,
                      }}
                      formatter={(value: number | string, name: string) =>
                        name === 'revenue'
                          ? [`$${value}`, 'Revenue']
                          : [value, 'Orders']
                      }
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="var(--primary)"
                      strokeWidth={2.5}
                      fill="url(#adminRevGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Order status distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers size={16} className="text-primary" /> Orders by status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            {loading || !stats ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <>
                {/* Stacked distribution bar */}
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
                  {stats.ordersByStatus.map((s) => (
                    <div
                      key={s.status}
                      className={cn('h-full transition-all', STATUS_META[s.status]?.color ?? 'bg-muted-foreground')}
                      style={{ width: `${(s.count / totalStatusCount) * 100}%` }}
                      title={`${s.status}: ${s.count}`}
                    />
                  ))}
                </div>
                <div className="space-y-2.5">
                  {stats.ordersByStatus.map((s) => {
                    const Icon = STATUS_META[s.status]?.icon ?? PackageOpen
                    return (
                      <div key={s.status} className="flex items-center gap-3">
                        <span
                          className={cn(
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                            STATUS_BADGE[s.status] ?? 'bg-muted text-muted-foreground'
                          )}
                        >
                          <Icon size={14} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="text-sm font-medium capitalize">{s.status.toLowerCase()}</p>
                            <p className="text-sm font-bold tabular-nums">{s.count}</p>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {s.status === 'CANCELLED' ? 'excluded from GMV' : formatUSD(s.revenue)}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top sellers + top categories */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Store size={16} className="text-primary" /> Top sellers by revenue
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-3">
            {loading || !stats ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)
            ) : stats.topSellers.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No sales yet.</p>
            ) : (
              stats.topSellers.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => useMarketplace.getState().navigate('store', { sellerId: s.id })}
                  className="group flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors hover:bg-accent"
                  aria-label={`View ${s.storeName ?? s.name} storefront`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-extrabold text-primary">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-semibold group-hover:text-primary">
                        {s.storeName ?? s.name}
                      </p>
                      <p className="shrink-0 text-sm font-bold tabular-nums">{formatUSD(s.revenue)}</p>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary/70 transition-all group-hover:bg-primary"
                        style={{ width: `${Math.max((s.revenue / maxSellerRevenue) * 100, 4)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {s.unitsSold} sold · {s.products} listings
                      {s.rating > 0 && <> · {s.rating.toFixed(1)} ★</>}
                    </p>
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers size={16} className="text-primary" /> Top categories by units sold
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 pt-3 sm:grid-cols-2">
            {loading || !stats ? (
              Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
            ) : stats.topCategories.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground sm:col-span-2">No sales yet.</p>
            ) : (
              stats.topCategories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => useMarketplace.getState().navigate('catalog', { category: c.slug })}
                  className="group flex flex-col rounded-xl border bg-card p-4 text-left transition-all hover:border-primary/40 hover:shadow-sm"
                  aria-label={`Browse ${c.name} category`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-semibold group-hover:text-primary">{c.name}</p>
                    <p className="shrink-0 text-sm font-bold tabular-nums text-primary">{c.unitsSold}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatUSD(c.revenue)} · {c.products} listings
                  </p>
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent orders */}
      <Card className="mt-6">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock size={16} className="text-primary" /> Recent orders
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-3">
          {loading || !stats ? (
            Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)
          ) : stats.recentOrders.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No orders yet.</p>
          ) : (
            stats.recentOrders.map((o) => (
              <div
                key={o.id}
                className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-accent/60"
              >
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border bg-muted">
                  {o.firstItemImage && (
                    <img src={o.firstItemImage} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {o.firstItemTitle ?? 'Order'}
                    {o.itemCount > 1 && <span className="text-muted-foreground"> +{o.itemCount - 1} more</span>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    #{o.id.slice(-8).toUpperCase()} · {o.buyer.name} · {timeAgo(o.createdAt)}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-bold tabular-nums">{formatUSD(o.total)}</span>
                <Badge className={cn('shrink-0 rounded-full text-[11px] font-semibold', STATUS_BADGE[o.status])}>
                  {o.status}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
