'use client'

import { useRef, useState } from 'react'
import {
  ArrowRight,
  Check,
  DollarSign,
  Hourglass,
  Image as ImageIcon,
  Loader2,
  Package,
  PackageSearch,
  Pencil,
  Plus,
  Scale,
  Search,
  Star,
  Store,
  Trash2,
  TrendingUp,
  Truck,
  Wallet,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useMarketplace } from '@/store/marketplace'
import { useApi } from '@/hooks/use-api'
import type { CategoryDTO, OrderDTO, ProductDTO, SellerStats } from '@/lib/types'
import { formatDate, formatNumber, formatUSD, timeAgo } from '@/lib/format'
import { STORE_COVERS, getStoreCover, setStoreCover } from '@/lib/store-covers'
import { ProductFormDialog } from './product-form-dialog'
import { SellerRfqInboxTab } from './seller/rfq-inbox-tab'
import { SellerDisputesTab } from './seller/disputes-tab'
import { SellerEarningsTab } from './seller/earnings-tab'
import { StarRating } from './star-rating'
import { DashboardLayout, PageHeader } from '@/components/dashboards/dashboard-layout'
import { SELLER_NAV } from '@/components/dashboards/nav-config'
import type { NavItem } from '@/components/dashboards/nav-config'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
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

export function SellerView() {
  const user = useMarketplace((s) => s.user)
  const authChecked = useMarketplace((s) => s.authChecked)
  const setUser = useMarketplace((s) => s.setUser)
  const openAuth = useMarketplace((s) => s.openAuth)
  const navigate = useMarketplace((s) => s.navigate)
  const params = useMarketplace((s) => s.params)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ProductDTO | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [storeForm, setStoreForm] = useState({ storeName: '', storeBio: '' })
  const [upgrading, setUpgrading] = useState(false)
  const [activeTab, setActiveTab] = useState(params.sellerTab ?? 'overview')
  // Storefront cover — persisted on the seller profile (STAB-8). localStorage
  // stays as an instant optimistic cache + the migration fallback for choices
  // made before server persistence existed. Render-time keyed re-read when
  // the signed-in seller changes (same pattern as the tab sync above — no
  // effect cascade).
  // In-flight PATCH's cover id (null = idle) — guards the sync block below
  // against reverting an optimistic pick mid-request.
  const coverPending = useRef<string | null>(null)

  const [coverChoice, setCoverChoice] = useState<{
    sellerKey: string | null
    serverId: string | null
    id: string | null
  }>({ sellerKey: null, serverId: null, id: null })
  const sellerKey = user?.id ?? null
  const serverCoverId = user?.storeCover ?? null
  if (coverChoice.sellerKey !== sellerKey) {
    // Server value wins; fall back to a legacy localStorage pick.
    const cover = serverCoverId ?? (sellerKey ? getStoreCover(sellerKey)?.id ?? null : null)
    setCoverChoice({ sellerKey, serverId: serverCoverId, id: cover })
  } else if (serverCoverId !== coverChoice.serverId && coverPending.current === null) {
    // A fresh session restore moved the server value (e.g. the cover was
    // changed on another device) — follow it while no optimistic pick of ours
    // is still being persisted.
    setCoverChoice((c) => ({ ...c, serverId: serverCoverId, id: serverCoverId ?? c.id }))
  }

  const selectCover = (id: string | null) => {
    if (!sellerKey) return
    const prevId = coverChoice.id
    // Optimistic: local cache + UI update immediately, then persist on the
    // seller profile so every buyer sees the change (not just this device).
    setStoreCover(sellerKey, id)
    setCoverChoice((c) => ({ ...c, id }))
    coverPending.current = id
    void (async () => {
      try {
        const res = await fetch('/api/seller/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storeCover: id ?? '' }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`)
        setUser(json.user)
        const label = id ? STORE_COVERS.find((c) => c.id === id)?.label : null
        toast({
          title: label ? `Cover saved — ${label}` : 'Cover reset',
          description: label
            ? 'Saved to your seller profile — every buyer now sees this image at the top of your store.'
            : 'Your storefront is back to the default warm gradient for every buyer.',
        })
      } catch (err) {
        // Persist failed — revert the optimistic update.
        setStoreCover(sellerKey, prevId)
        setCoverChoice((c) => ({ ...c, id: prevId }))
        toast({
          title: 'Could not save cover',
          description: err instanceof Error ? err.message : 'Network error — try again in a moment',
          variant: 'destructive',
        })
      } finally {
        coverPending.current = null
      }
    })()
  }

  // Sync tab when navigation params change while the view stays mounted
  if (params.sellerTab && params.sellerTab !== activeTab) {
    setActiveTab(params.sellerTab)
  }
  // Bell deep-link: a dispute notification opens the disputes tab directly
  if (params.disputeId && activeTab !== 'disputes') {
    setActiveTab('disputes')
  }

  const { data: catData } = useApi<{ categories: CategoryDTO[] }>('/api/categories')
  const categories = catData?.categories ?? []

  const isSeller = user?.role === 'SELLER'
  const { data: statsData, loading: statsLoading, refetch: refetchStats } = useApi<{ stats: SellerStats }>(
    isSeller ? '/api/seller/stats' : null,
    { skip: !isSeller }
  )
  // SEL-002: the payout card must show the REAL commission rate (per-vendor
  // override or platform default) from /api/seller/earnings — never a hardcoded 8%.
  const { data: earningsData } = useApi<{ commissionRate: number }>(
    isSeller ? '/api/seller/earnings' : null,
    { skip: !isSeller }
  )
  const commissionRate = earningsData?.commissionRate
  const {
    data: productsData,
    loading: productsLoading,
    refetch: refetchProducts,
  } = useApi<{ items: ProductDTO[] }>(isSeller ? '/api/products?mine=1&limit=48' : null, { skip: !isSeller })
  const {
    data: ordersData,
    loading: ordersLoading,
    refetch: refetchOrders,
  } = useApi<{ orders: OrderDTO[] }>(isSeller ? '/api/seller/orders' : null, { skip: !isSeller })

  const stats = statsData?.stats
  const myProducts = productsData?.items ?? []
  const sellerOrders = ordersData?.orders ?? []

  // SEL-004: catalog management needs search + status filtering, not a 48-row dump.
  const [productQuery, setProductQuery] = useState('')
  const [productStatus, setProductStatus] = useState<'ALL' | 'ACTIVE' | 'DRAFT' | 'ARCHIVED'>('ALL')
  const visibleProducts = myProducts.filter((p) => {
    if (productStatus !== 'ALL' && p.status !== productStatus) return false
    const q = productQuery.trim().toLowerCase()
    if (!q) return true
    return (
      p.title.toLowerCase().includes(q) ||
      (p.sku ?? '').toLowerCase().includes(q)
    )
  })

  const refetchAll = () => {
    void refetchStats()
    void refetchProducts()
    void refetchOrders()
  }

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const openEdit = (product: ProductDTO) => {
    setEditing(product)
    setFormOpen(true)
  }

  const handleDelete = async (product: ProductDTO) => {
    setDeleting(product.id)
    try {
      const res = await fetch(`/api/products/${product.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Delete failed', description: json.error, variant: 'destructive' })
        return
      }
      toast({
        title: json.archived ? 'Product archived' : 'Product deleted',
        description: json.archived
          ? 'It has past orders, so we archived it instead of deleting.'
          : product.title,
      })
      refetchAll()
    } catch {
      toast({ title: 'Delete failed', description: 'Network error', variant: 'destructive' })
    } finally {
      setDeleting(null)
    }
  }

  const advanceStatus = async (order: OrderDTO) => {
    const next = { PAID: 'PROCESSING', PROCESSING: 'SHIPPED', SHIPPED: 'DELIVERED' }[order.status]
    if (!next) return
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Update failed', description: json.error, variant: 'destructive' })
        return
      }
      toast({ title: `Order marked as ${next}` })
      refetchAll()
    } catch {
      toast({ title: 'Update failed', description: 'Network error', variant: 'destructive' })
    }
  }

  const becomeSeller = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    if (storeForm.storeName.trim().length < 2) {
      toast({ title: 'Store name too short', variant: 'destructive' })
      return
    }
    setUpgrading(true)
    try {
      const res = await fetch('/api/auth/become-seller', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(storeForm),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Upgrade failed', description: json.error, variant: 'destructive' })
        return
      }
      setUser(json.user)
      toast({ title: 'Welcome to Vendora Selling! 🎉', description: 'Your storefront is live.' })
    } catch {
      toast({ title: 'Upgrade failed', description: 'Network error', variant: 'destructive' })
    } finally {
      setUpgrading(false)
    }
  }

  // ── Auth gate ──
  if (!authChecked) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16">
        <Skeleton className="mx-auto h-64 w-full max-w-xl rounded-2xl" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <Store size={44} className="text-muted-foreground/40" />
        <h1 className="mt-4 text-xl font-bold">Sign in to open your storefront</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sell to thousands of shoppers on Vendora.</p>
        <Button className="mt-6 rounded-xl" onClick={() => openAuth('login', { view: 'seller' })}>
          Sign in
        </Button>
      </div>
    )
  }

  // ── Buyer → become seller upsell ──
  if (!isSeller) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-r from-orange-600 to-rose-500 px-8 py-10 text-white">
            <Store size={40} />
            <h1 className="mt-4 text-2xl font-extrabold">Turn your passion into a store</h1>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-white/90">
              List products in minutes, manage orders and grow your brand — with only a 5% fee when you sell.
            </p>
          </div>
          <CardContent className="p-8">
            <form onSubmit={becomeSeller} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="storeName">Store name</Label>
                <Input
                  id="storeName"
                  value={storeForm.storeName}
                  onChange={(e) => setStoreForm((f) => ({ ...f, storeName: e.target.value }))}
                  placeholder="e.g. Willow & Pine Ceramics"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="storeBio">
                  Store bio <span className="text-xs text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="storeBio"
                  value={storeForm.storeBio}
                  onChange={(e) => setStoreForm((f) => ({ ...f, storeBio: e.target.value }))}
                  placeholder="Tell shoppers what you make"
                />
              </div>
              <Button type="submit" size="lg" className="w-full rounded-xl" disabled={upgrading}>
                {upgrading && <Loader2 size={15} className="mr-2 animate-spin" />}
                Create my storefront
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  const chartData = (stats?.salesByDay ?? []).map((d) => ({
    ...d,
    label: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }))

  return (
    <DashboardLayout
      role="seller"
      nav={SELLER_NAV}
      activeKey={activeTab}
      onNavigate={(item: NavItem) =>
        navigate('seller', { sellerTab: item.key === 'overview' ? undefined : item.key })
      }
    >
      <PageHeader
        title={user.storeName ?? 'Seller Dashboard'}
        description={`Seller dashboard · ${user.name}`}
        actions={
          <Button className="rounded-xl" onClick={openCreate}>
            <Plus size={16} className="mr-1.5" /> Add product
          </Button>
        }
      />

      {/* ── Overview section ── */}
      {activeTab === 'overview' && (
      <div className="space-y-6">
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {statsLoading || !stats
              ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)
              : [
                  { icon: DollarSign, label: 'Total revenue', value: formatUSD(stats.revenue), sub: 'from all orders' },
                  { icon: Package, label: 'Units sold', value: formatNumber(stats.totalSold), sub: 'across products' },
                  { icon: Star, label: 'Avg. rating', value: `${stats.avgRating.toFixed(1)} ★`, sub: 'buyer reviews' },
                  { icon: TrendingUp, label: 'Active listings', value: String(stats.activeListings), sub: `${stats.totalProducts} total` },
                ].map((kpi) => (
                  <Card key={kpi.label}>
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {kpi.label}
                        </p>
                        <kpi.icon size={16} className="text-primary" />
                      </div>
                      <p className="mt-2.5 text-2xl font-extrabold tabular-nums">{kpi.value}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{kpi.sub}</p>
                    </CardContent>
                  </Card>
                ))}
          </div>

          {/* Payouts summary (read-only, derived from order items) */}
          {statsLoading || !stats ? (
            <Skeleton className="h-44 rounded-2xl" />
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wallet size={16} className="text-primary" /> Payouts
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Weekly payout runs every Friday · Vendora fee{' '}
                  {commissionRate != null ? `${commissionRate}% of gross sales` : 'per your vendor terms'}
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border bg-muted/40 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Available now
                    </p>
                    <p className="mt-1 text-xl font-extrabold tabular-nums text-emerald-600 dark:text-emerald-400">
                      {formatUSD(stats.payouts.availableBalance)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">from delivered orders</p>
                  </div>
                  <div className="rounded-xl border bg-muted/40 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      In transit
                    </p>
                    <p className="mt-1 text-xl font-extrabold tabular-nums">
                      {formatUSD(stats.payouts.inTransitBalance)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">clears once orders deliver</p>
                  </div>
                  <div className="rounded-xl border bg-muted/40 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Next payout
                    </p>
                    <p className="mt-1 text-xl font-extrabold">
                      {new Date(stats.payouts.nextPayoutDate).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">Friday · weekly run</p>
                  </div>
                </div>
                <div className="mt-4 space-y-1.5 rounded-xl border p-4 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Gross sales (all time)</span>
                    <span className="tabular-nums">{formatUSD(stats.payouts.grossSales)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Vendora fee{commissionRate != null ? ` (${commissionRate}%)` : ''}</span>
                    <span className="tabular-nums">−{formatUSD(stats.payouts.platformFee)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-1.5 font-bold">
                    <span>Net earnings</span>
                    <span className="tabular-nums">{formatUSD(stats.payouts.netEarnings)}</span>
                  </div>
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground">
                  Payouts are simulated in this demo — no real money moves. Cancelled orders are excluded.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Storefront cover picker (persisted on the seller profile — STAB-8) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ImageIcon size={16} className="text-primary" /> Storefront cover
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Pick the hero image shoppers see at the top of your store page
              </p>
            </CardHeader>
            <CardContent>
              <div
                className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6"
                role="radiogroup"
                aria-label="Storefront cover image"
              >
                {STORE_COVERS.map((c) => {
                  const selected = coverChoice.id === c.id
                  return (
                    <button
                      key={c.id}
                      role="radio"
                      aria-checked={selected}
                      onClick={() => selectCover(c.id)}
                      className={cn(
                        'group relative aspect-[16/9] overflow-hidden rounded-xl border-2 transition-all duration-200',
                        selected
                          ? 'border-primary shadow-md shadow-primary/20'
                          : 'border-transparent hover:border-primary/40 active:scale-[0.97]'
                      )}
                      title={c.label}
                    >
                      <img
                        src={c.url}
                        alt={c.label}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      {selected && (
                        <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                          <Check size={12} strokeWidth={3} />
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[11px] text-muted-foreground">
                  Saved to your seller profile — visible to every buyer on your storefront, on any
                  device.
                </p>
                {coverChoice.id && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-full text-xs"
                    onClick={() => selectCover(null)}
                  >
                    Reset to gradient
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Revenue — last 14 days</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {statsLoading || !stats ? (
                <Skeleton className="h-64 w-full" />
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -12, bottom: 0 }}>
                      <defs>
                        <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
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
                        formatter={(value: number | string) => [`$${value}`, 'Revenue']}
                      />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="var(--primary)"
                        strokeWidth={2.5}
                        fill="url(#revGradient)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Top products */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Top products</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {statsLoading || !stats ? (
                  Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14" />)
                ) : stats.topProducts.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No sales yet — your top sellers will appear here.
                  </p>
                ) : (
                  stats.topProducts.map((p, i) => (
                    <div key={p.id} className="flex items-center gap-3">
                      <span className="w-5 text-sm font-bold text-muted-foreground">{i + 1}</span>
                      <button
                        className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border bg-muted"
                        onClick={() => navigate('product', { productId: p.id })}
                      >
                        {p.image && <img src={p.image} alt="" className="h-full w-full object-cover" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-1 text-sm font-medium">{p.title}</p>
                        <p className="text-xs text-muted-foreground">{formatNumber(p.soldCount)} sold</p>
                      </div>
                      <span className="text-sm font-bold tabular-nums">{formatUSD(p.revenue)}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Recent orders */}
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-base">Recent orders</CardTitle>
                <Button variant="ghost" size="sm" className="h-7 rounded-full text-xs text-primary" onClick={() => navigate('seller', { sellerTab: 'orders' })}>
                  View all <ArrowRight size={13} className="ml-1" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {statsLoading || !stats ? (
                  Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14" />)
                ) : stats.recentOrders.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">Orders will appear here.</p>
                ) : (
                  stats.recentOrders.map((o) => (
                    <div key={o.id} className="flex items-center gap-3 rounded-xl border p-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{o.buyer?.name ?? 'Customer'}</p>
                        <p className="text-xs text-muted-foreground">
                          {o.itemCount} item(s) · {timeAgo(o.createdAt)}
                        </p>
                      </div>
                      <Badge variant="secondary" className="rounded-full text-[11px]">
                        {o.status}
                      </Badge>
                      <span className="text-sm font-bold tabular-nums">{formatUSD(o.total)}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ── Products section ── */}
      {activeTab === 'products' && (
      <div>
          {/* SEL-004: search + status toolbar for catalog management */}
          <Card className="mb-4">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-9 rounded-lg pl-9"
                  placeholder="Search your products by title or SKU…"
                  value={productQuery}
                  onChange={(e) => setProductQuery(e.target.value)}
                  aria-label="Search your products"
                />
              </div>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
                {(['ALL', 'ACTIVE', 'DRAFT', 'ARCHIVED'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setProductStatus(s)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors',
                      productStatus === s
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {s === 'ALL' ? 'All' : s === 'ACTIVE' ? 'Active' : s === 'DRAFT' ? 'Drafts' : 'Archived'}
                    <span className="ml-1 tabular-nums opacity-70">
                      {s === 'ALL'
                        ? myProducts.length
                        : myProducts.filter((p) => p.status === s).length}
                    </span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-0">
              {productsLoading ? (
                <div className="space-y-3 p-5">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-16" />
                  ))}
                </div>
              ) : myProducts.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-center">
                  <PackageSearch size={40} className="text-muted-foreground/40" />
                  <p className="mt-4 font-semibold">No products yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">Publish your first listing to get started.</p>
                  <Button className="mt-5 rounded-full" onClick={openCreate}>
                    <Plus size={15} className="mr-1.5" /> Add product
                  </Button>
                </div>
              ) : visibleProducts.length === 0 ? (
                <div className="flex flex-col items-center py-14 text-center">
                  <PackageSearch size={36} className="text-muted-foreground/40" />
                  <p className="mt-3 text-sm font-semibold">No products match</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Try a different search or clear the status filter.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4 h-8 rounded-full text-xs"
                    onClick={() => {
                      setProductQuery('')
                      setProductStatus('ALL')
                    }}
                  >
                    Clear filters
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-5 py-3 font-medium">Product</th>
                        <th className="px-3 py-3 text-center font-medium">Price</th>
                        <th className="px-3 py-3 text-center font-medium">Stock</th>
                        <th className="px-3 py-3 text-center font-medium">Sold</th>
                        <th className="px-3 py-3 text-center font-medium">Rating</th>
                        <th className="px-3 py-3 text-center font-medium">Status</th>
                        <th className="px-5 py-3 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleProducts.map((p) => (
                        <tr key={p.id} className="border-b transition-colors last:border-0 hover:bg-muted/30">
                          <td className="max-w-72 px-5 py-3">
                            <div className="flex items-center gap-3">
                              <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border bg-muted">
                                {p.images[0] && (
                                  <img src={p.images[0]} alt="" className="h-full w-full object-cover" />
                                )}
                              </div>
                              <button
                                className="line-clamp-2 text-left font-medium leading-4 hover:text-primary"
                                onClick={() => navigate('product', { productId: p.id })}
                              >
                                {p.title}
                              </button>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-center font-semibold tabular-nums">{formatUSD(p.price)}</td>
                          <td className="px-3 py-3 text-center tabular-nums">
                            <span className={cn(p.stock === 0 ? 'font-bold text-destructive' : p.stock < 6 && 'font-semibold text-amber-600 dark:text-amber-400')}>
                              {p.stock}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center tabular-nums text-muted-foreground">{p.soldCount}</td>
                          <td className="px-3 py-3">
                            <div className="flex justify-center">
                              <StarRating value={p.rating} showValue count={p.reviewCount} />
                            </div>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <Badge
                              variant="secondary"
                              className={cn(
                                'rounded-full text-[11px]',
                                p.status === 'ACTIVE' && 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
                                p.status === 'ARCHIVED' && 'bg-muted text-muted-foreground'
                              )}
                            >
                              {p.status}
                            </Badge>
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)} aria-label={`Edit ${p.title}`}>
                                <Pencil size={14} />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                    disabled={deleting === p.id}
                                    aria-label={`Delete ${p.title}`}
                                  >
                                    {deleting === p.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete “{p.title}”?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This permanently removes the listing. Products with past orders are archived
                                      instead, to preserve order history.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      onClick={() => handleDelete(p)}
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
      </div>
      )}

      {/* ── Seller RFQ inbox section ── */}
      {activeTab === 'rfqs' && <SellerRfqInboxTab myProducts={myProducts} focusRfqId={params.rfqId ?? null} />}

      {/* ── Earnings section ── */}
      {activeTab === 'earnings' && <SellerEarningsTab />}

      {/* ── Disputes section ── */}
      {activeTab === 'disputes' && <SellerDisputesTab focusId={params.disputeId ?? null} />}

      {/* ── Orders section ── */}
      {activeTab === 'orders' && (
      <div>
          {ordersLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-40 rounded-2xl" />
              ))}
            </div>
          ) : sellerOrders.length === 0 ? (
            <Card className="flex flex-col items-center border-dashed py-16 text-center">
              <Truck size={40} className="text-muted-foreground/40" />
              <p className="mt-4 font-semibold">No orders yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                When shoppers buy your products, orders will show up here.
              </p>
            </Card>
          ) : (
            <div className="space-y-4">
              {sellerOrders.map((order) => {
                const myItems = order.items.filter((i) => i.mine)
                const myTotal = myItems.reduce((sum, i) => sum + i.price * i.quantity, 0)
                const awaitingApproval = order.status === 'PENDING_APPROVAL'
                const next = { PAID: 'PROCESSING', PROCESSING: 'SHIPPED', SHIPPED: 'DELIVERED' }[order.status]
                return (
                  <Card key={order.id}>
                    <CardContent className="p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-mono text-xs font-bold tracking-wide text-muted-foreground">
                            #${order.id.slice(-8).toUpperCase()}
                          </p>
                          <p className="mt-0.5 text-sm">
                            <span className="font-medium">{order.buyer?.name}</span>
                            <span className="text-muted-foreground"> · {formatDate(order.createdAt)}</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge
                            variant="secondary"
                            className={
                              order.status === 'CANCELLED'
                                ? 'rounded-full text-[11px] bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                                : awaitingApproval
                                  ? 'rounded-full text-[11px] bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300'
                                  : 'rounded-full text-[11px]'
                            }
                          >
                            {awaitingApproval ? 'AWAITING BUYER APPROVAL' : order.status}
                          </Badge>
                          <span className="text-sm font-bold tabular-nums">{formatUSD(myTotal)}</span>
                          {next && (
                            <Button size="sm" className="h-8 rounded-full text-xs" onClick={() => advanceStatus(order)}>
                              Mark as {next.toLowerCase()}
                            </Button>
                          )}
                        </div>
                      </div>
                      {awaitingApproval && (
                        <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-teal-500/10 px-3 py-2 text-xs text-teal-700 dark:text-teal-300">
                          <Hourglass size={13} className="shrink-0" />
                          The buying company is approving this order internally — fulfillment unlocks once it clears.
                        </p>
                      )}
                      <div className="mt-4 space-y-2.5 border-t pt-4">
                        {myItems.map((item) => (
                          <div key={item.id} className="flex items-center gap-3">
                            <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border bg-muted">
                              {item.image && <img src={item.image} alt="" className="h-full w-full object-cover" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="line-clamp-1 text-sm font-medium">{item.title}</p>
                              <p className="text-xs text-muted-foreground">
                                Qty {item.quantity} · {formatUSD(item.price)} each
                              </p>
                            </div>
                            <span className="text-sm font-semibold tabular-nums">
                              {formatUSD(item.price * item.quantity)}
                            </span>
                          </div>
                        ))}
                      </div>
                      <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
                        Ship to: {order.fullName}, {order.address}, {order.city} {order.zip}, {order.country}
                      </p>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
      </div>
      )}

      <ProductFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        categories={categories}
        editing={editing}
        onSaved={refetchAll}
      />
    </DashboardLayout>
  )
}
